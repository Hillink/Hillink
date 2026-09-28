-- Security hardening from the 2026-09-28 architecture audit (AUDIT-0928, items H1-H8).
-- Closes ways a signed-in user could write data only Hillink's server should write.
-- Safe to run more than once. Run after the PR #7 and #10 migrations if those are applied (no dependency).
--
-- Pattern (same as 20260928000150 and 000400): direct API callers run as "authenticated" or "anon";
-- Hillink's server (service role), the SQL editor and SECURITY DEFINER functions don't, and are exempt.

-- H1. log_athlete_xp_event is SECURITY DEFINER and was executable by everyone, so any caller could
-- write any amount of XP for any athlete. Only triggers and the server use it.
revoke all on function public.log_athlete_xp_event(uuid, uuid, uuid, text, integer, jsonb) from public, anon, authenticated;
grant execute on function public.log_athlete_xp_event(uuid, uuid, uuid, text, integer, jsonb) to service_role;

-- H2. transition_campaign_status trusted its p_changed_by argument, so a signed-in user could act as
-- any business (or an admin, with force). A signed-in caller now always acts as themselves, and only
-- the server may call it (the admin API does, through the service role).
create or replace function public.transition_campaign_status(
  p_campaign_id uuid,
  p_to_status text,
  p_changed_by uuid,
  p_reason text default null,
  p_force boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campaign record;
  v_role text;
  v_allowed text[];
  v_from_status text;
  v_to_status text := lower(coalesce(p_to_status, ''));
  v_business_ok boolean;
  v_actor uuid := coalesce(auth.uid(), p_changed_by);
begin
  if v_to_status not in ('draft', 'active', 'paused', 'completed', 'cancelled') then
    raise exception 'invalid_to_status';
  end if;

  select role into v_role
  from public.profiles
  where id = v_actor;

  if v_role is null or v_role not in ('business', 'admin') then
    raise exception 'forbidden';
  end if;

  select * into v_campaign
  from public.campaigns
  where id = p_campaign_id
  for update;

  if not found then
    raise exception 'campaign_not_found';
  end if;

  if v_role = 'business' and v_campaign.business_id <> v_actor then
    raise exception 'forbidden';
  end if;

  v_from_status := lower(coalesce(v_campaign.status, ''));

  if p_force and v_role <> 'admin' then
    raise exception 'force_requires_admin';
  end if;

  v_allowed := case v_from_status
    when 'draft' then array['active', 'cancelled']
    when 'active' then array['paused', 'completed', 'cancelled']
    when 'open' then array['paused', 'completed', 'cancelled']
    when 'paused' then array['active', 'cancelled']
    when 'closed' then array['active', 'cancelled']
    when 'completed' then array[]::text[]
    when 'cancelled' then array[]::text[]
    else array[]::text[]
  end;

  if not p_force and not (v_to_status = any(v_allowed)) then
    raise exception 'invalid_transition: %->%', v_campaign.status, v_to_status;
  end if;

  if v_to_status = 'active' then
    if coalesce(v_campaign.open_slots, 0) <= 0 then
      raise exception 'open_slots_required';
    end if;
    if v_campaign.start_date is null then
      raise exception 'start_date_required';
    end if;

    select exists(
      select 1
      from public.business_profiles bp
      where bp.id = v_campaign.business_id
        and coalesce(nullif(trim(bp.business_name), ''), '') <> ''
    ) into v_business_ok;

    if not coalesce(v_business_ok, false) then
      raise exception 'business_not_verified';
    end if;
  end if;

  perform set_config('app.is_admin_override', case when p_force then 'true' else 'false' end, true);

  update public.campaigns
  set status = v_to_status
  where id = p_campaign_id
  returning * into v_campaign;

  insert into public.campaign_status_log (
    campaign_id,
    from_status,
    to_status,
    changed_by,
    reason
  ) values (
    p_campaign_id,
    nullif(v_from_status, ''),
    v_to_status,
    v_actor,
    nullif(trim(coalesce(p_reason, '')), '')
  );

  return jsonb_build_object('campaign', to_jsonb(v_campaign));
end;
$$;

revoke all on function public.transition_campaign_status(uuid, text, uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.transition_campaign_status(uuid, text, uuid, text, boolean) to service_role;

-- H3. campaign_status_log had no row security, so any signed-in user could read it (including admin
-- user ids) and write fake history. Admins read it; only the server writes it.
alter table public.campaign_status_log enable row level security;
revoke insert, update, delete, truncate on public.campaign_status_log from anon, authenticated;
drop policy if exists "campaign_status_log: admins read" on public.campaign_status_log;
create policy "campaign_status_log: admins read" on public.campaign_status_log
  for select to authenticated using (public.is_admin(auth.uid()));
drop policy if exists "campaign_status_log: businesses read own" on public.campaign_status_log;
create policy "campaign_status_log: businesses read own" on public.campaign_status_log
  for select to authenticated using (
    exists (select 1 from public.campaigns c where c.id = campaign_id and c.business_id = auth.uid())
  );

-- H5. Athletes could mark themselves verified, pick their own tier and clear their own flag, and
-- auto-accept trusts all three. Admin tools set them through the service role.
create or replace function public.guard_athlete_privileged_columns()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.is_verified := false;
      new.is_flagged := false;
      new.tier := 'bronze';
    else
      new.is_verified := old.is_verified;
      new.is_flagged := old.is_flagged;
      new.tier := old.tier;
    end if;
  end if;
  return new;
end;
$$;

do $$ begin
  if (select count(*) from information_schema.columns
      where table_schema = 'public' and table_name = 'athlete_profiles'
        and column_name in ('is_verified', 'is_flagged', 'tier')) = 3 then
    drop trigger if exists athlete_profiles_guard_privileged on public.athlete_profiles;
    create trigger athlete_profiles_guard_privileged
    before insert or update on public.athlete_profiles
    for each row
    execute function public.guard_athlete_privileged_columns();
  else
    raise warning 'athlete_profiles is missing is_verified, is_flagged or tier; guard not installed';
  end if;
end $$;

-- H6a. A business could give itself a paid plan (status, tier, limits, Stripe ids) by writing its own
-- billing row. Settings may still save the billing contact and address; the plan and Stripe fields
-- come only from the Stripe webhook, checkout and admin tools.
create or replace function public.guard_business_billing_columns()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.subscription_tier := 'starter';
      new.subscription_status := 'inactive';
      new.monthly_price_cents := 25000;
      new.max_slots_per_campaign := 3;
      new.max_open_campaigns := 1;
      new.max_athlete_tier := 'Bronze';
      new.stripe_customer_id := null;
      new.stripe_subscription_id := null;
      new.stripe_subscription_status := null;
      new.stripe_payment_method_id := null;
      new.billing_ready := false;
      new.access_tier_override := null;
    else
      new.subscription_tier := old.subscription_tier;
      new.subscription_status := old.subscription_status;
      new.monthly_price_cents := old.monthly_price_cents;
      new.max_slots_per_campaign := old.max_slots_per_campaign;
      new.max_open_campaigns := old.max_open_campaigns;
      new.max_athlete_tier := old.max_athlete_tier;
      new.stripe_customer_id := old.stripe_customer_id;
      new.stripe_subscription_id := old.stripe_subscription_id;
      new.stripe_subscription_status := old.stripe_subscription_status;
      new.stripe_payment_method_id := old.stripe_payment_method_id;
      new.billing_ready := old.billing_ready;
      new.access_tier_override := old.access_tier_override;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists business_billing_profiles_guard_plan on public.business_billing_profiles;
create trigger business_billing_profiles_guard_plan
before insert or update on public.business_billing_profiles
for each row
execute function public.guard_business_billing_columns();

-- H6b. Plan limits were only checked in the browser, and campaigns are created by a direct insert.
-- The same checks now run in the database for signed-in callers. Mirrors createCampaign in
-- app/business/BusinessDashboard.tsx; keep in sync.
create or replace function public.athlete_tier_level(t text)
returns int
language sql
immutable
as $$
  select case lower(coalesce(t, ''))
    when 'bronze' then 1
    when 'silver' then 2
    when 'gold' then 3
    when 'platinum' then 4
    when 'diamond' then 5
    else 0
  end;
$$;

create or replace function public.enforce_campaign_plan_limits()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  b record;
  open_count integer;
  goes_live boolean;
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    -- Slot counts change only through Hillink's server (accept, withdraw, the slots API).
    new.slots := old.slots;
    new.open_slots := old.open_slots;
  end if;

  goes_live := coalesce(new.status, 'open') in ('active', 'open')
    and (tg_op = 'INSERT' or coalesce(old.status, '') not in ('active', 'open'));

  if tg_op = 'UPDATE' and not goes_live
     and new.preferred_tier is not distinct from old.preferred_tier
     and new.min_athlete_tier is not distinct from old.min_athlete_tier
     and new.eligible_athlete_tiers is not distinct from old.eligible_athlete_tiers then
    return new;
  end if;

  select subscription_status, billing_ready, max_slots_per_campaign, max_open_campaigns, max_athlete_tier
    into b
    from public.business_billing_profiles
    where business_id = new.business_id;

  if not found or b.subscription_status <> 'active' or not b.billing_ready then
    raise exception 'HILLINK:subscription_required' using errcode = 'P0001';
  end if;

  if new.preferred_tier is not null and new.preferred_tier <> 'Any'
     and public.athlete_tier_level(new.preferred_tier) > public.athlete_tier_level(b.max_athlete_tier) then
    raise exception 'HILLINK:plan_tier_limit' using errcode = 'P0001';
  end if;

  -- Auto-accept enforces min_athlete_tier, so it can't sit above the plan either.
  if public.athlete_tier_level(new.min_athlete_tier) > public.athlete_tier_level(b.max_athlete_tier) then
    raise exception 'HILLINK:plan_tier_limit' using errcode = 'P0001';
  end if;

  -- The column defaults to every tier, so drop the ones above the plan instead of refusing the row.
  if new.eligible_athlete_tiers is not null then
    new.eligible_athlete_tiers := array(
      select t from unnest(new.eligible_athlete_tiers) as t
      where public.athlete_tier_level(t) <= public.athlete_tier_level(b.max_athlete_tier)
    );
    if cardinality(new.eligible_athlete_tiers) = 0 then
      raise exception 'HILLINK:plan_tier_limit' using errcode = 'P0001';
    end if;
  end if;

  if (tg_op = 'INSERT' or goes_live) and new.slots > b.max_slots_per_campaign then
    raise exception 'HILLINK:plan_slot_limit' using errcode = 'P0001';
  end if;
  if tg_op = 'INSERT' then
    new.open_slots := new.slots;
  end if;

  if goes_live then
    -- A business creating or reopening campaigns in parallel can't slip past the count.
    perform pg_advisory_xact_lock(hashtextextended('campaign-plan:' || new.business_id::text, 0));
    select count(*) into open_count
      from public.campaigns
      where business_id = new.business_id and status in ('active', 'open') and id <> new.id;
    if open_count >= b.max_open_campaigns then
      raise exception 'HILLINK:plan_campaign_limit' using errcode = 'P0001';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists campaigns_enforce_plan_limits on public.campaigns;
create trigger campaigns_enforce_plan_limits
before insert or update on public.campaigns
for each row
execute function public.enforce_campaign_plan_limits();

-- The status API changes campaigns with the service role, which the trigger above lets through. For a
-- business, it goes live through this function instead: every plan check and the status change share
-- one transaction and the same per-business lock, so two parallel requests can't both pass the count,
-- and a draft made on a bigger plan can't go live after a downgrade.
-- Returns null when the campaign went live, 'stale' when its status changed meanwhile, or a plan block.
create or replace function public.activate_campaign_within_plan(
  p_campaign_id uuid,
  p_from_status text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  c record;
  b record;
  v_tiers text[];
  open_count integer;
begin
  select business_id into c from public.campaigns where id = p_campaign_id;
  if not found then
    return 'stale';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('campaign-plan:' || c.business_id::text, 0));

  select business_id, status, slots, preferred_tier, min_athlete_tier, eligible_athlete_tiers
    into c
    from public.campaigns
    where id = p_campaign_id
    for update;
  if c.status is distinct from p_from_status then
    return 'stale';
  end if;

  select subscription_status, billing_ready, max_open_campaigns, max_slots_per_campaign, max_athlete_tier
    into b
    from public.business_billing_profiles
    where business_id = c.business_id;
  if not found or b.subscription_status <> 'active' or not b.billing_ready then
    return 'subscription_required';
  end if;

  if c.slots > b.max_slots_per_campaign then
    return 'plan_slot_limit';
  end if;

  if (c.preferred_tier is not null and c.preferred_tier <> 'Any'
      and public.athlete_tier_level(c.preferred_tier) > public.athlete_tier_level(b.max_athlete_tier))
     or public.athlete_tier_level(c.min_athlete_tier) > public.athlete_tier_level(b.max_athlete_tier) then
    return 'plan_tier_limit';
  end if;

  v_tiers := c.eligible_athlete_tiers;
  if v_tiers is not null then
    v_tiers := array(
      select t from unnest(v_tiers) as t
      where public.athlete_tier_level(t) <= public.athlete_tier_level(b.max_athlete_tier)
    );
    if cardinality(v_tiers) = 0 then
      return 'plan_tier_limit';
    end if;
  end if;

  select count(*) into open_count
    from public.campaigns
    where business_id = c.business_id and status in ('active', 'open') and id <> p_campaign_id;
  if open_count >= b.max_open_campaigns then
    return 'plan_campaign_limit';
  end if;

  update public.campaigns
    set status = 'active', eligible_athlete_tiers = v_tiers
    where id = p_campaign_id;

  return null;
end;
$$;

revoke all on function public.activate_campaign_within_plan(uuid, text) from public, anon, authenticated;
grant execute on function public.activate_campaign_within_plan(uuid, text) to service_role;

-- The slots API sets a campaign's total capacity. Auto-accept spends open_slots as remaining capacity,
-- so this stores total minus accepted. The campaign row is locked while it counts, so an acceptance
-- running at the same time either finishes first and is counted, or waits and decrements afterwards.
-- Returns {"reason": null | 'not_found' | 'below_filled_count' | plan block, "accepted": n}.
create or replace function public.set_campaign_total_slots(
  p_campaign_id uuid,
  p_total_slots integer,
  p_check_plan boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c record;
  b record;
  v_accepted integer;
begin
  select business_id into c from public.campaigns where id = p_campaign_id for update;
  if not found then
    return jsonb_build_object('reason', 'not_found', 'accepted', 0);
  end if;

  select count(*) into v_accepted
    from public.campaign_applications
    where campaign_id = p_campaign_id and status = 'accepted';

  if p_total_slots < greatest(v_accepted, 1) then
    return jsonb_build_object('reason', 'below_filled_count', 'accepted', v_accepted);
  end if;

  if p_check_plan then
    select subscription_status, billing_ready, max_slots_per_campaign
      into b
      from public.business_billing_profiles
      where business_id = c.business_id;
    if not found or b.subscription_status <> 'active' or not b.billing_ready then
      return jsonb_build_object('reason', 'subscription_required', 'accepted', v_accepted);
    end if;
    if p_total_slots > b.max_slots_per_campaign then
      return jsonb_build_object('reason', 'plan_slot_limit', 'accepted', v_accepted);
    end if;
  end if;

  update public.campaigns
    set slots = p_total_slots, open_slots = p_total_slots - v_accepted
    where id = p_campaign_id;

  return jsonb_build_object('reason', null, 'accepted', v_accepted);
end;
$$;

revoke all on function public.set_campaign_total_slots(uuid, integer, boolean) from public, anon, authenticated;
grant execute on function public.set_campaign_total_slots(uuid, integer, boolean) to service_role;

-- H7. Athletes could write their own Stripe account id and mark Stripe onboarding complete, and payouts
-- go to whatever id is stored. Those come only from Connect onboarding and Stripe's account.updated
-- webhook. "Ready" also comes only from Stripe, whatever payout method the athlete picks.
create or replace function public.guard_athlete_payout_columns()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.stripe_account_id := null;
      new.stripe_onboarding_complete := false;
    else
      new.stripe_account_id := old.stripe_account_id;
      new.stripe_onboarding_complete := old.stripe_onboarding_complete;
    end if;
    -- Stripe is the only payout method, so "ready" means Stripe said so, whatever method is picked.
    new.payout_ready := new.stripe_onboarding_complete;
  end if;
  return new;
end;
$$;

drop trigger if exists athlete_payout_profiles_guard_stripe on public.athlete_payout_profiles;
create trigger athlete_payout_profiles_guard_stripe
before insert or update on public.athlete_payout_profiles
for each row
execute function public.guard_athlete_payout_columns();

-- H8. The direct insert policy on disputes only checked opened_by, so anyone could open a dispute on
-- any application and hold up its auto-approval. Disputes are opened through POST /api/disputes/open,
-- which checks that the caller is a party, using the service role.
drop policy if exists "disp_party_insert" on public.disputes;

-- attempt_auto_accept takes an athlete id. A signed-in caller may only join as themselves.
-- Same function as supabase/fn-auto-accept.sql with the caller check added at the top.
create or replace function public.attempt_auto_accept(
  p_campaign_id uuid,
  p_athlete_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_campaign record;
  v_athlete record;
  v_existing_id uuid;
  v_app_id uuid;
  v_distance_miles numeric(10,2);
  v_updated_count int := 0;
begin
  -- A signed-in caller can only join as themselves. Hillink's server (service role) has no auth.uid().
  if auth.uid() is not null and auth.uid() <> p_athlete_id then
    return jsonb_build_object('success', false, 'reason', 'forbidden');
  end if;

  -- 1) Lock campaign row for race-safe slot decrement.
  select
    c.id,
    c.status,
    c.auto_accept_enabled,
    c.open_slots,
    c.start_date,
    c.auto_accept_lock_hours,
    c.min_athlete_tier,
    c.latitude,
    c.longitude,
    c.auto_accept_radius_miles
  into v_campaign
  from public.campaigns c
  where c.id = p_campaign_id
  for update;

  -- 2) Load athlete profile row.
  select
    ap.id,
    ap.is_verified,
    ap.is_flagged,
    ap.tier,
    ap.latitude,
    ap.longitude
  into v_athlete
  from public.athlete_profiles ap
  where ap.id = p_athlete_id;

  -- 3) Gate checks in order, return clean jsonb failures.
  if v_campaign.id is null then
    return jsonb_build_object('success', false, 'reason', 'campaign_not_found');
  end if;

  if lower(coalesce(v_campaign.status, '')) <> 'active' then
    return jsonb_build_object('success', false, 'reason', 'campaign_not_active');
  end if;

  if coalesce(v_campaign.auto_accept_enabled, false) <> true then
    return jsonb_build_object('success', false, 'reason', 'auto_accept_disabled');
  end if;

  if coalesce(v_campaign.open_slots, 0) <= 0 then
    return jsonb_build_object('success', false, 'reason', 'no_slots');
  end if;

  if v_campaign.start_date is not null
     and v_campaign.start_date <= (v_now + make_interval(hours => coalesce(v_campaign.auto_accept_lock_hours, 0))) then
    return jsonb_build_object('success', false, 'reason', 'auto_accept_locked');
  end if;

  if v_athlete.id is null then
    return jsonb_build_object('success', false, 'reason', 'athlete_profile_not_found');
  end if;

  if coalesce(v_athlete.is_verified, false) <> true then
    return jsonb_build_object('success', false, 'reason', 'not_verified');
  end if;

  if coalesce(v_athlete.is_flagged, false) = true then
    return jsonb_build_object('success', false, 'reason', 'flagged');
  end if;

  if public.tier_rank(v_athlete.tier) < public.tier_rank(v_campaign.min_athlete_tier) then
    return jsonb_build_object('success', false, 'reason', 'tier_insufficient');
  end if;

  if v_campaign.latitude is null or v_campaign.longitude is null then
    return jsonb_build_object('success', false, 'reason', 'campaign_location_missing');
  end if;

  if v_athlete.latitude is null or v_athlete.longitude is null then
    return jsonb_build_object('success', false, 'reason', 'location_missing');
  end if;

  v_distance_miles := (
    earth_distance(
      ll_to_earth(v_athlete.latitude, v_athlete.longitude),
      ll_to_earth(v_campaign.latitude, v_campaign.longitude)
    ) / 1609.34
  )::numeric(10,2);

  if v_distance_miles > coalesce(v_campaign.auto_accept_radius_miles, 0)::numeric then
    return jsonb_build_object('success', false, 'reason', 'outside_radius');
  end if;

  select ca.id
  into v_existing_id
  from public.campaign_applications ca
  where ca.campaign_id = p_campaign_id
    and ca.athlete_id = p_athlete_id
  limit 1;

  if v_existing_id is not null then
    return jsonb_build_object('success', false, 'reason', 'already_applied');
  end if;

  -- 4) Insert accepted application.
  insert into public.campaign_applications (
    campaign_id,
    athlete_id,
    status,
    accepted_at,
    accepted_via,
    distance_miles
  )
  values (
    p_campaign_id,
    p_athlete_id,
    'accepted',
    v_now,
    'auto',
    v_distance_miles
  )
  returning id into v_app_id;

  -- 5) Decrement slot count exactly once; otherwise raise unexpected race error.
  update public.campaigns
  set open_slots = open_slots - 1
  where id = p_campaign_id
    and open_slots > 0;

  get diagnostics v_updated_count = row_count;

  if v_updated_count <> 1 then
    raise exception 'slot_race_condition';
  end if;

  -- 6) Success payload.
  return jsonb_build_object('success', true, 'application_id', v_app_id);
end;
$$;

revoke all on function public.attempt_auto_accept(uuid, uuid) from public, anon;
grant execute on function public.attempt_auto_accept(uuid, uuid) to authenticated, service_role;

-- H9 (data). When an athlete's Instagram wasn't connected or the post wasn't on their account, the app
-- stored likes, reach and views invented from the characters of the proof URL. Those numbers are not
-- real, so clear them. Verified rows (read from the athlete's own account) are untouched. XP that was
-- awarded from invented numbers is NOT reversed here; see the PR for a read-only query to review it.
do $$ begin
  if to_regclass('public.instagram_post_diagnostics') is not null then
    update public.instagram_post_diagnostics
      set likes = 0, comments = 0, saves = 0, reach = 0, impressions = 0, video_views = 0
      where coalesce(diagnostics_status, '') <> 'verified'
        and (coalesce(likes, 0) + coalesce(comments, 0) + coalesce(saves, 0) + coalesce(reach, 0)
             + coalesce(impressions, 0) + coalesce(video_views, 0)) > 0;
  end if;
end $$;
