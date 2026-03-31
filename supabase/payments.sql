-- Billing and payout profiles (Stripe-ready metadata only)
-- Run this after schema.sql

create table if not exists public.business_billing_profiles (
  business_id uuid primary key references public.profiles(id) on delete cascade,
  subscription_tier text not null default 'starter' check (subscription_tier in ('starter', 'growth', 'scale', 'domination')),
  subscription_status text not null default 'inactive' check (subscription_status in ('inactive', 'active', 'past_due', 'cancelled')),
  monthly_price_cents integer not null default 25000 check (monthly_price_cents >= 0),
  max_slots_per_campaign integer not null default 3 check (max_slots_per_campaign > 0),
  max_open_campaigns integer not null default 1 check (max_open_campaigns > 0),
  max_athlete_tier text not null default 'Bronze' check (max_athlete_tier in ('Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond')),
  billing_name text not null,
  billing_email text not null,
  billing_address_line1 text not null,
  billing_city text not null,
  billing_state text not null,
  billing_postal_code text not null,
  billing_country text not null default 'US',
  stripe_customer_id text,
  stripe_subscription_id text,
  stripe_subscription_status text,
  stripe_payment_method_id text,
  card_brand text,
  card_last4 text,
  billing_ready boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.athlete_payout_profiles (
  athlete_id uuid primary key references public.profiles(id) on delete cascade,
  payout_method text not null check (payout_method in ('stripe_connect', 'bank_transfer', 'paypal', 'venmo', 'cashapp')),
  recipient_name text not null,
  recipient_email text,
  payout_handle text,
  bank_last4 text,
  stripe_account_id text,
  stripe_onboarding_complete boolean not null default false,
  payout_ready boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.touch_updated_at_generic()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists business_billing_profiles_touch_updated_at on public.business_billing_profiles;
create trigger business_billing_profiles_touch_updated_at
before update on public.business_billing_profiles
for each row
execute function public.touch_updated_at_generic();

drop trigger if exists athlete_payout_profiles_touch_updated_at on public.athlete_payout_profiles;
create trigger athlete_payout_profiles_touch_updated_at
before update on public.athlete_payout_profiles
for each row
execute function public.touch_updated_at_generic();

alter table public.business_billing_profiles enable row level security;
alter table public.athlete_payout_profiles enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='business_billing_profiles' and policyname='Businesses can manage own billing profile'
  ) then
    create policy "Businesses can manage own billing profile"
      on public.business_billing_profiles
      for all
      to authenticated
      using (business_id = auth.uid())
      with check (business_id = auth.uid());
  end if;
end $$;

alter table public.business_billing_profiles
  drop constraint if exists business_billing_profiles_subscription_tier_check;

alter table public.business_billing_profiles
  add constraint business_billing_profiles_subscription_tier_check
  check (subscription_tier in ('starter', 'growth', 'scale', 'domination'));

alter table public.business_billing_profiles
  add column if not exists monthly_price_cents integer not null default 25000;

alter table public.business_billing_profiles
  add column if not exists stripe_subscription_id text;

alter table public.business_billing_profiles
  add column if not exists stripe_subscription_status text;

alter table public.business_billing_profiles
  drop constraint if exists business_billing_profiles_max_athlete_tier_check;

alter table public.business_billing_profiles
  add constraint business_billing_profiles_max_athlete_tier_check
  check (max_athlete_tier in ('Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond'));

alter table public.athlete_payout_profiles
  add column if not exists stripe_onboarding_complete boolean not null default false;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='athlete_payout_profiles' and policyname='Athletes can manage own payout profile'
  ) then
    create policy "Athletes can manage own payout profile"
      on public.athlete_payout_profiles
      for all
      to authenticated
      using (athlete_id = auth.uid())
      with check (athlete_id = auth.uid());
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='business_billing_profiles' and policyname='Admins can read all business billing profiles'
  ) then
    create policy "Admins can read all business billing profiles"
      on public.business_billing_profiles
      for select
      to authenticated
      using (public.is_admin(auth.uid()));
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='athlete_payout_profiles' and policyname='Admins can read all athlete payout profiles'
  ) then
    create policy "Admins can read all athlete payout profiles"
      on public.athlete_payout_profiles
      for select
      to authenticated
      using (public.is_admin(auth.uid()));
  end if;
end $$;

create table if not exists public.finance_events (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('stripe_webhook', 'payout_trigger', 'system')),
  event_type text not null,
  event_id text,
  business_id uuid references public.profiles(id) on delete set null,
  athlete_id uuid references public.profiles(id) on delete set null,
  campaign_id uuid,
  application_id uuid,
  transfer_id text,
  amount_cents integer check (amount_cents is null or amount_cents >= 0),
  currency text,
  status text,
  details_json jsonb,
  created_at timestamptz not null default now()
);

create index if not exists finance_events_created_at_idx
  on public.finance_events(created_at desc);

create index if not exists finance_events_business_id_idx
  on public.finance_events(business_id);

create index if not exists finance_events_athlete_id_idx
  on public.finance_events(athlete_id);

create index if not exists finance_events_application_id_idx
  on public.finance_events(application_id);

do $$ begin
  if to_regclass('public.campaigns') is not null and not exists (
    select 1
    from pg_constraint
    where conname = 'finance_events_campaign_id_fkey'
      and conrelid = 'public.finance_events'::regclass
  ) then
    alter table public.finance_events
      add constraint finance_events_campaign_id_fkey
      foreign key (campaign_id)
      references public.campaigns(id)
      on delete set null;
  end if;
end $$;

do $$ begin
  if to_regclass('public.campaign_applications') is not null and not exists (
    select 1
    from pg_constraint
    where conname = 'finance_events_application_id_fkey'
      and conrelid = 'public.finance_events'::regclass
  ) then
    alter table public.finance_events
      add constraint finance_events_application_id_fkey
      foreign key (application_id)
      references public.campaign_applications(id)
      on delete set null;
  end if;
end $$;

alter table public.finance_events enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='finance_events' and policyname='Admins can read finance events'
  ) then
    create policy "Admins can read finance events"
      on public.finance_events
      for select
      to authenticated
      using (public.is_admin(auth.uid()));
  end if;
end $$;

-- Module 6: Payout Hold / Escrow-Style Status Logic
-- Tracks payment hold status from commitment through payout

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.campaign_applications(id) on delete cascade,
  business_id uuid references public.profiles(id) on delete set null,
  athlete_id uuid references public.profiles(id) on delete set null,
  hold_status text not null default 'uncommitted'
    check (hold_status in ('uncommitted','held','released','refunded','disputed')),
  stripe_payment_intent_id text,
  stripe_transfer_id text,
  amount_cents integer not null default 0 check (amount_cents >= 0),
  payout_at timestamptz,
  idempotency_key text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists payments_application_id_idx
  on public.payments (application_id);

create index if not exists payments_business_id_idx
  on public.payments (business_id);

create index if not exists payments_athlete_id_idx
  on public.payments (athlete_id);

create index if not exists payments_hold_status_idx
  on public.payments (hold_status);

create index if not exists payments_stripe_transfer_id_idx
  on public.payments (stripe_transfer_id);

-- RLS policies for payments table
alter table public.payments enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='payments' and policyname='p_athlete_select_own'
  ) then
    create policy "p_athlete_select_own"
      on public.payments
      for select
      to authenticated
      using (athlete_id = auth.uid());
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='payments' and policyname='p_business_select_own'
  ) then
    create policy "p_business_select_own"
      on public.payments
      for select
      to authenticated
      using (
        exists (
          select 1
          from public.campaign_applications ca
          join public.campaigns c on c.id = ca.campaign_id
          where ca.id = payments.application_id
            and c.business_id = auth.uid()
        )
      );
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='payments' and policyname='p_admin_all'
  ) then
    create policy "p_admin_all"
      on public.payments
      for all
      to authenticated
      using (public.is_admin(auth.uid()))
      with check (public.is_admin(auth.uid()));
  end if;
end $$;

-- Trigger function: auto-release payment when application completes
create or replace function public.release_payment_on_completion()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Only fire if status changes to completed from something else
  if new.status = 'completed' and old.status != 'completed' then
    update public.payments
    set hold_status = 'released', payout_at = now(), updated_at = now()
    where application_id = new.id
      and hold_status = 'held';
  end if;

  return new;
end;
$$;

drop trigger if exists campaign_applications_release_on_completed on public.campaign_applications;
create trigger campaign_applications_release_on_completed
after update on public.campaign_applications
for each row
execute function public.release_payment_on_completion();
