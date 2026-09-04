#!/bin/bash
#
# Rollt eine neue Fassung der Anwendung aus.
#
# Aufgerufen wird das Skript ausschliesslich von GitHub Actions ueber SSH. Der
# Deploy-Schluessel ist in authorized_keys fest auf dieses Skript gelegt
# ("forced command") - mit ihm laesst sich sonst nichts auf dem Server tun,
# auch keine Shell oeffnen. Deshalb steht die Kennzeichnung des Abbilds nicht
# als Argument da, sondern in SSH_ORIGINAL_COMMAND.
#
# Das Anmeldetoken fuer die Registry kommt ueber die Standardeingabe. Es gilt
# nur solange der CI-Lauf laeuft und wird nach dem Laden wieder verworfen -
# auf dem Server bleibt dauerhaft kein Zugang zur Registry liegen.
#
# Aufruf von Hand (Rueckfall auf eine aeltere Fassung) siehe deploy/README.md.

set -euo pipefail

VERZEICHNIS="/opt/flipbase"
CONTAINER="flipbase-web"
REGISTRY="ghcr.io"

BEFEHL="${SSH_ORIGINAL_COMMAND:-latest}"

# Angewendete Migrationen auflisten.
#
# Eigener Verb statt eines freien Kommandos, damit der Deploy-Schluessel weiter
# nur genau das kann, was hier steht. Die Pipeline vergleicht die Liste mit den
# Dateien im Repository und verweigert das Ausliefern, wenn eine fehlt: Code,
# dessen Spalten in der Datenbank nicht existieren, soll gar nicht erst live
# gehen. Genau das ist am 21.08.2026 passiert - eine Migration lag wochenlang
# im Repository und war nie angewendet.
if [ "$BEFEHL" = "migrationen" ]; then
  docker exec supabase-db psql -U postgres -d postgres -tAq     -c "select version from supabase_migrations.schema_migrations order by version"
  exit 0
fi

TAG="$BEFEHL"

# Die Kennzeichnung landet in einem Docker-Befehl. Sie wird deshalb streng
# geprueft, statt sie durchzureichen: Der Schluessel darf zwar nur dieses
# Skript starten, aber ein ungeprueftes Argument waere ein Weg daran vorbei.
case "$TAG" in
  latest) ;;
  sha-[0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]) ;;
  *)
    echo "Ungueltige Kennzeichnung: $TAG" >&2
    exit 2
    ;;
esac

cd "$VERZEICHNIS"

echo "Rolle $TAG aus..."

docker login "$REGISTRY" --username flipbase-deploy --password-stdin >/dev/null
trap 'docker logout "$REGISTRY" >/dev/null 2>&1 || true' EXIT

IMAGE_TAG="$TAG" docker compose pull web
IMAGE_TAG="$TAG" docker compose up -d web

docker logout "$REGISTRY" >/dev/null
docker image prune -f >/dev/null

# Ein neu gestarteter Container ist noch kein arbeitender. Ohne diese Pruefung
# meldet die Pipeline einen kaputten Stand als erfolgreiches Deployment.
for _ in $(seq 1 30); do
  zustand="$(docker inspect -f '{{.State.Health.Status}}' "$CONTAINER" 2>/dev/null || echo fehlt)"
  if [ "$zustand" = "healthy" ]; then
    echo "$CONTAINER ist gesund."
    if [ -d /opt/flipbase-landing ]; then
      docker cp "$CONTAINER":/usr/share/nginx/landing/. /opt/flipbase-landing/ 2>/dev/null || true
      echo "Landingpage synchronisiert."
    fi
    exit 0
  fi
  sleep 2
done

echo "$CONTAINER wurde nicht gesund. Letzte Ausgaben:" >&2
docker logs --tail 50 "$CONTAINER" >&2
exit 1
