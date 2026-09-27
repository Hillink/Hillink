-- Help Center / knowledge base (see docs/HELP_CENTER.md).
--
-- Articles live here so they can change without a code deploy. Who can read what is decided by the
-- database from the signed-in user's own profile, never from anything the app or a future AI agent asks for:
--   athletes:   status 'live' and audience 'athlete' or 'both'
--   businesses: status 'live' and audience 'business' or 'both'
--   admins:     everything, including drafts, planned features and audience 'admin' (internal notes)
-- Signed-out visitors can read nothing. Only the server (service role) writes, from the admin editor.

create table if not exists public.help_articles (
  id uuid primary key default gen_random_uuid(),
  -- Stable, globally unique id used in URLs, emails and by the support agent. Never reuse a slug.
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  -- A key from lib/help/categories.ts. Only decides where the article is listed; links work by slug.
  category text not null check (category ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text not null check (length(btrim(title)) > 0),
  short_answer text not null default '',
  -- Light formatting: blank lines between paragraphs, "## " headings, "- " bullets, **bold**, [text](/help/...) links.
  body text not null default '',
  -- Optional numbered steps shown under the answer.
  steps text[] not null default '{}',
  audience text not null check (audience in ('athlete', 'business', 'both', 'admin')),
  status text not null default 'draft' check (status in ('live', 'planned', 'experimental', 'deprecated', 'draft')),
  -- Product area the article describes (e.g. 'payouts', 'hillink_score'), for contextual help and the agent.
  feature text,
  keywords text[] not null default '{}',
  -- Other ways people ask this question. Weighted like the title in search.
  question_variants text[] not null default '{}',
  related_slugs text[] not null default '{}',
  featured boolean not null default false,
  -- The support agent should hand off to a person instead of answering alone (disputes, money problems).
  escalation_required boolean not null default false,
  sort_order integer not null default 100,
  version integer not null default 1,
  last_verified_at timestamptz,
  search_vector tsvector,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

create index if not exists help_articles_category_idx on public.help_articles (category, sort_order);
create index if not exists help_articles_visibility_idx on public.help_articles (status, audience);
create index if not exists help_articles_search_idx on public.help_articles using gin (search_vector);

-- Search text, weighted: title and question variants (A), keywords (B), short answer (C), body and steps (D).
create or replace function public.help_articles_before_write()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.search_vector :=
    setweight(to_tsvector('english', coalesce(new.title, '') || ' ' || array_to_string(new.question_variants, ' ')), 'A') ||
    setweight(to_tsvector('english', array_to_string(new.keywords, ' ')), 'B') ||
    setweight(to_tsvector('english', coalesce(new.short_answer, '')), 'C') ||
    setweight(to_tsvector('english', coalesce(new.body, '') || ' ' || array_to_string(new.steps, ' ')), 'D');
  if tg_op = 'UPDATE' then
    new.updated_at := now();
    new.created_at := old.created_at;
    if (new.title, new.short_answer, new.body, new.steps, new.audience, new.status)
       is distinct from (old.title, old.short_answer, old.body, old.steps, old.audience, old.status) then
      new.version := old.version + 1;
    else
      new.version := old.version;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists help_articles_before_write on public.help_articles;
create trigger help_articles_before_write
before insert or update on public.help_articles
for each row execute function public.help_articles_before_write();

-- The audiences the signed-in user may read, from their own profile. Empty for anyone without a role.
create or replace function public.help_viewer_audiences()
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select case p.role
              when 'athlete' then array['athlete', 'both']
              when 'business' then array['business', 'both']
              when 'admin' then array['athlete', 'business', 'both', 'admin']
            end
       from public.profiles p
      where p.id = auth.uid()),
    array[]::text[]
  );
$$;

revoke all on function public.help_viewer_audiences() from public, anon;
grant execute on function public.help_viewer_audiences() to authenticated, service_role;

alter table public.help_articles enable row level security;

revoke all on public.help_articles from anon;
revoke insert, update, delete, truncate on public.help_articles from authenticated;
grant select on public.help_articles to authenticated;

drop policy if exists "help articles: readers see their audience" on public.help_articles;
create policy "help articles: readers see their audience" on public.help_articles
  for select to authenticated
  using (
    public.is_admin(auth.uid())
    or (status = 'live' and audience <> 'admin' and audience = any (public.help_viewer_audiences()))
  );

-- Full-text search. SECURITY INVOKER, so the row security above still applies: a caller can only ever
-- narrow what they see with p_audiences / p_statuses, never widen it.
-- Articles matching every word are returned when there are any; otherwise articles matching some words.
-- Each word also matches as a prefix ("pay" finds "payout"), and titles containing the whole phrase rank higher.
create or replace function public.search_help_articles(
  p_query text,
  p_audiences text[],
  p_statuses text[],
  p_limit integer default 20
)
returns table (
  id uuid,
  slug text,
  category text,
  title text,
  short_answer text,
  audience text,
  status text,
  rank real
)
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_words text[];
  v_all tsquery;
  v_any tsquery;
  v_phrase text := lower(btrim(coalesce(p_query, '')));
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 50);
begin
  -- Words are letters and digits only, so nothing a user types can change the query syntax.
  select array_agg(w) into v_words
    from (
      select w from unnest(regexp_split_to_array(lower(coalesce(p_query, '')), '[^a-z0-9]+')) as w
       where length(w) >= 2
       limit 12
    ) words;

  if v_words is null then
    return;
  end if;

  -- Stop words ("how", "do", "the") drop out of these on their own.
  v_all := to_tsquery('english', array_to_string(array(select w || ':*' from unnest(v_words) w), ' & '));
  v_any := to_tsquery('english', array_to_string(array(select w || ':*' from unnest(v_words) w), ' | '));

  if v_any is null or numnode(v_any) = 0 then
    return;
  end if;

  return query
    with candidates as (
      select a.*,
             (numnode(v_all) > 0 and a.search_vector @@ v_all) as matches_all
        from public.help_articles a
       where a.search_vector @@ v_any
         and a.audience = any (coalesce(p_audiences, array[]::text[]))
         and a.status = any (coalesce(p_statuses, array[]::text[]))
    ),
    chosen as (
      select c.* from candidates c
       where c.matches_all or not exists (select 1 from candidates x where x.matches_all)
    )
    select c.id, c.slug, c.category, c.title, c.short_answer, c.audience, c.status,
           (ts_rank(c.search_vector, v_any)
             + case when length(v_phrase) >= 3 and position(v_phrase in lower(c.title)) > 0 then 0.5 else 0 end
           )::real as rank
      from chosen c
     order by rank desc, c.sort_order, c.title
     limit v_limit;
end;
$$;

revoke all on function public.search_help_articles(text, text[], text[], integer) from public, anon;
grant execute on function public.search_help_articles(text, text[], text[], integer) to authenticated, service_role;
