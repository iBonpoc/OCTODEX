#!/usr/bin/env bash
# Одноразовый локальный Postgres 16: initdb во временный каталог → заглушка auth →
# миграции → тесты RLS (ON_ERROR_STOP) → остановка и удаление.
# Использование: supabase/tests/run.sh   (PGBIN, PGPORT, PG_RUN_USER можно переопределить;
#                VERBOSE=1 — печатать текст каждой ожидаемой ошибки;
#                CATALOG_OUT=<файл> — записать каталог public после миграций, docs/specs/21 §5;
#                DB_NOW=la-2340|la-0020|"<YYYY-MM-DD HH:MM:SS UTC>" — часы базы с этого момента, #620)
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
PGBIN="${PGBIN:-/usr/lib/postgresql/16/bin}"
PGPORT="${PGPORT:-54329}"
PGUSER_DB="postgres"

if [[ ! -x "$PGBIN/initdb" ]]; then
  echo "initdb not found in $PGBIN (set PGBIN)" >&2; exit 1
fi

# DB_NOW: the database's clock starts at that moment (libfaketime, apt package «faketime»; only the server and psql of
# this run) — the tests at a risky hour (#620, docs/ai/CHECKS.md §5, §9 п.7). la-2340 = 23:40 in Los Angeles: the UTC date
# is tomorrow already, a test that takes «today» from current_date goes red (T147, #476); la-0020 = 00:20 LA, right after
# the company's midnight. Without DB_NOW — the real clock, as before.
FAKE=()
if [[ -n "${DB_NOW:-}" ]]; then
  case "$DB_NOW" in
    la-2340) AT="$(date -u -d "TZ=\"America/Los_Angeles\" $(TZ=America/Los_Angeles date +%F) 23:40" '+%F %T')" ;;
    la-0020) AT="$(date -u -d "TZ=\"America/Los_Angeles\" $(TZ=America/Los_Angeles date -d tomorrow +%F) 00:20" '+%F %T')" ;;
    *) AT="$(date -u -d "$DB_NOW UTC" '+%F %T')" ;;
  esac
  LIB="${FAKETIME_LIB:-$(ls /usr/lib/*/faketime/libfaketime.so.1 2>/dev/null | head -1)}"
  [[ -n "$LIB" && -f "$LIB" ]] || { echo "DB_NOW needs libfaketime (apt-get install faketime) or FAKETIME_LIB" >&2; exit 1; }
  FAKE=(env LD_PRELOAD="$LIB" FAKETIME="@$AT")
  echo "== clock: the database starts at $AT UTC (DB_NOW=$DB_NOW)"
fi

# Postgres не запускается от root: под root работаем через системного пользователя postgres.
RUN_AS=()
if [[ "$(id -u)" == "0" ]]; then
  RUN_USER="${PG_RUN_USER:-postgres}"
  id "$RUN_USER" >/dev/null 2>&1 || { echo "user $RUN_USER not found; set PG_RUN_USER" >&2; exit 1; }
  RUN_AS=(runuser -u "$RUN_USER" --)
fi

TMP="$(mktemp -d "${TMPDIR:-/tmp}/octo-pg.XXXXXX")"
DATA="$TMP/data"
SOCK="$TMP/sock"
mkdir -p "$DATA" "$SOCK"
[[ ${#RUN_AS[@]} -gt 0 ]] && chown -R "$RUN_USER" "$TMP"
# Файлы миграций должны читаться пользователем сервера/psql
WORK="$TMP/sql"; mkdir -p "$WORK"
cp "$HERE"/auth_stub.sql "$HERE"/core_rls.sql "$HERE"/catalog.sql "$WORK"/
cp "$ROOT"/migrations/*.sql "$WORK"/
# one rule on the phone and on the server: the same examples as apps/mobile/test/matchKeys.test.ts (T139)
cp "$ROOT"/../apps/mobile/test/fixtures/matchKeys.json "$WORK"/
# the attached pages (spec 33 П24.7): the same examples as apps/mobile/test/docPages.test.ts (T165)
cp "$ROOT"/../apps/mobile/test/fixtures/docPages.json "$WORK"/
# #1147: the totals the phone shows the client = the totals the server signs (apps/mobile/test/signTotals.test.ts, T195)
cp "$ROOT"/../apps/mobile/test/fixtures/signTotals.json "$WORK"/
[[ ${#RUN_AS[@]} -gt 0 ]] && chown -R "$RUN_USER" "$WORK"

cleanup() {
  "${RUN_AS[@]}" "$PGBIN/pg_ctl" -D "$DATA" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$TMP"
}
trap cleanup EXIT

"${RUN_AS[@]}" "$PGBIN/initdb" -D "$DATA" -U "$PGUSER_DB" -A trust -E UTF8 --locale=C >/dev/null
"${RUN_AS[@]}" "${FAKE[@]}" "$PGBIN/pg_ctl" -D "$DATA" -l "$TMP/server.log" -w \
  -o "-p $PGPORT -k $SOCK -c listen_addresses=''" start >/dev/null

PSQL=("${RUN_AS[@]}" psql -X -q -v ON_ERROR_STOP=1 -h "$SOCK" -p "$PGPORT" -U "$PGUSER_DB" -d postgres)
# the clock really moved (a missing preload would run the tests at the real hour and look green)
if [[ -n "${DB_NOW:-}" ]]; then
  GOT="$("${PSQL[@]}" -At -c "select to_char(now() at time zone 'UTC', 'YYYY-MM-DD HH24:MI')")"
  [[ "$GOT" == "${AT:0:16}" ]] || { echo "DB_NOW: the database says $GOT UTC, not ${AT:0:16}" >&2; exit 1; }
fi

echo "== auth stub"
"${PSQL[@]}" -f "$WORK/auth_stub.sql"
# Migration on a database that already has data (CLAUDE.md rule 15): upgrade/<migration>.before.sql puts old-shape
# rows in right before that migration, upgrade/<migration>.after.sql checks them right after (and cleans up).
for m in $(ls "$WORK" | grep -E '^[0-9]+_.*\.sql$' | sort); do
  b="$HERE/upgrade/${m%.sql}.before.sql"; a="$HERE/upgrade/${m%.sql}.after.sql"
  [[ -f "$b" ]] && { echo "== upgrade data before $m"; cp "$b" "$WORK/_before.sql"; [[ ${#RUN_AS[@]} -gt 0 ]] && chown "$RUN_USER" "$WORK/_before.sql"; "${PSQL[@]}" -f "$WORK/_before.sql"; }
  echo "== migration $m"
  "${PSQL[@]}" -f "$WORK/$m"
  [[ -f "$a" ]] && { echo "== upgrade check after $m"; cp "$a" "$WORK/_after.sql"; [[ ${#RUN_AS[@]} -gt 0 ]] && chown "$RUN_USER" "$WORK/_after.sql"; "${PSQL[@]}" -f "$WORK/_after.sql"; }
done
# CATALOG_OUT=<file>: the live catalog of public after the migrations, before the tests add their rows (docs/specs/21 §5;
# read by apps/mobile/test/serverCatalog.test.ts)
if [[ -n "${CATALOG_OUT:-}" ]]; then
  echo "== catalog -> $CATALOG_OUT"
  "${PSQL[@]}" -At -f "$WORK/catalog.sql" > "$CATALOG_OUT"
fi
echo "== tests core_rls.sql"
VERB=(); [[ "${VERBOSE:-}" == "1" ]] && VERB=(-v verbose=1)
"${PSQL[@]}" "${VERB[@]}" -v match_keys="$WORK/matchKeys.json" -v doc_pages="$WORK/docPages.json" -v sign_totals="$WORK/signTotals.json" -f "$WORK/core_rls.sql"
