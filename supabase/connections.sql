-- Campaign and athlete-business connection system
-- Run this after schema.sql

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  campaign_type text not null default 'basic_post' check (campaign_type in ('basic_post', 'story_pack', 'reel_boost', 'event_appearance', 'brand_ambassador')),
  deliverables text not null,
  additional_compensation text,
  preferred_tier text not null check (preferred_tier in ('Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Any')),
  payout_cents integer not null check (payout_cents >= 0),
  start_date date,
  slots integer not null check (slots > 0),
  open_slots integer not null check (open_slots >= 0),
  location_text text,
  due_date date,
  status text not null default 'open' check (status in ('open', 'closed', 'completed', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.campaigns
  add column if not exists campaign_type text not null default 'basic_post';

alter table public.campaigns
  add column if not exists additional_compensation text;

alter table public.campaigns
  add column if not exists start_date date;

alter table public.campaigns
  add column if not exists location_text text;

alter table public.campaigns
  drop constraint if exists campaigns_campaign_type_check;

alter table public.campaigns
  add constraint campaigns_campaign_type_check
  check (campaign_type in ('basic_post', 'story_pack', 'reel_boost', 'event_appearance', 'brand_ambassador'));

alter table public.campaigns
  drop constraint if exists campaigns_preferred_tier_check;

alter table public.campaigns
  add constraint campaigns_preferred_tier_check
  check (preferred_tier in ('Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Any'));

create table if not exists public.campaign_applications (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  athlete_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'applied' check (status in ('applied', 'accepted', 'declined', 'withdrawn', 'submitted', 'approved', 'rejected')),
  proof_url text,
  proof_notes text,
  applied_at timestamptz not null default now(),
  decided_at timestamptz,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  unique(campaign_id, athlete_id)
);

create index if not exists campaigns_business_id_idx on public.campaigns(business_id);
create index if not exists campaigns_status_idx on public.campaigns(status);
create index if not exists campaign_applications_campaign_id_idx on public.campaign_applications(campaign_id);
create index if not exists campaign_applications_athlete_id_idx on public.campaign_applications(athlete_id);

create or replace function public.touch_campaign_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists campaigns_touch_updated_at on public.campaigns;
create trigger campaigns_touch_updated_at
before update on public.campaigns
for each row
execute function public.touch_campaign_updated_at();

alter table public.campaigns enable row level security;
alter table public.campaign_applications enable row level security;

-- campaigns: business owns write access, athletes can see open campaigns

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='campaigns' and policyname='Businesses can read own campaigns'
  ) then
    create policy "Businesses can read own campaigns"
      on public.campaigns
      for select
      to authenticated
      using (business_id = auth.uid());
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='campaigns' and policyname='Businesses can insert own campaigns'
  ) then
    create policy "Businesses can insert own campaigns"
      on public.campaigns
      for insert
      to authenticated
      with check (business_id = auth.uid());
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='campaigns' and policyname='Businesses can update own campaigns'
  ) then
    create policy "Businesses can update own campaigns"
      on public.campaigns
      for update
      to authenticated
      using (business_id = auth.uid())
      with check (business_id = auth.uid());
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='campaigns' and policyname='Athletes can browse open campaigns'
  ) then
    create policy "Athletes can browse open campaigns"
      on public.campaigns
      for select
      to authenticated
      using (status = 'open');
  end if;
end $$;

-- campaign_applications: athlete applies/updates own, business reviews apps for own campaigns

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='campaign_applications' and policyname='Athletes can read own applications'
  ) then
    create policy "Athletes can read own applications"
      on public.campaign_applications
      for select
      to authenticated
      using (athlete_id = auth.uid());
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='campaign_applications' and policyname='Athletes can apply to campaigns'
  ) then
    create policy "Athletes can apply to campaigns"
      on public.campaign_applications
      for insert
      to authenticated
      with check (athlete_id = auth.uid());
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='campaign_applications' and policyname='Athletes can update own applications'
  ) then
    create policy "Athletes can update own applications"
      on public.campaign_applications
      for update
      to authenticated
      using (athlete_id = auth.uid())
      with check (athlete_id = auth.uid());
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='campaign_applications' and policyname='Businesses can read applications for own campaigns'
  ) then
    create policy "Businesses can read applications for own campaigns"
      on public.campaign_applications
      for select
      to authenticated
      using (
        exists (
          select 1
          from public.campaigns c
          where c.id = campaign_id and c.business_id = auth.uid()
        )
      );
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='campaign_applications' and policyname='Businesses can update applications for own campaigns'
  ) then
    create policy "Businesses can update applications for own campaigns"
      on public.campaign_applications
      for update
      to authenticated
      using (
        exists (
          select 1
          from public.campaigns c
          where c.id = campaign_id and c.business_id = auth.uid()
        )
      )
      with check (
        exists (
          select 1
          from public.campaigns c
          where c.id = campaign_id and c.business_id = auth.uid()
        )
      );
  end if;
end $$;

-- Businesses can read athlete profiles only when athlete applied to one of their campaigns

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='athlete_profiles' and policyname='Businesses can read applicant athlete profiles'
  ) then
    create policy "Businesses can read applicant athlete profiles"
      on public.athlete_profiles
      for select
      to authenticated
      using (
        exists (
          select 1
          from public.campaign_applications ca
          join public.campaigns c on c.id = ca.campaign_id
          where ca.athlete_id = athlete_profiles.id
            and c.business_id = auth.uid()
        )
      );
  end if;
end $$;

-- Admin read policies for new tables

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='campaigns' and policyname='Admins can read all campaigns'
  ) then
    create policy "Admins can read all campaigns"
      on public.campaigns
      for select
      to authenticated
      using (public.is_admin(auth.uid()));
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='campaign_applications' and policyname='Admins can read all applications'
  ) then
    create policy "Admins can read all applications"
      on public.campaign_applications
      for select
      to authenticated
      using (public.is_admin(auth.uid()));
  end if;
end $$;
