-- ============================================================
-- HILLINK NOTIFICATIONS SYSTEM
-- Run this in the Supabase SQL editor after schema.sql
-- ============================================================

create table if not exists public.notifications (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null references public.profiles(id) on delete cascade,
  type         text        not null check (type in (
    'application_accepted',
    'application_declined',
    'proof_approved',
    'proof_rejected',
    'new_application',
    'proof_submitted',
    'challenge_completed',
    'xp_earned',
    'campaign_invited',
    'campaign_invite',
    'admin_broadcast',
    'campaign_cancelled',
    'campaign_completed',
    'payout_sent',
    'verification_approved',
    'verification_rejected',
    'athlete_verification_approved',
    'athlete_verification_rejected',
    'deliverable_submitted',
    'deliverable_reviewed',
    'dispute_opened',
    'dispute_resolved'
  )),
  title        text        not null,
  body         text        not null,
  is_read      boolean     not null default false,
  cta_label    text,
  cta_url      text,
  email_sent   boolean     not null default false,
  email_sent_at timestamptz,
  metadata     jsonb,
  created_at   timestamptz not null default now()
);

create index if not exists notifications_user_created_idx
  on public.notifications (user_id, created_at desc);

create index if not exists notifications_user_unread_idx
  on public.notifications (user_id, is_read)
  where is_read = false;

alter table public.notifications enable row level security;

-- Users can read their own notifications
do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'notifications'
      and policyname = 'Users can read own notifications'
  ) then
    create policy "Users can read own notifications"
      on public.notifications for select to authenticated
      using (user_id = auth.uid());
  end if;
end $$;

-- Users can update (mark-read) their own notifications
do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'notifications'
      and policyname = 'Users can update own notifications'
  ) then
    create policy "Users can update own notifications"
      on public.notifications for update to authenticated
      using (user_id = auth.uid())
      with check (user_id = auth.uid());
  end if;
end $$;

-- Only service role (admin client) can insert — keeps notification creation server-side
do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'notifications'
      and policyname = 'Service role can insert notifications'
  ) then
    create policy "Service role can insert notifications"
      on public.notifications for insert to service_role
      with check (true);
  end if;
end $$;
