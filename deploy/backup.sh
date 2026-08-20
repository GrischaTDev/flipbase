#!/bin/bash
#
# Naechtliche Sicherung von Flipbase.
# Sichert die komplette Datenbank (inklusive Rollen und Rechten) sowie die
# hochgeladenen Dateien aus dem Supabase-Storage.
#
# Aufbewahrung: 14 Tage. Aufruf per Cron, siehe /etc/cron.d/flipbase-backup
#
set -euo pipefail

ZIEL="/var/backups/flipbase"
TAGE=14
STAMPEL=$(date +%Y-%m-%d_%H%M)
mkdir -p "$ZIEL"

log() { echo "$(date +'%Y-%m-%d %H:%M:%S') $*"; }

# --- Datenbank ---------------------------------------------------------
# pg_dumpall erfasst alle Datenbanken samt Rollen - beim Wiederherstellen
# muss dadurch nichts von Hand nachgezogen werden.
log "Datenbank wird gesichert"
if docker exec supabase-db pg_dumpall -U postgres | gzip -9 > "$ZIEL/db_${STAMPEL}.sql.gz.tmp"; then
  mv "$ZIEL/db_${STAMPEL}.sql.gz.tmp" "$ZIEL/db_${STAMPEL}.sql.gz"
  log "Datenbank gesichert: $(du -h "$ZIEL/db_${STAMPEL}.sql.gz" | cut -f1)"
else
  rm -f "$ZIEL/db_${STAMPEL}.sql.gz.tmp"
  log "FEHLER: Datenbanksicherung fehlgeschlagen"
  exit 1
fi

# --- Hochgeladene Dateien ---------------------------------------------
# Artikelfotos und Belege liegen im Storage-Verzeichnis, nicht in der Datenbank.
if [ -d /opt/supabase/volumes/storage ]; then
  log "Dateien werden gesichert"
  if tar -czf "$ZIEL/storage_${STAMPEL}.tar.gz.tmp" -C /opt/supabase/volumes storage; then
    mv "$ZIEL/storage_${STAMPEL}.tar.gz.tmp" "$ZIEL/storage_${STAMPEL}.tar.gz"
    log "Dateien gesichert: $(du -h "$ZIEL/storage_${STAMPEL}.tar.gz" | cut -f1)"
  else
    rm -f "$ZIEL/storage_${STAMPEL}.tar.gz.tmp"
    log "FEHLER: Dateisicherung fehlgeschlagen"
    exit 1
  fi
fi

# --- Konfiguration -----------------------------------------------------
# .env enthaelt die Schluessel. Ohne sie ist eine Wiederherstellung wertlos,
# weil die bestehenden Anmeldungen nicht mehr passen.
install -m 600 /opt/supabase/.env "$ZIEL/env_${STAMPEL}.txt"

# --- Alte Staende entfernen -------------------------------------------
geloescht=$(find "$ZIEL" -type f -mtime "+${TAGE}" -print -delete | wc -l)
log "Aufgeraeumt: $geloescht Datei(en) aelter als $TAGE Tage entfernt"
log "Belegt gesamt: $(du -sh "$ZIEL" | cut -f1)"
