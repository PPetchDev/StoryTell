#!/bin/sh
# Pulls Storytell's backups from the live VM onto a Synology NAS: a second off-site copy, kept in
# the clear on hardware you own. The NAS connects out to the VM; nothing at home is opened to the
# internet. Paste this whole file into a DSM scheduled task that runs as root, once a day
# (README, "Live on the Oracle VM" → "A copy on the NAS").
#
# First run: it makes an SSH key for the NAS, writes the public half next to the backups and
# stops. Once the VM trusts that key (scripts/vm/authorize-nas-pull.sh), every later run copies
# the backups the VM has and the NAS lacks, and keeps the newest KEEP here. It never deletes a
# backup because the VM no longer has it, so a wiped VM cannot empty the NAS.
set -eu

SHARE="Petch"                        # the shared folder the backups go in
FOLDER="StorytellBackup"             # the folder inside it
VM_HOST="storytell.duckdns.org"
VM_USER="storytell-pull"             # may only read /var/backups/storytell on the VM
KEEP=30                              # backups kept on the NAS
# The VM's host keys, so the NAS only ever talks to the real VM. Both kinds: DSM's ssh asks for the
# ECDSA one, newer ones for ED25519, and a kind missing here reads as "the host key has changed".
VM_HOST_KEYS="ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAICvn22U9Bda/lpUem+NMM2LMZhSRo2r/xA8vS/UVnUlt
ecdsa-sha2-nistp256 AAAAE2VjZHNhLXNoYTItbmlzdHAyNTYAAAAIbmlzdHAyNTYAAABBBLWiErsGnNW8S1hH8h9ddmIc6S7GF0Gy9CBHs1Yy/VXByhYzYJeeNit4sLb4QPw7J2Xxlw/aaTZXC7vsN7AefKY="

KEY="/root/.ssh/storytell_pull"
KNOWN_HOSTS="/root/.ssh/storytell_known_hosts"

fail() { echo "FAILED: $1" >&2; exit 1; }

SHARE_DIR=""
for volume in /volume*; do
    if [ -d "$volume/$SHARE" ]; then SHARE_DIR="$volume/$SHARE"; break; fi
done
[ -n "$SHARE_DIR" ] || fail "no shared folder named $SHARE on this NAS; set SHARE at the top of the script"
DEST="$SHARE_DIR/$FOLDER"
command -v rsync >/dev/null 2>&1 || fail "rsync is not on this NAS"
command -v ssh >/dev/null 2>&1 || fail "ssh is not on this NAS"
mkdir -p "$DEST/backups" /root/.ssh
chmod 700 /root/.ssh

if [ ! -f "$KEY" ]; then
    ssh-keygen -q -t ed25519 -N "" -C "storytell-nas-pull" -f "$KEY"
    echo "Made a new SSH key for this NAS."
fi
cp "$KEY.pub" "$DEST/storytell-pull.pub"
echo "$VM_HOST_KEYS" | sed "s|^|$VM_HOST |" > "$KNOWN_HOSTS"

SSH="ssh -i $KEY -o IdentitiesOnly=yes -o BatchMode=yes -o ConnectTimeout=20 -o StrictHostKeyChecking=yes -o CheckHostIP=no -o UserKnownHostsFile=$KNOWN_HOSTS"

# The VM serves only its backup folder to this key (rrsync, read-only), so "./" is that folder.
set +e
rsync -rlt --timeout=120 --exclude '*.partial' -e "$SSH" "$VM_USER@$VM_HOST:./" "$DEST/backups/" 2>"$DEST/last-pull-error.txt"
status=$?
set -e
if [ "$status" -ne 0 ]; then
    cat "$DEST/last-pull-error.txt" >&2
    if grep -qi "permission denied" "$DEST/last-pull-error.txt"; then
        echo "The VM does not trust this NAS's key yet. Its public half is in $DEST/storytell-pull.pub:" >&2
        cat "$KEY.pub" >&2
    fi
    fail "rsync ended with status $status; nothing was removed"
fi
rm -f "$DEST/last-pull-error.txt"

# Keep the newest KEEP. Names sort by date; only folders named like a backup are ever removed.
count=0
for backup in $(ls -1 "$DEST/backups" | grep -E '^storytell-[0-9]{8}-[0-9]{6}$' | sort -r); do
    count=$((count + 1))
    if [ "$count" -gt "$KEEP" ]; then rm -rf "$DEST/backups/$backup"; fi
done

newest=$(ls -1 "$DEST/backups" | grep -E '^storytell-[0-9]{8}-[0-9]{6}$' | sort | tail -n 1)
[ -n "$newest" ] || fail "the VM had no backup to copy"
[ -s "$DEST/backups/$newest/storytell.dump" ] || fail "$newest has no database dump"
kept=$(ls -1 "$DEST/backups" | grep -cE '^storytell-[0-9]{8}-[0-9]{6}$')
echo "$(date '+%Y-%m-%d %H:%M:%S') newest $newest, $kept kept" > "$DEST/last-pull.txt"
echo "OK: newest backup $newest, $kept kept in $DEST/backups"
