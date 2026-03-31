-- One-shot bundle for admin actions:
-- - Reset user activity
-- - Grant XP
-- - Set athlete tier
-- - Override business access tier
--
-- Safe to run multiple times.

begin;

-- 1) Ensure admin role support and helper function exist.
alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('athlete', 'business', 'admin'));

create or replace function public.is_admin(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = uid
      and p.role = 'admin'
  );
$$;

revoke all on function public.is_admin(uuid) from public;
grant execute on function public.is_admin(uuid) to authenticated;
grant execute on function public.is_admin(uuid) to service_role;

-- 2) XP events table used by admin XP grant + athlete tier set.
create table if not exists public.athlete_xp_events (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.profiles(id) on delete cascade,
  application_id uuid,
  campaign_id uuid,
  action text not null check (
    action in (
      'accept_campaign',
      'complete_campaign',
      'early_completion_bonus',
      'upload_proof',
      'approved_post',
      'five_star_rating',
      'repeat_business_bonus',
      'complete_profile',
      'connect_instagram',
      'connect_tiktok',
      'refer_athlete_signup',
      'refer_business_signup',
      'referred_user_first_completion',
      'weekly_activity_streak',
      'monthly_activity_streak'
    )
  ),
  xp_delta integer not null,
  details_json jsonb,
  created_at timestamptz not null default now()
);

create index if not exists athlete_xp_events_athlete_created_idx
  on public.athlete_xp_events (athlete_id, created_at desc);

create unique index if not exists athlete_xp_events_application_action_uniq
  on public.athlete_xp_events (athlete_id, application_id, action)
  where application_id is not null;

alter table public.athlete_xp_events enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'athlete_xp_events'
      and policyname = 'Athletes can read own xp events'
  ) then
    create policy "Athletes can read own xp events"
      on public.athlete_xp_events
      for select
      to authenticated
      using (athlete_id = auth.uid());
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'athlete_xp_events'
      and policyname = 'Admins can read all xp events'
  ) then
    create policy "Admins can read all xp events"
      on public.athlete_xp_events
      for select
      to authenticated
      using (public.is_admin(auth.uid()));
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'athlete_xp_events'
      and policyname = 'Admins can insert xp events'
  ) then
    create policy "Admins can insert xp events"
      on public.athlete_xp_events
      for insert
      to authenticated
      with check (public.is_admin(auth.uid()));
  end if;
end $$;

-- 3) Business billing fields used by admin business access-tier override.
alter table public.business_billing_profiles
  add column if not exists max_slots_per_campaign integer not null default 3;

alter table public.business_billing_profiles
  add column if not exists max_open_campaigns integer not null default 1;

alter table public.business_billing_profiles
  add column if not exists max_athlete_tier text not null default 'Bronze';

alter table public.business_billing_profiles
  add column if not exists access_tier_override text;

alter table public.business_billing_profiles
  drop constraint if exists business_billing_profiles_subscription_tier_check;

alter table public.business_billing_profiles
  add constraint business_billing_profiles_subscription_tier_check
  check (subscription_tier in ('starter', 'growth', 'scale', 'domination'));

alter table public.business_billing_profiles
  drop constraint if exists business_billing_profiles_max_athlete_tier_check;

alter table public.business_billing_profiles
  add constraint business_billing_profiles_max_athlete_tier_check
  check (max_athlete_tier in ('Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond'));

alter table public.business_billing_profiles
  drop constraint if exists business_billing_profiles_access_tier_override_check;

alter table public.business_billing_profiles
  add constraint business_billing_profiles_access_tier_override_check
  check (
    access_tier_override is null
    or access_tier_override in ('starter', 'growth', 'scale', 'domination')
  );

-- Admins can read all billing profiles (used in admin pages/flows).
do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'business_billing_profiles'
      and policyname = 'Admins can read all business billing profiles'
  ) then
    create policy "Admins can read all business billing profiles"
      on public.business_billing_profiles
      for select
      to authenticated
      using (public.is_admin(auth.uid()));
  end if;
end $$;

-- 4) Rating fields touched during reset recompute.
alter table public.athlete_profiles
  add column if not exists average_rating numeric(3,2);

alter table public.athlete_profiles
  add column if not exists total_ratings integer not null default 0;

-- 5) Optional reset-related tables (created if missing).
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null default 'Notification',
  body text not null default '',
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.athlete_instagram_connections (
  athlete_id uuid primary key references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.athlete_verification_audit_logs (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.profiles(id) on delete cascade,
  actor_admin_id uuid not null references public.profiles(id) on delete cascade,
  previous_status text,
  next_status text not null,
  reason text,
  created_at timestamptz not null default now()
);

create table if not exists public.finance_events (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'system',
  event_type text not null default 'manual',
  event_id text,
  business_id uuid references public.profiles(id) on delete set null,
  athlete_id uuid references public.profiles(id) on delete set null,
  campaign_id uuid,
  application_id uuid,
  transfer_id text,
  amount_cents integer,
  currency text,
  status text,
  details_json jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.instagram_post_diagnostics (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid,
  campaign_id uuid,
  application_id uuid,
  created_at timestamptz not null default now()
);

commit;

-- Optional: promote your current account to admin if needed.
-- Replace the email below, then run separately:
-- update public.profiles p
-- set role = 'admin'
-- where p.id in (
--   select u.id
--   from auth.users u
--   where lower(u.email) = lower('you@example.com')
-- );
