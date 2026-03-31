-- Module 2: Atomic auto-accept function

create extension if not exists cube;
create extension if not exists earthdistance;

create or replace function public.tier_rank(t text)
returns int
language sql
immutable
as $$
  select case lower(coalesce(t, ''))
    when 'bronze' then 1
    when 'silver' then 2
    when 'gold' then 3
    when 'diamond' then 4
    else 0
  end;
$$;

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

revoke all on function public.attempt_auto_accept(uuid, uuid) from public;
grant execute on function public.attempt_auto_accept(uuid, uuid) to authenticated;
grant execute on function public.attempt_auto_accept(uuid, uuid) to service_role;
