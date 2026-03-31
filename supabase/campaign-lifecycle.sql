-- Module 3: Campaign lifecycle enforcement

create table if not exists public.campaign_status_log (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  from_status text,
  to_status text not null,
  changed_by uuid references public.profiles(id) on delete set null,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists campaign_status_log_campaign_idx
  on public.campaign_status_log (campaign_id, created_at desc);

create or replace function public.validate_campaign_status_transition()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_allowed text[];
  v_override text := current_setting('app.is_admin_override', true);
begin
  if old.status is not distinct from new.status then
    return new;
  end if;

  if coalesce(v_override, 'false') = 'true' then
    return new;
  end if;

  v_allowed := case lower(coalesce(old.status, ''))
    when 'draft' then array['active', 'cancelled']
    when 'active' then array['paused', 'completed', 'cancelled']
    when 'open' then array['paused', 'completed', 'cancelled']
    when 'paused' then array['active', 'cancelled']
    when 'closed' then array['active', 'cancelled']
    when 'completed' then array[]::text[]
    when 'cancelled' then array[]::text[]
    else array[]::text[]
  end;

  if not (lower(coalesce(new.status, '')) = any(v_allowed)) then
    raise exception 'invalid_transition: %->%', old.status, new.status;
  end if;

  return new;
end;
$$;

drop trigger if exists before_campaign_status_update on public.campaigns;
create trigger before_campaign_status_update
before update on public.campaigns
for each row
execute function public.validate_campaign_status_transition();

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
begin
  if v_to_status not in ('draft', 'active', 'paused', 'completed', 'cancelled') then
    raise exception 'invalid_to_status';
  end if;

  select role into v_role
  from public.profiles
  where id = p_changed_by;

  if v_role not in ('business', 'admin') then
    raise exception 'forbidden';
  end if;

  select * into v_campaign
  from public.campaigns
  where id = p_campaign_id
  for update;

  if not found then
    raise exception 'campaign_not_found';
  end if;

  if v_role = 'business' and v_campaign.business_id <> p_changed_by then
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
    p_changed_by,
    nullif(trim(coalesce(p_reason, '')), '')
  );

  return jsonb_build_object('campaign', to_jsonb(v_campaign));
end;
$$;

revoke all on function public.transition_campaign_status(uuid, text, uuid, text, boolean) from public;
grant execute on function public.transition_campaign_status(uuid, text, uuid, text, boolean) to authenticated;
grant execute on function public.transition_campaign_status(uuid, text, uuid, text, boolean) to service_role;
