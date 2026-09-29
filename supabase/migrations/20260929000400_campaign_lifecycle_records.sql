-- Campaign lifecycle: keep records, and no cancelling after proof (Kyle's decision D4, 2026-09-28).
-- Idempotent. Doesn't depend on 20260929000300_security_hardening.sql; either can run first.
--
-- Before this, a business cancelling a campaign deleted the campaign, its applications and (by cascade)
-- their payments, XP and finance history. Cancelling now marks things cancelled instead.
-- Once any athlete has sent proof, only a Hillink admin can cancel.

-- True once any athlete has sent proof for the campaign: an application moved to a proof status, or a
-- deliverable submitted through the deliverables flow (which leaves the application "accepted").
create or replace function public.campaign_has_proof(p_campaign_id uuid)
returns boolean
language plpgsql
stable
set search_path = public
as $$
begin
  if exists (
    select 1 from public.campaign_applications
    where campaign_id = p_campaign_id
      and status in ('submitted', 'rejected', 'approved', 'completed')
  ) then
    return true;
  end if;
  if to_regclass('public.deliverable_submissions') is not null then
    return exists (
      select 1
      from public.deliverable_submissions ds
      join public.campaign_applications a on a.id = ds.application_id
      where a.campaign_id = p_campaign_id
    );
  end if;
  return false;
end;
$$;

-- The same for one application.
create or replace function public.application_has_proof(p_application_id uuid)
returns boolean
language plpgsql
stable
set search_path = public
as $$
begin
  if exists (
    select 1 from public.campaign_applications
    where id = p_application_id
      and status in ('submitted', 'rejected', 'approved', 'completed')
  ) then
    return true;
  end if;
  if to_regclass('public.deliverable_submissions') is not null then
    return exists (select 1 from public.deliverable_submissions where application_id = p_application_id);
  end if;
  return false;
end;
$$;

-- A deliverable can only be sent while the athlete is still on the campaign. Locking the application row
-- lines this up with cancel/remove: whichever commits first wins, and the other sees it.
create or replace function public.guard_deliverable_submission()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  select status into v_status from public.campaign_applications where id = new.application_id for update;
  if v_status is null or v_status not in ('accepted', 'submitted', 'approved', 'completed') then
    raise exception 'HILLINK:application_closed' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

do $$
begin
  if to_regclass('public.deliverable_submissions') is not null then
    drop trigger if exists deliverable_submissions_guard_open on public.deliverable_submissions;
    create trigger deliverable_submissions_guard_open
    before insert on public.deliverable_submissions
    for each row
    execute function public.guard_deliverable_submission();
  end if;
end $$;

-- A business taking one athlete off its campaign, keeping the record. Under the application row lock:
-- refuses with 'stale' if the status changed since the caller read it, or 'proof_submitted' once the
-- athlete has sent proof (unless p_allow_after_proof). Returns {"reason": null | ...}.
create or replace function public.close_application_keep_record(
  p_application_id uuid,
  p_expected_status text,
  p_next_status text,
  p_allow_after_proof boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_now timestamptz := now();
begin
  if p_next_status not in ('declined', 'withdrawn') then
    raise exception 'invalid next status %', p_next_status;
  end if;

  select status into v_status from public.campaign_applications where id = p_application_id for update;
  if not found then
    return jsonb_build_object('reason', 'not_found');
  end if;
  if v_status is distinct from p_expected_status then
    return jsonb_build_object('reason', 'stale');
  end if;
  if not p_allow_after_proof and public.application_has_proof(p_application_id) then
    return jsonb_build_object('reason', 'proof_submitted');
  end if;

  update public.campaign_applications
    set status = p_next_status,
        decided_at = v_now,
        reviewed_at = case when p_next_status = 'declined' then v_now else null end
    where id = p_application_id;

  return jsonb_build_object('reason', null);
end;
$$;

revoke all on function public.close_application_keep_record(uuid, text, text, boolean) from public, anon, authenticated;
grant execute on function public.close_application_keep_record(uuid, text, text, boolean) to service_role;

-- A business cancelling its campaign. Everything happens under the campaign row lock with the
-- applications locked too, so an athlete can't send proof halfway through:
--   * refuses with 'proof_submitted' if any athlete has sent proof (unless p_allow_after_proof, for admins)
--   * declines waiting applications and withdraws accepted ones
--   * marks the campaign cancelled with no open slots, and logs it
-- Returns {"reason": null | 'not_found' | 'not_cancellable' | 'proof_submitted',
--          "applications": [ids whose payments should be refunded]}.
-- Calling it again on a cancelled campaign returns the same applications, so a failed refund can be retried.
create or replace function public.cancel_campaign_keep_records(
  p_campaign_id uuid,
  p_actor uuid,
  p_reason text,
  p_allow_after_proof boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c record;
  v_now timestamptz := now();
  v_ids uuid[];
begin
  select id, status into c from public.campaigns where id = p_campaign_id for update;
  if not found then
    return jsonb_build_object('reason', 'not_found', 'applications', '[]'::jsonb);
  end if;

  perform 1 from public.campaign_applications where campaign_id = p_campaign_id for update;

  if c.status = 'cancelled' then
    select coalesce(array_agg(id), '{}') into v_ids
      from public.campaign_applications
      where campaign_id = p_campaign_id and status in ('withdrawn', 'declined');
    return jsonb_build_object('reason', null, 'applications', to_jsonb(v_ids));
  end if;

  if c.status not in ('draft', 'open', 'active', 'paused', 'closed') then
    return jsonb_build_object('reason', 'not_cancellable', 'applications', '[]'::jsonb);
  end if;

  if not p_allow_after_proof and public.campaign_has_proof(p_campaign_id) then
    return jsonb_build_object('reason', 'proof_submitted', 'applications', '[]'::jsonb);
  end if;

  with closed as (
    update public.campaign_applications
      set status = case when status in ('pending', 'applied') then 'declined' else 'withdrawn' end,
          decided_at = v_now
      where campaign_id = p_campaign_id
        and status in ('pending', 'applied', 'accepted')
      returning id
  )
  select coalesce(array_agg(id), '{}') into v_ids from closed;

  -- Lets the proof guard below through for an admin cancel.
  perform set_config('app.allow_cancel_after_proof', case when p_allow_after_proof then 'true' else 'false' end, true);
  update public.campaigns set status = 'cancelled', open_slots = 0 where id = p_campaign_id;
  perform set_config('app.allow_cancel_after_proof', 'false', true);

  insert into public.campaign_status_log (campaign_id, from_status, to_status, changed_by, reason)
  values (p_campaign_id, c.status, 'cancelled', p_actor, p_reason);

  return jsonb_build_object('reason', null, 'applications', to_jsonb(v_ids));
end;
$$;

revoke all on function public.cancel_campaign_keep_records(uuid, uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.cancel_campaign_keep_records(uuid, uuid, text, boolean) to service_role;

-- Businesses can update their own campaigns directly (RLS), which included setting status = 'cancelled',
-- and could also cancel through transition_campaign_status (SECURITY DEFINER, so it runs as the function
-- owner, not "authenticated"). Once proof is in, cancelling is refused unless it comes from Hillink's
-- server (service role, which checks the caller itself) or an admin override: transition_campaign_status
-- with p_force, or cancel_campaign_keep_records with p_allow_after_proof. In the SQL editor, run
-- `set local app.is_admin_override = 'true'` first.
create or replace function public.guard_campaign_cancel_after_proof()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'cancelled'
     and old.status is distinct from 'cancelled'
     and current_user <> 'service_role'
     and coalesce(current_setting('app.is_admin_override', true), '') <> 'true'
     and coalesce(current_setting('app.allow_cancel_after_proof', true), '') <> 'true'
     and public.campaign_has_proof(new.id) then
    raise exception 'HILLINK:proof_submitted' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists campaigns_guard_cancel_after_proof on public.campaigns;
create trigger campaigns_guard_cancel_after_proof
before update on public.campaigns
for each row
execute function public.guard_campaign_cancel_after_proof();

-- ---------------------------------------------------------------------------------------------
-- Pay can't be cut after athletes apply (overnight finding BUS-001, 2026-09-28).
-- Before: a business could lower campaigns.payout_cents from the browser (its own-campaign
-- update policy), then accept. The payment is priced from the current payout, so a $0 payout
-- became an instantly "held" $0 payment and the athlete worked for nothing.
-- Now: every application remembers the pay it was offered, payments are priced from the higher
-- of that and the current pay, and a business can't lower pay while anyone is still in the running.
-- ---------------------------------------------------------------------------------------------
alter table public.campaign_applications
  add column if not exists offered_payout_cents integer check (offered_payout_cents >= 0);

-- Existing applications keep today's pay as their offer.
update public.campaign_applications a
set offered_payout_cents = greatest(0, coalesce(c.payout_cents, 0))
from public.campaigns c
where c.id = a.campaign_id
  and a.offered_payout_cents is null;

-- The offer is always taken from the campaign, never from the caller, and never changes after.
create or replace function public.snapshot_application_offer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    select greatest(0, coalesce(c.payout_cents, 0)) into new.offered_payout_cents
    from public.campaigns c
    where c.id = new.campaign_id;
    return new;
  end if;

  if new.offered_payout_cents is distinct from old.offered_payout_cents then
    new.offered_payout_cents := old.offered_payout_cents;
  end if;
  return new;
end;
$$;

drop trigger if exists campaign_applications_snapshot_offer on public.campaign_applications;
create trigger campaign_applications_snapshot_offer
before insert or update on public.campaign_applications
for each row
execute function public.snapshot_application_offer();

create or replace function public.guard_campaign_payout_cut()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if coalesce(new.payout_cents, 0) >= coalesce(old.payout_cents, 0) then
    return new;
  end if;
  if exists (
    select 1 from public.campaign_applications a
    where a.campaign_id = new.id
      and a.status not in ('declined', 'withdrawn')
  ) then
    raise exception 'HILLINK:payout_locked' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists campaigns_guard_payout_cut on public.campaigns;
create trigger campaigns_guard_payout_cut
before update of payout_cents on public.campaigns
for each row
execute function public.guard_campaign_payout_cut();
