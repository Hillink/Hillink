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
