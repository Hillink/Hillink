-- ============================================================
-- HILLINK FULL SCHEMA — Run this ONCE in Supabase SQL Editor
-- ============================================================

-- 1) BASE TABLES ─────────────────────────────────────────────

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text check (role in ('business', 'athlete', 'admin')),
  referral_code text,
  referred_by_code text,
  referred_by_user_id uuid,
  created_at timestamptz default now()
);

create table if not exists public.athlete_profiles (
  id uuid primary key references public.profiles(id) on delete cascade,
  first_name text,
  last_name text,
  school text,
  sport text,
  graduation text,
  city text,
  state text,
  latitude double precision,
  longitude double precision,
  instagram text,
  tiktok text,
  deal_types text,
  minimum_payout text,
  travel_radius text,
  preferred_company_type text,
  heard_about text,
  bio text,
  recurring_deals boolean default false,
  created_at timestamptz default now()
);

create table if not exists public.business_profiles (
  id uuid primary key references public.profiles(id) on delete cascade,
  business_name text,
  contact_first_name text,
  contact_last_name text,
  category text,
  city text,
  state text,
  latitude double precision,
  longitude double precision,
  website text,
  instagram text,
  campaign_interests text,
  budget text,
  preferred_tiers text,
  local_radius text,
  heard_about text,
  subscription_tier text,
  description text,
  created_at timestamptz default now()
);


-- 2) REFERRAL SYSTEM ─────────────────────────────────────────

create unique index if not exists profiles_referral_code_unique
  on public.profiles (referral_code)
  where referral_code is not null;

create or replace function public.generate_referral_code_for_user(uid uuid)
returns text
language sql
immutable
as $$
  select
    'HL-' ||
    upper(substr(replace(uid::text, '-', ''), 1, 4)) ||
    '-' ||
    upper(substr(md5(uid::text), 1, 4));
$$;

create or replace function public.enforce_profile_referrals()
returns trigger
language plpgsql
as $$
declare
  matched_referrer_id uuid;
begin
  if new.referral_code is null or btrim(new.referral_code) = '' then
    new.referral_code := public.generate_referral_code_for_user(new.id);
  end if;

  new.referral_code := upper(btrim(new.referral_code));

  if tg_op = 'update' and old.referral_code is not null and new.referral_code is distinct from old.referral_code then
    raise exception 'referral_code is immutable once set';
  end if;

  if tg_op = 'update' and old.referred_by_code is not null and new.referred_by_code is distinct from old.referred_by_code then
    raise exception 'referred_by_code already set';
  end if;

  if new.referred_by_code is not null and btrim(new.referred_by_code) <> '' then
    new.referred_by_code := upper(btrim(new.referred_by_code));

    select p.id
      into matched_referrer_id
      from public.profiles p
     where p.referral_code = new.referred_by_code
     limit 1;

    if matched_referrer_id is null then
      raise exception 'invalid referral code';
    end if;

    if matched_referrer_id = new.id then
      raise exception 'self referral not allowed';
    end if;

    new.referred_by_user_id := matched_referrer_id;
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_referral_guard on public.profiles;
create trigger profiles_referral_guard
before insert or update on public.profiles
for each row
execute function public.enforce_profile_referrals();


-- 3) ROW LEVEL SECURITY ──────────────────────────────────────

alter table public.profiles enable row level security;
alter table public.athlete_profiles enable row level security;
alter table public.business_profiles enable row level security;

-- Users can read/write their own profile
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='profiles' and policyname='Users can read own profile') then
    create policy "Users can read own profile" on public.profiles for select to authenticated using (auth.uid() = id);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='profiles' and policyname='Users can insert own profile') then
    create policy "Users can insert own profile" on public.profiles for insert to authenticated with check (auth.uid() = id);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='profiles' and policyname='Users can update own profile') then
    create policy "Users can update own profile" on public.profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);
  end if;
end $$;

-- Users can read/write their own athlete profile
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='athlete_profiles' and policyname='Users can read own athlete profile') then
    create policy "Users can read own athlete profile" on public.athlete_profiles for select to authenticated using (auth.uid() = id);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='athlete_profiles' and policyname='Users can insert own athlete profile') then
    create policy "Users can insert own athlete profile" on public.athlete_profiles for insert to authenticated with check (auth.uid() = id);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='athlete_profiles' and policyname='Users can update own athlete profile') then
    create policy "Users can update own athlete profile" on public.athlete_profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);
  end if;
end $$;

-- Users can read/write their own business profile
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='business_profiles' and policyname='Users can read own business profile') then
    create policy "Users can read own business profile" on public.business_profiles for select to authenticated using (auth.uid() = id);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='business_profiles' and policyname='Users can insert own business profile') then
    create policy "Users can insert own business profile" on public.business_profiles for insert to authenticated with check (auth.uid() = id);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='business_profiles' and policyname='Users can update own business profile') then
    create policy "Users can update own business profile" on public.business_profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);
  end if;
end $$;


-- 4) ADMIN HELPER + POLICIES ─────────────────────────────────

create or replace function public.is_admin(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = uid and p.role = 'admin'
  );
$$;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='profiles' and policyname='Admins can read all profiles') then
    create policy "Admins can read all profiles" on public.profiles for select to authenticated using (public.is_admin(auth.uid()));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='profiles' and policyname='Admins can update all profiles') then
    create policy "Admins can update all profiles" on public.profiles for update to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='athlete_profiles' and policyname='Admins can read all athlete profiles') then
    create policy "Admins can read all athlete profiles" on public.athlete_profiles for select to authenticated using (public.is_admin(auth.uid()));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='business_profiles' and policyname='Admins can read all business profiles') then
    create policy "Admins can read all business profiles" on public.business_profiles for select to authenticated using (public.is_admin(auth.uid()));
  end if;
end $$;


-- 5) BACKFILL existing users missing referral codes ──────────
update public.profiles p
   set referral_code = public.generate_referral_code_for_user(p.id)
 where p.referral_code is null or btrim(p.referral_code) = '';


-- ============================================================
-- AFTER RUNNING: Promote your admin account
-- Replace the email below and uncomment to run:
-- ============================================================
-- insert into public.profiles (id, role)
-- select u.id, 'admin'
-- from auth.users u
-- where lower(u.email) = lower('kyle+admin@hillink.io')
-- on conflict (id) do update set role = 'admin';
