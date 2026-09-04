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

VERZEICHNIS="${FLIPBASE_DEPLOY_DIR:-/opt/flipbase}"
CONTAINER="flipbase-web"
REGISTRY="ghcr.io"
LANDING_DIRECTORY="${FLIPBASE_LANDING_DIR:-/opt/flipbase-landing}"

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
release_image=""
if [[ "$BEFEHL" =~ ^release-v1\ (sha256:[a-f0-9]{64})$ ]]; then
  release_image="ghcr.io/grischatdev/flipbase@${BASH_REMATCH[1]}"
  TAG=release-v1
  if [[ ! -x "$VERZEICHNIS/apply-release-migrations.sh" || ! -x "$VERZEICHNIS/migration-backup.sh" ]]; then
    echo 'Release-v1 erfordert den Serverbootstrap aus deploy/RELEASE-PIPELINE.md.' >&2
    exit 1
  fi
fi

# Die Kennzeichnung landet in einem Docker-Befehl. Sie wird deshalb streng
# geprueft, statt sie durchzureichen: Der Schluessel darf zwar nur dieses
# Skript starten, aber ein ungeprueftes Argument waere ein Weg daran vorbei.
case "$TAG" in
  release-v1) [[ -n "$release_image" ]] || exit 2 ;;
  latest) ;;
  sha-[0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]) ;;
  *)
    echo 'Ungueltige Kennzeichnung; fuer Release-v1 zuerst Serverbootstrap pruefen.' >&2
    exit 2
    ;;
esac

cd "$VERZEICHNIS"
exec 9>"$VERZEICHNIS/deploy.lock"
flock -w 60 9 || { echo 'Anderes Deployment aktiv.' >&2; exit 1; }

# Kurzlebige Registry-Anmeldung in einem privaten Verzeichnis, auch bei Fehlern.
umask 077
temporary="$(mktemp -d "$VERZEICHNIS/.release-XXXXXXXX")"
export DOCKER_CONFIG="$temporary/registry"
mkdir "$DOCKER_CONFIG"
release_container=""
cleanup() {
  if [[ -n "$release_container" ]]; then docker rm "$release_container" >/dev/null 2>&1 || true; fi
  docker logout "$REGISTRY" >/dev/null 2>&1 || true
  rm -rf -- "$temporary"
}
trap cleanup EXIT

echo "Rolle $TAG aus..."

docker login "$REGISTRY" --username flipbase-deploy --password-stdin >/dev/null
if [[ -n "$release_image" ]]; then
  configured_image="$(FLIPBASE_IMAGE="$release_image" docker compose config --images web)"
  [[ "$configured_image" = "$release_image" ]] || {
    echo 'Compose verwendet nicht den Release-Digest; Serverbootstrap erforderlich.' >&2; exit 1;
  }
  docker pull "$release_image"
  release_container="$(docker create "$release_image")"
  mkdir "$temporary/migrations"
  docker cp "$release_container":/opt/flipbase/migrations/. "$temporary/migrations/"
  "$VERZEICHNIS/apply-release-migrations.sh" "$temporary/migrations"
  # Auch der Start verwendet den Digest. Eine inzwischen verschobene Markierung
  # kann dadurch kein anderes als das geprüfte Abbild starten.
  FLIPBASE_IMAGE="$release_image" docker compose up -d --pull never web
else
  IMAGE_TAG="$TAG" docker compose pull web
  IMAGE_TAG="$TAG" docker compose up -d web
fi

docker logout "$REGISTRY" >/dev/null
docker image prune -f >/dev/null

# Ein neu gestarteter Container ist noch kein arbeitender. Ohne diese Pruefung
# meldet die Pipeline einen kaputten Stand als erfolgreiches Deployment.
for _ in $(seq 1 30); do
  zustand="$(docker inspect -f '{{.State.Health.Status}}' "$CONTAINER" 2>/dev/null || echo fehlt)"
  if [ "$zustand" = "healthy" ]; then
    echo "$CONTAINER ist gesund."
    if [ -d "$LANDING_DIRECTORY" ]; then
      docker cp "$CONTAINER":/usr/share/nginx/landing/. "$LANDING_DIRECTORY"/
      echo "Landingpage synchronisiert."
    fi
    exit 0
  fi
  sleep 2
done

echo "$CONTAINER wurde nicht gesund. Letzte Ausgaben:" >&2
docker logs --tail 50 "$CONTAINER" >&2
exit 1
