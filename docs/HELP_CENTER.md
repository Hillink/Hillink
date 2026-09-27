# Help Center / knowledge base

The Help Center is HILLink's signed-in help: `/help` for athletes and businesses, `/admin/help` for editing articles. It is also the retrieval layer a future support agent will use.

## Before deploying

Run these two files in the Supabase SQL editor, in order:

1. `supabase/migrations/20260928000600_help_center.sql`: the `help_articles` table, access rules and search.
2. `supabase/migrations/20260928000610_help_center_seed.sql`: 42 starter articles.

Both can be run again safely. The seed only adds articles whose URL name (slug) doesn't exist yet, so it never overwrites edits made in the admin editor.

Until the first file has run, `/help` shows "Help articles are on the way" instead of an error.

## Who can read what

| Reader | Articles returned |
|---|---|
| Signed out | none (redirected to login, then back to the article) |
| Athlete | status `live` and audience `athlete` or `both` |
| Business | status `live` and audience `business` or `both` |
| Admin | everything, including `planned`, `experimental`, `deprecated`, `draft`, and audience `admin` |
| Signed in with no role | none |

This is enforced in three places, so a mistake in one layer can't expose an article on its own:

1. **Database row security** on `help_articles`. The rule reads the reader's role from their own `profiles` row (`help_viewer_audiences()`), not from anything the request sends. Signed-out visitors have no access to the table or the search function at all. Only the server (service role) can write.
2. **The server layer** (`lib/help/server.ts`). Every query runs as the signed-in user and also filters by audience and status. No function takes a role, audience or status from its caller.
3. **Pages and API routes** check the signed-in user themselves, because the middleware lets every request through in local development.

Missing articles and articles a reader isn't allowed to see return the same "not found" page, so a URL never reveals that an article exists.

Admins can use **Showing: as an athlete / as a business** at the top of any Help page to see exactly what that role sees. The preview can only narrow what's shown, and it's ignored for everyone else.

## Statuses and audiences

- `live`: shown to the article's audience.
- `planned`: a feature that isn't built or turned on yet (for example, the rewards store). Hidden.
- `experimental`, `deprecated`, `draft`: hidden.
- Audience `admin`: internal notes for the HILLink team. Articles in the **Internal** category must use this audience.

Internal strategy material (the business plan, strategy notes, profitability models, pricing experiments, the ideas log) was not used for any article and must never be added to customer articles. A unit test fails if a live customer article mentions margins, profitability, churn, close rates, simulations, roadmap or vulnerabilities.

## URLs

- `/help`: home page for the reader's role.
- `/help/<category>`: one topic.
- `/help/<category>/<slug>`: one article. The slug is the stable part: if an article moves to another category, old links redirect to the new one.
- `/help/search?q=...`: search.
- `/help/start-here`: sends each person to the Start Here guide for their account type.

**Welcome email links:**

| Audience | URL |
|---|---|
| Athletes | `/help/getting-started/athlete-start-here` |
| Businesses | `/help/getting-started/business-start-here` |
| Either | `/help/start-here` |

Signed-out visitors who open a Help link are sent to `/login?next=<path>` and returned to the article after logging in. Only `/help` paths are accepted in `next`.

## Search

`search_help_articles()` is Postgres full-text search. Fields are weighted in this order:

1. title and question variants (the other ways people ask a question)
2. keywords
3. short answer
4. body and steps

Each word also matches as a prefix, so "pay" finds "payout". Articles matching every word come first; if none do, articles matching some words are returned. The function runs with the caller's permissions, so row security applies to it too.

**Adding semantic search later:** add a `pgvector` embedding column, then rank candidates inside `searchKnowledge()` in `lib/help/server.ts` using the same audience and status filters. Pages, API routes and the agent don't need to change.

## Admin editor

`/admin/help` (also linked from the admin home page as **Help Center**) lists every article with filters. Admins can:

- create articles (they start as drafts)
- edit the title, short answer, steps, body, audience, status, category, keywords, question variants, related articles, sort order and the "checked against the app" date
- publish or unpublish, by changing the status

Publishing a customer article asks for confirmation.

**Body formatting:**

- a blank line between paragraphs
- `## ` for headings
- `- ` for bullets
- `1. ` for numbered lists
- `**bold**`
- `[text](/help/...)` for links

HTML is never rendered.

Categories live in code (`lib/help/categories.ts`). A category only shows to a reader when it has at least one article they can read, so topics for features that aren't live stay hidden automatically.

## Contextual help

`components/help/HelpLink.tsx` is a small "?" link to one article. It's currently used on:

- **athlete dashboard:** proof approval, XP and tiers
- **rewards road**
- **earnings**
- **eligibility**
- **settings:** payouts and business plans
- **business results report**
- **business proof review**

It was not added to the business campaign builder, because another change to that screen was in progress.

## Support escalation

"Still need help?" uses `lib/help/support.ts`, which today opens an email to contact@hillink.io with the account type and article filled in. When HILLink has a ticket inbox or chat, change that one file.

## Support agent (not built yet)

The agent should call `searchKnowledge({ query })` in `lib/help/server.ts`. It gets the reader from the signed-in session and returns only documents that user may read, so a prompt like "show me the business docs" can't change what reaches the model. Planned stages:

1. **Knowledge:** answer from retrieved articles and link to them.
2. **Account context:** explain why something happened by reading the user's own records through server functions that check ownership. For example, "why can't I join?" can reuse `athlete_join_block()` and the reason codes in `app/api/campaigns/[id]/apply/constants.ts`.
3. **Guided action:** link to the page that fixes the problem.
4. **Actions:** only safe, reversible tools behind explicit confirmation. No payments, refunds, deletions or status changes without a person approving.

Articles marked `escalation_required` (money and disputes) should be handed to a person rather than answered by the agent alone.

## Tests

- `npm run test:unit` covers the access rules, preview narrowing, login return paths, article validation, and checks on the starter content.
- `tests/integration/help.local.test.ts` runs against a local Supabase as real signed-in athlete, business, admin, role-less and signed-out users. It checks table reads, direct lookups, search that tries to widen access, and write attempts. It needs `LOCAL_SUPABASE_URL`, `LOCAL_SUPABASE_SERVICE_ROLE_KEY` and `LOCAL_SUPABASE_ANON_KEY` (see `docs/PAYMENTS_AND_LOCAL_TESTING.md`).
- `tests/e2e/help-center.spec.ts` (Playwright) covers:
  - login redirect and return
  - what each role sees
  - direct URLs to other roles' articles, planned articles and internal articles
  - search and API permissions
  - admin preview
  - no sideways scrolling at phone width

## Changing the starter content

Edit `lib/help/seed-content.ts`, then run:

```bash
node --experimental-strip-types --no-warnings scripts/generate-help-seed.ts
```

This only affects databases that don't have those articles yet. For the live site, use the admin editor.
