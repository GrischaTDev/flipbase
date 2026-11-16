#!/usr/bin/env python3
"""Begrenzt lokale Flipbase-Versionen, Browser-Caches und Sicherungen; Vorschau ist Standard."""

import argparse
import contextlib
from datetime import datetime
import json
import os
import re
import shutil
import subprocess
import sys
import time
from pathlib import Path


IMAGE_REPOSITORIES = {
    "ghcr.io/grischatdev/flipbase",
    "ghcr.io/grischatdev/flipbase-sniper",
    "ghcr.io/grischatdev/flipbase-marketplace-worker",
    "ghcr.io/grischatdev/flipbase-chromium-broker",
    "ghcr.io/grischatdev/flipbase-chromium-session",
    "ghcr.io/grischatdev/flipbase-push",
    "flipbase-sniper",
}
COMPACT_ROLLBACK_REPOSITORIES = {
    "ghcr.io/grischatdev/flipbase-chromium-session",
}
MARKETPLACE_RUNTIME_CONTAINERS = (
    "flipbase-marketplace-worker",
    "flipbase-chromium-pilot-chromium-host-broker-1",
)
SUPABASE_REPOSITORY_GROUPS = [
    {f"supabase/{service}", f"public.ecr.aws/supabase/{service}"}
    for service in (
        "postgres", "gotrue", "storage-api", "realtime", "edge-runtime",
        "postgres-meta", "studio", "supavisor",
    )
]
CHROMIUM_PROFILE_PATTERN = re.compile(r"^chromium_[0-9a-f-]{36}$")
CHROMIUM_SINGLETON_MARKERS = ("SingletonLock", "SingletonSocket", "SingletonCookie")
ACTIVE_PROFILE_DISPOSABLE_SUBPATHS = (
    "BrowserMetrics",
    "Crashpad",
    "ShaderCache",
    "GrShaderCache",
    "DawnGraphiteCache",
    "DawnWebGPUCache",
    "GraphiteDawnCache",
    "Default/GPUCache",
)
ARCHIVE_PROFILE_DISPOSABLE_SUBPATHS = ACTIVE_PROFILE_DISPOSABLE_SUBPATHS + (
    "Safe Browsing",
    "component_crx_cache",
    "extensions_crx_cache",
    "optimization_guide_model_store",
    "WasmTtsEngine",
    "segmentation_platform",
    "OnDeviceHeadSuggestModel",
    "CertificateRevocation",
    "WidevineCdm",
    "ZxcvbnData",
    "hyphen-data",
    "Default/Cache",
    "Default/Code Cache",
    "Default/Service Worker/CacheStorage",
)
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
    result = subprocess.run(
        ["docker", "container", "inspect", "--format", "{{.Image}}"] + container_ids,
        capture_output=True, text=True,
    )
    if result.returncode == 0:
        return set(result.stdout.split())
    # Kurzlebige Sitzungscontainer können zwischen ls und inspect beendet werden.
    referenced = set()
    for container_id in container_ids:
        single = subprocess.run(
            ["docker", "container", "inspect", "--format", "{{.Image}}", container_id],
            capture_output=True, text=True,
        )
        if single.returncode == 0:
            referenced.update(single.stdout.split())
        elif "No such object" not in single.stderr and "No such container" not in single.stderr:
            raise subprocess.CalledProcessError(single.returncode, single.args, single.stdout, single.stderr)
    return referenced


def image_repositories(image):
    references = (image.get("tags") or []) + (image.get("digests") or [])
    return {reference.split("@", 1)[0].rsplit(":", 1)[0] for reference in references}


def read_marketplace_session_images():
    references = set()
    for container in MARKETPLACE_RUNTIME_CONTAINERS:
        result = subprocess.run(
            ["docker", "container", "inspect", "--format", "{{json .Config.Env}}", container],
            capture_output=True, text=True,
        )
        if result.returncode != 0:
            if "No such object" in result.stderr or "No such container" in result.stderr:
                continue
            raise ValueError("Marketplace-Konfiguration konnte nicht geprüft werden.")
        entries = json.loads(result.stdout) or []
        for entry in entries:
            if isinstance(entry, str) and entry.startswith("MARKETPLACE_CHROMIUM_IMAGE="):
                reference = entry.split("=", 1)[1].strip()
                if reference:
                    references.add(reference)
    protected = set()
    for reference in sorted(references):
        result = subprocess.run(
            ["docker", "image", "inspect", "--format", "{{.Id}}", reference],
            capture_output=True, text=True,
        )
        if result.returncode == 0:
            protected.add(result.stdout.strip())
        elif "No such image" not in result.stderr:
            raise ValueError("Marketplace-Sitzungsimage konnte nicht geprüft werden.")
    return protected


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
        # Zwei unbenutzte Versionen bleiben neben allen Container-Versionen erhalten;
        # schwere Sitzungsimages behalten einen lokalen Rückfallstand.
        compact = repositories <= COMPACT_ROLLBACK_REPOSITORIES
        rollback_versions = [image for image in versions if image["id"] not in referenced_ids]
        has_active = any(image["id"] in referenced_ids for image in versions)
        rollback_count = (1 if compact else 2) if has_active else (2 if compact else 3)
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


def plan_backups(directory, nightly_count=7, weekly_count=0):
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
    kept_nightly = complete_sets[:nightly_count]
    weeks = set()
    for stamp in complete_sets[nightly_count:]:
        week = datetime.strptime(stamp, "%Y-%m-%d_%H%M").isocalendar()[:2]
        if len(weeks) < weekly_count and week not in weeks:
            kept_nightly.append(stamp)
            weeks.add(week)
    encrypted_to_remove = releases[3:]
    for stamp in complete_sets:
        if stamp in kept_nightly:
            continue
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
    for stamp in kept_nightly:
        verification.extend(nightly[stamp].values())
    return candidates, verification, releases[:3], kept_nightly


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


def read_chromium_container_profiles():
    output = run_command([
        "docker", "ps", "-a", "--filter", "label=de.flipbase.chromium.role=session",
        "--format", '{{.Label "de.flipbase.chromium.profile"}}',
    ]).stdout
    return {line.strip() for line in output.splitlines() if line.strip()}


def safe_subpath(root, relative):
    root_resolved = root.resolve(strict=True)
    current = root
    for part in Path(relative).parts:
        current = current / part
        if current.is_symlink():
            raise ValueError("Unsicherer symbolischer Link im Browserprofil.")
        if not current.exists():
            return None
    resolved = current.resolve(strict=True)
    if not resolved.is_relative_to(root_resolved):
        raise ValueError("Browserpfad verlässt das Profilverzeichnis.")
    return current


def path_contains_symlink(path):
    if path.is_symlink():
        return True
    if not path.is_dir():
        return False
    for current, dirnames, filenames in os.walk(path, followlinks=False):
        current_path = Path(current)
        if any((current_path / name).is_symlink() for name in (*dirnames, *filenames)):
            return True
    return False


def tree_size_no_symlinks(path):
    if path.is_symlink():
        raise ValueError("Unsicherer symbolischer Link im Browserprofil.")
    if path.is_file():
        return path.stat().st_size
    total = 0
    for current, dirnames, filenames in os.walk(path, followlinks=False):
        current_path = Path(current)
        for name in (*dirnames, *filenames):
            entry = current_path / name
            if entry.is_symlink():
                raise ValueError("Unsicherer symbolischer Link im Browserprofil.")
            if entry.is_file():
                total += entry.stat().st_size
    return total


def remove_tree_no_symlinks(path):
    if path_contains_symlink(path):
        raise ValueError("Unsicherer symbolischer Link im Browserprofil.")
    if path.is_file():
        path.unlink()
    elif path.is_dir():
        shutil.rmtree(path)


def chromium_profile_is_idle(
    profile_dir, parent_dir, worker_profiles_dir, profile_id, active_containers, min_idle_seconds, now=None,
):
    if not CHROMIUM_PROFILE_PATTERN.fullmatch(profile_id):
        return False
    if profile_dir.is_symlink() or not profile_dir.is_dir():
        return False
    if profile_dir.resolve(strict=True).parent != parent_dir.resolve(strict=True):
        raise ValueError("Unsicherer Browserprofilpfad.")
    if profile_id in active_containers:
        return False
    lock_roots = [parent_dir]
    if worker_profiles_dir is not None:
        if worker_profiles_dir.is_symlink():
            raise ValueError("Unsicheres Worker-Profilverzeichnis.")
        if worker_profiles_dir.exists():
            lock_roots.append(worker_profiles_dir)
    for lock_root in lock_roots:
        for suffix in ("running", "recovery"):
            marker = lock_root / f"{profile_id}.{suffix}"
            if marker.is_symlink() or marker.exists():
                return False
    for marker_name in CHROMIUM_SINGLETON_MARKERS:
        marker = profile_dir / marker_name
        if marker.is_symlink() or marker.exists():
            return False
    if min_idle_seconds > 0:
        reference_now = time.time() if now is None else now
        if reference_now - profile_dir.stat().st_mtime < min_idle_seconds:
            return False
    return True


def plan_chromium_cleanup(
    chromium_directory,
    worker_directory=None,
    min_idle_seconds=120,
    active_containers=None,
    now=None,
):
    if chromium_directory.is_symlink():
        raise ValueError("Unsicheres Chromium-Verzeichnis.")
    if not chromium_directory.exists():
        return []
    chromium_directory = chromium_directory.resolve(strict=True)
    if chromium_directory == Path(chromium_directory.anchor):
        raise ValueError("Unsicheres Chromium-Verzeichnis.")
    worker_profiles_dir = None
    if worker_directory is not None:
        if worker_directory.is_symlink():
            raise ValueError("Unsicheres Worker-Verzeichnis.")
        if worker_directory.exists():
            worker_profiles_dir = worker_directory.resolve(strict=True) / "profiles"
    containers = read_chromium_container_profiles() if active_containers is None else active_containers
    reference_now = time.time() if now is None else now
    entries = []

    profiles_dir = chromium_directory / "profiles"
    if profiles_dir.is_symlink():
        raise ValueError("Unsicheres Chromium-Profilverzeichnis.")
    if profiles_dir.is_dir():
        for profile_dir in sorted(profiles_dir.iterdir()):
            if not chromium_profile_is_idle(
                profile_dir, profiles_dir, worker_profiles_dir, profile_dir.name,
                containers, min_idle_seconds, reference_now,
            ):
                continue
            for relative in ACTIVE_PROFILE_DISPOSABLE_SUBPATHS:
                subpath = safe_subpath(profile_dir, relative)
                if subpath is None or not subpath.is_dir():
                    continue
                if path_contains_symlink(subpath):
                    raise ValueError("Unsicherer symbolischer Link im Browserprofil.")
                for current, _, filenames in os.walk(subpath, followlinks=False):
                    current_path = Path(current)
                    for filename in sorted(filenames):
                        candidate = current_path / filename
                        info = candidate.stat()
                        if reference_now - info.st_mtime >= min_idle_seconds:
                            entries.append({
                                "kind": "active_file",
                                "parent_dir": profiles_dir,
                                "profile_dir": profile_dir,
                                "profile_id": profile_dir.name,
                                "path": candidate,
                                "bytes": info.st_size,
                            })

    archive_dir = chromium_directory / "archive"
    if archive_dir.is_symlink():
        raise ValueError("Unsicheres Chromium-Archivverzeichnis.")
    if archive_dir.is_dir():
        for profile_dir in sorted(archive_dir.iterdir()):
            if not chromium_profile_is_idle(
                profile_dir, archive_dir, worker_profiles_dir, profile_dir.name,
                containers, 0, reference_now,
            ):
                continue
            for relative in ARCHIVE_PROFILE_DISPOSABLE_SUBPATHS:
                subpath = safe_subpath(profile_dir, relative)
                if subpath is None:
                    continue
                entries.append({
                    "kind": "archive_subpath",
                    "parent_dir": archive_dir,
                    "profile_dir": profile_dir,
                    "profile_id": profile_dir.name,
                    "path": subpath,
                    "bytes": tree_size_no_symlinks(subpath),
                })

    return entries


def apply_chromium_cleanup(entries, worker_directory=None, min_idle_seconds=120, active_containers=None):
    if not entries:
        return
    worker_profiles_dir = None
    if worker_directory is not None and worker_directory.exists():
        if worker_directory.is_symlink():
            raise ValueError("Unsicheres Worker-Verzeichnis.")
        worker_profiles_dir = worker_directory.resolve(strict=True) / "profiles"
    containers = read_chromium_container_profiles() if active_containers is None else active_containers
    grouped = {}
    for entry in entries:
        grouped.setdefault((entry["parent_dir"], entry["profile_dir"], entry["profile_id"], entry["kind"]), []).append(entry)
    now = time.time()
    for (parent_dir, profile_dir, profile_id, kind), items in grouped.items():
        idle_wait = min_idle_seconds if kind == "active_file" else 0
        if not chromium_profile_is_idle(
            profile_dir, parent_dir, worker_profiles_dir, profile_id, containers, idle_wait, now,
        ):
            continue
        for item in items:
            target = item["path"]
            if target.is_symlink():
                raise ValueError("Unsicherer symbolischer Link im Browserprofil.")
            if not target.exists():
                continue
            if kind == "active_file":
                if target.is_file():
                    target.unlink()
            else:
                remove_tree_no_symlinks(target)


def apply_images(images, include_supabase=False):
    needs_session_check = any(COMPACT_ROLLBACK_REPOSITORIES & image_repositories(item) for item in images)
    supabase_repositories = set().union(*SUPABASE_REPOSITORY_GROUPS)
    needs_supabase_check = include_supabase and any(supabase_repositories & image_repositories(item) for item in images)
    for image in images:
        protected = read_referenced_images()
        if needs_session_check:
            protected.update(read_marketplace_session_images())
        if needs_supabase_check:
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
    parser.add_argument("--scope", choices=("all", "images", "backups", "profiles"), default="all")
    parser.add_argument(
        "--include-supabase", action="store_true",
        help="Auch Supabase-Caches begrenzen; Container und Compose-Versionen schützen",
    )
    parser.add_argument(
        "--include-chromium", action="store_true",
        help="Auch gestoppte Chromium-Telemetrie und Archivcaches sicher bereinigen",
    )
    parser.add_argument("--backup-directory", type=Path, default=Path("/var/backups/flipbase"))
    parser.add_argument("--nightly-count", type=int, choices=range(1, 8), default=7)
    parser.add_argument("--deploy-directory", type=Path, default=Path("/opt/flipbase"))
    parser.add_argument(
        "--chromium-directory", type=Path, default=Path("/opt/flipbase-marketplace/chromium")
    )
    parser.add_argument(
        "--worker-directory", type=Path, default=Path("/opt/flipbase-marketplace/chromium-worker")
    )
    arguments = parser.parse_args()
    images = []
    backups = []
    verification = []
    kept_releases = []
    kept_nightly_sets = []
    chromium_entries = []
    # Auch die Vorschau misst einen Stand außerhalb laufender Deployments/Sicherungen.
    with storage_locks(arguments.deploy_directory):
        if arguments.scope in ("all", "images"):
            protected = read_referenced_images() | read_marketplace_session_images()
            if arguments.include_supabase:
                protected.update(read_supabase_compose_images())
            images = select_old_images(read_images(), protected, arguments.include_supabase)
        if arguments.scope in ("all", "backups"):
            backups, verification, kept_releases, kept_nightly_sets = plan_backups(
                arguments.backup_directory, nightly_count=arguments.nightly_count
            )
        if arguments.scope == "profiles" or (arguments.scope == "all" and arguments.include_chromium):
            chromium_entries = plan_chromium_cleanup(
                arguments.chromium_directory,
                worker_directory=arguments.worker_directory,
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
            "chromium_entries_to_remove": len(chromium_entries),
            "chromium_bytes_to_reclaim": sum(entry["bytes"] for entry in chromium_entries),
        }), flush=True)
        if arguments.verify_offsite and not arguments.apply:
            verify_offsite(arguments.backup_directory, verification)
            print("Verbleibende Sicherungen extern inhaltlich bestätigt.", flush=True)
        if arguments.apply:
            apply_images(images, arguments.include_supabase)
            if chromium_entries:
                apply_chromium_cleanup(chromium_entries, worker_directory=arguments.worker_directory)
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
