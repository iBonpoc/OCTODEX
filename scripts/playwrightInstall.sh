#!/usr/bin/env bash
# Playwright's Chromium (#1060): `--with-deps` also installs system libraries and fonts through apt; when Ubuntu's domains do not
# resolve, it fails although the browser itself downloads fine (from Playwright's CDN). The runner image has Chrome's libraries.
#   bash scripts/playwrightInstall.sh      (from apps/mobile)
# 1) with deps, ONE quick try (apt has short timeouts: scripts/aptRetries.sh); 2) without deps, with retries. The choice is printed.
# The fonts that --with-deps adds (fonts-ipafont: Japanese) are not used by any spec (no CJK text is checked).
PW="${PW_INSTALL:-npx playwright install}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if RETRY_SOFT=1 RETRY_DELAYS="" bash "$HERE/retry.sh" "playwright install --with-deps (one quick try)" bash -c "$PW --with-deps chromium >/dev/null"; then
  echo "playwright: chromium with system dependencies (apt worked)"
else
  echo "playwright: apt did not work — chromium WITHOUT system dependencies (the image has them)"
  bash "$HERE/retry.sh" "playwright install chromium" bash -c "$PW chromium >/dev/null" || exit 1
fi
