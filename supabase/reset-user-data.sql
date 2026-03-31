-- Reset operational/test data for ONE user at a time.
-- Preserves profiles, athlete_profiles, business_profiles, and billing/payout profile rows.
--
-- HOW TO USE:
-- 1) Replace the UUID below with the user you want to wipe.
-- 2) Run this script in Supabase SQL Editor.

begin;

with target as (
  select '00000000-0000-0000-0000-000000000000'::uuid as user_id
),
owned_campaigns as (
  select c.id
  from public.campaigns c
  join target t on c.business_id = t.user_id
),
related_applications as (
  select ca.id
  from public.campaign_applications ca
  join target t on ca.athlete_id = t.user_id
  union
  select ca2.id
  from public.campaign_applications ca2
  where ca2.campaign_id in (select id from owned_campaigns)
)
-- Notifications for this user
 delete from public.notifications n
 using target t
 where n.user_id = t.user_id;

-- Instagram diagnostics linked to this user or their business campaigns/apps
delete from public.instagram_post_diagnostics d
where d.athlete_id = (select user_id from target)
   or d.campaign_id in (select id from owned_campaigns)
   or d.application_id in (select id from related_applications);

-- Ratings linked to this user or their related applications
delete from public.athlete_ratings r
where r.athlete_id = (select user_id from target)
   or r.business_id = (select user_id from target)
   or r.application_id in (select id from related_applications);

-- XP events linked to this user or their related campaign/app rows
delete from public.athlete_xp_events x
where x.athlete_id = (select user_id from target)
   or x.campaign_id in (select id from owned_campaigns)
   or x.application_id in (select id from related_applications);

-- Finance/audit data linked to this user or related rows
delete from public.finance_events f
where f.business_id = (select user_id from target)
   or f.athlete_id = (select user_id from target)
   or f.campaign_id in (select id from owned_campaigns)
   or f.application_id in (select id from related_applications);

delete from public.athlete_verification_audit_logs a
where a.actor_admin_id = (select user_id from target)
   or a.athlete_id = (select user_id from target);

-- Remove IG connection for athlete account if present
delete from public.athlete_instagram_connections c
using target t
where c.athlete_id = t.user_id;

-- Remove applications for this athlete, and all applications for this user's campaigns
delete from public.campaign_applications ca
where ca.athlete_id = (select user_id from target)
   or ca.campaign_id in (select id from owned_campaigns);

-- Remove campaigns owned by this business user
delete from public.campaigns c
using target t
where c.business_id = t.user_id;

-- Clear derived athlete rating aggregates for this user only
update public.athlete_profiles ap
set average_rating = null,
    total_ratings = 0
where ap.id = (select user_id from target);

commit;
