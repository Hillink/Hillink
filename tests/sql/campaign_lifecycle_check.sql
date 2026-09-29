-- Checks for supabase/migrations/20260929000400_campaign_lifecycle_records.sql.
-- LOCAL DATABASES ONLY. Never run against production. Everything runs in one transaction and is rolled back.
-- Each "expect" line says what should print next.
\set ON_ERROR_STOP 0
\set ON_ERROR_ROLLBACK on
begin;
set session_replication_role = replica; -- fixtures only: skip eligibility triggers
insert into auth.users values ('00000000-0000-0000-0000-00000000000b','biz@x.io','{}'),('00000000-0000-0000-0000-00000000000c','a1@x.edu','{}'),('00000000-0000-0000-0000-00000000000d','a2@x.edu','{}'),('00000000-0000-0000-0000-00000000000e','a3@x.edu','{}'),('00000000-0000-0000-0000-00000000000a','admin@x.io','{}');
insert into public.profiles(id, role) values ('00000000-0000-0000-0000-00000000000b','business'),('00000000-0000-0000-0000-00000000000c','athlete'),('00000000-0000-0000-0000-00000000000d','athlete'),('00000000-0000-0000-0000-00000000000e','athlete'),('00000000-0000-0000-0000-00000000000a','admin');
insert into public.campaigns(id,business_id,title,deliverables,preferred_tier,payout_cents,slots,open_slots,status) values
  ('11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-00000000000b','No proof','d','Any',1000,3,1,'open'),
  ('22222222-2222-2222-2222-222222222222','00000000-0000-0000-0000-00000000000b','Proof in','d','Any',1000,3,2,'open'),
  ('33333333-3333-3333-3333-333333333333','00000000-0000-0000-0000-00000000000b','Deliverable in','d','Any',1000,3,1,'open');
insert into public.campaign_applications(id,campaign_id,athlete_id,status) values
  ('a1111111-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-00000000000c','accepted'),
  ('a1111111-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-00000000000d','accepted'),
  ('a1111111-0000-0000-0000-000000000003','11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-00000000000e','applied'),
  ('a2222222-0000-0000-0000-000000000001','22222222-2222-2222-2222-222222222222','00000000-0000-0000-0000-00000000000c','submitted'),
  ('a3333333-0000-0000-0000-000000000001','33333333-3333-3333-3333-333333333333','00000000-0000-0000-0000-00000000000e','accepted'),
  ('a3333333-0000-0000-0000-000000000002','33333333-3333-3333-3333-333333333333','00000000-0000-0000-0000-00000000000d','accepted');
-- A deliverable sent through the deliverables flow leaves the application "accepted".
insert into public.deliverable_requirements(id,campaign_id,type) values ('d3333333-0000-0000-0000-000000000001','33333333-3333-3333-3333-333333333333','instagram_post');
insert into public.deliverable_submissions(application_id,requirement_id,athlete_id,submission_url) values
  ('a3333333-0000-0000-0000-000000000001','d3333333-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000e','https://instagram.com/p/x');
set session_replication_role = origin;

\echo '--- BUSINESS (signed in)'
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
set request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';
\echo 'direct cancel after proof (expect HILLINK:use_cancel_flow):'
update public.campaigns set status = 'cancelled' where id = '22222222-2222-2222-2222-222222222222';
\echo 'direct cancel with no proof either (expect HILLINK:use_cancel_flow):'
update public.campaigns set status = 'cancelled' where id = '11111111-1111-1111-1111-111111111111';
\echo 'cancel function is server-only (expect permission denied):'
select public.cancel_campaign_keep_records('11111111-1111-1111-1111-111111111111', auth.uid(), 'x', false);
reset role;
reset request.jwt.claim.sub; reset request.jwt.claims;

\echo '--- SERVER'
set role service_role;
\echo 'business cancel after proof (expect proof_submitted, nothing changed):'
select public.cancel_campaign_keep_records('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-00000000000b', 'Cancelled by business', false);
select status from public.campaigns where id = '22222222-2222-2222-2222-222222222222';
\echo 'business cancel without proof (expect reason null, 3 applications):'
select public.cancel_campaign_keep_records('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-00000000000b', 'Cancelled by business', false);
\echo 'rows kept (expect campaign cancelled / 0 open; 2 withdrawn + 1 declined; 1 log row):'
select status, open_slots from public.campaigns where id = '11111111-1111-1111-1111-111111111111';
select status, count(*) from public.campaign_applications where campaign_id = '11111111-1111-1111-1111-111111111111' group by status order by status;
select count(*) from public.campaign_status_log where campaign_id = '11111111-1111-1111-1111-111111111111';
\echo 'retry on cancelled campaign (expect reason null, same 3 applications, still 1 log row):'
select public.cancel_campaign_keep_records('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-00000000000b', 'Cancelled by business', false);
select count(*) from public.campaign_status_log where campaign_id = '11111111-1111-1111-1111-111111111111';
\echo 'admin cancel after proof (expect reason null and the submitted application, which is withdrawn):'
select public.cancel_campaign_keep_records('22222222-2222-2222-2222-222222222222', null, 'Admin', true);
select status from public.campaign_applications where id = 'a2222222-0000-0000-0000-000000000001';
reset role;
\echo '--- PAY CUTS (BUSINESS, signed in)'
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
set request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';
\echo 'lower pay with an athlete still in (expect HILLINK:payout_locked):'
update public.campaigns set payout_cents = 0 where id = '33333333-3333-3333-3333-333333333333';
\echo 'raise pay (expect UPDATE 1 and 1500):'
update public.campaigns set payout_cents = 1500 where id = '22222222-2222-2222-2222-222222222222';
select payout_cents from public.campaigns where id = '22222222-2222-2222-2222-222222222222';
\echo 'lower pay when everyone is out (expect UPDATE 1):'
update public.campaigns set payout_cents = 500 where id = '11111111-1111-1111-1111-111111111111';
reset role;
reset request.jwt.claim.sub; reset request.jwt.claims;
\echo '--- OFFER SNAPSHOT (SERVER)'
set role service_role;
\echo 'offer comes from the campaign, not the caller (expect 1500):'
insert into public.campaign_applications(id,campaign_id,athlete_id,status,offered_payout_cents)
  values ('a2222222-0000-0000-0000-000000000002','22222222-2222-2222-2222-222222222222','00000000-0000-0000-0000-00000000000d','applied',1);
select offered_payout_cents from public.campaign_applications where id = 'a2222222-0000-0000-0000-000000000002';
\echo 'offer never changes after (expect 1500):'
update public.campaign_applications set offered_payout_cents = 0 where id = 'a2222222-0000-0000-0000-000000000002';
select offered_payout_cents from public.campaign_applications where id = 'a2222222-0000-0000-0000-000000000002';
reset role;
\echo '--- DELIVERABLES COUNT AS PROOF'
\echo 'business cancels through transition_campaign_status (definer) after a deliverable (expect HILLINK:use_cancel_flow, or permission denied once #14's migration revokes it):'
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select public.transition_campaign_status('33333333-3333-3333-3333-333333333333', 'cancelled', '00000000-0000-0000-0000-00000000000b', 'x', false);
reset role;
reset request.jwt.claim.sub;
set role service_role;
\echo 'campaign_has_proof with only a deliverable (expect t):'
select public.campaign_has_proof('33333333-3333-3333-3333-333333333333');
\echo 'remove the athlete who sent a deliverable (expect proof_submitted):'
select public.close_application_keep_record('a3333333-0000-0000-0000-000000000001', 'accepted', 'withdrawn', false);
\echo 'remove with a stale status (expect stale):'
select public.close_application_keep_record('a3333333-0000-0000-0000-000000000002', 'applied', 'withdrawn', false);
\echo 'remove the athlete with no proof (expect reason null, then withdrawn, and open slots 1 -> 2):'
select public.close_application_keep_record('a3333333-0000-0000-0000-000000000002', 'accepted', 'withdrawn', false);
select status from public.campaign_applications where id = 'a3333333-0000-0000-0000-000000000002';
select open_slots from public.campaigns where id = '33333333-3333-3333-3333-333333333333';
\echo 'deliverable after removal (expect HILLINK:application_closed):'
insert into public.deliverable_submissions(application_id,requirement_id,athlete_id,submission_url)
  values ('a3333333-0000-0000-0000-000000000002','d3333333-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000d','https://instagram.com/p/y');
reset role;
\echo 'athlete inserts a deliverable directly without funding (expect HILLINK:payment_not_funded):'
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000e';
set request.jwt.claim.role = 'authenticated';
insert into public.deliverable_submissions(application_id,requirement_id,athlete_id,submission_url)
  values ('a3333333-0000-0000-0000-000000000001','d3333333-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000e','https://instagram.com/p/z');
\echo 'athlete sends a deliverable on another athlete application (expect HILLINK:not_your_application):'
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
insert into public.deliverable_submissions(application_id,requirement_id,athlete_id,submission_url)
  values ('a3333333-0000-0000-0000-000000000001','d3333333-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000c','https://instagram.com/p/w');
reset role;
reset request.jwt.claim.sub; reset request.jwt.claim.role;
set role service_role;
\echo 'admin force cancel through transition_campaign_status (expect cancelled):'
select public.transition_campaign_status('33333333-3333-3333-3333-333333333333', 'cancelled', '00000000-0000-0000-0000-00000000000a', 'Admin', true) is not null as ok;
select status from public.campaigns where id = '33333333-3333-3333-3333-333333333333';
reset role;
rollback;
