-- Module 2: Auto-accept schema hardening
-- Idempotent and backward-compatible with existing campaigns/campaign_applications schema.

alter table public.campaigns
  add column if not exists auto_accept_enabled boolean not null default true;

alter table public.campaigns
  add column if not exists auto_accept_radius_miles integer not null default 10;

alter table public.campaigns
  add column if not exists auto_accept_lock_hours integer not null default 12;

alter table public.campaigns
  add column if not exists min_athlete_tier text not null default 'bronze';

alter table public.campaigns
  add column if not exists latitude double precision;

alter table public.campaigns
  add column if not exists longitude double precision;

alter table public.campaigns
  alter column open_slots set default 5;

-- Existing projects may have campaigns.start_date as date; convert safely to timestamptz.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'campaigns'
      and column_name = 'start_date'
      and data_type = 'date'
  ) then
    alter table public.campaigns
      alter column start_date type timestamptz
      using (start_date::timestamptz);
  end if;
end $$;

alter table public.campaigns
  drop constraint if exists campaigns_min_athlete_tier_check;

alter table public.campaigns
  add constraint campaigns_min_athlete_tier_check
  check (min_athlete_tier in ('bronze', 'silver', 'gold', 'platinum', 'diamond'));

-- Keep compatibility with existing states while adding Module 2 states.
alter table public.campaigns
  drop constraint if exists campaigns_status_check;

alter table public.campaigns
  add constraint campaigns_status_check
  check (status in ('draft', 'active', 'paused', 'completed', 'cancelled', 'open', 'closed'));

alter table public.athlete_profiles
  add column if not exists tier text not null default 'bronze';

alter table public.athlete_profiles
  add column if not exists is_flagged boolean not null default false;

alter table public.athlete_profiles
  add column if not exists is_verified boolean not null default false;

alter table public.athlete_profiles
  drop constraint if exists athlete_profiles_tier_check;

alter table public.athlete_profiles
  add constraint athlete_profiles_tier_check
  check (tier in ('bronze', 'silver', 'gold', 'platinum', 'diamond'));

-- campaign_applications already exists; extend it for auto-accept metadata.
alter table public.campaign_applications
  add column if not exists accepted_at timestamptz;

alter table public.campaign_applications
  add column if not exists accepted_via text;

alter table public.campaign_applications
  add column if not exists distance_miles numeric(6,2);

alter table public.campaign_applications
  add column if not exists updated_at timestamptz not null default now();

alter table public.campaign_applications
  drop constraint if exists campaign_applications_accepted_via_check;

alter table public.campaign_applications
  add constraint campaign_applications_accepted_via_check
  check (accepted_via in ('auto', 'manual', 'business') or accepted_via is null);

-- Keep compatibility with existing app statuses while adding module statuses.
alter table public.campaign_applications
  drop constraint if exists campaign_applications_status_check;

alter table public.campaign_applications
  add constraint campaign_applications_status_check
  check (status in ('pending', 'applied', 'accepted', 'rejected', 'declined', 'withdrawn', 'submitted', 'approved', 'completed'));

create or replace function public.touch_campaign_application_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists campaign_applications_touch_updated_at on public.campaign_applications;
create trigger campaign_applications_touch_updated_at
before update on public.campaign_applications
for each row
execute function public.touch_campaign_application_updated_at();
