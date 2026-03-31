-- Athlete rating system
-- Business rates athletes after campaign approval (1-5 stars)
-- Ratings block low-performing athletes from future campaigns

create table if not exists public.athlete_ratings (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.profiles(id) on delete cascade,
  business_id uuid not null references public.profiles(id) on delete cascade,
  application_id uuid not null references public.campaign_applications(id) on delete cascade,
  rating integer not null check (rating >= 1 and rating <= 5),
  review text,
  created_at timestamptz not null default now(),
  unique(application_id)
);

create index if not exists athlete_ratings_athlete_id_idx on public.athlete_ratings(athlete_id);
create index if not exists athlete_ratings_business_id_idx on public.athlete_ratings(business_id);
create index if not exists athlete_ratings_application_id_idx on public.athlete_ratings(application_id);

-- Extend athlete_profiles with rating stats
alter table public.athlete_profiles
  add column if not exists average_rating numeric(3,2),
  add column if not exists total_ratings integer default 0;

-- Function to calculate average rating for an athlete
create or replace function public.recalculate_athlete_average_rating(athlete_uuid uuid)
returns void
language plpgsql
as $$
declare
  avg_rating numeric(3,2);
  count_ratings integer;
begin
  select 
    avg(rating)::numeric(3,2),
    count(*)::integer
  into avg_rating, count_ratings
  from public.athlete_ratings
  where athlete_id = athlete_uuid;

  update public.athlete_profiles
  set 
    average_rating = avg_rating,
    total_ratings = count_ratings
  where id = athlete_uuid;
end;
$$;

-- Trigger to update average rating when a new rating is added
create or replace function public.update_athlete_rating_stats()
returns trigger
language plpgsql
as $$
begin
  perform public.recalculate_athlete_average_rating(new.athlete_id);
  return new;
end;
$$;

drop trigger if exists athlete_ratings_update_stats on public.athlete_ratings;
create trigger athlete_ratings_update_stats
after insert or update on public.athlete_ratings
for each row
execute function public.update_athlete_rating_stats();

-- Row level security
alter table public.athlete_ratings enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='athlete_ratings' and policyname='Athletes can see own ratings'
  ) then
    create policy "Athletes can see own ratings"
      on public.athlete_ratings
      for select
      to authenticated
      using (athlete_id = auth.uid() or business_id = auth.uid());
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='athlete_ratings' and policyname='Businesses can rate athletes'
  ) then
    create policy "Businesses can rate athletes"
      on public.athlete_ratings
      for insert
      to authenticated
      with check (business_id = auth.uid());
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='athlete_ratings' and policyname='Ratings are readable'
  ) then
    create policy "Ratings are readable"
      on public.athlete_ratings
      for select
      to authenticated
      using (true);
  end if;
end $$;
