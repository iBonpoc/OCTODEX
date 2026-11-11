#!/usr/bin/env bash
# The runner's apt (#1060, 11.11.2026): azure.archive.ubuntu.com did not resolve for hours and every apt step failed on all PRs
# — retries alone (job 130586447349: 4 attempts × ~5 min) are not enough, the mirror itself has to be avoided.
#  1) the mirror list (/etc/apt/apt-mirrors.txt — the runner's sources point at it: `mirror+file:/etc/apt/apt-mirrors.txt`)
#     and any source that names the azure mirror directly: azure.archive.ubuntu.com → archive.ubuntu.com, and archive.ubuntu.com
#     is added to the list as a fallback when it is not there;
#  2) apt itself retries a failed download and gives up on a silent host sooner than minutes (also for Playwright's apt-get).
# Paths and sudo can be replaced by variables, so the test runs it on temporary files (test/aptRetry.test.ts).
SUDO="${APT_SUDO-sudo}"
MIRRORS="${APT_MIRRORS_FILE:-/etc/apt/apt-mirrors.txt}"
SOURCES_DIR="${APT_SOURCES_DIR:-/etc/apt/sources.list.d}"
LEGACY_LIST="${APT_LEGACY_LIST:-/etc/apt/sources.list}"
CONF_DIR="${APT_CONF_DIR:-/etc/apt/apt.conf.d}"

AZURE='http://azure\.archive\.ubuntu\.com/'
ARCHIVE='http://archive.ubuntu.com/'

if [ -f "$MIRRORS" ]; then
  $SUDO sed -i "s#${AZURE}#${ARCHIVE}#g" "$MIRRORS"
  # the fallback: archive.ubuntu.com/ubuntu/ stands in the list (once)
  if ! grep -q 'archive\.ubuntu\.com/ubuntu' "$MIRRORS"; then
    echo "${ARCHIVE}ubuntu/ priority:2" | $SUDO tee -a "$MIRRORS" >/dev/null
  fi
  # no duplicate lines after the replacement
  $SUDO awk '!seen[$0]++' "$MIRRORS" | $SUDO tee "$MIRRORS.tmp" >/dev/null && $SUDO mv "$MIRRORS.tmp" "$MIRRORS"
fi
for f in "$SOURCES_DIR"/*.sources "$SOURCES_DIR"/*.list "$LEGACY_LIST"; do
  [ -f "$f" ] && grep -q 'azure\.archive\.ubuntu\.com' "$f" && $SUDO sed -i "s#${AZURE}#${ARCHIVE}#g" "$f"
done
printf 'Acquire::Retries "3";\nAcquire::http::Timeout "20";\nAcquire::https::Timeout "20";\n' | $SUDO tee "$CONF_DIR/80-retries" >/dev/null
exit 0
