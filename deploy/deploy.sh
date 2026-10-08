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
REGISTRY="ghcr.io"
LANDING_DIRECTORY="${FLIPBASE_LANDING_DIR:-/opt/flipbase-landing}"
CADDY_CONFIG_PATH="${FLIPBASE_CADDY_CONFIG_PATH:-/opt/supabase/volumes/proxy/caddy/Caddyfile}"
CADDY_CONTAINER="${FLIPBASE_CADDY_CONTAINER:-supabase-caddy}"
SNIPER_COMPOSE_FILE="${FLIPBASE_SNIPER_COMPOSE_FILE:-/opt/flipbase-sniper/docker-compose.sniper.yml}"
SNIPER_IMAGE_REPOSITORY="${FLIPBASE_SNIPER_IMAGE_REPOSITORY:-ghcr.io/grischatdev/flipbase-sniper}"

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

WEB_TAG=""
SNIPER_REFERENCE=""
release_image=""

# Die Kennzeichnung landet in einem Docker-Befehl. Sie wird deshalb streng
# geprueft, statt sie durchzureichen: Der Schluessel darf zwar nur dieses
# Skript starten, aber ein ungeprueftes Argument waere ein Weg daran vorbei.
# Die Pipeline kann damit Anwendung und Sniper gemeinsam oder einzeln ausrollen.
parts=()
read -r -a parts <<< "$BEFEHL"
if [[ ${#parts[@]} -eq 1 ]]; then
  if [[ "${parts[0]:-}" == "latest" || "${parts[0]:-}" =~ ^sha-[0-9a-f]{7}$ ]]; then
    WEB_TAG="${parts[0]}"
  else
    echo 'Ungueltige Kennzeichnung; fuer Release-v1 zuerst Serverbootstrap pruefen.' >&2
    exit 2
  fi
elif [[ "${parts[0]:-}" == "release-v1" ]]; then
  if [[ ${#parts[@]} -ne 2 && ${#parts[@]} -ne 4 ]] || [[ ! "${parts[1]:-}" =~ ^sha256:[a-f0-9]{64}$ ]]; then
    echo 'Ungueltige Release-Kennzeichnung.' >&2
    exit 2
  fi
  release_image="ghcr.io/grischatdev/flipbase@${parts[1]}"
  if [[ ! -x "$VERZEICHNIS/apply-release-migrations.sh" || ! -x "$VERZEICHNIS/migration-backup.sh" ]]; then
    echo 'Release-v1 erfordert den Serverbootstrap aus deploy/RELEASE-PIPELINE.md.' >&2
    exit 1
  fi
  if [[ ${#parts[@]} -eq 4 ]]; then
    if [[ "${parts[2]}" != "sniper" || ( ! "${parts[3]:-}" =~ ^sha-[0-9a-f]{7}$ && ! "${parts[3]:-}" =~ ^sha256:[a-f0-9]{64}$ ) ]]; then
      echo 'Ungueltige Sniper-Kennzeichnung.' >&2
      exit 2
    fi
    SNIPER_REFERENCE="${parts[3]}"
  fi
elif [[ ${#parts[@]} -eq 2 || ${#parts[@]} -eq 4 ]]; then
  for ((index = 0; index < ${#parts[@]}; index += 2)); do
    service="${parts[index]}"
    tag="${parts[index + 1]}"
    if [[ ! "$tag" =~ ^sha-[0-9a-f]{7}$ && ( "$service" != "sniper" || ! "$tag" =~ ^sha256:[a-f0-9]{64}$ ) ]]; then
      echo 'Ungueltige Image-Kennzeichnung.' >&2
      exit 2
    fi
    case "$service" in
      web)
        [[ -z "$WEB_TAG" ]] || { echo 'Web wurde doppelt angegeben.' >&2; exit 2; }
        WEB_TAG="$tag"
        ;;
      sniper)
        [[ -z "$SNIPER_REFERENCE" ]] || { echo 'Sniper wurde doppelt angegeben.' >&2; exit 2; }
        SNIPER_REFERENCE="$tag"
        ;;
      *)
        echo 'Unbekannter Dienst.' >&2
        exit 2
        ;;
    esac
  done
else
  echo 'Ungueltige Deployment-Kennzeichnung.' >&2
  exit 2
fi

if [[ -z "$WEB_TAG" && -z "$release_image" && -z "$SNIPER_REFERENCE" ]]; then
  echo 'Kein Dienst zum Ausrollen angegeben.' >&2
  exit 2
fi

if [[ -n "$release_image" ]]; then
  TAG="release-v1"
else
  TAG="${WEB_TAG:-$SNIPER_REFERENCE}"
fi

sniper_image=""
if [[ -n "$SNIPER_REFERENCE" ]]; then
  if [[ "$SNIPER_REFERENCE" =~ ^sha256:[a-f0-9]{64}$ ]]; then
    sniper_image="$SNIPER_IMAGE_REPOSITORY@$SNIPER_REFERENCE"
  else
    # Alte Kennzeichnungen bleiben ausschließlich für bewusste manuelle Rückfälle.
    sniper_image="$SNIPER_IMAGE_REPOSITORY:$SNIPER_REFERENCE"
  fi
fi

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

prepare_sniper_browser_runtime() {
  local artifact_container="$1"
  local runtime_directory
  runtime_directory="$(dirname "$SNIPER_COMPOSE_FILE")"
  local environment_file="${SNIPER_ENV_FILE:-$runtime_directory/sniper.env}"
  export SNIPER_ENV_FILE="$environment_file"
  export SNIPER_BROWSER_PROFILE_PATH="${SNIPER_BROWSER_PROFILE_PATH:-$runtime_directory/browser}"
  export SNIPER_SECCOMP_FILE="${SNIPER_SECCOMP_FILE:-$runtime_directory/chromium-seccomp.json}"
  # Keine Schlüssel kopieren oder protokollieren. Der öffentliche Auth-Key muss
  # bei der einmaligen, freigegebenen Servervorbereitung bereitgestellt sein.
  if ! grep -Eq "^SUPABASE_ANON_KEY=['\"]?[A-Za-z0-9._-]{20,}['\"]?$" "$environment_file"; then
    echo 'SUPABASE_ANON_KEY fehlt in der Botkonfiguration; Servervorbereitung erforderlich.' >&2
    return 1
  fi
  if [ -e "$SNIPER_BROWSER_PROFILE_PATH" ]; then
    [ -d "$SNIPER_BROWSER_PROFILE_PATH" ] && [ ! -L "$SNIPER_BROWSER_PROFILE_PATH" ] \
      && [ "$(stat -c '%u:%g:%a' "$SNIPER_BROWSER_PROFILE_PATH")" = '1000:1000:700' ] || {
      echo 'Das eigene Botprofil muss UID/GID 1000 und Modus 0700 besitzen.' >&2; return 1;
    }
  else
    # Numerische Container-IDs brauchen keinen passenden Benutzer auf dem Host.
    install -d -m 700 "$SNIPER_BROWSER_PROFILE_PATH"
    chown 1000:1000 "$SNIPER_BROWSER_PROFILE_PATH"
  fi
  docker cp "$artifact_container":/opt/flipbase/docker-compose.sniper.yml "$temporary/docker-compose.sniper.yml"
  docker cp "$artifact_container":/opt/flipbase/chromium-seccomp.json "$temporary/chromium-seccomp.json"
  install -m 644 "$temporary/chromium-seccomp.json" "$SNIPER_SECCOMP_FILE"
  install -m 644 "$temporary/docker-compose.sniper.yml" "$SNIPER_COMPOSE_FILE"
  FLIPBASE_SNIPER_IMAGE="$sniper_image" docker compose -f "$SNIPER_COMPOSE_FILE" config --quiet
}

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
  if [[ -n "$SNIPER_REFERENCE" ]]; then prepare_sniper_browser_runtime "$release_container"; fi
  # Auch der Start verwendet den Digest. Eine inzwischen verschobene Markierung
  # kann dadurch kein anderes als das geprüfte Abbild starten.
  FLIPBASE_IMAGE="$release_image" docker compose up -d --pull never web
elif [[ -n "$WEB_TAG" ]]; then
  IMAGE_TAG="$WEB_TAG" docker compose pull web
  IMAGE_TAG="$WEB_TAG" docker compose up -d web
fi

if [[ -n "$SNIPER_REFERENCE" ]]; then
  if [[ -z "$release_image" ]]; then prepare_sniper_browser_runtime flipbase-web; fi
  if [[ "$SNIPER_REFERENCE" =~ ^sha256:[a-f0-9]{64}$ ]]; then
    configured_sniper_image="$(FLIPBASE_SNIPER_IMAGE="$sniper_image" docker compose -f "$SNIPER_COMPOSE_FILE" config --images sniper)"
    [[ "$configured_sniper_image" = "$sniper_image" ]] || {
      echo 'Compose verwendet nicht den Sniper-Digest; Serverbootstrap erforderlich.' >&2; exit 1;
    }
  fi
  FLIPBASE_SNIPER_IMAGE="$sniper_image" docker compose -f "$SNIPER_COMPOSE_FILE" pull sniper
  FLIPBASE_SNIPER_IMAGE="$sniper_image" docker compose -f "$SNIPER_COMPOSE_FILE" up -d --pull never sniper
fi

docker logout "$REGISTRY" >/dev/null
docker image prune -f >/dev/null

# Ein neu gestarteter Container ist noch kein arbeitender. Ohne diese Pruefung
# meldet die Pipeline einen kaputten Stand als erfolgreiches Deployment.
wait_for_healthy() {
  local container="$1"
  for _ in $(seq 1 30); do
    zustand="$(docker inspect -f '{{.State.Health.Status}}' "$container" 2>/dev/null || echo fehlt)"
    if [ "$zustand" = "healthy" ]; then
      echo "$container ist gesund."
      return 0
    fi
    sleep 2
  done

  echo "$container wurde nicht gesund. Letzte Ausgaben:" >&2
  docker logs --tail 50 "$container" >&2
  return 1
}

restore_caddy_configuration() {
  local previous="$temporary/Caddyfile.previous"
  local restore_path="${CADDY_CONFIG_PATH}.restore"
  [ -f "$previous" ] || return 0

  install -m 644 "$previous" "$restore_path"
  mv -f "$restore_path" "$CADDY_CONFIG_PATH"
  docker exec "$CADDY_CONTAINER" caddy reload \
    --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null 2>&1 || true
}

activate_release_caddy_configuration() {
  local candidate="$temporary/Caddyfile"
  local previous="$temporary/Caddyfile.previous"
  local next_path="${CADDY_CONFIG_PATH}.next"

  [ -f "$CADDY_CONFIG_PATH" ] || {
    echo "Caddy-Konfiguration fehlt: $CADDY_CONFIG_PATH" >&2
    return 1
  }

  docker cp flipbase-web:/opt/flipbase/Caddyfile "$candidate"
  if cmp -s "$candidate" "$CADDY_CONFIG_PATH"; then
    echo "Caddy-Konfiguration ist bereits aktuell."
    return 0
  fi

  cp -p "$CADDY_CONFIG_PATH" "$previous"
  install -m 644 "$candidate" "$next_path"
  mv -f "$next_path" "$CADDY_CONFIG_PATH"

  if ! docker exec "$CADDY_CONTAINER" caddy validate \
    --config /etc/caddy/Caddyfile --adapter caddyfile; then
    echo 'Neue Caddy-Konfiguration ist ungueltig; stelle den vorherigen Stand wieder her.' >&2
    restore_caddy_configuration
    return 1
  fi

  if ! docker exec "$CADDY_CONTAINER" caddy reload \
    --config /etc/caddy/Caddyfile --adapter caddyfile; then
    echo 'Caddy konnte die neue Konfiguration nicht laden; stelle den vorherigen Stand wieder her.' >&2
    restore_caddy_configuration
    return 1
  fi

  echo "Caddy-Konfiguration aktiviert."
}

if [[ -n "$WEB_TAG" || -n "$release_image" ]]; then
  wait_for_healthy flipbase-web
  if [ -d "$LANDING_DIRECTORY" ]; then
    activate_release_caddy_configuration
    if ! docker cp flipbase-web:/usr/share/nginx/landing/. "$LANDING_DIRECTORY"/; then
      echo 'Landingpage konnte nicht synchronisiert werden; stelle die vorherige Caddy-Konfiguration wieder her.' >&2
      restore_caddy_configuration
      exit 1
    fi
    echo "Landingpage synchronisiert."
  fi
fi

if [[ -n "$SNIPER_REFERENCE" ]]; then
  wait_for_healthy flipbase-sniper
fi
