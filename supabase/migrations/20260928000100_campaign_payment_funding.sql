-- Campaign payment funding: a business pays an athlete's payout (plus Hillink's fee) up front,
-- and the athlete is paid from those funds. Before this, payouts came out of Hillink's own balance.
-- Safe to re-run. Needs public.payments from supabase/payments.sql.

do $$ begin
  if to_regclass('public.payments') is null then
    raise exception 'public.payments is missing: run supabase/payments.sql first';
  end if;
end $$;

alter table public.payments
  add column if not exists platform_fee_cents integer not null default 0 check (platform_fee_cents >= 0),
  add column if not exists card_fee_cents integer not null default 0 check (card_fee_cents >= 0),
  add column if not exists business_charge_cents integer not null default 0 check (business_charge_cents >= 0),
  add column if not exists funding_source text check (funding_source is null or funding_source in ('checkout', 'tier_credit')),
  add column if not exists stripe_checkout_session_id text,
  add column if not exists stripe_charge_id text,
  add column if not exists funded_at timestamptz,
  add column if not exists refunded_at timestamptz,
  add column if not exists payout_claimed_at timestamptz;

-- One payment per application, so accepting twice can never create two charges.
do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'payments_application_id_key'
  ) then
    -- Stop rather than guess which money record to delete.
    if exists (select 1 from public.payments group by application_id having count(*) > 1) then
      raise exception 'payments has more than one row for some applications. Review them first: select application_id, count(*) from public.payments group by 1 having count(*) > 1;';
    end if;
    alter table public.payments add constraint payments_application_id_key unique (application_id);
  end if;
end $$;

create index if not exists payments_checkout_session_idx on public.payments (stripe_checkout_session_id);
create index if not exists payments_funded_at_idx on public.payments (business_id, funding_source, funded_at);

-- A transfer id can only be written once.
create or replace function public.payments_guard_transfer()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.stripe_transfer_id is not null and new.stripe_transfer_id is distinct from old.stripe_transfer_id then
    raise exception 'payments.stripe_transfer_id is already set for payment %', old.id;
  end if;
  return new;
end;
$$;

drop trigger if exists payments_guard_transfer on public.payments;
create trigger payments_guard_transfer
before update on public.payments
for each row
execute function public.payments_guard_transfer();

-- Dispute outcomes. The old trigger marked the business "refunded" without moving any money.
-- Now a business win leaves the payment disputed and the resolve API refunds it through Stripe,
-- then marks it refunded. An athlete win still releases the payment for payout.
do $$ begin
  if to_regclass('public.disputes') is not null then
    create or replace function public.settle_payment_on_dispute_resolution()
    returns trigger
    language plpgsql
    set search_path = public
    as $fn$
    begin
      if old.status in ('open', 'under_review') and new.status = 'resolved_athlete' then
        update public.payments
        set hold_status = 'released', payout_at = now(), updated_at = now()
        where application_id = new.application_id
          and hold_status = 'disputed';
      end if;
      return new;
    end;
    $fn$;
  end if;
end $$;
