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

-- A rating only counts when the business that left it ran the campaign, and the athlete really did the work.
create or replace function public.rating_is_valid(p_application_id uuid, p_athlete_id uuid, p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.campaign_applications a
    join public.campaigns c on c.id = a.campaign_id
    where a.id = p_application_id
      and a.athlete_id = p_athlete_id
      and c.business_id = p_business_id
      and a.status in ('approved', 'completed')
  );
$$;

revoke all on function public.rating_is_valid(uuid, uuid, uuid) from public, anon;
grant execute on function public.rating_is_valid(uuid, uuid, uuid) to authenticated, service_role;

-- The old insert policy only checked business_id, so anyone signed in could rate anyone.
drop policy if exists "Businesses can rate athletes" on public.athlete_ratings;
create policy "Businesses can rate athletes"
  on public.athlete_ratings
  for insert
  to authenticated
  with check (business_id = auth.uid() and public.rating_is_valid(application_id, athlete_id, business_id));

-- Everything the score needs, aggregated for one page of athletes (keyset paging by id).
drop function if exists public.athlete_score_inputs();
-- Some databases don't have deliverable_submissions (the deliverables flow is optional). There, first-try
-- and proof timing come from the application alone. Re-run this block after adding that table.
do $score$
declare
  subs_sql text;
begin
  if to_regclass('public.deliverable_submissions') is not null then
    subs_sql := $subs$
    select s.application_id, max(s.version) as max_version,
           bool_or(s.status in ('rejected', 'revision_requested')) as had_redo,
           min(s.submitted_at) as first_submitted_at
    from public.deliverable_submissions s
    where s.application_id in (select id from done)
    group by s.application_id
    $subs$;
  else
    subs_sql := $subs$
    select null::uuid as application_id, null::integer as max_version, null::boolean as had_redo,
           null::timestamptz as first_submitted_at
    where false
    $subs$;
  end if;
  execute format($fn$
create or replace function public.athlete_score_inputs(p_after uuid default null, p_limit integer default 500)
returns table (
  athlete_id uuid,
  rating_count bigint,
  rating_sum bigint,
  completed bigint,
  timed bigint,
  on_time bigint,
  first_try bigint,
  first_try_tracked bigint,
  tracked_campaigns bigint,
  customers bigint
)
language sql
stable
security definer
set search_path = public
as $body$
  with page as (
    select ap.id
    from public.athlete_profiles ap
    join public.profiles pr on pr.id = ap.id
    where p_after is null or ap.id > p_after
    order by ap.id
    limit greatest(1, least(coalesce(p_limit, 500), 1000))
  ),
  done as (
    select a.id, a.athlete_id, a.campaign_id, a.accepted_at, a.submitted_at, c.completion_window_days
    from public.campaign_applications a
    join public.campaigns c on c.id = a.campaign_id
    where a.status in ('approved', 'completed')
      and a.athlete_id in (select id from page)
  ),
  subs as (
%s
  ),
  reds as (
    select r.application_id, count(*) as n
    from public.redemptions r
    where r.application_id in (select id from done)
    group by r.application_id
  ),
  tracked as (
    select distinct r.campaign_id from public.redemptions r
    where r.campaign_id in (select campaign_id from done)
  ),
  work as (
    -- Proof time comes from deliverable_submissions (set by the server) before the application's own column.
    select d.athlete_id,
           count(*) as completed,
           count(*) filter (where d.accepted_at is not null and coalesce(s.first_submitted_at, d.submitted_at) is not null) as timed,
           count(*) filter (
             where d.accepted_at is not null
               and coalesce(s.first_submitted_at, d.submitted_at) <= d.accepted_at + make_interval(days => coalesce(d.completion_window_days, 7))
           ) as on_time,
           -- Only campaigns with tracked proof rounds count toward first-try, either way.
           count(*) filter (where s.application_id is not null and s.max_version = 1 and not s.had_redo) as first_try,
           count(*) filter (where s.application_id is not null) as first_try_tracked,
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
    where ar.athlete_id in (select id from page)
      and public.rating_is_valid(ar.application_id, ar.athlete_id, ar.business_id)
    group by ar.athlete_id
  )
  select p.id,
         coalesce(ra.rating_count, 0), coalesce(ra.rating_sum, 0),
         coalesce(w.completed, 0), coalesce(w.timed, 0), coalesce(w.on_time, 0),
         coalesce(w.first_try, 0), coalesce(w.first_try_tracked, 0),
         coalesce(w.tracked_campaigns, 0), coalesce(w.customers, 0)
  from page p
  left join work w on w.athlete_id = p.id
  left join ratings ra on ra.athlete_id = p.id
  order by p.id;
$body$
  $fn$, subs_sql);
end
$score$;

revoke all on function public.athlete_score_inputs(uuid, integer) from public, anon, authenticated;
grant execute on function public.athlete_score_inputs(uuid, integer) to service_role;

-- Ratings: the average on athlete_profiles is recalculated by a trigger when a business rates an athlete.
-- That trigger ran as the business, and RLS doesn't let a business update an athlete's profile, so the
-- average never changed. Defined here (not only in athlete-ratings.sql) so re-running that file can't undo it.
create or replace function public.recalculate_athlete_average_rating(athlete_uuid uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  avg_rating numeric(3,2);
  count_ratings integer;
begin
  select avg(rating)::numeric(3,2), count(*)::integer
  into avg_rating, count_ratings
  from public.athlete_ratings
  where athlete_id = athlete_uuid
    and public.rating_is_valid(application_id, athlete_id, business_id);

  update public.athlete_profiles
  set average_rating = avg_rating,
      total_ratings = count_ratings
  where id = athlete_uuid;
end;
$$;

revoke all on function public.recalculate_athlete_average_rating(uuid) from public, anon, authenticated;
grant execute on function public.recalculate_athlete_average_rating(uuid) to service_role;

create or replace function public.update_athlete_rating_stats()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform public.recalculate_athlete_average_rating(old.athlete_id);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    perform public.recalculate_athlete_average_rating(new.athlete_id);
    return new;
  end if;
  return old;
end;
$$;

drop trigger if exists athlete_ratings_update_stats on public.athlete_ratings;
create trigger athlete_ratings_update_stats
after insert or update or delete on public.athlete_ratings
for each row
execute function public.update_athlete_rating_stats();

-- Drop ratings that were planted before the policy fix out of every athlete's average.
do $$ declare r record; begin
  for r in select distinct athlete_id from public.athlete_ratings loop
    perform public.recalculate_athlete_average_rating(r.athlete_id);
  end loop;
end $$;

-- Athletes could edit the timestamps the on-time part is built from. Keep them server-only.
create or replace function public.guard_application_timestamps()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.accepted_at := null;
      new.submitted_at := null;
      new.decided_at := null;
      new.reviewed_at := null;
    else
      new.accepted_at := old.accepted_at;
      new.submitted_at := old.submitted_at;
      new.decided_at := old.decided_at;
      new.reviewed_at := old.reviewed_at;
    end if;
  end if;
  return new;
end;
$$;

do $$ begin
  if (select count(*) from information_schema.columns
      where table_schema = 'public' and table_name = 'campaign_applications'
        and column_name in ('accepted_at', 'submitted_at', 'decided_at', 'reviewed_at')) = 4 then
    drop trigger if exists campaign_applications_guard_timestamps on public.campaign_applications;
    create trigger campaign_applications_guard_timestamps
    before insert or update on public.campaign_applications
    for each row
    execute function public.guard_application_timestamps();
  else
    raise warning 'campaign_applications is missing a timestamp column; timestamp guard not installed';
  end if;
end $$;

-- Instagram: only connections made through Instagram login count as verified. The manual connect route and
-- direct API writes can store any account id and token, so they are never verified.
alter table public.athlete_instagram_connections add column if not exists verified boolean not null default false;

create or replace function public.guard_instagram_verified()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT'
       or new.ig_user_id is distinct from old.ig_user_id
       or new.access_token is distinct from old.access_token then
      new.verified := false;
    else
      new.verified := old.verified;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists athlete_instagram_connections_guard_verified on public.athlete_instagram_connections;
create trigger athlete_instagram_connections_guard_verified
before insert or update on public.athlete_instagram_connections
for each row
execute function public.guard_instagram_verified();

-- A disconnected, switched or unverified account loses its verified follower count right away.
create or replace function public.clear_stale_instagram_followers()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    update public.athlete_scores set instagram_followers = null, followers_checked_at = null where athlete_id = old.athlete_id;
    return old;
  end if;
  if not new.verified or (tg_op = 'UPDATE' and new.ig_user_id is distinct from old.ig_user_id) then
    update public.athlete_scores set instagram_followers = null, followers_checked_at = null where athlete_id = new.athlete_id;
  end if;
  return new;
end;
$$;

drop trigger if exists athlete_instagram_connections_clear_followers on public.athlete_instagram_connections;
create trigger athlete_instagram_connections_clear_followers
after insert or update or delete on public.athlete_instagram_connections
for each row
execute function public.clear_stale_instagram_followers();

-- Who to check next: verified connections with a score row, least recently checked first, at most weekly.
create or replace function public.instagram_follower_queue(p_limit integer default 100)
returns table (athlete_id uuid, ig_user_id text, access_token text)
language sql
stable
security definer
set search_path = public
as $$
  select c.athlete_id, c.ig_user_id, c.access_token
  from public.athlete_instagram_connections c
  join public.athlete_scores s on s.athlete_id = c.athlete_id
  where c.verified
    and c.ig_user_id is not null
    and c.access_token is not null
    and (c.token_expires_at is null or c.token_expires_at > now())
    and (s.followers_checked_at is null or s.followers_checked_at < now() - interval '7 days')
  order by s.followers_checked_at nulls first, c.athlete_id
  limit greatest(1, least(coalesce(p_limit, 100), 500));
$$;

revoke all on function public.instagram_follower_queue(integer) from public, anon, authenticated;
grant execute on function public.instagram_follower_queue(integer) to service_role;

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
