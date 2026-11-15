#!/usr/bin/env bash
# On the VM, as the ubuntu user: lets one SSH key read the backups, and nothing else.
#
#   bash authorize-nas-pull.sh "ssh-ed25519 AAAA... storytell-nas-pull"
#
# The key is the NAS's public half (scripts/vm/nas-pull.sh writes it to storytell-pull.pub).
# It makes the account `storytell-pull` if it isn't there, lets its group read
# /var/backups/storytell, and replaces the account's authorized key with this one. The key is
# tied to `rrsync -ro`: it can copy files out of that folder, and cannot write, open a shell,
# forward a port or read anything else. Run it again with a new key to replace the old one.
set -euo pipefail

KEY=${1:?usage: authorize-nas-pull.sh "<public key>"}
[[ "$KEY" =~ ^ssh-ed25519\ AAAA[A-Za-z0-9+/=]+(\ [A-Za-z0-9@._-]+)?$ ]] || { echo "Not an ed25519 public key on one line." >&2; exit 1; }
[[ -x /usr/bin/rrsync ]] || { echo "rrsync is missing: sudo apt-get install rsync" >&2; exit 1; }

ACCOUNT=storytell-pull
HOME_DIR=/var/lib/$ACCOUNT
BACKUPS=/var/backups/storytell

if ! getent passwd "$ACCOUNT" >/dev/null; then
    sudo useradd --system --user-group --create-home --home-dir "$HOME_DIR" --shell /bin/sh "$ACCOUNT"
fi
# The backups stay the app user's; the pull account's group may list and read them.
sudo chgrp "$ACCOUNT" "$BACKUPS"
sudo chmod 750 "$BACKUPS"
# root owns the key file, so the account cannot loosen its own restriction.
sudo install -d -o root -g root -m 755 "$HOME_DIR" "$HOME_DIR/.ssh"
printf 'command="/usr/bin/rrsync -ro %s",restrict %s\n' "$BACKUPS" "$KEY" | sudo tee "$HOME_DIR/.ssh/authorized_keys" >/dev/null
sudo chmod 644 "$HOME_DIR/.ssh/authorized_keys"
echo "AUTHORIZED: $ACCOUNT may read $BACKUPS with $(echo "$KEY" | awk '{print $1, substr($2, 1, 16) "…", $3}')"
