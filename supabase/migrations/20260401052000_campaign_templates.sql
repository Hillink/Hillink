-- Structured campaign templates for MVP

alter table public.campaigns
  add column if not exists campaign_template text not null default 'instagram_post';

alter table public.campaigns
  add column if not exists campaign_objective text;

alter table public.campaigns
  add column if not exists claim_method text not null default 'first_come_first_serve';

alter table public.campaigns
  add column if not exists completion_window_days integer not null default 3;

alter table public.campaigns
  add column if not exists review_window_hours integer not null default 48;

alter table public.campaigns
  add column if not exists location_type text not null default 'local_only';

alter table public.campaigns
  add column if not exists eligible_athlete_tiers text[] not null default array['Bronze','Silver','Gold','Platinum','Diamond'];

alter table public.campaigns
  add column if not exists proof_requirements text[] not null default array['Live post URL','Screenshot of live content'];

alter table public.campaigns
  add column if not exists template_config jsonb not null default '{}'::jsonb;

alter table public.campaigns
  drop constraint if exists campaigns_campaign_template_check;

alter table public.campaigns
  add constraint campaigns_campaign_template_check
  check (campaign_template in ('instagram_post', 'dine_and_post', 'product_review', 'monthly_ambassador'));

alter table public.campaigns
  drop constraint if exists campaigns_claim_method_check;

alter table public.campaigns
  add constraint campaigns_claim_method_check
  check (claim_method in ('first_come_first_serve', 'business_selects'));

alter table public.campaigns
  drop constraint if exists campaigns_completion_window_days_check;

alter table public.campaigns
  add constraint campaigns_completion_window_days_check
  check (completion_window_days between 1 and 90);

alter table public.campaigns
  drop constraint if exists campaigns_review_window_hours_check;

alter table public.campaigns
  add constraint campaigns_review_window_hours_check
  check (review_window_hours between 1 and 168);

alter table public.campaigns
  drop constraint if exists campaigns_location_type_check;

alter table public.campaigns
  add constraint campaigns_location_type_check
  check (location_type in ('local_only', 'shipped', 'hybrid'));

update public.campaigns
set campaign_template = case campaign_type
  when 'basic_post' then 'instagram_post'
  when 'story_pack' then 'dine_and_post'
  when 'reel_boost' then 'product_review'
  when 'brand_ambassador' then 'monthly_ambassador'
  else 'instagram_post'
end
where campaign_template is null
   or campaign_template = '';

update public.campaigns
set claim_method = case when coalesce(auto_accept_enabled, false) then 'first_come_first_serve' else 'business_selects' end
where claim_method is null
   or claim_method = '';

update public.campaigns
set campaign_objective = coalesce(nullif(campaign_objective, ''), title)
where campaign_objective is null
   or campaign_objective = '';

update public.campaigns
set eligible_athlete_tiers = case
  when preferred_tier = 'Any' then array['Bronze','Silver','Gold','Platinum','Diamond']
  else array[preferred_tier]
end
where eligible_athlete_tiers is null
   or cardinality(eligible_athlete_tiers) = 0;

update public.campaigns
set proof_requirements = array['Live post URL','Screenshot of live content']
where proof_requirements is null
   or cardinality(proof_requirements) = 0;

update public.campaigns
set location_type = case
  when coalesce(location_text, '') ilike '%ship%' then 'shipped'
  when coalesce(location_text, '') ilike '%remote%' or coalesce(location_text, '') ilike '%online%' then 'hybrid'
  else 'local_only'
end
where location_type is null
   or location_type = '';

update public.campaigns
set template_config = coalesce(template_config, '{}'::jsonb) || jsonb_build_object(
  'short_description', left(coalesce(deliverables, ''), 160),
  'campaign_objective', coalesce(campaign_objective, title),
  'platform', 'instagram',
  'claim_method', claim_method,
  'content_guidelines', coalesce(deliverables, ''),
  'proof_requirements', proof_requirements,
  'completion_window_days', completion_window_days
)
where template_config = '{}'::jsonb
   or template_config is null;
