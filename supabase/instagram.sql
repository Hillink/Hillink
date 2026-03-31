-- Instagram integrations and diagnostics
-- Run this after connections.sql

create table if not exists public.athlete_instagram_connections (
  athlete_id uuid primary key references public.profiles(id) on delete cascade,
  ig_user_id text,
  ig_username text,
  access_token text,
  token_expires_at timestamptz,
  connected_at timestamptz not null default now(),
  last_sync_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.instagram_post_diagnostics (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null unique references public.campaign_applications(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  athlete_id uuid not null references public.profiles(id) on delete cascade,
  ig_media_id text,
  proof_url text not null,
  media_type text,
  caption text,
  posted_at timestamptz,
  likes integer not null default 0,
  comments integer not null default 0,
  saves integer not null default 0,
  reach integer not null default 0,
  impressions integer not null default 0,
  video_views integer not null default 0,
  diagnostics_status text not null default 'mock' check (diagnostics_status in ('verified', 'mock', 'missing_connection', 'unverified', 'error')),
  diagnostics_notes text,
  last_synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists instagram_post_diagnostics_campaign_id_idx
  on public.instagram_post_diagnostics(campaign_id);

create index if not exists instagram_post_diagnostics_athlete_id_idx
  on public.instagram_post_diagnostics(athlete_id);

create or replace function public.touch_instagram_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists athlete_instagram_connections_touch_updated_at on public.athlete_instagram_connections;
create trigger athlete_instagram_connections_touch_updated_at
before update on public.athlete_instagram_connections
for each row
execute function public.touch_instagram_updated_at();

drop trigger if exists instagram_post_diagnostics_touch_updated_at on public.instagram_post_diagnostics;
create trigger instagram_post_diagnostics_touch_updated_at
before update on public.instagram_post_diagnostics
for each row
execute function public.touch_instagram_updated_at();

alter table public.athlete_instagram_connections enable row level security;
alter table public.instagram_post_diagnostics enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='athlete_instagram_connections' and policyname='Athletes can manage own instagram connection'
  ) then
    create policy "Athletes can manage own instagram connection"
      on public.athlete_instagram_connections
      for all
      to authenticated
      using (athlete_id = auth.uid())
      with check (athlete_id = auth.uid());
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='instagram_post_diagnostics' and policyname='Athletes can read own diagnostics'
  ) then
    create policy "Athletes can read own diagnostics"
      on public.instagram_post_diagnostics
      for select
      to authenticated
      using (athlete_id = auth.uid());
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='instagram_post_diagnostics' and policyname='Businesses can read diagnostics for own campaigns'
  ) then
    create policy "Businesses can read diagnostics for own campaigns"
      on public.instagram_post_diagnostics
      for select
      to authenticated
      using (
        exists (
          select 1
          from public.campaigns c
          where c.id = instagram_post_diagnostics.campaign_id
            and c.business_id = auth.uid()
        )
      );
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='athlete_instagram_connections' and policyname='Admins can read instagram connections'
  ) then
    create policy "Admins can read instagram connections"
      on public.athlete_instagram_connections
      for select
      to authenticated
      using (public.is_admin(auth.uid()));
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='instagram_post_diagnostics' and policyname='Admins can read diagnostics'
  ) then
    create policy "Admins can read diagnostics"
      on public.instagram_post_diagnostics
      for select
      to authenticated
      using (public.is_admin(auth.uid()));
  end if;
end $$;
