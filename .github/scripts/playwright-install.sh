#!/usr/bin/env bash
# Usage: playwright-install.sh <install --with-deps | install-deps> chromium
#
# `playwright ... --with-deps` shells out to `sudo apt-get`, so on a stall the
# apt/dpkg children are root-owned: `timeout` (runner user) and the retry
# action's process-tree kill both get EPERM and leave them holding the dpkg
# lock into the next attempt. Clean them up here, with sudo, before failing.
set -u

timeout -k 15 180 bunx playwright "$@"
status=$?

# 124 = TERM on timeout, 137 = escalated to KILL by -k. Other failures are real
# install errors, not a stalled apt, so leave the package manager alone.
if [ "$status" -eq 124 ] || [ "$status" -eq 137 ]; then
  sudo pkill -KILL -x apt-get || true
  sudo pkill -KILL -x apt || true
  sudo pkill -KILL -x dpkg || true
  # Let the killed processes release the dpkg lock (bounded, ~10s).
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    sudo pgrep -x 'apt-get|apt|dpkg' >/dev/null || break
    sleep 1
  done
  # Bounded so the repair can't outlive the retry action's per-attempt limit.
  sudo timeout -k 5 60 dpkg --configure -a || true
fi

exit "$status"
