-- Persistent athlete XP system
-- Run this after connections.sql

create table if not exists public.athlete_xp_events (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.profiles(id) on delete cascade,
  application_id uuid references public.campaign_applications(id) on delete set null,
  campaign_id uuid references public.campaigns(id) on delete set null,
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

create or replace function public.log_athlete_xp_event(
  p_athlete_id uuid,
  p_application_id uuid,
  p_campaign_id uuid,
  p_action text,
  p_xp integer,
  p_details jsonb default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.athlete_xp_events (
    athlete_id,
    application_id,
    campaign_id,
    action,
    xp_delta,
    details_json
  )
  values (
    p_athlete_id,
    p_application_id,
    p_campaign_id,
    p_action,
    p_xp,
    p_details
  )
  on conflict do nothing;
end;
$$;

create or replace function public.award_xp_on_campaign_application_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  due_date_value date;
begin
  if new.status = 'accepted' and (tg_op = 'INSERT' or old.status is distinct from 'accepted') then
    perform public.log_athlete_xp_event(
      new.athlete_id,
      new.id,
      new.campaign_id,
      'accept_campaign',
      25,
      jsonb_build_object('status', new.status)
    );
  end if;

  if new.status = 'submitted' and (tg_op = 'INSERT' or old.status is distinct from 'submitted') then
    perform public.log_athlete_xp_event(
      new.athlete_id,
      new.id,
      new.campaign_id,
      'upload_proof',
      20,
      jsonb_build_object('proof_url', new.proof_url)
    );
  end if;

  if new.status = 'approved' and (tg_op = 'INSERT' or old.status is distinct from 'approved') then
    perform public.log_athlete_xp_event(
      new.athlete_id,
      new.id,
      new.campaign_id,
      'complete_campaign',
      120,
      jsonb_build_object('status', new.status)
    );

    perform public.log_athlete_xp_event(
      new.athlete_id,
      new.id,
      new.campaign_id,
      'approved_post',
      40,
      jsonb_build_object('status', new.status)
    );

    select c.due_date into due_date_value
    from public.campaigns c
    where c.id = new.campaign_id;

    if due_date_value is not null
      and new.submitted_at is not null
      and new.submitted_at <= (due_date_value::timestamp + interval '1 day' - interval '1 second') then
      perform public.log_athlete_xp_event(
        new.athlete_id,
        new.id,
        new.campaign_id,
        'early_completion_bonus',
        30,
        jsonb_build_object('due_date', due_date_value)
      );
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists campaign_applications_award_xp_trigger on public.campaign_applications;
create trigger campaign_applications_award_xp_trigger
after insert or update on public.campaign_applications
for each row
execute function public.award_xp_on_campaign_application_change();

alter table public.athlete_xp_events enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='athlete_xp_events' and policyname='Athletes can read own xp events'
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
    where schemaname='public' and tablename='athlete_xp_events' and policyname='Admins can read all xp events'
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
    where schemaname='public' and tablename='athlete_xp_events' and policyname='Admins can insert xp events'
  ) then
    create policy "Admins can insert xp events"
      on public.athlete_xp_events
      for insert
      to authenticated
      with check (public.is_admin(auth.uid()));
  end if;
end $$;