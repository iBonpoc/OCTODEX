#!/usr/bin/env bash
# Run a command with retries for the runner's network (apt mirrors, DNS): 4 attempts, pauses 10 / 30 / 60 s (#1060).
#   bash scripts/retry.sh "<what, for the message>" <command> [args…]
# RETRY_DELAYS="0 0 0" shortens the pauses (the test does). A command that keeps failing ends with a plain note that the
# network of the runner is the likely cause — re-run the job; a real failure of the command shows in its own output above.
what="$1"; shift
delays=(${RETRY_DELAYS:-10 30 60})
attempt=1
while true; do
  "$@" && exit 0
  code=$?
  if [ "$attempt" -gt "${#delays[@]}" ]; then
    echo "::error::${what}: failed ${attempt} times (exit ${code}). Most likely the runner's network (apt mirror / DNS), not the code: re-run the failed job. If it fails again with the same message, read the command's output above."
    exit "$code"
  fi
  d="${delays[$((attempt - 1))]}"
  echo "::warning::${what}: attempt ${attempt} failed (exit ${code}); retrying in ${d}s"
  sleep "$d"
  attempt=$((attempt + 1))
done
