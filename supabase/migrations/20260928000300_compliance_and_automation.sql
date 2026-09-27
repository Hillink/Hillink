-- Compliance checks for who can work with whom. Lists mirror lib/compliance/rules.ts; keep in sync.

-- Business category as a fixed key. Restricted categories (alcohol, betting, cannabis/CBD, tobacco/vape,
-- adult, firearms, supplements) can't be saved at all.
alter table public.business_profiles add column if not exists category_key text;
alter table public.business_profiles drop constraint if exists business_profiles_category_key_check;
alter table public.business_profiles add constraint business_profiles_category_key_check check (
  category_key is null or category_key in (
    'restaurant','cafe_dessert','fitness','beauty','apparel','retail','beverages','banking','auto',
    'telecom','health','education','housing','entertainment','services','other'
  )
);

-- Athlete eligibility, confirmed by the athlete.
alter table public.athlete_profiles
  add column if not exists confirmed_adult boolean not null default false,
  add column if not exists visa_status text,
  add column if not exists school_disclosure_ack boolean not null default false,
  add column if not exists school_conflict_categories text[] not null default '{}',
  add column if not exists compliance_confirmed_at timestamptz;
alter table public.athlete_profiles drop constraint if exists athlete_profiles_visa_status_check;
alter table public.athlete_profiles add constraint athlete_profiles_visa_status_check check (
  visa_status is null or visa_status in ('us_citizen_or_resident','international_cleared','international_not_cleared')
);

-- Why an athlete can't join a campaign, or null. Mirrors joinBlock() in lib/compliance/rules.ts.
create or replace function public.athlete_join_block(p_athlete_id uuid, p_campaign_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  a record;
  category text;
begin
  select confirmed_adult, visa_status, school_disclosure_ack, school_conflict_categories
    into a from public.athlete_profiles where id = p_athlete_id;
  if not found or not a.confirmed_adult or a.visa_status is null or not a.school_disclosure_ack then
    return 'compliance_required';
  end if;
  if a.visa_status = 'international_not_cleared' then
    return 'visa_not_cleared';
  end if;
  select bp.category_key into category
    from public.campaigns c join public.business_profiles bp on bp.id = c.business_id
    where c.id = p_campaign_id;
  if category is not null and category = any (a.school_conflict_categories) then
    return 'school_conflict';
  end if;
  return null;
end;
$$;

revoke all on function public.athlete_join_block(uuid, uuid) from public, anon;
grant execute on function public.athlete_join_block(uuid, uuid) to authenticated, service_role;

-- Every way an athlete joins (apply API, direct insert, auto-accept) goes through this.
-- The service role (Hillink's server and admin tools) is exempt.
create or replace function public.enforce_athlete_join_rules()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  reason text;
begin
  if current_user = 'service_role' then
    return new;
  end if;
  reason := public.athlete_join_block(new.athlete_id, new.campaign_id);
  if reason is not null then
    raise exception 'HILLINK:%', reason using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists campaign_applications_enforce_join_rules on public.campaign_applications;
create trigger campaign_applications_enforce_join_rules
before insert on public.campaign_applications
for each row
execute function public.enforce_athlete_join_rules();
