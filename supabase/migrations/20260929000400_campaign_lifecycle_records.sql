-- Campaign lifecycle: keep records, and no cancelling after proof (Kyle's decision D4, 2026-09-28).
-- Idempotent. Doesn't depend on 20260929000300_security_hardening.sql; either can run first.
--
-- Before this, a business cancelling a campaign deleted the campaign, its applications and (by cascade)
-- their payments, XP and finance history. Cancelling now marks things cancelled instead.
-- Once any athlete has sent proof, only a Hillink admin can cancel.

-- Statuses that mean an athlete has sent proof for the campaign.
create or replace function public.campaign_has_proof(p_campaign_id uuid)
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (
    select 1 from public.campaign_applications
    where campaign_id = p_campaign_id
      and status in ('submitted', 'rejected', 'approved', 'completed')
  );
$$;

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

  update public.campaigns set status = 'cancelled', open_slots = 0 where id = p_campaign_id;

  insert into public.campaign_status_log (campaign_id, from_status, to_status, changed_by, reason)
  values (p_campaign_id, c.status, 'cancelled', p_actor, p_reason);

  return jsonb_build_object('reason', null, 'applications', to_jsonb(v_ids));
end;
$$;

revoke all on function public.cancel_campaign_keep_records(uuid, uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.cancel_campaign_keep_records(uuid, uuid, text, boolean) to service_role;

-- Businesses can update their own campaigns directly (RLS), which included setting status = 'cancelled'.
-- A signed-in caller can't cancel once proof is in. Hillink's server and admins go through the functions
-- above or the service role, which this doesn't block.
create or replace function public.guard_campaign_cancel_after_proof()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('authenticated', 'anon')
     and new.status = 'cancelled'
     and old.status is distinct from 'cancelled'
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
