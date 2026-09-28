-- Checks for supabase/migrations/20260929000300_security_hardening.sql.
-- LOCAL DATABASES ONLY. Never run against production. Everything runs in one transaction and is rolled back.
-- Usage (local Supabase after scripts/local-db-bootstrap.sh):
--   docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres < tests/sql/security_hardening_check.sql
-- Each "expect" line says what should print next. Errors marked "expect ... denied/violation/HILLINK" are passes.
\set ON_ERROR_STOP 0
\set ON_ERROR_ROLLBACK on
begin;
-- fixtures (as superuser)
insert into auth.users values ('00000000-0000-0000-0000-00000000000a','admin@x.io','{}'),('00000000-0000-0000-0000-00000000000b','biz@x.io','{}'),('00000000-0000-0000-0000-00000000000c','ath@x.edu','{}');
insert into public.profiles(id, role, athlete_verification_status) values ('00000000-0000-0000-0000-00000000000a','admin','approved'),('00000000-0000-0000-0000-00000000000b','business','approved'),('00000000-0000-0000-0000-00000000000c','athlete','approved');
insert into public.business_profiles(id, business_name) values ('00000000-0000-0000-0000-00000000000b','Biz');
insert into public.athlete_profiles(id, first_name) values ('00000000-0000-0000-0000-00000000000c','Ath');
insert into public.campaigns(id,business_id,title,deliverables,preferred_tier,payout_cents,slots,open_slots,status,start_date) values ('11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-00000000000b','T','post','Any',1000,2,2,'active', now()+interval '5 days');

\echo '--- ATHLETE session'
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c'; set request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated"}';
\echo 'H1 expect permission denied:'
select public.log_athlete_xp_event('00000000-0000-0000-0000-00000000000c', null, null, 'five_star_rating', 999999, null);
\echo 'H2 expect permission denied:'
select public.transition_campaign_status('11111111-1111-1111-1111-111111111111','cancelled','00000000-0000-0000-0000-00000000000b');
\echo 'H3 expect 0 rows visible / insert denied:'
select count(*) from public.campaign_status_log;
insert into public.campaign_status_log(campaign_id,to_status) values ('11111111-1111-1111-1111-111111111111','cancelled');
\echo 'H5 self-verify (expect f / bronze after):'
update public.athlete_profiles set is_verified = true, tier = 'diamond', is_flagged = false, first_name = 'Changed' where id = auth.uid();
reset role; select is_verified, tier, first_name from public.athlete_profiles where id='00000000-0000-0000-0000-00000000000c';
set role authenticated;
\echo 'H7 payout self-set (expect null / false / false):'
insert into public.athlete_payout_profiles(athlete_id,payout_method,recipient_name,stripe_account_id,stripe_onboarding_complete,payout_ready) values (auth.uid(),'stripe_connect','A','acct_evil',true,true);
reset role; select stripe_account_id, stripe_onboarding_complete, payout_ready from public.athlete_payout_profiles; set role authenticated;
\echo 'H7 non-Stripe method cannot mark itself ready (expect paypal / false):'
update public.athlete_payout_profiles set payout_method = 'paypal', payout_ready = true where athlete_id = auth.uid();
reset role; select payout_method, payout_ready from public.athlete_payout_profiles; set role authenticated;
\echo 'H8 dispute direct insert (expect RLS violation):'
insert into public.disputes(application_id, opened_by, opened_by_role, reason) select gen_random_uuid(), auth.uid(), 'athlete', 'long enough reason';
\echo 'auto-accept as someone else (expect forbidden):'
select public.attempt_auto_accept('11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-00000000000b');

\echo '--- BUSINESS session'
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b'; set request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';
\echo 'H6a self-upgrade (expect starter/inactive/1/false, billing_name kept):'
insert into public.business_billing_profiles(business_id,billing_name,billing_email,billing_address_line1,billing_city,billing_state,billing_postal_code,subscription_tier,subscription_status,max_open_campaigns,billing_ready) values (auth.uid(),'N','e','a','c','s','z','domination','active',99,true);
update public.business_billing_profiles set subscription_status='active', max_open_campaigns=99, billing_ready=true, billing_name='New name' where business_id=auth.uid();
select subscription_tier, subscription_status, max_open_campaigns, billing_ready, billing_name from public.business_billing_profiles;
\echo 'H6b create campaign without subscription (expect subscription_required):'
insert into public.campaigns(business_id,title,deliverables,preferred_tier,payout_cents,slots,open_slots,status) values (auth.uid(),'X','d','Any',0,1,1,'active');
reset role;
update public.business_billing_profiles set subscription_status='active', billing_ready=true, max_open_campaigns=2, max_slots_per_campaign=3, max_athlete_tier='Silver';
set role authenticated;
\echo 'slots over plan (expect plan_slot_limit):'
insert into public.campaigns(business_id,title,deliverables,preferred_tier,payout_cents,slots,open_slots,status) values (auth.uid(),'X','d','Any',0,5,5,'active');
\echo 'tier over plan (expect plan_tier_limit):'
insert into public.campaigns(business_id,title,deliverables,preferred_tier,payout_cents,slots,open_slots,status) values (auth.uid(),'X','d','Gold',0,1,1,'active');
\echo 'OK insert (open_slots forced to 2):'
insert into public.campaigns(business_id,title,deliverables,preferred_tier,payout_cents,slots,open_slots,status) values (auth.uid(),'OK','d','Silver',0,2,50,'active') returning open_slots;
\echo '3rd live campaign (expect plan_campaign_limit):'
insert into public.campaigns(business_id,title,deliverables,preferred_tier,payout_cents,slots,open_slots,status) values (auth.uid(),'X','d','Any',0,1,1,'active');
\echo 'draft is fine, then activating it fails:'
insert into public.campaigns(id,business_id,title,deliverables,preferred_tier,payout_cents,slots,open_slots,status) values ('22222222-2222-2222-2222-222222222222',auth.uid(),'D','d','Any',0,1,1,'draft');
update public.campaigns set status='active' where id='22222222-2222-2222-2222-222222222222';
\echo 'min_athlete_tier over plan (expect plan_tier_limit):'
update public.campaigns set min_athlete_tier = 'gold' where title = 'OK';
\echo 'eligible tiers above plan are dropped (expect {Bronze,Silver}):'
update public.campaigns set eligible_athlete_tiers = array['Bronze','Silver','Gold','Diamond'] where title = 'OK' returning eligible_athlete_tiers;
\echo 'go-live function is server-only (expect permission denied):'
select public.activate_campaign_within_plan('22222222-2222-2222-2222-222222222222', 'draft');
\echo 'slots function is server-only (expect permission denied):'
select public.set_campaign_total_slots('11111111-1111-1111-1111-111111111111', 3, true);
\echo 'slot edit ignored (expect 2):'
update public.campaigns set open_slots = 999, title='renamed' where id='11111111-1111-1111-1111-111111111111' returning open_slots, title;
reset role;
\echo '--- SERVICE (no jwt): admin transition still works'
reset request.jwt.claim.sub; reset request.jwt.claims;
select (public.transition_campaign_status('11111111-1111-1111-1111-111111111111','paused','00000000-0000-0000-0000-00000000000a','test')->'campaign'->>'status');
select changed_by from public.campaign_status_log;
\echo 'server go-live at the limit (expect plan_campaign_limit):'
update public.campaigns set status = 'active' where id = '11111111-1111-1111-1111-111111111111';
set role service_role;
select public.activate_campaign_within_plan('22222222-2222-2222-2222-222222222222', 'draft');
\echo 'server go-live with room after pausing one (expect empty, then active):'
update public.campaigns set status = 'paused' where title = 'OK';
select public.activate_campaign_within_plan('22222222-2222-2222-2222-222222222222', 'draft');
select status from public.campaigns where id = '22222222-2222-2222-2222-222222222222';
\echo 'stale from-status (expect stale):'
select public.activate_campaign_within_plan('22222222-2222-2222-2222-222222222222', 'draft');
reset role;
\echo '--- Draft made before a downgrade (plan now: 3 slots, Silver)'
update public.campaigns set status = 'paused' where id = '11111111-1111-1111-1111-111111111111';
insert into public.campaigns(id,business_id,title,deliverables,preferred_tier,payout_cents,slots,open_slots,status) values ('33333333-3333-3333-3333-333333333333','00000000-0000-0000-0000-00000000000b','Big','d','Any',0,5,5,'draft');
set role service_role;
\echo 'too many slots (expect plan_slot_limit):'
select public.activate_campaign_within_plan('33333333-3333-3333-3333-333333333333', 'draft');
reset role; update public.campaigns set slots = 2, open_slots = 2, preferred_tier = 'Gold' where id = '33333333-3333-3333-3333-333333333333'; set role service_role;
\echo 'preferred tier above plan (expect plan_tier_limit):'
select public.activate_campaign_within_plan('33333333-3333-3333-3333-333333333333', 'draft');
reset role; update public.campaigns set preferred_tier = 'Any', min_athlete_tier = 'gold' where id = '33333333-3333-3333-3333-333333333333'; set role service_role;
\echo 'min tier above plan (expect plan_tier_limit):'
select public.activate_campaign_within_plan('33333333-3333-3333-3333-333333333333', 'draft');
reset role; update public.campaigns set min_athlete_tier = 'bronze', eligible_athlete_tiers = array['Bronze','Gold'] where id = '33333333-3333-3333-3333-333333333333'; set role service_role;
\echo 'within plan (expect empty, then active / {Bronze}):'
select public.activate_campaign_within_plan('33333333-3333-3333-3333-333333333333', 'draft');
select status, eligible_athlete_tiers from public.campaigns where id = '33333333-3333-3333-3333-333333333333';
reset role;

\echo '--- Total slots (one accepted athlete, plan max 3)'
set session_replication_role = replica; -- fixture only: skip the join-rule triggers
insert into public.campaign_applications(campaign_id, athlete_id, status, applied_at) values ('11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-00000000000c','accepted', now());
set session_replication_role = origin;
set role service_role;
\echo 'below accepted (expect below_filled_count):'
select public.set_campaign_total_slots('11111111-1111-1111-1111-111111111111', 0, true);
\echo 'over plan (expect plan_slot_limit):'
select public.set_campaign_total_slots('11111111-1111-1111-1111-111111111111', 4, true);
\echo 'total 3 (expect reason null, accepted 1; then slots 3 / open 2):'
select public.set_campaign_total_slots('11111111-1111-1111-1111-111111111111', 3, true);
select slots, open_slots from public.campaigns where id = '11111111-1111-1111-1111-111111111111';
\echo 'admin skips the plan (expect reason null; then slots 10 / open 9):'
select public.set_campaign_total_slots('11111111-1111-1111-1111-111111111111', 10, false);
select slots, open_slots from public.campaigns where id = '11111111-1111-1111-1111-111111111111';
reset role;
\echo 'submitted athletes still hold a slot (expect accepted 1; then slots 3 / open 2):'
update public.campaign_applications set status = 'submitted' where campaign_id = '11111111-1111-1111-1111-111111111111';
set role service_role;
select public.set_campaign_total_slots('11111111-1111-1111-1111-111111111111', 3, true);
select slots, open_slots from public.campaigns where id = '11111111-1111-1111-1111-111111111111';
reset role;

\echo '--- Manual accept takes a slot in the same transaction'
set session_replication_role = replica; -- fixture only
insert into public.campaign_applications(id, campaign_id, athlete_id, status, applied_at) values
  ('44444444-4444-4444-4444-444444444444','11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-00000000000d','applied', now()),
  ('55555555-5555-5555-5555-555555555555','11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-00000000000e','applied', now()),
  ('66666666-6666-6666-6666-666666666666','11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-00000000000f','applied', now());
set session_replication_role = origin;
\echo 'accept function is server-only (expect permission denied):'
set role authenticated;
select public.accept_application_with_slot('44444444-4444-4444-4444-444444444444', 'applied');
reset role;
-- The athletes' eligibility triggers aren't what's being checked here, so skip them for these calls.
set session_replication_role = replica;
set role service_role;
\echo 'accept two (expect empty twice; then open 0):'
select public.accept_application_with_slot('44444444-4444-4444-4444-444444444444', 'applied');
select public.accept_application_with_slot('55555555-5555-5555-5555-555555555555', 'applied');
select open_slots from public.campaigns where id = '11111111-1111-1111-1111-111111111111';
\echo 'accept again (expect stale):'
select public.accept_application_with_slot('44444444-4444-4444-4444-444444444444', 'applied');
\echo 'campaign full (expect no_open_slots; application still applied):'
select public.accept_application_with_slot('66666666-6666-6666-6666-666666666666', 'applied');
select status from public.campaign_applications where id = '66666666-6666-6666-6666-666666666666';
reset role;
set session_replication_role = origin;
rollback;
