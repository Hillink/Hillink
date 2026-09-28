-- Fixes decided on 2026-09-28 from the Help Center's open product questions.
-- Safe to run more than once.

-- 1. Platinum was missing, so it ranked below Bronze when a campaign set a minimum tier for auto-accept.
create or replace function public.tier_rank(t text)
returns int
language sql
immutable
as $$
  select case lower(coalesce(t, ''))
    when 'bronze' then 1
    when 'silver' then 2
    when 'gold' then 3
    when 'platinum' then 4
    when 'diamond' then 5
    else 0
  end;
$$;

-- 2. Athletes rated below 1.5 stars can't join campaigns. This was only checked in the browser.
-- Same function as 20260928000300, plus the rating check. It runs for the apply API, direct inserts
-- and auto-accept, through the campaign_applications_enforce_join_rules trigger.
create or replace function public.athlete_join_block(p_athlete_id uuid, p_campaign_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  a record;
  category text;
begin
  if auth.uid() is not null and auth.uid() <> p_athlete_id then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select confirmed_adult, visa_status, school_disclosure_ack, school_conflict_categories, average_rating
    into a from public.athlete_profiles where id = p_athlete_id;
  if not found or not a.confirmed_adult or a.visa_status is null or not a.school_disclosure_ack then
    return 'compliance_required';
  end if;
  if a.visa_status = 'international_not_cleared' then
    return 'visa_not_cleared';
  end if;
  if a.average_rating is not null and a.average_rating < 1.5 then
    return 'low_rating';
  end if;
  select bp.category_key into category
    from public.campaigns c join public.business_profiles bp on bp.id = c.business_id
    where c.id = p_campaign_id;
  if category is not null and category = any (a.school_conflict_categories) then
    return 'school_conflict';
  end if;
  return null;
end;
$$;

revoke all on function public.athlete_join_block(uuid, uuid) from public, anon;
grant execute on function public.athlete_join_block(uuid, uuid) to authenticated, service_role;

-- 3. Proof is a link to the live post plus notes (there is no screenshot upload), so checklists
-- only ask for things the business can check by opening the link.
alter table public.campaigns
  alter column proof_requirements set default array['Live post URL', 'Post says #ad or uses the Paid partnership label (FTC rule)'];

do $$
declare
  pair text[];
  pairs text[][] := array[
    array['Screenshot of live content', null],
    array['Screenshot for each deliverable', null],
    array['Screenshot showing required tags or mentions', 'Post includes the required tags or mentions'],
    array['Screenshot showing #ad or the Paid partnership label (FTC rule)', 'Post says #ad or uses the Paid partnership label (FTC rule)'],
    array['Photo or screenshot of visit confirmation', 'Post shows your visit (photo or location tag)'],
    array['Delivery or pickup confirmation', 'Post shows the product'],
    array['Live content URL for each deliverable', 'Live content URL for each deliverable (extra links go in the notes)'],
    array['Optional customer code usage screenshot', 'Customer code included in the post (optional)']
  ];
begin
  foreach pair slice 1 in array pairs loop
    if pair[2] is null then
      update public.campaigns set proof_requirements = array_remove(proof_requirements, pair[1])
        where pair[1] = any (proof_requirements);
    else
      update public.campaigns set proof_requirements = array_replace(proof_requirements, pair[1], pair[2])
        where pair[1] = any (proof_requirements);
    end if;
  end loop;
end $$;
