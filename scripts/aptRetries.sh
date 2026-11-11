#!/usr/bin/env bash
# apt itself retries a failed download 5 times (also when Playwright's --with-deps calls apt-get) — a flaky mirror or DNS
# (azure.archive.ubuntu.com, 11.11.2026) no longer fails the step on the first miss (#1060).
echo 'Acquire::Retries "5";' | sudo tee /etc/apt/apt.conf.d/80-retries >/dev/null
