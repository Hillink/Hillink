-- Waitlist schema and admin review support
--
-- Preflight:
-- 1) This file is intended for a separate waitlist-only Supabase project.
-- 2) Do not depend on your main app's auth/profiles tables here.
-- 3) reviewed_by stores the admin user id from your primary app project without a foreign key.

create extension if not exists pgcrypto;

create table if not exists public.athlete_waitlist (
  id uuid primary key default gen_random_uuid(),
  school text,
  sport text,
  nil_experience text,
  deal_types text[] not null default '{}',
  would_use_platform text,
  wants_early_access boolean not null default true,
  email text not null,
  instagram_handle text,
  preferred_business_types text,
  objections text,
  status text not null default 'new' check (status in ('new', 'contacted', 'approved', 'rejected')),
  admin_notes text,
  reviewed_at timestamptz,
  reviewed_by uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.business_waitlist (
  id uuid primary key default gen_random_uuid(),
  full_name text,
  business_name text,
  business_type text,
  city text,
  email text not null,
  website_or_instagram text,
  influencer_marketing_experience text,
  desired_campaign_use text,
  wants_early_access boolean not null default true,
  budget_range text,
  objections text,
  created_at timestamptz not null default now()
);

alter table public.athlete_waitlist add column if not exists status text;
alter table public.athlete_waitlist add column if not exists admin_notes text;
alter table public.athlete_waitlist add column if not exists reviewed_at timestamptz;
alter table public.athlete_waitlist add column if not exists reviewed_by uuid;
alter table public.athlete_waitlist add column if not exists created_at timestamptz not null default now();
alter table public.athlete_waitlist alter column email set not null;

update public.athlete_waitlist
   set status = 'new'
 where status is null or btrim(status) = '';

alter table public.athlete_waitlist
  alter column status set default 'new';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'athlete_waitlist_status_check'
      and conrelid = 'public.athlete_waitlist'::regclass
  ) then
    alter table public.athlete_waitlist
      add constraint athlete_waitlist_status_check
      check (status in ('new', 'contacted', 'approved', 'rejected'));
  end if;
end $$;

alter table public.athlete_waitlist
  alter column status set not null;

alter table public.athlete_waitlist enable row level security;
alter table public.business_waitlist enable row level security;

revoke all on table public.athlete_waitlist from public, anon, authenticated;
revoke all on table public.business_waitlist from public, anon, authenticated;

grant insert on table public.athlete_waitlist to anon, authenticated;
grant insert on table public.business_waitlist to anon, authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'athlete_waitlist'
      and policyname = 'athlete_waitlist_public_insert'
  ) then
    create policy athlete_waitlist_public_insert
      on public.athlete_waitlist
      for insert
      to anon, authenticated
      with check (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'business_waitlist'
      and policyname = 'business_waitlist_public_insert'
  ) then
    create policy business_waitlist_public_insert
      on public.business_waitlist
      for insert
      to anon, authenticated
      with check (true);
  end if;
end $$;

create index if not exists athlete_waitlist_created_at_idx
  on public.athlete_waitlist (created_at desc);

create index if not exists athlete_waitlist_status_created_at_idx
  on public.athlete_waitlist (status, created_at desc);

create index if not exists business_waitlist_created_at_idx
  on public.business_waitlist (created_at desc);

create unique index if not exists athlete_waitlist_email_unique
  on public.athlete_waitlist (email);

create unique index if not exists business_waitlist_email_unique
  on public.business_waitlist (email);

create unique index if not exists athlete_waitlist_email_unique_ci
  on public.athlete_waitlist ((lower(email)));

create unique index if not exists business_waitlist_email_unique_ci
  on public.business_waitlist ((lower(email)));
