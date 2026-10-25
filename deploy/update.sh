#!/bin/bash
# Redeploy CHOKEPOINT if the tracked branch has new commits.
# Run every 2 minutes by chokepoint-update.timer, or by hand:  sudo bash /opt/chokepoint/deploy/update.sh --force
# .env.local is untracked, so the reset below never touches the keys.
set -euo pipefail
APP=/opt/chokepoint
cd "$APP"
as_app() { sudo -u chokepoint -H bash -c "cd '$APP' && $*"; }
as_app "git fetch --quiet origin"
BRANCH=$(as_app "git rev-parse --abbrev-ref HEAD")
LOCAL=$(as_app "git rev-parse HEAD")
REMOTE=$(as_app "git rev-parse origin/$BRANCH")
if [ "$LOCAL" = "$REMOTE" ] && [ "${1:-}" != "--force" ]; then exit 0; fi
echo "deploying $REMOTE"
as_app "git reset --hard --quiet origin/$BRANCH"
as_app "npm ci --no-audit --no-fund && npm run build"
systemctl restart chokepoint
echo "deployed $(as_app 'git rev-parse --short HEAD') at $(date -u)"
