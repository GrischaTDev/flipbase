#!/bin/bash
#
# Setzt das Passwort eines Authelia-Benutzers.
#
# Aufruf:  bash /opt/authelia/passwort-setzen.sh <benutzername>
#
# Die Eingabe ist verdeckt und landet weder in der Kommando-Historie noch in
# einer Datei. Gespeichert wird ausschliesslich der Argon2-Hash.
#
set -euo pipefail

BENUTZER="${1:-}"
DATEI="/opt/authelia/config/users.yml"

if [ -z "$BENUTZER" ]; then
  echo "Aufruf: bash $0 <benutzername>"
  echo "Vorhandene Benutzer:"
  grep -oE '^  [a-z0-9_.-]+:' "$DATEI" | tr -d ' :' | sed 's/^/  - /'
  exit 1
fi

if ! grep -qE "^  ${BENUTZER}:" "$DATEI"; then
  echo "Benutzer '$BENUTZER' steht nicht in $DATEI."
  exit 1
fi

read -r -s -p "Neues Passwort fuer $BENUTZER: " PW1; echo
read -r -s -p "Zur Bestaetigung wiederholen:  " PW2; echo

if [ "$PW1" != "$PW2" ]; then
  echo "Die Eingaben stimmen nicht ueberein. Nichts geaendert."
  exit 1
fi

if [ ${#PW1} -lt 12 ]; then
  echo "Bitte mindestens 12 Zeichen. Nichts geaendert."
  exit 1
fi

echo "Hash wird berechnet ..."
HASH=$(docker run --rm authelia/authelia:latest \
  authelia crypto hash generate argon2 --password "$PW1" 2>/dev/null \
  | sed -n 's/^Digest: //p')
unset PW1 PW2

if [ -z "$HASH" ]; then
  echo "Der Hash konnte nicht erzeugt werden. Nichts geaendert."
  exit 1
fi

# Sicherungskopie, falls beim Ersetzen etwas schiefgeht.
cp -p "$DATEI" "${DATEI}.bak"

# Nur die Passwortzeile im Block des gewaehlten Benutzers ersetzen.
python3 - "$DATEI" "$BENUTZER" "$HASH" <<'PY'
import re, sys
datei, benutzer, hashwert = sys.argv[1], sys.argv[2], sys.argv[3]
with open(datei, encoding='utf-8') as f:
    zeilen = f.read().split('\n')
im_block = False
gesetzt = False
for i, z in enumerate(zeilen):
    if re.match(rf'^  {re.escape(benutzer)}:\s*$', z):
        im_block = True
        continue
    if im_block:
        if re.match(r'^  \S', z):      # naechster Benutzer beginnt
            break
        if re.match(r'^    password:', z):
            zeilen[i] = f"    password: '{hashwert}'"
            gesetzt = True
            break
if not gesetzt:
    raise SystemExit('Passwortzeile nicht gefunden - nichts geaendert.')
with open(datei, 'w', encoding='utf-8') as f:
    f.write('\n'.join(zeilen))
PY

chmod 600 "$DATEI"
echo "Passwort fuer '$BENUTZER' gesetzt. Authelia liest die Datei selbsttaetig neu ein."
