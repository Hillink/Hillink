-- Athlete verification audit log
-- Run after athlete-approval.sql

create table if not exists public.athlete_verification_audit_logs (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.profiles(id) on delete cascade,
  actor_admin_id uuid not null references public.profiles(id) on delete cascade,
  previous_status text,
  next_status text not null check (next_status in ('pending', 'approved', 'rejected')),
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists athlete_verification_audit_logs_athlete_idx
  on public.athlete_verification_audit_logs (athlete_id, created_at desc);

create index if not exists athlete_verification_audit_logs_actor_idx
  on public.athlete_verification_audit_logs (actor_admin_id, created_at desc);

alter table public.athlete_verification_audit_logs enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='athlete_verification_audit_logs' and policyname='Admins can read athlete verification audit logs'
  ) then
    create policy "Admins can read athlete verification audit logs"
      on public.athlete_verification_audit_logs
      for select
      to authenticated
      using (public.is_admin(auth.uid()));
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='athlete_verification_audit_logs' and policyname='Admins can insert athlete verification audit logs'
  ) then
    create policy "Admins can insert athlete verification audit logs"
      on public.athlete_verification_audit_logs
      for insert
      to authenticated
      with check (public.is_admin(auth.uid()));
  end if;
end $$;
