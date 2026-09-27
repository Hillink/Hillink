-- Hillink Score (see lib/score/hillinkScore.ts) and verified Instagram reach.
-- Stored in its own table that only the server writes, so athletes can't edit their own score.
create table if not exists public.athlete_scores (
  athlete_id uuid primary key references public.profiles(id) on delete cascade,
  score integer not null check (score between 0 and 100),
  rating_part integer not null,
  on_time_part integer not null,
  first_try_part integer not null,
  customers_part integer not null,
  completed_campaigns integer not null default 0,
  provisional boolean not null default true,
  instagram_followers integer check (instagram_followers is null or instagram_followers >= 0),
  followers_checked_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists athlete_scores_score_idx on public.athlete_scores (score desc);

alter table public.athlete_scores enable row level security;
drop policy if exists "scores: signed-in users read" on public.athlete_scores;
create policy "scores: signed-in users read" on public.athlete_scores
  for select to authenticated using (true);

-- Everything the score needs, aggregated per athlete in one pass.
create or replace function public.athlete_score_inputs()
returns table (
  athlete_id uuid,
  rating_count bigint,
  rating_sum bigint,
  completed bigint,
  timed bigint,
  on_time bigint,
  first_try bigint,
  tracked_campaigns bigint,
  customers bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with done as (
    select a.id, a.athlete_id, a.campaign_id, a.accepted_at, a.submitted_at, c.completion_window_days
    from public.campaign_applications a
    join public.campaigns c on c.id = a.campaign_id
    where a.status in ('approved', 'completed')
  ),
  subs as (
    select s.application_id, max(s.version) as max_version,
           bool_or(s.status in ('rejected', 'revision_requested')) as had_redo,
           min(s.submitted_at) as first_submitted_at
    from public.deliverable_submissions s
    group by s.application_id
  ),
  reds as (
    select r.application_id, count(*) as n from public.redemptions r group by r.application_id
  ),
  tracked as (
    select distinct r.campaign_id from public.redemptions r
  ),
  work as (
    select d.athlete_id,
           count(*) as completed,
           count(*) filter (where d.accepted_at is not null and coalesce(d.submitted_at, s.first_submitted_at) is not null) as timed,
           count(*) filter (
             where d.accepted_at is not null
               and coalesce(d.submitted_at, s.first_submitted_at) <= d.accepted_at + make_interval(days => coalesce(d.completion_window_days, 7))
           ) as on_time,
           count(*) filter (where s.application_id is null or (s.max_version = 1 and not s.had_redo)) as first_try,
           count(*) filter (where t.campaign_id is not null) as tracked_campaigns,
           coalesce(sum(r.n) filter (where t.campaign_id is not null), 0) as customers
    from done d
    left join subs s on s.application_id = d.id
    left join reds r on r.application_id = d.id
    left join tracked t on t.campaign_id = d.campaign_id
    group by d.athlete_id
  ),
  ratings as (
    select ar.athlete_id, count(*) as rating_count, sum(ar.rating) as rating_sum
    from public.athlete_ratings ar
    group by ar.athlete_id
  )
  select p.id,
         coalesce(ra.rating_count, 0), coalesce(ra.rating_sum, 0),
         coalesce(w.completed, 0), coalesce(w.timed, 0), coalesce(w.on_time, 0), coalesce(w.first_try, 0),
         coalesce(w.tracked_campaigns, 0), coalesce(w.customers, 0)
  from public.athlete_profiles p
  left join work w on w.athlete_id = p.id
  left join ratings ra on ra.athlete_id = p.id
  order by p.id;
$$;

revoke all on function public.athlete_score_inputs() from public, anon, authenticated;
grant execute on function public.athlete_score_inputs() to service_role;

-- Ratings: the average on athlete_profiles is recalculated by a trigger when a business rates an athlete.
-- That trigger ran as the business, and RLS doesn't let a business update an athlete's profile, so the
-- average never changed. Run it as the owner instead.
do $$ begin
  if to_regprocedure('public.update_athlete_rating_stats()') is not null then
    alter function public.update_athlete_rating_stats() security definer;
    alter function public.update_athlete_rating_stats() set search_path = public;
  end if;
  if to_regprocedure('public.recalculate_athlete_average_rating(uuid)') is not null then
    alter function public.recalculate_athlete_average_rating(uuid) security definer;
    alter function public.recalculate_athlete_average_rating(uuid) set search_path = public;
    revoke all on function public.recalculate_athlete_average_rating(uuid) from public, anon, authenticated;
  end if;
end $$;

-- Athletes can edit their own profile, which included their own rating average. Keep those server-only.
create or replace function public.guard_athlete_rating_columns()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.average_rating := null;
      new.total_ratings := 0;
    else
      new.average_rating := old.average_rating;
      new.total_ratings := old.total_ratings;
    end if;
  end if;
  return new;
end;
$$;

do $$ begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'athlete_profiles' and column_name = 'average_rating') then
    drop trigger if exists athlete_profiles_guard_rating_columns on public.athlete_profiles;
    create trigger athlete_profiles_guard_rating_columns
    before insert or update on public.athlete_profiles
    for each row
    execute function public.guard_athlete_rating_columns();
  end if;
end $$;
