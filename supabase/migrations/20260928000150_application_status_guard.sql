-- Application status changes only go through Hillink's server (service role) or its own
-- SECURITY DEFINER functions such as attempt_auto_accept. Before this, RLS let a signed-in athlete
-- update their own application, e.g. set status = 'completed' or 'approved' on unapproved work,
-- and let a business skip steps (approve without funding).
create or replace function public.guard_campaign_application_changes()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Direct API callers run as "authenticated" or "anon". The service role and definer functions don't.
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.status is distinct from 'applied' then
      raise exception 'New applications must start as applied' using errcode = '42501';
    end if;
    return new;
  end if;

  if new.status is distinct from old.status
     or new.athlete_id is distinct from old.athlete_id
     or new.campaign_id is distinct from old.campaign_id then
    raise exception 'Application status can only be changed through Hillink' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists campaign_applications_guard_changes on public.campaign_applications;
create trigger campaign_applications_guard_changes
before insert or update on public.campaign_applications
for each row
execute function public.guard_campaign_application_changes();
