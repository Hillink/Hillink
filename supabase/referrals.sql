-- Referral system enforcement
-- 1) one referral_code per user, immutable, unique
-- 2) one referred_by_code submission per user
-- 3) no self-referral

alter table public.profiles
  add column if not exists referral_code text,
  add column if not exists referred_by_code text,
  add column if not exists referred_by_user_id uuid references public.profiles(id);

alter table public.athlete_profiles
  add column if not exists heard_about text;

alter table public.business_profiles
  add column if not exists heard_about text;

create unique index if not exists profiles_referral_code_unique
  on public.profiles (referral_code)
  where referral_code is not null;

create or replace function public.generate_referral_code_for_user(uid uuid)
returns text
language sql
immutable
as $$
  select
    'HL-' ||
    upper(substr(replace(uid::text, '-', ''), 1, 4)) ||
    '-' ||
    upper(substr(md5(uid::text), 1, 4));
$$;

create or replace function public.enforce_profile_referrals()
returns trigger
language plpgsql
as $$
declare
  matched_referrer_id uuid;
begin
  -- Always ensure an owner code exists.
  if new.referral_code is null or btrim(new.referral_code) = '' then
    new.referral_code := public.generate_referral_code_for_user(new.id);
  end if;

  new.referral_code := upper(btrim(new.referral_code));

  -- Owner code is immutable once set.
  if tg_op = 'update' and old.referral_code is not null and new.referral_code is distinct from old.referral_code then
    raise exception 'referral_code is immutable once set';
  end if;

  -- Referrer code is a one-time submission.
  if tg_op = 'update' and old.referred_by_code is not null and new.referred_by_code is distinct from old.referred_by_code then
    raise exception 'referred_by_code already set';
  end if;

  if new.referred_by_code is not null and btrim(new.referred_by_code) <> '' then
    new.referred_by_code := upper(btrim(new.referred_by_code));

    select p.id
      into matched_referrer_id
      from public.profiles p
     where p.referral_code = new.referred_by_code
     limit 1;

    if matched_referrer_id is null then
      raise exception 'invalid referral code';
    end if;

    if matched_referrer_id = new.id then
      raise exception 'self referral not allowed';
    end if;

    new.referred_by_user_id := matched_referrer_id;
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_referral_guard on public.profiles;
create trigger profiles_referral_guard
before insert or update on public.profiles
for each row
execute function public.enforce_profile_referrals();

-- Optional one-time backfill for existing rows missing referral_code
update public.profiles p
   set referral_code = public.generate_referral_code_for_user(p.id)
 where p.referral_code is null or btrim(p.referral_code) = '';
