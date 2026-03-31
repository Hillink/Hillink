-- Module 7: Dispute Handling
-- Evidence trail, SLA timer, payout freeze, and admin resolution.

create table if not exists public.disputes (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.campaign_applications(id) on delete cascade,
  opened_by uuid not null references public.profiles(id) on delete cascade,
  opened_by_role text not null check (opened_by_role in ('athlete','business')),
  reason text not null check (char_length(trim(reason)) >= 10),
  evidence_urls text[] not null default '{}',
  status text not null default 'open'
    check (status in ('open','under_review','resolved_athlete','resolved_business','resolved_partial','closed')),
  resolution_notes text,
  resolved_by uuid references public.profiles(id) on delete set null,
  resolved_at timestamptz,
  sla_deadline timestamptz not null default (now() + interval '7 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists disputes_application_id_idx
  on public.disputes (application_id);

create index if not exists disputes_opened_by_idx
  on public.disputes (opened_by);

create index if not exists disputes_status_idx
  on public.disputes (status);

create index if not exists disputes_sla_deadline_idx
  on public.disputes (sla_deadline asc)
  where status in ('open', 'under_review');

-- Only one active (open/under_review) dispute allowed per application
create unique index if not exists disputes_one_active_per_application_idx
  on public.disputes (application_id)
  where status in ('open', 'under_review');

alter table public.disputes enable row level security;

-- ─────────────────────────────────────────────────────────────
-- Trigger: freeze payment when dispute opens
-- ─────────────────────────────────────────────────────────────
create or replace function public.freeze_payment_on_dispute()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Only freeze on INSERT of a new dispute (status='open')
  if TG_OP = 'INSERT' and new.status = 'open' then
    update public.payments
    set hold_status = 'disputed', updated_at = now()
    where application_id = new.application_id
      and hold_status = 'held';
  end if;

  return new;
end;
$$;

drop trigger if exists disputes_freeze_payment on public.disputes;
create trigger disputes_freeze_payment
after insert on public.disputes
for each row
execute function public.freeze_payment_on_dispute();

-- ─────────────────────────────────────────────────────────────
-- Trigger: restore / release payment on dispute resolution
-- ─────────────────────────────────────────────────────────────
create or replace function public.settle_payment_on_dispute_resolution()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Only act when status transitions out of open/under_review to a resolved/closed state
  if old.status in ('open', 'under_review')
     and new.status in ('resolved_athlete','resolved_business','resolved_partial','closed')
  then
    case new.status
      -- Athlete wins → pay the athlete (flip to released)
      when 'resolved_athlete' then
        update public.payments
        set hold_status = 'released', payout_at = now(), updated_at = now()
        where application_id = new.application_id
          and hold_status = 'disputed';

      -- Business wins → refund the business
      when 'resolved_business' then
        update public.payments
        set hold_status = 'refunded', updated_at = now()
        where application_id = new.application_id
          and hold_status = 'disputed';

      -- Partial / closed → keep in disputed for manual handling
      else
        null;
    end case;
  end if;

  return new;
end;
$$;

drop trigger if exists disputes_settle_payment on public.disputes;
create trigger disputes_settle_payment
after update on public.disputes
for each row
execute function public.settle_payment_on_dispute_resolution();

-- ─────────────────────────────────────────────────────────────
-- RLS policies
-- ─────────────────────────────────────────────────────────────

-- Athlete can see their own disputes
do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='disputes' and policyname='disp_athlete_select_own'
  ) then
    create policy "disp_athlete_select_own"
      on public.disputes
      for select
      to authenticated
      using (
        opened_by = auth.uid()
        or exists (
          select 1 from public.campaign_applications ca
          where ca.id = disputes.application_id
            and ca.athlete_id = auth.uid()
        )
      );
  end if;
end $$;

-- Business can see disputes for their own campaigns
do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='disputes' and policyname='disp_business_select_own_campaign'
  ) then
    create policy "disp_business_select_own_campaign"
      on public.disputes
      for select
      to authenticated
      using (
        exists (
          select 1
          from public.campaign_applications ca
          join public.campaigns c on c.id = ca.campaign_id
          where ca.id = disputes.application_id
            and c.business_id = auth.uid()
        )
      );
  end if;
end $$;

-- Athlete or business may open a dispute (INSERT only)
do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='disputes' and policyname='disp_party_insert'
  ) then
    create policy "disp_party_insert"
      on public.disputes
      for insert
      to authenticated
      with check (opened_by = auth.uid());
  end if;
end $$;

-- Only admins may update (resolve / move to under_review)
do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='disputes' and policyname='disp_admin_update'
  ) then
    create policy "disp_admin_update"
      on public.disputes
      for update
      to authenticated
      using (public.is_admin(auth.uid()))
      with check (public.is_admin(auth.uid()));
  end if;
end $$;

-- Admin full access
do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='disputes' and policyname='disp_admin_all'
  ) then
    create policy "disp_admin_all"
      on public.disputes
      for all
      to authenticated
      using (public.is_admin(auth.uid()))
      with check (public.is_admin(auth.uid()));
  end if;
end $$;
