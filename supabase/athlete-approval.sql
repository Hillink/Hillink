-- Athlete verification gate
-- Run after schema.sql

alter table public.profiles
  add column if not exists athlete_verification_status text not null default 'pending';

alter table public.profiles
  drop constraint if exists profiles_athlete_verification_status_check;

alter table public.profiles
  add constraint profiles_athlete_verification_status_check
  check (athlete_verification_status in ('pending', 'approved', 'rejected'));

-- Keep non-athlete accounts approved by default
update public.profiles
set athlete_verification_status = 'approved'
where role in ('business', 'admin')
  and athlete_verification_status <> 'approved';
