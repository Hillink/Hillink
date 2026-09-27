-- Customer redemption tracking: proves Hillink athletes bring real customers through the door.
--
-- Each athlete on a campaign gets one short code (e.g. JAKE-7K2Q) to share with followers.
-- A customer shows or says the code at the counter; staff log it on the business's staff page.
-- Every logged code is one redemption, which feeds the monthly results report.

create table if not exists public.athlete_promo_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9]{2,12}-[A-Z0-9]{4}$'),
  application_id uuid not null unique references public.campaign_applications(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  athlete_id uuid not null references public.profiles(id) on delete cascade,
  business_id uuid not null references public.profiles(id) on delete cascade,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists athlete_promo_codes_business_idx on public.athlete_promo_codes (business_id);
create index if not exists athlete_promo_codes_athlete_idx on public.athlete_promo_codes (athlete_id);

create table if not exists public.redemptions (
  id uuid primary key default gen_random_uuid(),
  promo_code_id uuid not null references public.athlete_promo_codes(id) on delete cascade,
  application_id uuid not null references public.campaign_applications(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  athlete_id uuid not null references public.profiles(id) on delete cascade,
  business_id uuid not null references public.profiles(id) on delete cascade,
  source text not null check (source in ('staff_link', 'business')),
  recorded_by uuid references public.profiles(id) on delete set null,
  purchase_cents integer check (purchase_cents is null or purchase_cents >= 0),
  note text check (note is null or char_length(note) <= 280),
  redeemed_at timestamptz not null default now()
);

create index if not exists redemptions_business_time_idx on public.redemptions (business_id, redeemed_at desc);
create index if not exists redemptions_campaign_idx on public.redemptions (campaign_id);
create index if not exists redemptions_athlete_idx on public.redemptions (athlete_id);
create index if not exists redemptions_code_time_idx on public.redemptions (promo_code_id, redeemed_at desc);

-- A secret link a business gives its counter staff so they can log codes without a Hillink login.
-- Only a SHA-256 hash of the token is stored.
create table if not exists public.business_staff_links (
  business_id uuid primary key references public.profiles(id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now()
);

alter table public.athlete_promo_codes enable row level security;
alter table public.redemptions enable row level security;
alter table public.business_staff_links enable row level security;

-- Reads only; all writes go through the API with the service role.
drop policy if exists "promo codes: athlete reads own" on public.athlete_promo_codes;
create policy "promo codes: athlete reads own" on public.athlete_promo_codes
  for select to authenticated using (athlete_id = auth.uid());

drop policy if exists "promo codes: business reads own" on public.athlete_promo_codes;
create policy "promo codes: business reads own" on public.athlete_promo_codes
  for select to authenticated using (business_id = auth.uid());

drop policy if exists "promo codes: admin reads all" on public.athlete_promo_codes;
create policy "promo codes: admin reads all" on public.athlete_promo_codes
  for select to authenticated using (public.is_admin(auth.uid()));

drop policy if exists "redemptions: athlete reads own" on public.redemptions;
create policy "redemptions: athlete reads own" on public.redemptions
  for select to authenticated using (athlete_id = auth.uid());

drop policy if exists "redemptions: business reads own" on public.redemptions;
create policy "redemptions: business reads own" on public.redemptions
  for select to authenticated using (business_id = auth.uid());

drop policy if exists "redemptions: admin reads all" on public.redemptions;
create policy "redemptions: admin reads all" on public.redemptions
  for select to authenticated using (public.is_admin(auth.uid()));
-- business_staff_links has no policies: only the service role can touch it.

-- What a customer gets for using an athlete's code (e.g. "10% off your order"). Shown on the code page.
alter table public.campaigns add column if not exists customer_offer text
  check (customer_offer is null or char_length(customer_offer) <= 140);
