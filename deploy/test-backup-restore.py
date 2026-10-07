#!/usr/bin/env python3
"""Prüft einen extrahierten Stand in PostgreSQL ohne Netzwerk oder Produktionsmounts."""

import argparse
import importlib.util
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import time
import uuid


spec = importlib.util.spec_from_file_location("backup_server", Path(__file__).with_name("backup-server.py"))
server = importlib.util.module_from_spec(spec)
spec.loader.exec_module(server)


def run(arguments, **options):
    return subprocess.run(arguments, check=True, capture_output=True, text=True, **options)


def test_restore(source):
    manifest = server.validate_snapshot(source, require_fresh=False)
    image = manifest["database_image"]
    if not re.fullmatch(r"sha256:[a-f0-9]{64}", image):
        raise ValueError("Unbekanntes PostgreSQL-Abbild.")
    run(["docker", "image", "inspect", image])
    work = Path("/var/lib/flipbase-backup-tests")
    work.mkdir(mode=0o700, parents=True, exist_ok=True)
    if work.is_symlink() or shutil.disk_usage(work).free < 4 * 1024**3:
        raise ValueError("Unsicherer oder zu kleiner Restore-Arbeitsbereich.")
    with tempfile.TemporaryDirectory(prefix="restore-", dir=work) as temporary:
        directory = Path(temporary) / "snapshot"
        shutil.copytree(source, directory)
        # Nur die private Testkopie verändern, niemals den aktiven Lesestand.
        for filename, metadata in manifest["files"].items():
            path = directory / filename
            os.chown(path, metadata["uid"], metadata["gid"])
            path.chmod(metadata["mode"])
        custom = directory / "configuration/postgres-custom"
        for path in [custom, *(entry for entry in custom.rglob("*") if entry.is_dir())]:
            os.chown(path, 100, 101)
            path.chmod(0o700)
        data = Path(temporary) / "postgres"
        data.mkdir()
        os.chown(data, 100, 101)
        name = "flipbase-borg-restore-" + uuid.uuid4().hex[:8]
        command = (
            'initdb -D /data -U supabase_admin --auth=trust >/dev/null && '
            'exec postgres -D /data -c listen_addresses="" '
            '-c unix_socket_directories=/tmp '
            '-c shared_preload_libraries=pg_stat_statements,pgaudit,pg_cron,pg_net,pgsodium,supabase_vault'
        )
        created = False
        try:
            run([
                "docker", "run", "-d", "--name", name, "--network", "none",
                "--label", "flipbase.backup-restore-test=true", "--user", "100:101",
                "--cap-drop", "ALL", "--security-opt", "no-new-privileges=true",
                "--memory", "2g", "--pids-limit", "256",
                "--entrypoint", "/bin/sh", "-v", f"{data}:/data",
                "-v", f"{directory / 'configuration/postgres-custom'}:/etc/postgresql-custom:ro",
                image, "-c", command,
            ])
            created = True
            for attempt in range(60):
                ready = subprocess.run([
                    "docker", "exec", name, "pg_isready", "-h", "/tmp",
                    "-U", "supabase_admin", "-d", "postgres",
                ], capture_output=True)
                if ready.returncode == 0:
                    break
                time.sleep(1)
            else:
                raise ValueError("Isolierte PostgreSQL-Instanz nicht bereit.")
            # PG17 benötigt denselben Bootstrap-Grantor (OID 10). Nur dessen
            # bereits von initdb erzeugtes CREATE ROLE auslassen, alle Rechte wiederherstellen.
            prepared = Path(temporary) / "database.sql"
            skipped = 0
            with (directory / "database.sql").open("rb") as original, prepared.open("wb") as output:
                for line in original:
                    if line == b"CREATE ROLE supabase_admin;\n":
                        skipped += 1
                    else:
                        output.write(line)
            if skipped != 1:
                raise ValueError("Unbekannter Bootstrap-Rollenaufbau; kein Restore.")
            with prepared.open("rb") as stream:
                with (work / "last-restore.log").open("wb") as log:
                    result = subprocess.run([
                        "docker", "exec", "-i", name, "psql", "-h", "/tmp",
                        "-U", "supabase_admin", "-d", "postgres", "-X", "-v", "ON_ERROR_STOP=1",
                    ], stdin=stream, stdout=log, stderr=log, timeout=2700)
            if result.returncode:
                raise ValueError("Datenbank-Restore fehlgeschlagen; rootgeschütztes Testprotokoll prüfen.")
            restored_fingerprint = run([
                "docker", "exec", name, "psql", "-h", "/tmp", "-U", "supabase_admin",
                "-d", "postgres", "-At", "-v", "ON_ERROR_STOP=1", "-c",
                server.snapshot.STORAGE_FINGERPRINT_SQL,
            ]).stdout.strip()
            if restored_fingerprint != manifest["storage_fingerprint"]:
                raise ValueError("Wiederhergestellte Storage-Zuordnung weicht vom Dateistand ab.")
            objects = json.loads(run([
                "docker", "exec", name, "psql", "-h", "/tmp", "-U", "supabase_admin",
                "-d", "postgres", "-At", "-v", "ON_ERROR_STOP=1", "-c",
                "select coalesce(json_agg(json_build_object('bucket',bucket_id,'name',name,"
                "'version',version)), '[]'::json) from storage.objects;",
            ]).stdout)
            storage = directory / "storage"
            for entry in objects:
                path = storage / "stub/stub" / entry["bucket"] / entry["name"] / str(entry["version"])
                if not path.resolve().is_relative_to(storage.resolve()) or not path.is_file():
                    raise ValueError("Referenziertes Storage-Objekt fehlt in den wiederhergestellten Dateien.")
            summary = run([
                "docker", "exec", name, "psql", "-h", "/tmp", "-U", "supabase_admin",
                "-d", "postgres", "-At", "-v", "ON_ERROR_STOP=1", "-c",
                "select json_build_object('public_tables', (select count(*) from information_schema.tables "
                "where table_schema='public' and table_type='BASE TABLE'), 'auth_users', "
                "(select count(*) from auth.users), 'storage_objects', (select count(*) from storage.objects));",
            ]).stdout.strip()
            print(json.dumps({"archive": manifest["archive"], "restored": True,
                              "storage_matches": True, "referenced_files_found": len(objects),
                              "database_counts": json.loads(summary)}))
        finally:
            if created:
                logs = subprocess.run(["docker", "logs", name], capture_output=True)
                (work / "last-postgres.log").write_bytes(logs.stdout + logs.stderr)
                label = run(["docker", "inspect", "--format",
                             '{{index .Config.Labels "flipbase.backup-restore-test"}}', name]).stdout.strip()
                if label != "true":
                    raise ValueError("Unbekannter Container; keine Testbereinigung.")
                run(["docker", "stop", "-t", "10", name])
                run(["docker", "rm", name])


if __name__ == "__main__":
    os.umask(0o077)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path)
    arguments = parser.parse_args()
    try:
        test_restore(arguments.directory.resolve(strict=True))
    except (OSError, ValueError, KeyError, subprocess.SubprocessError) as error:
        reason = str(error) if isinstance(error, ValueError) else type(error).__name__
        print(f"Restore-Test fehlgeschlagen: {reason}.", file=sys.stderr)
        raise SystemExit(1)
