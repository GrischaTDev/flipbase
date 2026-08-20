#!/bin/bash
#
# Naechtliche Sicherung von Flipbase.
#
# Ablauf:
#   1. Datenbank (inklusive Rollen), hochgeladene Dateien und .env sichern
#   2. Alles verschluesseln - der Abzug enthaelt Steuerdaten und saemtliche
#      Schluessel der Installation
#   3. Verschluesselte Kopie auf den zweiten Server uebertragen
#   4. Alte Staende hier und dort entfernen
#
# Aufruf per Cron, siehe /etc/cron.d/flipbase-backup
#
set -euo pipefail

ZIEL="/var/backups/flipbase"
TAGE=14
STAMPEL=$(date +%Y-%m-%d_%H%M)
SCHLUESSEL_PUB="/opt/flipbase/sicherung-schluessel.pub"
FERN_ZIEL="flipbackup@168.119.165.201:"  # rrsync sperrt das Zielverzeichnis ein - der Pfad ist deshalb relativ
FERN_SCHLUESSEL="/root/.ssh/flipbase-backup"

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

# --- Verschluesseln und auslagern -------------------------------------
# Ohne Verschluesselung laege eine lesbare Kopie der Steuerdaten und aller
# Schluessel auf einem zweiten Rechner.
if [ -f "$SCHLUESSEL_PUB" ]; then
  EMPFAENGER=$(cat "$SCHLUESSEL_PUB")
  log "Verschluesseln"
  for datei in "$ZIEL/db_${STAMPEL}.sql.gz" "$ZIEL/storage_${STAMPEL}.tar.gz" "$ZIEL/env_${STAMPEL}.txt"; do
    [ -f "$datei" ] || continue
    age -r "$EMPFAENGER" -o "${datei}.age" "$datei"
  done

  log "Uebertragen auf den zweiten Server"
  # Bewusst OHNE --delete: Der Schluessel darf auf dem zweiten Server nur
  # hinzufuegen, nicht loeschen. Ein kompromittierter Flipbase-Server kann die
  # ausgelagerten Kopien dadurch nicht mit vernichten. Das Aufraeumen dort
  # erledigt ein eigener Cron-Auftrag auf dem zweiten Server.
  if rsync -a \
       -e "ssh -i ${FERN_SCHLUESSEL} -o BatchMode=yes -o StrictHostKeyChecking=accept-new" \
       --include='*.age' --exclude='*' \
       "$ZIEL/" "$FERN_ZIEL" 2>/dev/null; then
    log "Uebertragung erfolgreich"
  else
    # Kein Abbruch: Die oertliche Sicherung ist wichtiger als die Kopie.
    log "WARNUNG: Uebertragung fehlgeschlagen - oertliche Sicherung besteht"
  fi
else
  log "WARNUNG: Kein Schluessel gefunden - keine Auslagerung"
fi

# --- Alte Staende entfernen -------------------------------------------
geloescht=$(find "$ZIEL" -type f -mtime "+${TAGE}" -print -delete | wc -l)
log "Aufgeraeumt: $geloescht Datei(en) aelter als $TAGE Tage entfernt"
log "Belegt gesamt: $(du -sh "$ZIEL" | cut -f1)"
