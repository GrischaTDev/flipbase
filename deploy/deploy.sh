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
PUSH_RUNTIME_DIRECTORY="${FLIPBASE_PUSH_RUNTIME_DIRECTORY:-/opt/flipbase-push}"
PUSH_COMPOSE_FILE="$PUSH_RUNTIME_DIRECTORY/docker-compose.push.yml"
PUSH_FUNCTIONS_COMPOSE_FILE="$PUSH_RUNTIME_DIRECTORY/docker-compose.push-functions.yml"
PUSH_IMAGE_REPOSITORY="${FLIPBASE_PUSH_IMAGE_REPOSITORY:-ghcr.io/grischatdev/flipbase-push}"
SUPABASE_DIRECTORY="${FLIPBASE_SUPABASE_DIRECTORY:-/opt/supabase}"

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
PUSH_REFERENCE=""
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
  if [[ ${#parts[@]} -ne 2 && ${#parts[@]} -ne 4 && ${#parts[@]} -ne 6 ]] || [[ ! "${parts[1]:-}" =~ ^sha256:[a-f0-9]{64}$ ]]; then
    echo 'Ungueltige Release-Kennzeichnung.' >&2
    exit 2
  fi
  release_image="ghcr.io/grischatdev/flipbase@${parts[1]}"
  if [[ ! -x "$VERZEICHNIS/apply-release-migrations.sh" || ! -x "$VERZEICHNIS/migration-backup.sh" ]]; then
    echo 'Release-v1 erfordert den Serverbootstrap aus deploy/RELEASE-PIPELINE.md.' >&2
    exit 1
  fi
  for ((index = 2; index < ${#parts[@]}; index += 2)); do
    case "${parts[index]}" in
      sniper)
        [[ -z "$SNIPER_REFERENCE" && ( "${parts[index+1]}" =~ ^sha-[0-9a-f]{7}$ || "${parts[index+1]}" =~ ^sha256:[a-f0-9]{64}$ ) ]] || { echo 'Ungueltige Sniper-Kennzeichnung.' >&2; exit 2; }
        SNIPER_REFERENCE="${parts[index+1]}" ;;
      push)
        [[ -z "$PUSH_REFERENCE" && "${parts[index+1]}" =~ ^sha256:[a-f0-9]{64}$ ]] || { echo 'Ungueltige Push-Kennzeichnung.' >&2; exit 2; }
        PUSH_REFERENCE="${parts[index+1]}" ;;
      *) echo 'Unbekannter Releasedienst.' >&2; exit 2 ;;
    esac
  done
elif [[ ${#parts[@]} -eq 2 || ${#parts[@]} -eq 4 || ${#parts[@]} -eq 6 ]]; then
  for ((index = 0; index < ${#parts[@]}; index += 2)); do
    service="${parts[index]}"
    tag="${parts[index + 1]}"
    if [[ "$service" == "push" && ! "$tag" =~ ^sha256:[a-f0-9]{64}$ ]] || [[ ! "$tag" =~ ^sha-[0-9a-f]{7}$ && ( ( "$service" != "sniper" && "$service" != "push" ) || ! "$tag" =~ ^sha256:[a-f0-9]{64}$ ) ]]; then
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
      push)
        [[ -z "$PUSH_REFERENCE" ]] || { echo 'Push wurde doppelt angegeben.' >&2; exit 2; }
        PUSH_REFERENCE="$tag"
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

if [[ -n "$PUSH_REFERENCE" && -n "$WEB_TAG" ]]; then
  echo 'Push mit Anwendung erfordert Release-v1 und den Migrationsbootstrap.' >&2
  exit 2
fi
if [[ -z "$WEB_TAG" && -z "$release_image" && -z "$SNIPER_REFERENCE" && -z "$PUSH_REFERENCE" ]]; then
  echo 'Kein Dienst zum Ausrollen angegeben.' >&2
  exit 2
fi

if [[ -n "$release_image" ]]; then
  TAG="release-v1"
else
  TAG="${WEB_TAG:-${SNIPER_REFERENCE:-$PUSH_REFERENCE}}"
fi
push_image=""
if [[ -n "$PUSH_REFERENCE" ]]; then push_image="$PUSH_IMAGE_REPOSITORY@$PUSH_REFERENCE"; fi

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

prepare_push_runtime() {
  local artifact_container="$1"
  export PUSH_ENV_FILE="${PUSH_ENV_FILE:-$PUSH_RUNTIME_DIRECTORY/push.env}"
  [[ -f "$PUSH_ENV_FILE" && ! -L "$PUSH_ENV_FILE" && "$(stat -c '%u:%g:%a' "$PUSH_ENV_FILE")" = '0:0:600' ]] || {
    echo 'Push benoetigt eine vorbereitete root-Konfiguration mit Modus0600.' >&2; return 1;
  }
  [[ -f "$SUPABASE_DIRECTORY/docker-compose.yml" && -f "$SUPABASE_DIRECTORY/.env" ]] || {
    echo 'Supabase-Hauptcompose fehlt; Pushbootstrap erforderlich.' >&2; return 1;
  }
  docker cp "$artifact_container":/opt/flipbase/push-functions "$temporary/push-functions"
  (cd "$temporary/push-functions" && sha256sum --check --strict manifest.sha256 >/dev/null)
  FLIPBASE_PUSH_COMMIT="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["commit"])' "$temporary/push-functions/deployment.json")"
  [[ "$FLIPBASE_PUSH_COMMIT" =~ ^[a-f0-9]{40}$ && "$FLIPBASE_PUSH_COMMIT" != 0000000000000000000000000000000000000000 ]] || { echo 'Ungueltiger Pushreleasecommit.' >&2; return 1; }
  export FLIPBASE_PUSH_COMMIT FLIPBASE_PUSH_IMAGE="$push_image"
  docker pull "$push_image"
  local revision
  revision="$(docker inspect -f '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$push_image")"
  [[ "$revision" = "$FLIPBASE_PUSH_COMMIT" ]] || { echo 'Pushimage und Functionpaket haben verschiedene Commits.' >&2; return 1; }
  export PUSH_FUNCTIONS_DIRECTORY="$PUSH_RUNTIME_DIRECTORY/releases/$FLIPBASE_PUSH_COMMIT"
  install -d -m 700 "$PUSH_RUNTIME_DIRECTORY/releases"
  if [[ ! -d "$PUSH_FUNCTIONS_DIRECTORY" ]]; then
    install -d -m 755 "$PUSH_FUNCTIONS_DIRECTORY"
    cp -a "$temporary/push-functions/." "$PUSH_FUNCTIONS_DIRECTORY/"
  fi
  (cd "$PUSH_FUNCTIONS_DIRECTORY" && sha256sum --check --strict manifest.sha256 >/dev/null)
  docker cp "$artifact_container":/opt/flipbase/docker-compose.push.yml "$temporary/docker-compose.push.yml"
  docker cp "$artifact_container":/opt/flipbase/docker-compose.push-functions.yml "$temporary/docker-compose.push-functions.yml"
  install -m 644 "$temporary/docker-compose.push.yml" "$PUSH_COMPOSE_FILE"
  install -m 644 "$temporary/docker-compose.push-functions.yml" "$PUSH_FUNCTIONS_COMPOSE_FILE"
  # Jede Releaseaktivierung startet geschlossen; Pilot-/Globalfreigabe bleibt ein eigener Betriebsschritt.
  export WEB_PUSH_ENABLED=false WEB_PUSH_ALLOW_ALL=false
  FLIPBASE_PUSH_IMAGE="$push_image" docker compose -f "$PUSH_COMPOSE_FILE" config --quiet
  local configured
  configured="$(FLIPBASE_PUSH_IMAGE="$push_image" docker compose -f "$PUSH_COMPOSE_FILE" config --images push-worker)"
  [[ "$configured" = "$push_image" ]] || { echo 'Compose verwendet nicht den Pushdigest.' >&2; return 1; }
}

activate_push_runtime() {
  prepare_push_runtime "$1"
  # Eigenes Functionpaket: vorhandene main-/hello-Verzeichnisse und JWT-Regeln werden nicht ersetzt.
  (cd "$SUPABASE_DIRECTORY" && docker compose --env-file .env --env-file "$PUSH_ENV_FILE" -f docker-compose.yml -f "$PUSH_FUNCTIONS_COMPOSE_FILE" config --quiet)
  (cd "$SUPABASE_DIRECTORY" && docker compose --env-file .env --env-file "$PUSH_ENV_FILE" -f docker-compose.yml -f "$PUSH_FUNCTIONS_COMPOSE_FILE" up -d --no-deps --pull never push-functions push-gateway)
  FLIPBASE_PUSH_IMAGE="$push_image" docker compose -f "$PUSH_COMPOSE_FILE" up -d --pull never push-worker
  # Wartet auf Router und echte Functioninitialisierung; keine Testgeneration erzeugen.
  for _ in $(seq 1 30); do
    if docker exec flipbase-push-gateway node -e "Promise.all([fetch('http://push-functions:9000/push-settings',{method:'POST',body:'{}'}),fetch('http://push-functions:9000/push-revoke',{method:'POST',body:'{}'})]).then(([a,b])=>{if(a.status!==401||b.status!==200)process.exit(1)}).catch(()=>process.exit(1))"; then break; fi
    sleep 2
  done
  docker exec flipbase-push-gateway node -e "Promise.all([fetch('http://push-functions:9000/push-settings',{method:'POST',body:'{}'}),fetch('http://push-functions:9000/push-revoke',{method:'POST',body:'{}'})]).then(([a,b])=>{if(a.status!==401||b.status!==200)process.exit(1)}).catch(()=>process.exit(1))"
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
  if [[ -n "$PUSH_REFERENCE" ]]; then activate_push_runtime "$release_container"; fi
  if [[ -n "$SNIPER_REFERENCE" ]]; then prepare_sniper_browser_runtime "$release_container"; fi
  # Auch der Start verwendet den Digest. Eine inzwischen verschobene Markierung
  # kann dadurch kein anderes als das geprüfte Abbild starten.
  FLIPBASE_IMAGE="$release_image" docker compose up -d --pull never web
elif [[ -n "$WEB_TAG" ]]; then
  IMAGE_TAG="$WEB_TAG" docker compose pull web
  IMAGE_TAG="$WEB_TAG" docker compose up -d web
fi

if [[ -n "$PUSH_REFERENCE" && -z "$release_image" ]]; then activate_push_runtime flipbase-web; fi

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
  if [[ -n "$PUSH_REFERENCE" || -d "$LANDING_DIRECTORY" ]]; then
    activate_release_caddy_configuration
  fi
  if [ -d "$LANDING_DIRECTORY" ]; then
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

if [[ -n "$PUSH_REFERENCE" ]]; then
  if [[ -z "$release_image" ]]; then activate_release_caddy_configuration; fi
  wait_for_healthy flipbase-push-worker
  wait_for_healthy flipbase-push-gateway
  for container in flipbase-push-worker flipbase-push-gateway; do
    expected_id="$(docker inspect -f '{{.Id}}' "$push_image")"
    running_id="$(docker inspect -f '{{.Image}}' "$container")"
    [[ "$running_id" = "$expected_id" ]] || { echo 'Laufende Pushinstanz verwendet falsches Abbild.' >&2; exit 1; }
    docker exec "$container" node -e "fetch('http://127.0.0.1:4177/healthz').then(async r=>{const h=await r.json();if(!r.ok||h.commit!==process.env.FLIPBASE_COMMIT)process.exit(1)}).catch(()=>process.exit(1))"
  done
  # Nur Referenzen; Ruecknahme verwendet bekannte kompatible Digests und laesst SQL/Bindings erhalten.
  current_app_image="$release_image"
  if [[ -z "$current_app_image" ]]; then current_app_image="$(docker inspect -f '{{.Config.Image}}' flipbase-web)"; fi
  printf '%s\n%s\n%s\n' "$current_app_image" "$push_image" "$FLIPBASE_PUSH_COMMIT" > "$PUSH_RUNTIME_DIRECTORY/current-release"
fi
