#!/bin/bash
# Installs the photographer as a launchd agent (autostart at login, restart on crash). Run from the checkout that should host the service:
#   npm run shot:install            — writes ~/Library/LaunchAgents/com.gorix.shot.plist and loads it
#   npm run shot:install -- --remove
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
PLIST="$HOME/Library/LaunchAgents/com.gorix.shot.plist"
if [ "$1" = "--remove" ]; then launchctl bootout "gui/$(id -u)" "$PLIST" 2>/dev/null || true; rm -f "$PLIST"; echo "removed"; exit 0; fi
mkdir -p "$HOME/GoRix/notes/screens" "$HOME/Library/LaunchAgents"
cat > "$PLIST" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.gorix.shot</string>
  <key>ProgramArguments</key><array><string>$(command -v node)</string><string>$HERE/server.cjs</string></array>
  <key>WorkingDirectory</key><string>$HERE/../..</string>
  <key>EnvironmentVariables</key><dict><key>PATH</key><string>$PATH</string></dict>
  <key>RunAtLoad</key><true/><key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$HOME/GoRix/notes/screens/.service.log</string>
  <key>StandardErrorPath</key><string>$HOME/GoRix/notes/screens/.service.log</string>
</dict></plist>
PL
launchctl bootout "gui/$(id -u)" "$PLIST" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "installed: $PLIST (service from $HERE)"
