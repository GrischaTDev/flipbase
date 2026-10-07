#!/usr/bin/env python3
"""Erzeugt genau einen lokalen Tagesstand für den lesenden Backupserver."""

import argparse
import contextlib
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import uuid


STORAGE_FINGERPRINT_SQL = """select count(*)::text || ':' || md5(coalesce(string_agg(
  jsonb_build_array(id, bucket_id, name, version, metadata)::text,
  E'\\n' order by id), '')) from storage.objects;
"""
BACKUP_SSH = (
    "ssh -i /root/.ssh/flipbase-backup -o BatchMode=yes "
    "-o StrictHostKeyChecking=yes -o ConnectTimeout=10"
)


def run(arguments, **options):
    return subprocess.run(arguments, check=True, capture_output=True, **options)


def digest(path):
    result = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            result.update(block)
    return result.hexdigest()


def describe_files(directory):
    files = {}
    for path in sorted(directory.rglob("*")):
        if path.is_symlink():
            raise ValueError("Symbolischer Link im Sicherungsstand.")
        if path.is_file():
            metadata = path.stat()
            files[path.relative_to(directory).as_posix()] = {
                "sha256": digest(path), "size": metadata.st_size,
                "mode": metadata.st_mode & 0o777, "uid": metadata.st_uid,
                "gid": metadata.st_gid,
            }
    return files


def copy_configuration(destination, deploy_directory, supabase_directory):
    metadata = {}

    def copy_file(source, target):
        stat = source.stat()
        metadata["configuration/" + target.relative_to(destination).as_posix()] = {
            "sha256": digest(source), "size": stat.st_size,
            "mode": stat.st_mode & 0o777, "uid": stat.st_uid, "gid": stat.st_gid,
        }
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)

    def copy_directory(source, target):
        for name, entry in describe_files(source).items():
            metadata["configuration/" + (target / name).relative_to(destination).as_posix()] = entry
        shutil.copytree(source, target)

    directories = [deploy_directory, supabase_directory, Path("/opt/flipbase-sniper")]
    for directory in directories:
        if not directory.exists():
            continue
        for path in directory.iterdir():
            if path.name in {".env", "sniper.env", "sicherung-schluessel.txt",
                             "sicherung-schluessel.pub", ".supabase-version"} or (
                path.suffix in {".yml", ".yaml", ".sh", ".py"}
            ):
                if path.is_symlink() or not path.is_file():
                    raise ValueError("Unsichere Konfigurationsdatei.")
                target = destination / path.relative_to(path.anchor)
                copy_file(path, target)
    volumes = supabase_directory / "volumes"
    for name in ("api", "functions", "pooler", "proxy"):
        source = volumes / name
        if source.exists():
            copy_directory(source, destination / source.relative_to(source.anchor))
    for source in (volumes / "db").glob("*.sql"):
        if source.is_symlink():
            raise ValueError("Symbolischer Link in DB-Startkonfiguration.")
        target = destination / source.relative_to(source.anchor)
        copy_file(source, target)
    mounts = json.loads(run([
        "docker", "inspect", "--format", "{{json .Mounts}}", "supabase-db",
    ]).stdout)
    configurations = [Path(mount["Source"]) for mount in mounts
                      if mount["Destination"] == "/etc/postgresql-custom"]
    if len(configurations) != 1 or not configurations[0].is_dir():
        raise ValueError("PostgreSQL-Konfiguration einschließlich Entschlüsselungsschlüssel fehlt.")
    copy_directory(configurations[0], destination / "postgres-custom")
    return metadata


def storage_fingerprint():
    return run([
        "docker", "exec", "supabase-db", "psql", "-U", "supabase_admin",
        "-d", "postgres", "-At", "-v", "ON_ERROR_STOP=1", "-c", STORAGE_FINGERPRINT_SQL,
    ]).stdout.strip()


def verify_previous_receipt(current):
    manifest = json.loads((current / "manifest.json").read_text())
    receipt = f"borg-verified-{manifest['archive']}.json"
    result = run([
        "rsync", "--dry-run", "--checksum", "--itemize-changes", "--from0",
        "--files-from=-", "-e", BACKUP_SSH, str(current) + "/",
        "flipbackup@168.119.165.201:",
    ], input=(receipt + "\0").encode(), timeout=600)
    if result.stdout.strip():
        raise ValueError("Vorheriger Stand extern noch nicht bestätigt; bleibt erhalten.")


@contextlib.contextmanager
def snapshot_locks(deploy_directory, root):
    import fcntl

    with contextlib.ExitStack() as stack:
        for path in (deploy_directory / "deploy.lock", deploy_directory / "backup.lock",
                     root / "snapshot.lock"):
            handle = stack.enter_context(path.open("a"))
            fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        yield


def create_snapshot(root, deploy_directory, supabase_directory, source_group):
    if root.is_symlink() or root.resolve() == Path(root.anchor):
        raise ValueError("Unsicheres Snapshot-Verzeichnis.")
    root.mkdir(parents=True, exist_ok=True, mode=0o750)
    root = root.resolve(strict=True)
    current = root / "current"
    storage = supabase_directory / "volumes/storage"
    if not storage.is_dir() or storage.is_symlink():
        raise ValueError("Erforderliche Storage-Dateien fehlen.")
    with snapshot_locks(deploy_directory, root):
        if current.exists():
            if current.is_symlink():
                raise ValueError("Unsicherer bestehender Stand.")
            verify_previous_receipt(current)
        with tempfile.TemporaryDirectory(prefix="pending-", dir=root) as temporary:
            pending = Path(temporary) / "snapshot"
            pending.mkdir()
            before_metadata = storage_fingerprint()
            before_files = describe_files(storage)
            shutil.copytree(storage, pending / "storage")
            with (pending / "database.sql").open("wb") as output:
                subprocess.run(
                    ["docker", "exec", "supabase-db", "pg_dumpall", "-U", "supabase_admin"],
                    stdout=output, stderr=subprocess.PIPE, check=True, timeout=2700,
                )
            if not (pending / "database.sql").stat().st_size:
                raise ValueError("Leerer Datenbankabzug.")
            if before_metadata != storage_fingerprint() or before_files != describe_files(storage):
                raise ValueError("Storage während des Abzugs verändert; Stand nicht freigegeben.")
            copied = describe_files(pending / "storage")
            if {name: (entry['sha256'], entry['size']) for name, entry in before_files.items()} != {
                name: (entry['sha256'], entry['size']) for name, entry in copied.items()
            }:
                raise ValueError("Storage-Kopie weicht ab.")
            configuration_metadata = copy_configuration(
                pending / "configuration", deploy_directory, supabase_directory,
            )
            now = datetime.now(timezone.utc)
            archive = "nightly-" + now.strftime("%Y%m%dT%H%M%SZ") + "-" + uuid.uuid4().hex[:8]
            image = run([
                "docker", "inspect", "--format", "{{.Image}}", "supabase-db",
            ]).stdout.decode().strip()
            image_references = json.loads(run([
                "docker", "image", "inspect", "--format", "{{json .RepoDigests}}", image,
            ]).stdout)
            if not image_references:
                raise ValueError("Abrufbarer PostgreSQL-Abbild-Digest fehlt.")
            manifest = {
                "format": 1, "archive": archive, "completed_at": now.isoformat(),
                "storage_fingerprint": before_metadata.decode(),
                "database_image": image,
                "database_image_reference": image_references[0],
                "files": describe_files(pending),
            }
            for name, metadata in before_files.items():
                manifest["files"]["storage/" + name] = metadata
            for name, metadata in configuration_metadata.items():
                if any(manifest["files"][name][key] != metadata[key] for key in ("sha256", "size")):
                    raise ValueError("Konfiguration während des Kopierens verändert.")
                manifest["files"][name] = metadata
            (pending / "manifest.json").write_text(json.dumps(manifest, sort_keys=True))
            receipt = {"archive": archive, "manifest_sha256": digest(pending / "manifest.json")}
            (pending / f"borg-verified-{archive}.json").write_text(json.dumps(receipt, sort_keys=True))
            import grp
            group = grp.getgrnam(source_group).gr_gid
            for path in [root, root / "snapshot.lock", pending, *pending.rglob("*")]:
                os.chown(path, 0, group)
                path.chmod(0o750 if path.is_dir() else 0o640)
            previous = root / "previous"
            if previous.exists():
                raise ValueError("Unabgeschlossener Wechsel; bestehenden Stand prüfen.")
            if current.exists():
                current.rename(previous)
            try:
                pending.rename(current)
            except OSError:
                if previous.exists():
                    previous.rename(current)
                raise
            if previous.exists():
                shutil.rmtree(previous)
            print(json.dumps({"archive": archive, "files": len(manifest["files"]),
                              "bytes": sum(entry["size"] for entry in manifest["files"].values())}))


def main():
    os.umask(0o077)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path("/var/backups/flipbase-snapshot"))
    parser.add_argument("--deploy-directory", type=Path, default=Path("/opt/flipbase"))
    parser.add_argument("--supabase-directory", type=Path, default=Path("/opt/supabase"))
    parser.add_argument("--source-group", default="flipborg-source")
    arguments = parser.parse_args()
    create_snapshot(arguments.root, arguments.deploy_directory, arguments.supabase_directory,
                    arguments.source_group)


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, KeyError, subprocess.SubprocessError) as error:
        reason = str(error) if isinstance(error, ValueError) else type(error).__name__
        print(f"Tagesstand fehlgeschlagen: {reason}.", file=sys.stderr)
        raise SystemExit(1)
