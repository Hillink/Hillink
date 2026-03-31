alter table public.business_billing_profiles
  add column if not exists access_tier_override text;

alter table public.business_billing_profiles
  drop constraint if exists business_billing_profiles_access_tier_override_check;

alter table public.business_billing_profiles
  add constraint business_billing_profiles_access_tier_override_check
  check (
    access_tier_override is null
    or access_tier_override in ('starter', 'growth', 'scale', 'domination')
  );
