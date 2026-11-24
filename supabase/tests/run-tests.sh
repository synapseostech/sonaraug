#!/usr/bin/env bash
# =============================================================================
# Database test harness
# =============================================================================
# Spins up a throwaway PostgreSQL 16 cluster (no Docker, no sudo), applies the
# Supabase-compat shim, every migration, the deterministic fixtures, then runs
# every RLS test file. Any failure fails the script.
#
# Usage:
#   bash supabase/tests/run-tests.sh            # fresh cluster
#   KEEP_CLUSTER=1 bash supabase/tests/run-tests.sh
#   DATABASE_URL=postgres://... bash supabase/tests/run-tests.sh   # plain Postgres, shim applied
#   SONARA_TEST_TARGET=supabase-local DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55422/postgres \
#     bash supabase/tests/run-tests.sh
#       Real local Supabase (supabase start). Run `supabase db reset` first: the CLI
#       applies the migrations; this script adds only helpers, fixtures and suites.
#       Refuses any host other than localhost so it can never touch a hosted project.
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PG_BIN="${PG_BIN:-/usr/lib/postgresql/16/bin}"
PGDATA="$ROOT/.tmp/pgdata"
PGPORT="${PGPORT:-55432}"
DB="kito_test"
LOGDIR="$ROOT/.tmp"
# Sockets must live at a path without spaces (the repo name contains one),
# otherwise postgres parses its own -k argument incorrectly.
SOCKDIR="${SOCKDIR:-/tmp/kito-pgtest-$(id -u)}"

red()   { printf '\033[31m%s\033[0m\n' "$*"; }
green() { printf '\033[32m%s\033[0m\n' "$*"; }
blue()  { printf '\033[36m%s\033[0m\n' "$*"; }

if [[ -n "${DATABASE_URL:-}" ]]; then
  PSQL=(psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q)
  blue "Using remote database from DATABASE_URL"
  REMOTE=1
else
  REMOTE=0
  mkdir -p "$LOGDIR" "$SOCKDIR"
  if [[ ! -d "$PGDATA" ]]; then
    blue "Initialising throwaway cluster at $PGDATA"
    "$PG_BIN/initdb" -D "$PGDATA" -U postgres --auth=trust --encoding=UTF8 --locale=C >/dev/null
  fi
  # A previous interrupted run may have left a postmaster behind.
  if [[ -f "$PGDATA/postmaster.pid" ]]; then
    "$PG_BIN/pg_ctl" -D "$PGDATA" stop -m immediate >/dev/null 2>&1 || true
    rm -f "$PGDATA/postmaster.pid"
  fi
  trap 'if [[ "${KEEP_CLUSTER:-0}" != "1" ]]; then "$PG_BIN/pg_ctl" -D "$PGDATA" stop -m fast >/dev/null 2>&1 || true; fi' EXIT
  if ! "$PG_BIN/pg_isready" -p "$PGPORT" -h "$SOCKDIR" -q 2>/dev/null; then
    blue "Starting cluster on port $PGPORT"
    "$PG_BIN/pg_ctl" -D "$PGDATA" -l "$LOGDIR/postgres.log" \
      -o "-p $PGPORT -k '$SOCKDIR' -c fsync=off -c full_page_writes=off -c listen_addresses=''" start >/dev/null
    for _ in $(seq 1 50); do
      "$PG_BIN/pg_isready" -p "$PGPORT" -h "$SOCKDIR" -q && break
      sleep 0.2
    done
  fi
  export PGHOST="$SOCKDIR" PGPORT="$PGPORT" PGUSER=postgres
  export PGOPTIONS='-c client_min_messages=warning'
  if ! psql -lqt | cut -d'|' -f1 | grep -qw "$DB"; then
    createdb "$DB"
  else
    psql -d "$DB" -q -c 'drop schema if exists public cascade; create schema public; drop schema if exists app_private cascade; drop schema if exists tests cascade; drop schema if exists auth cascade;'
  fi
  PSQL=(psql -d "$DB" -v ON_ERROR_STOP=1 -q)
fi

if [[ "${SONARA_TEST_TARGET:-}" == "supabase-local" ]]; then
  if [[ ! "${DATABASE_URL:-}" =~ @(127\.0\.0\.1|localhost): ]]; then
    red "supabase-local target requires a DATABASE_URL on 127.0.0.1/localhost"; exit 2
  fi
  blue "Target: local Supabase (migrations applied by 'supabase db reset'; no shim)"
  "${PSQL[@]}" -c "select 1 from public.platform_settings where key = 'policy.terms_version'" | grep -q 1 \
    || { red "Migration 0160 not applied: run 'supabase db reset' first"; exit 2; }
else
  blue "Applying Supabase compatibility shim"
  "${PSQL[@]}" -f "$ROOT/supabase/tests/bootstrap/00_local_supabase_shim.sql"

  blue "Applying migrations"
  for migration in "$ROOT"/supabase/migrations/*.sql; do
    printf '  → %s\n' "$(basename "$migration")"
    "${PSQL[@]}" -f "$migration"
  done
fi

blue "Applying test helpers and fixtures"
"${PSQL[@]}" -f "$ROOT/supabase/tests/rls-helpers/00_helpers.sql"
"${PSQL[@]}" -f "$ROOT/supabase/tests/fixtures/00_seed.sql"

failed=0
total=0
for test_file in "$ROOT"/supabase/tests/rls/*.sql; do
  total=$((total + 1))
  printf '  %-46s' "$(basename "$test_file" .sql)"
  if output=$("${PSQL[@]}" -f "$test_file" 2>&1 >/dev/null); then
    green "PASS"
  else
    red "FAIL"
    printf '%s\n' "$output" | sed 's/^/      /'
    failed=$((failed + 1))
  fi
done

if [[ "${KEEP_CLUSTER:-0}" != "1" && "$REMOTE" = "0" ]]; then
  "$PG_BIN/pg_ctl" -D "$PGDATA" stop -m fast >/dev/null 2>&1 || true
fi

echo
if [[ $failed -eq 0 ]]; then
  green "Database tests: $total files passed"
else
  red "Database tests: $failed of $total files failed"
  exit 1
fi
