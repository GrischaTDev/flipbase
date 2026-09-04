#!/bin/bash
# Nur intern: deploy.sh liefert das Verzeichnis aus dem festgelegten Image-Digest.
# Die Freigabe attestiert transaktionales SQL ohne COMMIT/ROLLBACK, psql-Befehle
# oder externe Seiteneffekte. Keine automatische SQL-Klassifizierung versuchen.
set -euo pipefail
umask 077
export LC_ALL=C
directory="${1:?Migrationsverzeichnis fehlt}"
deploy_directory="${FLIPBASE_DEPLOY_DIR:-/opt/flipbase}"
exec 8>"$deploy_directory/migrations.lock"
flock -w 60 8 || { echo 'Andere Migration aktiv.' >&2; exit 1; }
psql_command=(docker exec -i supabase-db psql -X -U postgres -d "${PGDATABASE:-postgres}" -qAt -v ON_ERROR_STOP=1)
"${psql_command[@]}" -c 'select version, name from supabase_migrations.schema_migrations limit 0' >/dev/null || {
  echo 'Migrationshistorie mit version/name fehlt; Serverbootstrap pruefen.' >&2; exit 1;
}
applied="$("${psql_command[@]}" -c 'select version from supabase_migrations.schema_migrations order by version')"
manifest="$directory/approved.sha256"
[[ -f "$manifest" && ! -L "$manifest" ]] || { echo 'Freigabeliste fehlt; Bootstrap pruefen.' >&2; exit 1; }
declare -A approved=() versions=()
while read -r checksum filename extra || [[ -n "$checksum$filename$extra" ]]; do
  [[ -z "$checksum$filename$extra" ]] && continue
  if [[ ! "$checksum" =~ ^[a-f0-9]{64}$ || ! "$filename" =~ ^[0-9]{14}_[a-z0-9_]+\.sql$ || -n "$extra" || -v "approved[$filename]" ]]; then
    echo 'Ungueltige oder doppelte Migrationsfreigabe.' >&2; exit 1
  fi
  approved[$filename]="$checksum"
done < "$manifest"
pending=()
expected=()
shopt -s nullglob
for file in "$directory"/*.sql; do
  filename="${file##*/}"
  [[ "$filename" =~ ^([0-9]{14})_([a-z0-9_]+)\.sql$ && -f "$file" && ! -L "$file" ]] || { echo 'Ungueltige Migrationsdatei.' >&2; exit 1; }
  version="${BASH_REMATCH[1]}"
  [[ ! -v "versions[$version]" ]] || { echo 'Doppelte Migrationsversion.' >&2; exit 1; }
  versions[$version]=1
  expected+=("$version")
  if grep -qxF "$version" <<< "$applied"; then continue; fi
  checksum="$(sha256sum "$file")"
  if [[ "${checksum%% *}" != "${approved[$filename]:-unapproved}" ]]; then
    echo "Nicht freigegebene Migration: $filename. Review oder dokumentierter manueller Weg erforderlich." >&2; exit 1
  fi
  pending+=("$file")
done
if (( ${#pending[@]} > 0 )); then
  [[ -x "$deploy_directory/migration-backup.sh" ]] || { echo 'Strikte Sicherung fehlt; Serverbootstrap erforderlich.' >&2; exit 1; }
  "$deploy_directory/migration-backup.sh"
  for file in "${pending[@]}"; do
    filename="${file##*/}"
    version="${filename%%_*}"
    name="${filename#*_}"
    name="${name%.sql}"
    # Ein psql-Prozess und eine Transaktion für Schema UND Historie. -X sperrt
    # benutzerspezifische psqlrc-Dateien. Ein Fehler rollt beides zurück.
    {
      printf 'begin;\n'
      cat "$file"
      printf "\ninsert into supabase_migrations.schema_migrations(version, name) values ('%s', '%s');\ncommit;\n" "$version" "$name"
    } | "${psql_command[@]}"
    echo "Migration $version angewendet."
  done
fi
applied="$("${psql_command[@]}" -c 'select version from supabase_migrations.schema_migrations order by version')"
for version in "${expected[@]}"; do
  grep -qxF "$version" <<< "$applied" || { echo "Migration $version fehlt nach Anwendung." >&2; exit 1; }
done
echo 'Alle Release-Migrationen angewendet.'
