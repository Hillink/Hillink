-- RBAC hardening for profiles
-- Goal: users can read/update their own profile, but cannot self-upgrade role.
-- Admins retain full access via public.is_admin(auth.uid()).

alter table public.profiles enable row level security;

-- Replace broad/self policies with explicit RBAC policy names.
drop policy if exists "Users can read own profile" on public.profiles;
drop policy if exists "Users can update own profile" on public.profiles;
drop policy if exists "Admins can read all profiles" on public.profiles;
drop policy if exists "Admins can update all profiles" on public.profiles;

drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_update_own_no_role" on public.profiles;
drop policy if exists "profiles_admin_all" on public.profiles;

create policy "profiles_select_own"
  on public.profiles
  for select
  to authenticated
  using (auth.uid() = id);

create policy "profiles_update_own_no_role"
  on public.profiles
  for update
  to authenticated
  using (auth.uid() = id)
  with check (
    auth.uid() = id
    and role = (
      select p.role
      from public.profiles p
      where p.id = auth.uid()
    )
  );

create policy "profiles_admin_all"
  on public.profiles
  for all
  to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));
