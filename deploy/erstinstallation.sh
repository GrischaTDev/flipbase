#!/bin/bash
#
# Einmalige Umstellung des Servers auf die automatische Auslieferung.
#
# Vorher baute der Server die Anwendung selbst aus einer Kopie des Quellcodes
# unter /opt/reflip/app. Seit der Pipeline (.github/workflows/ci.yml) baut
# GitHub Actions das Abbild, und der Server laedt es nur noch. Dieses Skript
# bringt ihn auf den dafuer noetigen Stand.
#
# Aufruf: die drei Dateien aus deploy/ in denselben Ordner auf den Server
# legen und das Skript dort starten, zum Beispiel:
#
#   scp deploy/deploy.sh deploy/docker-compose.app.yml \
#       deploy/erstinstallation.sh root@<server>:/tmp/
#   ssh root@<server> "bash /tmp/erstinstallation.sh"
#
# Das Skript laeuft absichtlich nicht auf gut Glueck: Findet es die alte
# Installation nicht, bricht es ab, statt auf einem fremden Rechner
# Verzeichnisse anzulegen. Ein zweiter Aufruf schadet ebenfalls nicht.

set -euo pipefail

HERKUNFT="$(cd "$(dirname "$0")" && pwd)"
ALT="/opt/reflip"
NEU="/opt/flipbase"
SCHLUESSEL='command="/opt/flipbase/deploy.sh",no-agent-forwarding,no-port-forwarding,no-pty,no-user-rc,no-X11-forwarding ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIPFd9dNslS65k5UyLnVuHZ6QxqnNqgdaX+DnCGVWdZ0O github-actions-deploy@flipbase'

for datei in deploy.sh docker-compose.app.yml; do
  [ -f "$HERKUNFT/$datei" ] || {
    echo "Fehlt: $HERKUNFT/$datei - bitte zusammen mit diesem Skript hochladen." >&2
    exit 1
  }
done

# 1. Verzeichnis auf den neuen Namen bringen
if [ -d "$ALT" ]; then
  echo "Benenne $ALT nach $NEU um..."
  mv "$ALT" "$NEU"
elif [ -d "$NEU" ]; then
  echo "$NEU besteht bereits - Umbenennung uebersprungen."
else
  echo "Weder $ALT noch $NEU vorhanden. Falscher Server?" >&2
  exit 1
fi

# 2. Verweise in Skripten und im Cron-Auftrag nachziehen
echo "Ziehe Pfadangaben nach..."
sed -i "s#$ALT#$NEU#g" "$NEU"/*.sh 2>/dev/null || true
[ -f /etc/cron.d/flipbase-backup ] && sed -i "s#$ALT#$NEU#g" /etc/cron.d/flipbase-backup

# 3. Neue Compose-Datei und das Deploy-Skript einsetzen
echo "Setze docker-compose.yml und deploy.sh ein..."
install -m 644 "$HERKUNFT/docker-compose.app.yml" "$NEU/docker-compose.yml"
install -m 755 "$HERKUNFT/deploy.sh" "$NEU/deploy.sh"
bash -n "$NEU/deploy.sh"

# 4. Deploy-Schluessel eintragen. Er ist fest auf deploy.sh gelegt und kann
#    auf diesem Server nichts anderes starten - auch keine Shell.
mkdir -p /root/.ssh
touch /root/.ssh/authorized_keys
chmod 700 /root/.ssh
chmod 600 /root/.ssh/authorized_keys
if grep -q 'github-actions-deploy@flipbase' /root/.ssh/authorized_keys; then
  echo "Deploy-Schluessel war schon eingetragen."
else
  echo "$SCHLUESSEL" >>/root/.ssh/authorized_keys
  echo "Deploy-Schluessel eingetragen."
fi

echo
echo "--- bereit:"
ls -l "$NEU/deploy.sh" "$NEU/docker-compose.yml"
echo
echo "Naechster Schritt: Push auf master. Die Pipeline baut das Abbild und"
echo "startet den Container flipbase-web neben dem alten. Erst danach wird"
echo "Caddy umgehaengt und der alte Container entfernt."
