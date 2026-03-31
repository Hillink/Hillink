-- Module 5: Deliverable submission and review flow

create table if not exists public.deliverable_requirements (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  type text not null check (type in ('instagram_post','tiktok_post','story','reel','tweet','review','other')),
  description text,
  deadline_days_after_accept integer not null default 14,
  is_required boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.deliverable_submissions (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.campaign_applications(id) on delete cascade,
  requirement_id uuid not null references public.deliverable_requirements(id) on delete cascade,
  athlete_id uuid not null references public.profiles(id) on delete cascade,
  submission_url text,
  notes text,
  status text not null default 'pending_review'
    check (status in ('pending_review','approved','rejected','revision_requested')),
  rejection_reason text,
  version integer not null default 1,
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id) on delete set null,
  due_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists deliverable_requirements_campaign_idx
  on public.deliverable_requirements (campaign_id);

create index if not exists deliverable_submissions_application_idx
  on public.deliverable_submissions (application_id);

create index if not exists deliverable_submissions_requirement_idx
  on public.deliverable_submissions (requirement_id);

create index if not exists deliverable_submissions_application_requirement_version_idx
  on public.deliverable_submissions (application_id, requirement_id, version desc);

alter table public.deliverable_requirements enable row level security;
alter table public.deliverable_submissions enable row level security;

create or replace function public.prepare_deliverable_submission()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_application_campaign_id uuid;
  v_application_athlete_id uuid;
  v_requirement_campaign_id uuid;
  v_deadline_days integer;
  v_accepted_at timestamptz;
begin
  select ca.campaign_id, ca.athlete_id, coalesce(ca.accepted_at, ca.decided_at, now())
    into v_application_campaign_id, v_application_athlete_id, v_accepted_at
  from public.campaign_applications ca
  where ca.id = new.application_id;

  if not found then
    raise exception 'application_not_found';
  end if;

  select dr.campaign_id, dr.deadline_days_after_accept
    into v_requirement_campaign_id, v_deadline_days
  from public.deliverable_requirements dr
  where dr.id = new.requirement_id;

  if not found then
    raise exception 'requirement_not_found';
  end if;

  if v_requirement_campaign_id <> v_application_campaign_id then
    raise exception 'requirement_campaign_mismatch';
  end if;

  if new.athlete_id <> v_application_athlete_id then
    raise exception 'athlete_application_mismatch';
  end if;

  if new.version is null or new.version < 1 then
    new.version := 1;
  end if;

  if new.submitted_at is null then
    new.submitted_at := now();
  end if;

  new.due_at := v_accepted_at + make_interval(days => coalesce(v_deadline_days, 14));

  return new;
end;
$$;

drop trigger if exists deliverable_submissions_prepare_insert on public.deliverable_submissions;
create trigger deliverable_submissions_prepare_insert
before insert on public.deliverable_submissions
for each row
execute function public.prepare_deliverable_submission();

-- deliverable_requirements policies
do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'deliverable_requirements'
      and policyname = 'dr_business_manage_own_campaign_requirements'
  ) then
    create policy "dr_business_manage_own_campaign_requirements"
      on public.deliverable_requirements
      for all
      to authenticated
      using (
        exists (
          select 1
          from public.campaigns c
          where c.id = deliverable_requirements.campaign_id
            and c.business_id = auth.uid()
        )
      )
      with check (
        exists (
          select 1
          from public.campaigns c
          where c.id = deliverable_requirements.campaign_id
            and c.business_id = auth.uid()
        )
      );
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'deliverable_requirements'
      and policyname = 'dr_athlete_read_related_requirements'
  ) then
    create policy "dr_athlete_read_related_requirements"
      on public.deliverable_requirements
      for select
      to authenticated
      using (
        exists (
          select 1
          from public.campaign_applications ca
          where ca.campaign_id = deliverable_requirements.campaign_id
            and ca.athlete_id = auth.uid()
        )
      );
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'deliverable_requirements'
      and policyname = 'dr_admin_all_requirements'
  ) then
    create policy "dr_admin_all_requirements"
      on public.deliverable_requirements
      for all
      to authenticated
      using (public.is_admin(auth.uid()))
      with check (public.is_admin(auth.uid()));
  end if;
end $$;

-- deliverable_submissions policies (prefix ds_ required)
do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'deliverable_submissions'
      and policyname = 'ds_athlete_select_own'
  ) then
    create policy "ds_athlete_select_own"
      on public.deliverable_submissions
      for select
      to authenticated
      using (athlete_id = auth.uid());
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'deliverable_submissions'
      and policyname = 'ds_athlete_insert_own'
  ) then
    create policy "ds_athlete_insert_own"
      on public.deliverable_submissions
      for insert
      to authenticated
      with check (athlete_id = auth.uid());
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'deliverable_submissions'
      and policyname = 'ds_business_select_own_campaign'
  ) then
    create policy "ds_business_select_own_campaign"
      on public.deliverable_submissions
      for select
      to authenticated
      using (
        exists (
          select 1
          from public.campaign_applications ca
          join public.campaigns c on c.id = ca.campaign_id
          where ca.id = deliverable_submissions.application_id
            and c.business_id = auth.uid()
        )
      );
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'deliverable_submissions'
      and policyname = 'ds_business_update_own_campaign'
  ) then
    create policy "ds_business_update_own_campaign"
      on public.deliverable_submissions
      for update
      to authenticated
      using (
        exists (
          select 1
          from public.campaign_applications ca
          join public.campaigns c on c.id = ca.campaign_id
          where ca.id = deliverable_submissions.application_id
            and c.business_id = auth.uid()
        )
      )
      with check (
        exists (
          select 1
          from public.campaign_applications ca
          join public.campaigns c on c.id = ca.campaign_id
          where ca.id = deliverable_submissions.application_id
            and c.business_id = auth.uid()
        )
      );
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'deliverable_submissions'
      and policyname = 'ds_admin_all_submissions'
  ) then
    create policy "ds_admin_all_submissions"
      on public.deliverable_submissions
      for all
      to authenticated
      using (public.is_admin(auth.uid()))
      with check (public.is_admin(auth.uid()));
  end if;
end $$;
