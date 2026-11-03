#!/usr/bin/env bash
# Одноразовый локальный Postgres 16: initdb во временный каталог → заглушка auth →
# миграции → тесты RLS (ON_ERROR_STOP) → остановка и удаление.
# Использование: supabase/tests/run.sh   (PGBIN, PGPORT, PG_RUN_USER можно переопределить;
#                VERBOSE=1 — печатать текст каждой ожидаемой ошибки)
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
cp "$HERE"/auth_stub.sql "$HERE"/core_rls.sql "$WORK"/
cp "$ROOT"/migrations/*.sql "$WORK"/
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
for m in $(ls "$WORK" | grep -E '^[0-9]+_.*\.sql$' | sort); do
  echo "== migration $m"
  "${PSQL[@]}" -f "$WORK/$m"
done
echo "== tests core_rls.sql"
VERB=(); [[ "${VERBOSE:-}" == "1" ]] && VERB=(-v verbose=1)
"${PSQL[@]}" "${VERB[@]}" -f "$WORK/core_rls.sql"
