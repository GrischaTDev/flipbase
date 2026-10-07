#!/bin/bash
# Ein aktueller Tagesstand; Historie und Verschlüsselung liegen auf dem Backupserver.
set -euo pipefail
umask 077
exec /usr/bin/python3 -B /opt/flipbase/create-backup-snapshot.py
