-- Admin role + policies
-- Run this after your base profiles table exists.

-- 1) allow admin role value
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check
  check (role in ('business', 'athlete', 'admin'));

-- 2) helper to check admin by auth uid
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

-- 3) example admin read policy for cross-user visibility
alter table public.profiles enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and policyname = 'Admins can read all profiles'
  ) then
    create policy "Admins can read all profiles"
      on public.profiles
      for select
      to authenticated
      using (public.is_admin(auth.uid()));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and policyname = 'Admins can update all profiles'
  ) then
    create policy "Admins can update all profiles"
      on public.profiles
      for update
      to authenticated
      using (public.is_admin(auth.uid()))
      with check (public.is_admin(auth.uid()));
  end if;
end $$;

alter table public.athlete_profiles enable row level security;
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'athlete_profiles'
      and policyname = 'Admins can read all athlete profiles'
  ) then
    create policy "Admins can read all athlete profiles"
      on public.athlete_profiles
      for select
      to authenticated
      using (public.is_admin(auth.uid()));
  end if;
end $$;

alter table public.business_profiles enable row level security;
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'business_profiles'
      and policyname = 'Admins can read all business profiles'
  ) then
    create policy "Admins can read all business profiles"
      on public.business_profiles
      for select
      to authenticated
      using (public.is_admin(auth.uid()));
  end if;
end $$;

-- 4) bootstrap first admin manually by email
-- update public.profiles p
--    set role = 'admin'
--   from auth.users u
--  where p.id = u.id
--    and lower(u.email) = lower('your-admin-email@example.com');
