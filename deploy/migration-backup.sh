#!/bin/bash
# Frische, ausschließlich verschlüsselte DB-Sicherung vor Release-Migrationen.
# Unabhängig vom toleranteren nächtlichen backup.sh; Fehler brechen ab.
set -euo pipefail
umask 077
directory="${FLIPBASE_BACKUP_DIR:-/var/backups/flipbase}"
recipient="${FLIPBASE_BACKUP_RECIPIENT:-/opt/flipbase/sicherung-schluessel.pub}"
[[ -s "$recipient" ]] || { echo 'Backup-Empfaengerschluessel fehlt.' >&2; exit 1; }
install -d -m 700 "$directory"
temporary="$(mktemp "$directory/release-db-XXXXXXXX")"
trap 'rm -f -- "$temporary"' EXIT
docker exec supabase-db pg_dumpall -U postgres | gzip -9 | age -R "$recipient" > "$temporary"
[[ -s "$temporary" ]] || { echo 'Leeres Backup.' >&2; exit 1; }
head -n 1 "$temporary" | grep -qx 'age-encryption.org/v1'
destination="$temporary.sql.gz.age"
mv -- "$temporary" "$destination"
# Der Transport prüft den bereits bekannten Host; keine automatische Annahme.
rsync -a -e 'ssh -i /root/.ssh/flipbase-backup -o BatchMode=yes -o StrictHostKeyChecking=yes' "$destination" flipbackup@168.119.165.201:
echo 'Frische verschluesselte Datenbanksicherung lokal und extern erfolgreich.'
