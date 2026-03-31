alter table public.campaigns
  add column if not exists additional_compensation text,
  add column if not exists start_date date,
  add column if not exists location_text text;
