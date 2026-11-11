#!/usr/bin/env bash
# The database tests' tools WITHOUT depending on Ubuntu's mirrors (#1060, 11.11.2026): for hours no Ubuntu domain resolved on the
# runners (azure.archive.ubuntu.com, then archive.ubuntu.com), while GitHub and npm worked.
#   bash scripts/dbTools.sh postgres faketime        (any of the two; no argument = both)
# postgres: the ubuntu-24.04 image has PostgreSQL 16 in /usr/lib/postgresql/16/bin — then apt is not called; otherwise apt with retries.
# faketime (libfaketime, for the 23:40 Los Angeles run): the system package if it is there; else ONE quick apt try; else it is
#   built from the source on GitHub — the tag v0.9.10 of github.com/wolfcw/libfaketime, the commit checked against the pinned
#   sha (rule 17), `make` in src/ — and FAKETIME_LIB is written to $GITHUB_ENV (supabase/tests/run.sh reads it).
# Every choice is printed as «dbtools: <tool>: <path>». Paths and commands can be replaced by DBTOOLS_* variables (the test does).
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PGBIN_DIR="${DBTOOLS_PGBIN:-/usr/lib/postgresql/16/bin}"
LIBROOT="${DBTOOLS_LIBROOT:-/usr/lib}"
APT_INSTALL="${DBTOOLS_APT_INSTALL:-sudo apt-get install -y -qq}"
APT_UPDATE="${DBTOOLS_APT_UPDATE:-sudo apt-get update -qq}"
SRC="${DBTOOLS_FAKETIME_SRC:-${HOME}/libfaketime}"
TAG="v0.9.10"
SHA="d475b925943ad404c6c728ac868dc73949e7281c"   # github.com/wolfcw/libfaketime, tag v0.9.10 (commit pinned, not just the tag)
URL="${DBTOOLS_FAKETIME_URL:-https://github.com/wolfcw/libfaketime}"
CLONE="${DBTOOLS_CLONE:-git clone -q --depth 1 --branch $TAG $URL $SRC}"
BUILD="${DBTOOLS_BUILD:-make -C $SRC/src}"
SHA_CMD="${DBTOOLS_SHA_CMD:-git -C $SRC rev-parse HEAD}"
want=("$@"); [ ${#want[@]} -eq 0 ] && want=(postgres faketime)
has() { local w; for w in "${want[@]}"; do [ "$w" = "$1" ] && return 0; done; return 1; }

system_faketime() { ls "$LIBROOT"/*/faketime/libfaketime.so.1 2>/dev/null | head -1; }

if has postgres; then
  if [ -x "$PGBIN_DIR/initdb" ]; then
    echo "dbtools: postgresql-16: preinstalled on the image ($("$PGBIN_DIR/postgres" --version 2>/dev/null || echo "$PGBIN_DIR"))"
  else
    echo "dbtools: postgresql-16: not on the image — apt with retries"
    bash "$HERE/retry.sh" "apt: postgresql-16" bash -c "$APT_UPDATE && $APT_INSTALL postgresql-16 >/dev/null" || exit 1
  fi
fi

if has faketime; then
  lib="$(system_faketime)"
  if [ -n "$lib" ]; then
    echo "dbtools: faketime: system package ($lib)"
  elif RETRY_SOFT=1 RETRY_DELAYS="" bash "$HERE/retry.sh" "apt: faketime (one quick try)" bash -c "$APT_UPDATE -o Acquire::Retries=0 -o Acquire::http::Timeout=10 && $APT_INSTALL -o Acquire::Retries=0 -o Acquire::http::Timeout=10 faketime >/dev/null" && [ -n "$(system_faketime)" ]; then
    echo "dbtools: faketime: installed by apt ($(system_faketime))"
  else
    echo "dbtools: faketime: apt did not work — from the source (libfaketime $TAG)"
    if [ -f "$SRC/src/libfaketime.so.1" ] && [ "$($SHA_CMD 2>/dev/null)" = "$SHA" ]; then
      echo "dbtools: faketime: built earlier (cache), commit ${SHA:0:7}"
    else
      rm -rf "$SRC"
      bash "$HERE/retry.sh" "git clone libfaketime $TAG" bash -c "$CLONE" || exit 1
      got="$($SHA_CMD 2>/dev/null)"
      if [ "$got" != "$SHA" ]; then
        echo "::error::libfaketime $TAG is commit '$got', not the pinned $SHA — not built (rule 17: check the tag before moving the pin)"; exit 1
      fi
      bash -c "$BUILD" >/dev/null || { echo "::error::libfaketime did not build (make in src/)"; exit 1; }
      [ -f "$SRC/src/libfaketime.so.1" ] || { echo "::error::libfaketime.so.1 is not where make puts it ($SRC/src)"; exit 1; }
      echo "dbtools: faketime: built from the source, commit ${SHA:0:7}"
    fi
    if [ -n "${GITHUB_ENV:-}" ]; then echo "FAKETIME_LIB=$SRC/src/libfaketime.so.1" >> "$GITHUB_ENV"; fi
    echo "dbtools: faketime: FAKETIME_LIB=$SRC/src/libfaketime.so.1"
  fi
fi
exit 0
