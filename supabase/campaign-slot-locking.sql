-- Module 4: Slot locking and duplicate-safe slot administration
-- Idempotent migration for campaigns slot-management metadata.

alter table public.campaigns
  add column if not exists version integer not null default 0;

alter table public.campaigns
  drop column if exists auto_accept_locked_at;

alter table public.campaigns
  add column auto_accept_locked_at timestamptz
  generated always as (
    case
      when start_date is null then null
      else start_date - make_interval(hours => coalesce(auto_accept_lock_hours, 12))
    end
  ) stored;

alter table public.campaigns
  drop constraint if exists campaigns_version_nonnegative;

alter table public.campaigns
  add constraint campaigns_version_nonnegative
  check (version >= 0);