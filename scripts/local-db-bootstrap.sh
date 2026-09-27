#!/usr/bin/env bash
# Builds a local copy of the Hillink database from the SQL files in supabase/.
# supabase/migrations alone can't build it from scratch (the first migration is empty), so this
# applies the loose files in dependency order, then the migrations.
#
# Usage: start local Supabase with the migrations folder empty (see docs/LOCAL_TESTING.md), then:
#   bash scripts/local-db-bootstrap.sh          (RESET=1 to wipe the local public schema first)
set -euo pipefail
cd "$(dirname "$0")/.."

DB_CONTAINER="${DB_CONTAINER:-$(docker ps --format '{{.Names}}' | grep '^supabase_db_' | head -1)}"
if [ -z "$DB_CONTAINER" ]; then
  echo "Local Supabase database container is not running." >&2
  exit 1
fi

run_sql() {
  echo "==> $1"
  if [ "$(basename "$1")" = "campaign-slot-locking.sql" ]; then
    # Local Postgres rejects this file's generated column (`timestamptz - interval` is not immutable).
    # Local-only stand-in: a plain column with the same name. Check how production created it.
    docker exec -e PGOPTIONS="-c client_min_messages=warning" -i "$DB_CONTAINER" psql -v ON_ERROR_STOP=1 -q -U postgres -d postgres <<'SQL'
alter table public.campaigns add column if not exists version integer not null default 0;
alter table public.campaigns add column if not exists auto_accept_locked_at timestamptz;
alter table public.campaigns drop constraint if exists campaigns_version_nonnegative;
alter table public.campaigns add constraint campaigns_version_nonnegative check (version >= 0);
SQL
  else
    docker exec -e PGOPTIONS="-c client_min_messages=warning" -i "$DB_CONTAINER" psql -v ON_ERROR_STOP=1 -q -U postgres -d postgres < "$1"
  fi
}

if [ "${RESET:-0}" = "1" ]; then
  echo "==> resetting public schema"
  docker exec -e PGOPTIONS="-c client_min_messages=warning" -i "$DB_CONTAINER" psql -v ON_ERROR_STOP=1 -q -U postgres -d postgres <<'SQL'
do $$ declare p record; begin
  for p in select policyname from pg_policies where schemaname = 'storage' and tablename = 'objects' loop
    execute format('drop policy %I on storage.objects', p.policyname);
  end loop;
end $$;
drop schema if exists public cascade;
create schema public;
grant usage on schema public to postgres, anon, authenticated, service_role;
grant all on schema public to postgres, service_role;
alter default privileges in schema public grant all on tables to postgres, anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to postgres, anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to postgres, anon, authenticated, service_role;
SQL
fi

ORDERED_FILES=(
  schema.sql
  admin-role.sql
  rbac-policies.sql
  connections.sql
  campaign-details.sql
  campaign-lifecycle.sql
  location-coordinates.sql
  payments.sql
  business-access-override.sql
  xp.sql
  referrals.sql
  athlete-ratings.sql
  athlete-approval.sql
  athlete-approval-audit.sql
  notifications.sql
  notifications-v2.sql
  # instagram.sql must run before admin-actions-bundle.sql, which creates stub versions of its tables.
  instagram.sql
  admin-actions-bundle.sql
  auto-accept.sql
  campaign-slot-locking.sql
  fn-auto-accept.sql
  deliverables.sql
  disputes.sql
  profile-photos.sql
  diamond-tier.sql
  waitlist.sql
)

for f in "${ORDERED_FILES[@]}"; do
  run_sql "supabase/$f"
done

for f in supabase/migrations/*.sql; do
  run_sql "$f"
done

echo "Local database ready."
