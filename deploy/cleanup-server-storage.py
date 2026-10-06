#!/usr/bin/env python3
"""Begrenzt lokale Flipbase-Versionen und Sicherungen; Vorschau ist Standard."""

import argparse
import contextlib
from datetime import datetime
import json
import re
import subprocess
import sys
from pathlib import Path


IMAGE_REPOSITORIES = {
    "ghcr.io/grischatdev/flipbase",
    "ghcr.io/grischatdev/flipbase-sniper",
    "ghcr.io/grischatdev/flipbase-marketplace-worker",
    "ghcr.io/grischatdev/flipbase-chromium-session",
    "flipbase-sniper",
}
SUPABASE_REPOSITORY_GROUPS = [
    {f"supabase/{service}", f"public.ecr.aws/supabase/{service}"}
    for service in (
        "postgres", "gotrue", "storage-api", "realtime", "edge-runtime",
        "postgres-meta", "studio", "supavisor",
    )
]
NIGHTLY_PATTERN = re.compile(
    r"^(db|storage|env)_(\d{4}-\d{2}-\d{2}_\d{4})\.(sql\.gz|tar\.gz|txt)\.age$"
)
RELEASE_PATTERN = re.compile(r"^release-db-[A-Za-z0-9]{8}\.sql\.gz\.age$")
BACKUP_EXTENSIONS = {"db": "sql.gz", "storage": "tar.gz", "env": "txt"}
OFFSITE_TARGET = "flipbackup@168.119.165.201:"
BACKUP_SSH = (
    "ssh -i /root/.ssh/flipbase-backup -o BatchMode=yes "
    "-o StrictHostKeyChecking=yes -o ConnectTimeout=10"
)


def run_command(arguments, **options):
    return subprocess.run(arguments, check=True, capture_output=True, text=True, **options)


def read_images():
    image_ids = run_command(["docker", "image", "ls", "-aq", "--no-trunc"]).stdout.split()
    image_ids = sorted(set(image_ids))
    images = []
    # Kurze Argumentlisten funktionieren auch bei vielen historischen Versionen.
    image_format = (
        '{"id":{{json .Id}},"created":{{json .Created}},'
        '"tags":{{json .RepoTags}},"digests":{{json .RepoDigests}}}'
    )
    for start in range(0, len(image_ids), 80):
        output = run_command(
            ["docker", "image", "inspect", "--format", image_format]
            + image_ids[start : start + 80]
        ).stdout
        images.extend(json.loads(line) for line in output.splitlines())
    return images


def read_referenced_images():
    container_ids = run_command(["docker", "container", "ls", "-aq"]).stdout.split()
    if not container_ids:
        return set()
    output = run_command(
        ["docker", "container", "inspect", "--format", "{{.Image}}"] + container_ids
    ).stdout
    return set(output.split())


def image_repositories(image):
    references = (image.get("tags") or []) + (image.get("digests") or [])
    return {reference.split("@", 1)[0].rsplit(":", 1)[0] for reference in references}


def read_supabase_compose_images():
    # Nur Image-Namen ausgeben lassen, niemals die aufgelöste Konfiguration mit Secrets.
    labels = json.loads(run_command([
        "docker", "container", "inspect", "--format", "{{json .Config.Labels}}", "supabase-db",
    ]).stdout)
    configuration = (labels or {}).get("com.docker.compose.project.config_files")
    if not configuration:
        raise ValueError("Supabase-Compose-Dateien fehlen; keine Supabase-Images bereinigt.")
    arguments = ["docker", "compose"]
    for filename in configuration.split(","):
        arguments.extend(["-f", filename])
    arguments.extend(["config", "--images"])
    references = sorted(set(run_command(arguments).stdout.split()))
    protected = set()
    for reference in references:
        result = subprocess.run(
            ["docker", "image", "inspect", "--format", "{{.Id}}", reference],
            capture_output=True, text=True,
        )
        if result.returncode == 0:
            protected.add(result.stdout.strip())
        else:
            # Ein fehlendes vorgesehenes Image braucht keine lokale Löschung;
            # andere Inspektionsfehler sollen den Lauf sicher abbrechen.
            if "No such image" not in result.stderr:
                raise ValueError("Supabase-Compose-Image konnte nicht geprüft werden.")
    return protected


def select_old_images(images, referenced_ids, include_supabase=False):
    protected_ids = set(referenced_ids)
    groups = [{repository} for repository in IMAGE_REPOSITORIES]
    if include_supabase:
        groups.extend(SUPABASE_REPOSITORY_GROUPS)
    allowed_repositories = set().union(*groups)
    for repositories in groups:
        versions = sorted(
            (image for image in images if repositories & image_repositories(image)),
            key=lambda image: (
                datetime.fromisoformat(
                    re.sub(r"(\.\d{6})\d+", r"\1", image["created"]).replace("Z", "+00:00")
                ),
                image["id"],
            ),
            reverse=True,
        )
        # Zwei unbenutzte Versionen bleiben neben allen Container-Versionen erhalten.
        rollback_versions = [image for image in versions if image["id"] not in referenced_ids]
        rollback_count = 2 if any(image["id"] in referenced_ids for image in versions) else 3
        protected_ids.update(image["id"] for image in rollback_versions[:rollback_count])
    return [
        image
        for image in images
        if image["id"] not in protected_ids
        and image_repositories(image)
        and image_repositories(image) <= allowed_repositories
    ]


def is_encrypted_backup(path):
    if path.is_symlink() or not path.is_file():
        return False
    with path.open("rb") as backup:
        return backup.readline(80) == b"age-encryption.org/v1\n" and path.stat().st_size > 32


def plan_backups(directory):
    if directory.is_symlink() or directory.resolve() == Path(directory.anchor):
        raise ValueError("Unsicheres Sicherungsverzeichnis.")
    directory = directory.resolve(strict=True)
    releases = []
    nightly = {}
    for path in directory.iterdir():
        if RELEASE_PATTERN.fullmatch(path.name) and is_encrypted_backup(path):
            releases.append(path)
        match = NIGHTLY_PATTERN.fullmatch(path.name)
        if match and BACKUP_EXTENSIONS[match[1]] == match[3] and is_encrypted_backup(path):
            nightly.setdefault(match[2], {})[match[1]] = path
    releases.sort(key=lambda path: (path.stat().st_mtime_ns, path.name), reverse=True)
    complete_sets = sorted(
        (stamp for stamp, files in nightly.items() if set(files) == set(BACKUP_EXTENSIONS)),
        reverse=True,
    )
    encrypted_to_remove = releases[3:]
    for stamp in complete_sets[7:]:
        encrypted_to_remove.extend(nightly[stamp].values())
    # Lesbare Duplikate erst entfernen, wenn die verschlüsselte Kopie extern stimmt.
    duplicates = {}
    for stamp in complete_sets:
        for encrypted in nightly[stamp].values():
            original = encrypted.with_suffix("")
            if (
                original.is_file()
                and not original.is_symlink()
                and original.stat().st_mtime_ns <= encrypted.stat().st_mtime_ns
            ):
                duplicates[original] = encrypted
    candidates = sorted(set(encrypted_to_remove) | set(duplicates), key=lambda path: path.name)
    # Die zugesagten Wiederherstellungspunkte müssen vor jeder lokalen Löschung
    # auch extern vollständig vorliegen; alte Punkte dürfen nach dieser Regel gehen.
    verification = list(releases[:3])
    for stamp in complete_sets[:7]:
        verification.extend(nightly[stamp].values())
    return candidates, verification, releases[:3], complete_sets[:7]


def verify_offsite(directory, paths):
    if not paths:
        return
    result = run_command(
        [
            "rsync", "--dry-run", "--checksum", "--itemize-changes", "--from0",
            "--files-from=-", "-e", BACKUP_SSH, str(directory.resolve()) + "/", OFFSITE_TARGET,
        ],
        input="".join(path.name + "\0" for path in paths),
        timeout=600,
    )
    if result.stdout.strip():
        raise ValueError("Externe Kopien fehlen oder weichen ab; keine lokale Sicherung gelöscht.")


def file_identity(path):
    if path.is_symlink():
        raise ValueError("Sicherung wurde durch einen symbolischen Link ersetzt.")
    stat = path.stat()
    return stat.st_dev, stat.st_ino, stat.st_size, stat.st_mtime_ns


@contextlib.contextmanager
def storage_locks(deploy_directory):
    import fcntl

    with contextlib.ExitStack() as stack:
        for name in ("deploy.lock", "backup.lock"):
            lock = stack.enter_context((deploy_directory / name).open("a"))
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        yield


def apply_images(images, include_supabase=False):
    for image in images:
        protected = read_referenced_images()
        if include_supabase:
            protected.update(read_supabase_compose_images())
        if image["id"] in protected:
            continue
        # Keine erzwungene Löschung und keine automatische Bereinigung fremder Eltern.
        references = image.get("tags") or image.get("digests") or []
        for reference in references:
            current_id = run_command(
                ["docker", "image", "inspect", "--format", "{{.Id}}", reference]
            ).stdout.strip()
            if current_id != image["id"]:
                raise ValueError("Image-Markierung wurde während der Bereinigung verändert.")
        run_command(["docker", "image", "rm", "--no-prune"] + references)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="Vorschau tatsächlich ausführen")
    parser.add_argument(
        "--verify-offsite", action="store_true", help="Externe Kopien bereits in der Vorschau prüfen"
    )
    parser.add_argument("--scope", choices=("all", "images", "backups"), default="all")
    parser.add_argument(
        "--include-supabase", action="store_true",
        help="Auch Supabase-Caches begrenzen; Container und Compose-Versionen schützen",
    )
    parser.add_argument("--backup-directory", type=Path, default=Path("/var/backups/flipbase"))
    parser.add_argument("--deploy-directory", type=Path, default=Path("/opt/flipbase"))
    arguments = parser.parse_args()
    images = []
    backups = []
    verification = []
    kept_releases = []
    kept_nightly_sets = []
    # Auch die Vorschau misst einen Stand außerhalb laufender Deployments/Sicherungen.
    with storage_locks(arguments.deploy_directory):
        if arguments.scope in ("all", "images"):
            protected = read_referenced_images()
            if arguments.include_supabase:
                protected.update(read_supabase_compose_images())
            images = select_old_images(read_images(), protected, arguments.include_supabase)
        if arguments.scope in ("all", "backups"):
            backups, verification, kept_releases, kept_nightly_sets = plan_backups(
                arguments.backup_directory
            )
        identities = {path: file_identity(path) for path in set(backups) | set(verification)}
        print(json.dumps({
            "mode": "apply" if arguments.apply else "preview",
            "images_to_remove": len(images),
            "images_to_remove_by_repository": {
                repository: sum(repository in image_repositories(image) for image in images)
                for repository in sorted(IMAGE_REPOSITORIES | (
                    set().union(*SUPABASE_REPOSITORY_GROUPS) if arguments.include_supabase else set()
                ))
            },
            "backup_files_to_remove": len(backups),
            "backup_bytes_to_reclaim": sum(path.stat().st_size for path in backups),
            "release_backups_to_keep": [path.name for path in kept_releases],
            "nightly_sets_to_keep": kept_nightly_sets,
        }), flush=True)
        if arguments.verify_offsite and not arguments.apply:
            verify_offsite(arguments.backup_directory, verification)
            print("Verbleibende Sicherungen extern inhaltlich bestätigt.", flush=True)
        if arguments.apply:
            apply_images(images, arguments.include_supabase)
            # Erst alle externen Kopien prüfen, dann die erste lokale Datei entfernen.
            verify_offsite(arguments.backup_directory, verification)
            if any(file_identity(path) != identity for path, identity in identities.items()):
                raise ValueError("Sicherungen wurden während der Prüfung verändert.")
            for path in backups:
                path.unlink()
            print("Speicherbereinigung erfolgreich.")


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, subprocess.SubprocessError) as error:
        # Keine Befehlsausgaben ausgeben: Sicherungen und SSH-Meldungen können vertraulich sein.
        reason = str(error) if isinstance(error, ValueError) else type(error).__name__
        print(f"Speicherbereinigung abgebrochen: {reason}.", file=sys.stderr)
        sys.exit(1)
