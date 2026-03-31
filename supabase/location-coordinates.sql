alter table public.athlete_profiles
  add column if not exists latitude double precision,
  add column if not exists longitude double precision;

alter table public.business_profiles
  add column if not exists latitude double precision,
  add column if not exists longitude double precision;