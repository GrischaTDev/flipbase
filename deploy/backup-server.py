#!/usr/bin/env python3
"""Holt Tagesstände und verwaltet Borg ausschließlich auf dem Backupserver."""

import argparse
import contextlib
from datetime import datetime, timezone
import importlib.util
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile


def load_module(name, filename):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(filename))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


snapshot = load_module("backup_snapshot", "create-backup-snapshot.py")
ARCHIVE_PATTERN = re.compile(r"^nightly-\d{8}T\d{6}Z-[a-f0-9]{8}$")
REPOSITORY = Path("/srv/flipbase-borg/repository")
STATE_DIRECTORY = Path("/var/lib/flipbase-backup")
LEGACY_DIRECTORY = Path("/srv/flipbase-backup/daten")
BORG_PASSPHRASE = Path("/root/.config/flipbase-borg/passphrase")
SOURCE_SSH = (
    "ssh -i /root/.ssh/flipbase-borg-source -o IdentitiesOnly=yes -o BatchMode=yes "
    "-o StrictHostKeyChecking=yes -o ConnectTimeout=10 -o HostKeyAlgorithms=ssh-ed25519 "
    "-o UserKnownHostsFile=/root/.ssh/flipbase-borg-known-hosts"
)


def run(arguments, **options):
    return subprocess.run(arguments, check=True, capture_output=True, text=True, **options)


def borg(arguments, **options):
    environment = dict(os.environ, BORG_PASSCOMMAND=f"cat {BORG_PASSPHRASE}")
    return run(["borg", *arguments], env=environment, **options)


def write_json(path, content):
    temporary = path.with_suffix(".tmp")
    with temporary.open("w") as stream:
        json.dump(content, stream, sort_keys=True)
        stream.flush()
        os.fsync(stream.fileno())
    temporary.replace(path)


def read_manifest(directory, require_fresh=True):
    manifest = json.loads((directory / "manifest.json").read_text())
    archive = manifest["archive"]
    if manifest["format"] != 1 or not ARCHIVE_PATTERN.fullmatch(archive):
        raise ValueError("Unbekannter Sicherungsstand.")
    completed = datetime.fromisoformat(manifest["completed_at"])
    if completed.tzinfo is None:
        raise ValueError("Sicherungszeit ohne Zeitzone.")
    age = (datetime.now(timezone.utc) - completed).total_seconds()
    if require_fresh and not -300 <= age <= 26 * 3600:
        raise ValueError("Tagesstand fehlt oder ist älter als 26 Stunden.")
    return manifest


def validate_snapshot(directory, require_fresh=True):
    actual = snapshot.describe_files(directory)
    manifest = read_manifest(directory, require_fresh)
    archive = manifest["archive"]
    if not {"database.sql", "configuration/opt/supabase/.env",
            "configuration/postgres-custom/pgsodium_root.key"} <= manifest["files"].keys():
        raise ValueError("Datenbank oder erforderliche Konfiguration fehlt.")
    if not any(name.startswith("storage/") for name in manifest["files"]) and not manifest[
        "storage_fingerprint"
    ].startswith("0:"):
        raise ValueError("Storage-Sicherung ist leer.")
    expected_names = set(manifest["files"]) | {"manifest.json", f"borg-verified-{archive}.json"}
    if set(actual) != expected_names:
        raise ValueError("Dateiliste stimmt nicht mit dem Sicherungsstand überein.")
    for name, expected in manifest["files"].items():
        if any(actual[name][key] != expected[key] for key in ("sha256", "size")):
            raise ValueError("Prüfsumme eines gesicherten Inhalts stimmt nicht.")
    receipt = json.loads((directory / f"borg-verified-{archive}.json").read_text())
    if receipt != {"archive": archive, "manifest_sha256": snapshot.digest(directory / "manifest.json")}:
        raise ValueError("Sicherungsbestätigung stimmt nicht.")
    return manifest


def read_archives():
    entries = json.loads(borg(["list", "--json", str(REPOSITORY)]).stdout)["archives"]
    return {entry["name"]: entry["id"] for entry in entries}


def verify_ledger(archives, ledger):
    if any(archives.get(name) != identity for name, identity in ledger.items()):
        raise ValueError("Geschützte Borg-Stände fehlen oder wurden verändert; keine Bereinigung.")


def prune_repository():
    ledger_path = STATE_DIRECTORY / "archives.json"
    ledger = json.loads(ledger_path.read_text()) if ledger_path.exists() else {}
    verify_ledger(read_archives(), ledger)
    arguments = ["prune", "--glob-archives", "nightly-*", "--keep-daily", "7",
                 "--keep-weekly", "4", "--list", str(REPOSITORY)]
    preview = borg([*arguments, "--dry-run"])
    (STATE_DIRECTORY / "last-prune-preview.log").write_text(preview.stderr)
    borg(arguments)
    write_json(ledger_path, read_archives())
    borg(["compact", str(REPOSITORY)])


def cleanup_legacy(apply=False):
    retention = load_module("legacy_retention", "cleanup-server-storage.py")
    candidates, verification, releases, nightly = retention.plan_backups(
        LEGACY_DIRECTORY, nightly_count=7, weekly_count=4,
    )
    identities = {path: retention.file_identity(path) for path in set(candidates) | set(verification)}
    print(json.dumps({"legacy_mode": "apply" if apply else "preview",
                      "legacy_files_to_remove": len(candidates),
                      "legacy_bytes_to_remove": sum(path.stat().st_size for path in candidates),
                      "release_points_to_keep": len(releases), "nightly_points_to_keep": len(nightly)}))
    if apply:
        if len(releases) < 3 or len(nightly) < 7:
            raise ValueError("Zu wenige geprüfte Altstände; keine Bereinigung.")
        if any(retention.file_identity(path) != identity for path, identity in identities.items()):
            raise ValueError("Altstände wurden während der Auswahl verändert.")
        for path in candidates:
            if retention.file_identity(path) != identities[path]:
                raise ValueError("Altstand wurde während der Bereinigung verändert.")
            path.unlink()


def publish_receipt(receipt):
    # Der Altordner nimmt Uploads entgegen. Niemals einer dort gesetzten .tmp-Verknüpfung folgen.
    with tempfile.NamedTemporaryFile(dir=STATE_DIRECTORY, delete=False) as stream:
        temporary = Path(stream.name)
        stream.write(receipt.read_bytes())
        stream.flush()
        os.fchmod(stream.fileno(), 0o644)
        os.fsync(stream.fileno())
    try:
        temporary.replace(LEGACY_DIRECTORY / receipt.name)
    finally:
        temporary.unlink(missing_ok=True)


def pull_snapshot():
    if shutil.disk_usage(STATE_DIRECTORY).free < 2 * 1024**3:
        raise ValueError("Weniger als 2 GiB Arbeitsbereich; bestehende Sicherungen geschützt.")
    ledger_path = STATE_DIRECTORY / "archives.json"
    ledger = json.loads(ledger_path.read_text()) if ledger_path.exists() else {}
    verify_ledger(read_archives(), ledger)
    with tempfile.TemporaryDirectory(prefix="pull-", dir=STATE_DIRECTORY) as temporary:
        directory = Path(temporary) / "snapshot"
        directory.mkdir()
        run(["rsync", "-a", "--no-owner", "--no-group", "--chmod=F600", "-e", SOURCE_SSH,
             "flipborg-source@168.119.246.33:manifest.json", str(directory / "manifest.json")],
            timeout=600)
        header = read_manifest(directory)
        success_path = STATE_DIRECTORY / "last-success.json"
        success = json.loads(success_path.read_text()) if success_path.exists() else {}
        if header["archive"] in ledger and success.get("archive") == header["archive"] and success.get(
            "manifest_sha256"
        ) == snapshot.digest(directory / "manifest.json"):
            print(json.dumps({"archive": header["archive"], "already_verified": True}))
            return
        run(["rsync", "-a", "--no-owner", "--no-group", "--chmod=D700,F600",
             "-e", SOURCE_SSH, "flipborg-source@168.119.246.33:", str(directory) + "/"],
            timeout=3600)
        manifest = validate_snapshot(directory)
        archive = manifest["archive"]
        if archive not in read_archives():
            borg(["create", "--compression", "zstd,3", "--json",
                  f"{REPOSITORY}::{archive}", "."], cwd=directory, timeout=3600)
        borg(["check", "--archives-only", "--glob-archives", archive,
              str(REPOSITORY)], timeout=3600)
        with tempfile.TemporaryDirectory(prefix="verify-", dir=STATE_DIRECTORY) as restored:
            borg(["extract", f"{REPOSITORY}::{archive}"], cwd=restored, timeout=3600)
            restored_manifest = validate_snapshot(Path(restored))
            if restored_manifest != manifest:
                raise ValueError("Zurückgelesener Stand weicht ab.")
        # Erst das Zurücklesen aller Inhalte gibt den nächsten Quellstand frei.
        receipt = directory / f"borg-verified-{archive}.json"
        publish_receipt(receipt)
        write_json(STATE_DIRECTORY / "last-success.json", {
            "archive": archive, "completed_at": datetime.now(timezone.utc).isoformat(),
            "source_completed_at": manifest["completed_at"], "verified_files": len(manifest["files"]),
            "manifest_sha256": snapshot.digest(directory / "manifest.json"),
        })
        prune_repository()
        print(json.dumps({"archive": archive, "verified_files": len(manifest["files"]),
                          "retained_archives": len(read_archives())}))


@contextlib.contextmanager
def server_lock():
    import fcntl

    with (STATE_DIRECTORY / "operation.lock").open("a") as handle:
        fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        yield


def main():
    os.umask(0o077)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--legacy-preview", action="store_true")
    parser.add_argument("--cleanup-legacy", action="store_true")
    arguments = parser.parse_args()
    for directory in (REPOSITORY, STATE_DIRECTORY, LEGACY_DIRECTORY):
        if not directory.is_dir() or directory.is_symlink():
            raise ValueError("Erforderliches Sicherungsverzeichnis fehlt oder ist unsicher.")
    with server_lock():
        if arguments.legacy_preview or arguments.cleanup_legacy:
            cleanup_legacy(arguments.cleanup_legacy)
        else:
            pull_snapshot()


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, KeyError, subprocess.SubprocessError) as error:
        reason = str(error) if isinstance(error, ValueError) else type(error).__name__
        print(f"Externe Sicherung fehlgeschlagen: {reason}.", file=sys.stderr)
        raise SystemExit(1)
