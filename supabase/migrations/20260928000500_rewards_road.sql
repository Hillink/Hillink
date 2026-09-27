-- Rewards road (see lib/rewards/road.ts): a points ledger, a store of rewards, and athletes' reward requests.
-- Everything here is written only by the server, so athletes can't give themselves points.

create table if not exists public.athlete_points_ledger (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.profiles(id) on delete cascade,
  season text not null,
  delta integer not null check (delta <> 0),
  reason text not null,
  -- One row per thing earned or spent (e.g. "level:2026-fall:12", "customer:<redemption id>"), so grants are paid once.
  ref text not null,
  created_at timestamptz not null default now(),
  unique (athlete_id, ref)
);

create index if not exists athlete_points_ledger_season_idx on public.athlete_points_ledger (athlete_id, season);

create table if not exists public.reward_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  points_cost integer not null check (points_cost > 0),
  stock integer check (stock is null or stock >= 0), -- null means unlimited
  -- Off until Hillink sets what a point is worth and prices each item.
  active boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.reward_claims (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.profiles(id) on delete cascade,
  item_id uuid not null references public.reward_items(id),
  season text not null,
  points_cost integer not null check (points_cost > 0),
  status text not null default 'requested' check (status in ('requested', 'sent', 'cancelled')),
  created_at timestamptz not null default now()
);

create index if not exists reward_claims_athlete_idx on public.reward_claims (athlete_id, created_at desc);

alter table public.athlete_points_ledger enable row level security;
alter table public.reward_items enable row level security;
alter table public.reward_claims enable row level security;

drop policy if exists "points: athletes read own" on public.athlete_points_ledger;
create policy "points: athletes read own" on public.athlete_points_ledger
  for select to authenticated using (athlete_id = auth.uid());

drop policy if exists "reward items: signed-in users read" on public.reward_items;
create policy "reward items: signed-in users read" on public.reward_items
  for select to authenticated using (true);

drop policy if exists "reward claims: athletes read own" on public.reward_claims;
create policy "reward claims: athletes read own" on public.reward_claims
  for select to authenticated using (athlete_id = auth.uid());

-- Spend points on a reward: checks the season balance and stock, and records the claim and the spend together.
create or replace function public.claim_reward_item(p_athlete_id uuid, p_item_id uuid, p_season text)
returns table (claim_id uuid, balance integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.reward_items%rowtype;
  v_balance integer;
  v_claim uuid;
begin
  -- One claim at a time per athlete, so two taps can't spend the same points twice.
  perform pg_advisory_xact_lock(hashtextextended('reward-claim:' || p_athlete_id::text, 0));

  select * into v_item from public.reward_items where id = p_item_id for update;
  if not found or not v_item.active then
    raise exception 'HILLINK:reward_unavailable';
  end if;
  if v_item.stock is not null and v_item.stock <= 0 then
    raise exception 'HILLINK:reward_out_of_stock';
  end if;

  select coalesce(sum(delta), 0) into v_balance
  from public.athlete_points_ledger
  where athlete_id = p_athlete_id and season = p_season;
  if v_balance < v_item.points_cost then
    raise exception 'HILLINK:not_enough_points';
  end if;

  insert into public.reward_claims (athlete_id, item_id, season, points_cost)
  values (p_athlete_id, p_item_id, p_season, v_item.points_cost)
  returning id into v_claim;

  insert into public.athlete_points_ledger (athlete_id, season, delta, reason, ref)
  values (p_athlete_id, p_season, -v_item.points_cost, 'Redeemed: ' || v_item.name, 'spend:' || v_claim::text);

  if v_item.stock is not null then
    update public.reward_items set stock = stock - 1 where id = p_item_id;
  end if;

  return query select v_claim, v_balance - v_item.points_cost;
end;
$$;

revoke all on function public.claim_reward_item(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.claim_reward_item(uuid, uuid, text) to service_role;

-- Starter catalog, all off until prices are set.
insert into public.reward_items (name, description, points_cost, stock, active, sort_order)
select * from (values
  ('Hillink sticker pack', 'Five Hillink stickers, shipped to you.', 150, null::integer, false, 10),
  ('Hillink T-shirt', 'Official Hillink tee.', 600, null::integer, false, 20),
  ('Partner gift card', 'A gift card from a Hillink partner business near you.', 900, null::integer, false, 30),
  ('Hillink hoodie', 'Official Hillink hoodie.', 1500, null::integer, false, 40)
) as v(name, description, points_cost, stock, active, sort_order)
where not exists (select 1 from public.reward_items);

-- Each XP challenge pays once. Parallel requests used to be able to award the same challenge many times,
-- and XP now turns into points. Skipped (with a warning) if production already has duplicates; the rewards
-- road also counts each challenge only once either way.
do $$ begin
  if exists (
    select 1 from public.athlete_xp_events
    where details_json->>'source' = 'xp_challenge'
    group by athlete_id, details_json->>'challenge_id'
    having count(*) > 1
  ) then
    raise warning 'duplicate XP challenge awards exist; clean them up, then create athlete_xp_events_challenge_once';
  else
    create unique index if not exists athlete_xp_events_challenge_once
      on public.athlete_xp_events (athlete_id, (details_json->>'challenge_id'))
      where details_json->>'source' = 'xp_challenge';
  end if;
end $$;

-- Which grant a ledger row belongs to, so grants can be reversed and re-earned.
alter table public.athlete_points_ledger add column if not exists base_ref text;
create index if not exists athlete_points_ledger_base_ref_idx on public.athlete_points_ledger (athlete_id, base_ref);
update public.athlete_points_ledger set base_ref = ref where base_ref is null and ref not like 'spend:%' and ref not like 'refund:%';

-- Brings an athlete's grants in line with what they've earned: pays missing grants, re-pays reversed ones
-- that are earned again, and reverses grants in the given season whose source went away (a cancelled campaign's
-- XP or a deleted customer). Badges and spending are never reversed here. Same lock as claims.
create or replace function public.sync_reward_points(
  p_athlete_id uuid,
  p_season text,
  p_desired jsonb,
  p_revocable_prefixes text[]
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_net integer;
  v_n integer;
  v_balance integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('reward-claim:' || p_athlete_id::text, 0));

  for r in
    select d->>'ref' as ref, (d->>'delta')::integer as delta, d->>'reason' as reason
    from jsonb_array_elements(coalesce(p_desired, '[]'::jsonb)) d
  loop
    select coalesce(sum(delta), 0), count(*) into v_net, v_n
    from public.athlete_points_ledger
    where athlete_id = p_athlete_id and base_ref = r.ref;
    if v_n = 0 then
      insert into public.athlete_points_ledger (athlete_id, season, delta, reason, ref, base_ref)
      values (p_athlete_id, p_season, r.delta, r.reason, r.ref, r.ref)
      on conflict (athlete_id, ref) do nothing;
    elsif v_net <= 0 then
      insert into public.athlete_points_ledger (athlete_id, season, delta, reason, ref, base_ref)
      values (p_athlete_id, p_season, r.delta, r.reason, 'regrant:' || r.ref || ':' || v_n, r.ref);
    end if;
  end loop;

  for r in
    select l.base_ref, sum(l.delta)::integer as net, count(*)::integer as n
    from public.athlete_points_ledger l
    where l.athlete_id = p_athlete_id
      and l.season = p_season
      and l.base_ref is not null
      and split_part(l.base_ref, ':', 1) = any(p_revocable_prefixes)
    group by l.base_ref
    having sum(l.delta) > 0
  loop
    if not exists (select 1 from jsonb_array_elements(coalesce(p_desired, '[]'::jsonb)) d where d->>'ref' = r.base_ref) then
      insert into public.athlete_points_ledger (athlete_id, season, delta, reason, ref, base_ref)
      values (p_athlete_id, p_season, -r.net, 'Reversed: no longer earned', 'revoke:' || r.base_ref || ':' || r.n, r.base_ref);
    end if;
  end loop;

  select coalesce(sum(delta), 0)::integer into v_balance
  from public.athlete_points_ledger
  where athlete_id = p_athlete_id and season = p_season;
  return v_balance;
end;
$$;

revoke all on function public.sync_reward_points(uuid, text, jsonb, text[]) from public, anon, authenticated;
grant execute on function public.sync_reward_points(uuid, text, jsonb, text[]) to service_role;

-- Cancelling a requested reward gives the points back and returns the item to stock.
create or replace function public.cancel_reward_claim(p_claim_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claim public.reward_claims%rowtype;
begin
  select * into v_claim from public.reward_claims where id = p_claim_id for update;
  if not found or v_claim.status <> 'requested' then
    return false;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('reward-claim:' || v_claim.athlete_id::text, 0));
  update public.reward_claims set status = 'cancelled' where id = p_claim_id;
  insert into public.athlete_points_ledger (athlete_id, season, delta, reason, ref)
  values (v_claim.athlete_id, v_claim.season, v_claim.points_cost, 'Refund: reward cancelled', 'refund:' || p_claim_id::text);
  update public.reward_items set stock = stock + 1 where id = v_claim.item_id and stock is not null;
  return true;
end;
$$;

revoke all on function public.cancel_reward_claim(uuid) from public, anon, authenticated;
grant execute on function public.cancel_reward_claim(uuid) to service_role;
