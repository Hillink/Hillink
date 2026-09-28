-- Checks for supabase/migrations/20260929000400_campaign_lifecycle_records.sql.
-- LOCAL DATABASES ONLY. Never run against production. Everything runs in one transaction and is rolled back.
-- Each "expect" line says what should print next.
\set ON_ERROR_STOP 0
\set ON_ERROR_ROLLBACK on
begin;
set session_replication_role = replica; -- fixtures only: skip eligibility triggers
insert into auth.users values ('00000000-0000-0000-0000-00000000000b','biz@x.io','{}'),('00000000-0000-0000-0000-00000000000c','a1@x.edu','{}'),('00000000-0000-0000-0000-00000000000d','a2@x.edu','{}'),('00000000-0000-0000-0000-00000000000e','a3@x.edu','{}');
insert into public.profiles(id, role) values ('00000000-0000-0000-0000-00000000000b','business'),('00000000-0000-0000-0000-00000000000c','athlete'),('00000000-0000-0000-0000-00000000000d','athlete'),('00000000-0000-0000-0000-00000000000e','athlete');
insert into public.campaigns(id,business_id,title,deliverables,preferred_tier,payout_cents,slots,open_slots,status) values
  ('11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-00000000000b','No proof','d','Any',1000,3,1,'open'),
  ('22222222-2222-2222-2222-222222222222','00000000-0000-0000-0000-00000000000b','Proof in','d','Any',1000,3,2,'open');
insert into public.campaign_applications(id,campaign_id,athlete_id,status) values
  ('a1111111-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-00000000000c','accepted'),
  ('a1111111-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-00000000000d','accepted'),
  ('a1111111-0000-0000-0000-000000000003','11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-00000000000e','applied'),
  ('a2222222-0000-0000-0000-000000000001','22222222-2222-2222-2222-222222222222','00000000-0000-0000-0000-00000000000c','submitted');
set session_replication_role = origin;

\echo '--- BUSINESS (signed in)'
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
set request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';
\echo 'direct cancel after proof (expect HILLINK:proof_submitted):'
update public.campaigns set status = 'cancelled' where id = '22222222-2222-2222-2222-222222222222';
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
\echo 'admin cancel after proof (expect reason null; submitted application untouched):'
select public.cancel_campaign_keep_records('22222222-2222-2222-2222-222222222222', null, 'Admin', true);
select status from public.campaign_applications where id = 'a2222222-0000-0000-0000-000000000001';
reset role;
rollback;
