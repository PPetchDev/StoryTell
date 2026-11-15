#!/usr/bin/env bash
# Deploys a commit on the Oracle VM. Run there, as the ubuntu user, after uploading the release:
#
#   git archive --format=tar.gz -o release.tar.gz <commit>
#   scp release.tar.gz scripts/vm/deploy.sh ubuntu@<vm>:/tmp/
#   ssh -o ServerAliveInterval=30 ubuntu@<vm> "bash /tmp/deploy.sh <commit>"
#
# It builds the release beside the running one, makes a restore point of what is live, stops the
# app, runs the migrations, swaps the folders and starts the app. /srv/storytell/app-prev is the
# release before, for going back (only safe before a migration the old code can't run on; else
# restore the restore point: README, "Restoring").
#
# The work runs detached from the SSH session, with its output in /tmp/st-deploy.log: a deploy
# must never stop between stopping the app and starting it, and connections do drop (twice on
# 2026-11-15, while a full backup was uploading to Drive). If the connection goes, the deploy
# carries on; `tail -f /tmp/st-deploy.log` shows the rest.
set -euo pipefail

COMMIT=${1:?usage: deploy.sh <commit>}
LOG=/tmp/st-deploy.log
if [[ "${DEPLOY_DETACHED:-}" != 1 ]]; then
    DEPLOY_DETACHED=1 setsid nohup bash "$0" "$@" >"$LOG" 2>&1 </dev/null &
    worker=$!
    # Shows the log until the worker ends; ends with the worker's own status.
    tail --pid="$worker" -n +1 -f "$LOG" || true
    wait "$worker"
    exit $?
fi

HOME_DIR=/srv/storytell
as_app() { sudo -u storytell -H bash -lc "$1"; }

sudo rm -rf "$HOME_DIR/app-next"
as_app "mkdir -p $HOME_DIR/app-next && tar -xzf /tmp/release.tar.gz -C $HOME_DIR/app-next && echo $COMMIT > $HOME_DIR/app-next/COMMIT"
as_app "cd $HOME_DIR/app-next && npm ci --no-audit --no-fund >/tmp/st-ci.log 2>&1 && npm run build -w apps/api >/tmp/st-api.log 2>&1 && cd apps/web && API_ORIGIN=http://127.0.0.1:4000 npx next build >/tmp/st-web.log 2>&1"
echo BUILD_OK

# A restore point of what is live, before anything changes: the database and the images, in
# /srv/storytell/backup/restore-points, a few seconds' work. It is not the day's backup: that one
# goes to Drive too, which takes minutes, and the hourly timer makes it. The script is the new
# release's own, so a change to it works from the deploy that brings it. systemd-run reads the
# API's settings file for DATABASE_URL, as the hourly unit does. A failed one stops the deploy
# here, with the app still running.
if sudo test -f "$HOME_DIR/live.env"; then
    sudo systemd-run --quiet --wait --collect -p User=storytell -p Group=storytell -p EnvironmentFile=/etc/storytell/api.env \
        /usr/local/bin/node "$HOME_DIR/app-next/scripts/backup.mjs" --home "$HOME_DIR" --restore-point
    echo RESTORE_POINT_OK
else
    echo "RESTORE_POINT_SKIPPED: no $HOME_DIR/live.env (see README, Live on the VM)"
fi

sudo systemctl stop storytell-web storytell-api
# Each migration runs in its own transaction; one that fails leaves the ones before it applied.
if ! as_app "cd $HOME_DIR/app-next/apps/api && ENV_FILE=/etc/storytell/api.env node dist/migrate.js >/tmp/st-migrate.log 2>&1"; then
    echo "MIGRATE_FAILED: see /tmp/st-migrate.log. Starting the release that was live; check it still runs on this database."
    sudo systemctl start storytell-api storytell-web
    exit 1
fi
echo MIGRATE_OK

as_app "cd $HOME_DIR && rm -rf app-prev && mv app app-prev && mv app-next app && cp app/scripts/backup.mjs backup.mjs"
sudo systemctl start storytell-api storytell-web
sleep 8
systemctl is-active storytell-api storytell-web
sudo cat "$HOME_DIR/app/COMMIT"
curl -s -o /dev/null -w "health %{http_code}\n" http://127.0.0.1:4000/api/health || true
