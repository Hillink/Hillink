-- ATH-001: new campaigns are saved as status 'active', but the only athlete read policy allowed
-- status = 'open'. Athletes couldn't see new campaigns, and /api/campaigns/[id]/apply (which reads
-- the campaign with the athlete's own client) returned campaign_not_found.
-- Both 'active' and 'open' are treated as live elsewhere in the code, so athletes may read either.
-- Draft, paused, closed, completed and cancelled campaigns stay hidden.

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'campaigns' and policyname = 'Athletes can browse live campaigns'
  ) then
    create policy "Athletes can browse live campaigns"
      on public.campaigns
      for select
      to authenticated
      using (status in ('active', 'open'));
  end if;
end $$;
