-- List users with IDs so you can pick a target for reset-user-data.sql

select
  p.id,
  p.role,
  coalesce(
    nullif(trim(ap.first_name || ' ' || ap.last_name), ''),
    bp.business_name,
    p.id::text
  ) as display_name,
  ap.school,
  ap.sport,
  bp.business_name,
  bp.category,
  p.created_at
from public.profiles p
left join public.athlete_profiles ap on ap.id = p.id
left join public.business_profiles bp on bp.id = p.id
order by p.created_at desc;
