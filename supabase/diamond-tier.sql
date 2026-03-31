-- Diamond athlete tier rollout
-- Run this after xp.sql, connections.sql, and payments.sql

alter table public.campaigns
  drop constraint if exists campaigns_preferred_tier_check;

alter table public.campaigns
  add constraint campaigns_preferred_tier_check
  check (preferred_tier in ('Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Any'));

alter table public.business_billing_profiles
  drop constraint if exists business_billing_profiles_max_athlete_tier_check;

alter table public.business_billing_profiles
  add constraint business_billing_profiles_max_athlete_tier_check
  check (max_athlete_tier in ('Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond'));

update public.business_billing_profiles
set max_athlete_tier = 'Diamond'
where subscription_tier = 'domination';
