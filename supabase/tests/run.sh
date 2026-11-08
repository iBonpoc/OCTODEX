#!/usr/bin/env bash
# Одноразовый локальный Postgres 16: initdb во временный каталог → заглушка auth →
# миграции → тесты RLS (ON_ERROR_STOP) → остановка и удаление.
# Использование: supabase/tests/run.sh   (PGBIN, PGPORT, PG_RUN_USER можно переопределить;
#                VERBOSE=1 — печатать текст каждой ожидаемой ошибки;
#                CATALOG_OUT=<файл> — записать каталог public после миграций, docs/specs/21 §5)
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
PGBIN="${PGBIN:-/usr/lib/postgresql/16/bin}"
PGPORT="${PGPORT:-54329}"
PGUSER_DB="postgres"

if [[ ! -x "$PGBIN/initdb" ]]; then
  echo "initdb not found in $PGBIN (set PGBIN)" >&2; exit 1
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
[[ ${#RUN_AS[@]} -gt 0 ]] && chown -R "$RUN_USER" "$WORK"

cleanup() {
  "${RUN_AS[@]}" "$PGBIN/pg_ctl" -D "$DATA" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$TMP"
}
trap cleanup EXIT

"${RUN_AS[@]}" "$PGBIN/initdb" -D "$DATA" -U "$PGUSER_DB" -A trust -E UTF8 --locale=C >/dev/null
"${RUN_AS[@]}" "$PGBIN/pg_ctl" -D "$DATA" -l "$TMP/server.log" -w \
  -o "-p $PGPORT -k $SOCK -c listen_addresses=''" start >/dev/null

PSQL=("${RUN_AS[@]}" psql -X -q -v ON_ERROR_STOP=1 -h "$SOCK" -p "$PGPORT" -U "$PGUSER_DB" -d postgres)

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
"${PSQL[@]}" "${VERB[@]}" -v match_keys="$WORK/matchKeys.json" -f "$WORK/core_rls.sql"
