#!/usr/bin/env bash
set -euo pipefail

# Eigene Namen verhindern Kollisionen mit einer laufenden lokalen Entwicklung.
network="flipbase-release-test-$$"
database="flipbase-release-db-$$"
cleanup() {
  docker rm -fv "$database" >/dev/null 2>&1 || true
  docker network rm "$network" >/dev/null 2>&1 || true
}
trap cleanup EXIT
docker network create "$network"
docker run -d --name "$database" --network "$network" \
  -e POSTGRES_PASSWORD=test -e POSTGRES_DB=flipbase_release_test postgres:16-alpine
# Der vorläufige Initialisierungsserver nimmt nur Unix-Sockets an. Erst der
# reguläre PostgreSQL-Server nach abgeschlossener Initialisierung antwortet per TCP.
for _ in $(seq 1 30); do
  if docker exec "$database" pg_isready -h 127.0.0.1 -U postgres -d flipbase_release_test; then break; fi
  sleep 1
done
docker exec "$database" pg_isready -h 127.0.0.1 -U postgres -d flipbase_release_test
docker run --rm --network "$network" -v "$PWD:/work:ro" -w /work \
  -e PGHOST="$database" -e PGUSER=postgres -e PGPASSWORD=test \
  -e PGDATABASE=flipbase_release_test \
  node:22-alpine sh -ec 'apk add --no-cache bash postgresql-client util-linux >/dev/null; node --test scripts/release-migrations.test.mjs'
