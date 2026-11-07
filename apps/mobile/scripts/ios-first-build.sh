#!/usr/bin/env bash
# The first iPhone build, once, by the founder on a Mac (docs/specs/30-ios-testflight.md §4, docs/11-setup-guide.md §5).
# Run: cd OCTODEX/apps/mobile && npm run ios:first
#
# Why a terminal and not the GitHub button: eas-cli 27.4.1 never creates the distribution certificate with
# --non-interactive, and Apple lets no API key create the push key (APNs). Signed in with the Apple ID once,
# EAS makes the certificate, the profile, the push key, an App Store Connect API key (kept on EAS),
# the app in App Store Connect and its TestFlight group. After that every build is Actions → «EAS build».
#
# The Apple ID password and the 2FA code are typed only here, into the terminal. Nothing is written to the repository.
set -euo pipefail
set +x

EAS="npx --yes eas-cli@27.4.1"
cd "$(dirname "$0")/.."

say() { printf '\n==> %s\n' "$1"; }

major=$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)
if [ "$major" -lt 20 ]; then
  echo "Node.js 20 or newer is needed (now: $(node -v 2>/dev/null || echo none)). Install it from https://nodejs.org (LTS), then run again."
  exit 1
fi

if ! grep -q '"expo-notifications"' package.json; then
  echo "expo-notifications is not in this copy yet: pushes would not be set up. Update the copy (git pull) and run again."
  exit 1
fi

if [ ! -d ../../node_modules ]; then
  say "Installing the project (a few minutes, once)"
  (cd ../.. && npm ci --no-audit --no-fund)
fi

# Sign in with the Apple ID here, not with an API key from the environment.
unset EXPO_ASC_API_KEY_PATH EXPO_ASC_KEY_ID EXPO_ASC_ISSUER_ID EXPO_APPLE_TEAM_ID EXPO_APPLE_TEAM_TYPE

say "Expo account"
$EAS whoami >/dev/null 2>&1 || $EAS login
$EAS whoami

say "iPhone build → TestFlight. Answer: Apple account — yes; Apple ID, password, the code from your iPhone; everything else — Enter"
$EAS build --platform ios --profile testflight --auto-submit-with-profile=testflight

say "Done. TestFlight sends an e-mail in 20–40 minutes; install OCTODEX from the TestFlight app."
