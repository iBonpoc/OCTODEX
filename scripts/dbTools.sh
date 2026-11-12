#!/usr/bin/env bash
# The database tests' tools WITHOUT depending on Ubuntu's mirrors (#1060, 11.11.2026): for hours no Ubuntu domain resolved on the
# runners (azure.archive.ubuntu.com, then archive.ubuntu.com), while GitHub and npm worked.
#   bash scripts/dbTools.sh postgres faketime        (any of the two; no argument = both)
# postgres: PostgreSQL 17 — the version of the live database (17.x, #806 P-03). The ubuntu-24.04 image has only 16, so 17 comes
#   from the PostgreSQL project's own apt repository (apt.postgresql.org, «PGDG»): its signing key is fetched and checked
#   against the pinned fingerprint (rule 17), then apt with retries. Already there (a cached or newer image) — apt is not called.
# faketime (libfaketime, for the 23:40 Los Angeles run): the system package if it is there; else ONE quick apt try; else it is
#   built from the source on GitHub — the tag v0.9.10 of github.com/wolfcw/libfaketime, the commit checked against the pinned
#   sha (rule 17), `make` in src/ — and FAKETIME_LIB is written to $GITHUB_ENV (supabase/tests/run.sh reads it).
# Every choice is printed as «dbtools: <tool>: <path>». Paths and commands can be replaced by DBTOOLS_* variables (the test does).
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PG_MAJOR=17
PGBIN_DIR="${DBTOOLS_PGBIN:-/usr/lib/postgresql/$PG_MAJOR/bin}"
PGSHARE_EXT="${DBTOOLS_PGEXT:-/usr/share/postgresql/$PG_MAJOR/extension}"
# the PGDG signing key, by its full fingerprint (www.postgresql.org/download/linux/ubuntu): another key is not trusted
PGDG_FPR="B97B0AFCAA1A47F044F244A07FCC7D46ACCC4CF8"
PGDG_KEY="${DBTOOLS_PGDG_KEY:-/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc}"
PGDG_SETUP="${DBTOOLS_PGDG_SETUP:-sudo install -d /usr/share/postgresql-common/pgdg && sudo curl -fsS --retry 3 -o $PGDG_KEY https://www.postgresql.org/media/keys/ACCC4CF8.asc && echo \"deb [signed-by=$PGDG_KEY] https://apt.postgresql.org/pub/repos/apt noble-pgdg main\" | sudo tee /etc/apt/sources.list.d/pgdg.list >/dev/null}"
PGDG_FPR_CMD="${DBTOOLS_PGDG_FPR_CMD:-gpg --show-keys --with-colons $PGDG_KEY}"
# the packages apt downloaded for it, kept between runs (actions/cache in checks.yml): the next run installs them with dpkg,
# without any mirror (#1060); a cache that no longer fits the image — apt again
PG_DEBS="${DBTOOLS_PG_DEBS:-${HOME}/pg$PG_MAJOR-debs}"
DPKG_INSTALL="${DBTOOLS_DPKG_INSTALL:-sudo dpkg -i}"
LIBROOT="${DBTOOLS_LIBROOT:-/usr/lib}"
APT_INSTALL="${DBTOOLS_APT_INSTALL:-sudo apt-get install -y -qq}"
APT_UPDATE="${DBTOOLS_APT_UPDATE:-sudo apt-get update -qq}"
SRC="${DBTOOLS_FAKETIME_SRC:-${HOME}/libfaketime}"
TAG="v0.9.10"
SHA="d475b925943ad404c6c728ac868dc73949e7281c"   # github.com/wolfcw/libfaketime, tag v0.9.10 (commit pinned, not just the tag)
URL="${DBTOOLS_FAKETIME_URL:-https://github.com/wolfcw/libfaketime}"
# Fetched by the pinned commit, not by the tag name: a moved tag cannot bring other code in.
CLONE="${DBTOOLS_CLONE:-git init -q $SRC && git -C $SRC fetch -q --depth 1 $URL $SHA && git -C $SRC checkout -q FETCH_HEAD}"
# The library is copied where the user «postgres» can read it (runuser -u postgres cannot enter /home/runner).
INSTALL_DIR="${DBTOOLS_INSTALL_DIR:-/usr/local/lib/faketime}"
INSTALL_SUDO="${DBTOOLS_SUDO-sudo}"
BUILD="${DBTOOLS_BUILD:-make -C $SRC/src}"
SHA_CMD="${DBTOOLS_SHA_CMD:-git -C $SRC rev-parse HEAD}"
want=("$@"); [ ${#want[@]} -eq 0 ] && want=(postgres faketime)
for w in "${want[@]}"; do case "$w" in postgres|faketime) ;; *) echo "::error::dbTools.sh: unknown tool '$w' (postgres | faketime)"; exit 1;; esac; done
has() { local w; for w in "${want[@]}"; do [ "$w" = "$1" ] && return 0; done; return 1; }

system_faketime() { ls "$LIBROOT"/*/faketime/libfaketime.so.1 2>/dev/null | head -1; }

if has postgres; then
  if [ -x "$PGBIN_DIR/initdb" ]; then
    echo "dbtools: postgresql-$PG_MAJOR: already there ($("$PGBIN_DIR/postgres" --version 2>/dev/null || echo "$PGBIN_DIR"))"
  else
    cached=$(ls "$PG_DEBS"/postgresql-"$PG_MAJOR"_*.deb 2>/dev/null | head -1)
    if [ -n "$cached" ] && $DPKG_INSTALL "$PG_DEBS"/*.deb >/dev/null 2>&1 && [ -x "$PGBIN_DIR/initdb" ]; then
      echo "dbtools: postgresql-$PG_MAJOR: from the cached packages ($PG_DEBS), no mirror"
    else
      [ -n "$cached" ] && echo "::warning::dbtools: the cached packages of PostgreSQL $PG_MAJOR did not install (the image changed?) — apt"
      echo "dbtools: postgresql-$PG_MAJOR: not on the image — the PGDG repository, then apt with retries"
      bash "$HERE/retry.sh" "PGDG: the signing key and the list" bash -c "$PGDG_SETUP" || exit 1
      if ! bash -c "$PGDG_FPR_CMD" 2>/dev/null | grep -q "^fpr:*$PGDG_FPR:"; then
        echo "::error::the PGDG signing key is not $PGDG_FPR — not trusted, PostgreSQL $PG_MAJOR not installed (rule 17: check the key before moving the pin)"; exit 1
      fi
      rm -rf "$PG_DEBS" && mkdir -p "$PG_DEBS/partial"
      # downloaded into the cache dir first (what the image lacks), then installed from it: the next run needs no mirror
      bash "$HERE/retry.sh" "apt: postgresql-$PG_MAJOR" bash -c "$APT_UPDATE && $APT_INSTALL --no-install-recommends --download-only -o Dir::Cache::archives=$PG_DEBS postgresql-$PG_MAJOR >/dev/null" || exit 1
      $DPKG_INSTALL "$PG_DEBS"/*.deb >/dev/null || { echo "::error::the downloaded PostgreSQL $PG_MAJOR packages did not install (dpkg -i $PG_DEBS)"; exit 1; }
      echo "dbtools: postgresql-$PG_MAJOR: installed from PGDG (packages kept in $PG_DEBS)"
    fi
  fi
fi

# The first thing the job checks (audit condition, #1060): the server is really 17.x — the live database's version (#806) — and has the extension the tests need
# (pgcrypto — the tests do without pg_cron / pg_net: they skip them as «not here»). A wrong image fails here, plainly.
if has postgres; then
  ver="$("$PGBIN_DIR/postgres" --version 2>&1)"
  if ! echo "$ver" | grep -Eq "(^|[^0-9])$PG_MAJOR\\.[0-9]"; then
    echo "::error::the database tests need PostgreSQL $PG_MAJOR.x (the live database's version) in $PGBIN_DIR, found: '$ver'. The image must stay ubuntu-24.04 (not ubuntu-latest), $PG_MAJOR from the PGDG repository."; exit 1
  fi
  if [ ! -f "$PGSHARE_EXT/pgcrypto.control" ]; then
    echo "::error::PostgreSQL $PG_MAJOR has no pgcrypto extension ($PGSHARE_EXT/pgcrypto.control is missing): the tests create it. Check the postgresql-$PG_MAJOR package."; exit 1
  fi
  echo "dbtools: checked — $ver, pgcrypto present"
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
    DEST="$INSTALL_DIR/libfaketime.so.1"
    $INSTALL_SUDO mkdir -p "$INSTALL_DIR" && $INSTALL_SUDO install -m 0644 "$SRC/src/libfaketime.so.1" "$DEST" \
      || { echo "::error::could not copy libfaketime.so.1 to $INSTALL_DIR"; exit 1; }
    if [ -n "${GITHUB_ENV:-}" ]; then echo "FAKETIME_LIB=$DEST" >> "$GITHUB_ENV"; fi
    echo "dbtools: faketime: FAKETIME_LIB=$DEST"
  fi
fi
exit 0
