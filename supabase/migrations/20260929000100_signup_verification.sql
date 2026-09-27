-- Signup verification.
-- 1. Users can't make themselves admin or approve themselves. Before this, the "update own profile" policy only
--    locked the role, so anyone could set their own athlete_verification_status to 'approved' through the API,
--    and a brand new user could insert their own profile row with any role.
-- 2. New businesses start 'pending' and wait for an admin, like athletes.
-- 3. Athlete accounts need a .edu email (the signup form already asked; now the database checks it too).
-- 4. Joining a campaign needs an Instagram account connected through Instagram login (verified = true).
-- Admins and Hillink's server (service role and the SQL editor, which have no auth.uid()) are exempt.

create or replace function public.guard_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  caller uuid := auth.uid();
  user_email text;
begin
  if caller is null or public.is_admin(caller) then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.role is null or new.role not in ('athlete', 'business') then
      raise exception 'HILLINK:role_not_allowed' using errcode = '42501';
    end if;
    new.athlete_verification_status := 'pending';
    if new.role = 'athlete' then
      select u.email into user_email from auth.users u where u.id = new.id;
      if user_email is null or lower(btrim(user_email)) not like '%.edu' then
        raise exception 'HILLINK:student_email_required' using errcode = '42501';
      end if;
    end if;
    return new;
  end if;

  if new.role is distinct from old.role then
    raise exception 'HILLINK:role_change_not_allowed' using errcode = '42501';
  end if;
  -- Users may send themselves back to review (re-applying after a rejection); only admins approve or reject.
  if new.athlete_verification_status is distinct from old.athlete_verification_status
     and new.athlete_verification_status is distinct from 'pending' then
    raise exception 'HILLINK:approval_change_not_allowed' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard_privileges on public.profiles;
create trigger profiles_guard_privileges
before insert or update on public.profiles
for each row
execute function public.guard_profile_privileges();

-- Joining a campaign now also needs a verified Instagram connection. Same function as
-- 20260928000300_compliance_and_automation.sql with one more check at the end.
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
  select confirmed_adult, visa_status, school_disclosure_ack, school_conflict_categories
    into a from public.athlete_profiles where id = p_athlete_id;
  if not found or not a.confirmed_adult or a.visa_status is null or not a.school_disclosure_ack then
    return 'compliance_required';
  end if;
  if a.visa_status = 'international_not_cleared' then
    return 'visa_not_cleared';
  end if;
  select bp.category_key into category
    from public.campaigns c join public.business_profiles bp on bp.id = c.business_id
    where c.id = p_campaign_id;
  if category is not null and category = any (a.school_conflict_categories) then
    return 'school_conflict';
  end if;
  if not exists (
    select 1 from public.athlete_instagram_connections ic
    where ic.athlete_id = p_athlete_id and ic.verified
  ) then
    return 'instagram_not_verified';
  end if;
  return null;
end;
$$;

revoke all on function public.athlete_join_block(uuid, uuid) from public, anon;
grant execute on function public.athlete_join_block(uuid, uuid) to authenticated, service_role;
