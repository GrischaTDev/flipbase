#!/usr/bin/env python3
"""Nur geprüfte öffentliche App-Dateien für ältere offene Fenster aufbewahren."""

import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import sys
import tempfile
import time


def _safe_archived_asset(entry: Path, url: str, destination: Path) -> Path | None:
    if not isinstance(url, str) or not url.startswith('/') or '..' in url:
        return None
    candidate = entry / url.lstrip('/')
    if candidate.is_symlink() or not candidate.is_file():
        return None
    resolved = candidate.resolve(strict=True)
    if not resolved.is_relative_to(destination):
        return None
    return candidate


def _index_archived_assets(destination: Path) -> dict[str, Path]:
    indexed: dict[str, Path] = {}
    builds = sorted(
        (entry for entry in destination.iterdir()
         if re.fullmatch(r'[a-f0-9]{64}', entry.name) and entry.is_dir() and not entry.is_symlink()),
        key=lambda entry: entry.stat().st_mtime, reverse=True,
    )
    for entry in builds:
        manifest_path = entry / 'pwa-assets.json'
        if manifest_path.is_symlink() or not manifest_path.is_file() or manifest_path.stat().st_size > 2_000_000:
            continue
        try:
            manifest = json.loads(manifest_path.read_bytes())
        except (OSError, ValueError):
            continue
        for asset in manifest.get('assets') or []:
            digest = asset.get('sha256', '')
            if not re.fullmatch(r'[a-f0-9]{64}', digest) or digest in indexed:
                continue
            candidate = _safe_archived_asset(entry, asset.get('url', ''), destination)
            if candidate is not None:
                indexed[digest] = candidate
    return indexed


def _link_or_copy(source_file: Path, target: Path, digest: str, indexed: dict[str, Path], destination: Path) -> None:
    existing = indexed.get(digest)
    if existing is not None:
        try:
            if (not existing.is_symlink() and existing.is_file()
                    and existing.resolve(strict=True).is_relative_to(destination)):
                info = existing.stat()
                if (info.st_nlink < 1000 and info.st_size == source_file.stat().st_size
                        and hashlib.sha256(existing.read_bytes()).hexdigest() == digest):
                    os.link(existing, target)
                    return
        except OSError:
            pass
    shutil.copyfile(source_file, target)


def deduplicate_archive(destination: Path) -> dict[str, int]:
    destination = destination.resolve(strict=True)
    builds = sorted(
        (entry for entry in destination.iterdir()
         if re.fullmatch(r'[a-f0-9]{64}', entry.name) and entry.is_dir() and not entry.is_symlink()),
        key=lambda entry: entry.stat().st_mtime, reverse=True,
    )
    canonical: dict[str, Path] = {}
    deduplicated = 0
    reclaimed = 0
    for entry in builds:
        manifest_path = entry / 'pwa-assets.json'
        if manifest_path.is_symlink() or not manifest_path.is_file() or manifest_path.stat().st_size > 2_000_000:
            continue
        manifest = json.loads(manifest_path.read_bytes())
        for asset in manifest.get('assets') or []:
            digest = asset.get('sha256', '')
            if not re.fullmatch(r'[a-f0-9]{64}', digest):
                continue
            candidate = _safe_archived_asset(entry, asset.get('url', ''), destination)
            if candidate is None or hashlib.sha256(candidate.read_bytes()).hexdigest() != digest:
                continue
            current_stat = candidate.stat()
            existing = canonical.get(digest)
            if existing is None:
                canonical[digest] = candidate
                continue
            existing_stat = existing.stat()
            if existing_stat.st_nlink >= 1000:
                canonical[digest] = candidate
                continue
            if (current_stat.st_dev, current_stat.st_ino) == (existing_stat.st_dev, existing_stat.st_ino):
                continue
            if current_stat.st_dev != existing_stat.st_dev or current_stat.st_size != existing_stat.st_size:
                continue
            if hashlib.sha256(existing.read_bytes()).hexdigest() != digest:
                continue
            stage_link = candidate.with_name(f'.dedup-{os.getpid()}-{candidate.name}')
            try:
                os.link(existing, stage_link)
                os.replace(stage_link, candidate)
                deduplicated += 1
                reclaimed += current_stat.st_size
            except OSError:
                stage_link.unlink(missing_ok=True)
    return {'builds': len(builds), 'deduplicated_files': deduplicated, 'bytes_reclaimed': reclaimed}


def archive_build(source: Path, destination: Path) -> None:
    source = source.resolve(strict=True)
    destination.mkdir(parents=True, exist_ok=True)
    destination = destination.resolve(strict=True)
    manifest_path = source / 'pwa-assets.json'
    if manifest_path.is_symlink() or manifest_path.stat().st_size > 2_000_000:
        raise ValueError('Ungültige App-Dateiliste')
    manifest_bytes = manifest_path.read_bytes()
    manifest = json.loads(manifest_bytes)
    build = manifest.get('buildId', '')
    assets = manifest.get('assets')
    if manifest.get('version') != 1 or not re.fullmatch(r'[a-f0-9]{64}', build):
        raise ValueError('Ungültige Baukennung')
    if not isinstance(assets, list) or not 1 <= len(assets) <= 5000:
        raise ValueError('Ungültige App-Dateiliste')
    paths = set()
    allowed = re.compile(
        r'/(?:index\.html|manifest\.webmanifest|favicon\.ico|[\w-]+\.(?:js|css))|'
        r'/(?:images|icons|fonts|i18n)/[\w./-]+\.(?:js|css|woff2?|ttf|otf|svg|png|jpe?g|gif|ico|webp|avif|json)|'
        r'/sounds/[\w-]+\.wav',
        re.ASCII,
    )
    for asset in assets:
        url, digest = asset.get('url', ''), asset.get('sha256', '')
        if not allowed.fullmatch(url) or '..' in url or url in paths:
            raise ValueError('Ungültiger öffentlicher Dateipfad')
        paths.add(url)
        path = source / url.lstrip('/')
        if (path.is_symlink() or not path.resolve(strict=True).is_relative_to(source)
                or not re.fullmatch(r'[a-f0-9]{64}', digest)
                or hashlib.sha256(path.read_bytes()).hexdigest() != digest):
            raise ValueError('App-Datei fehlt oder hat falsche Bytes')
    if '/index.html' not in paths:
        raise ValueError('App-Startdatei fehlt')
    final = destination / build
    if final.is_symlink():
        raise ValueError('Bauverzeichnis darf kein Verweis sein')
    if final.exists():
        if (final / 'pwa-assets.json').read_bytes() != manifest_bytes:
            raise ValueError('Unveränderlicher Bau wurde überschrieben')
        for asset in assets:
            path = final / asset['url'].lstrip('/')
            if path.is_symlink() or hashlib.sha256(path.read_bytes()).hexdigest() != asset['sha256']:
                raise ValueError('Vorhandenes Archiv ist beschädigt')
    else:
        indexed = _index_archived_assets(destination)
        stage = Path(tempfile.mkdtemp(prefix='.stage-', dir=destination))
        try:
            for asset in assets:
                target = stage / asset['url'].lstrip('/')
                target.parent.mkdir(parents=True, exist_ok=True)
                _link_or_copy(source / asset['url'].lstrip('/'), target, asset['sha256'], indexed, destination)
            (stage / 'pwa-assets.json').write_bytes(manifest_bytes)
            # Das Auslieferungsverzeichnis wird erst nach vollständiger Prüfung sichtbar.
            stage.rename(final)
        finally:
            if stage.exists():
                shutil.rmtree(stage)
    for directory in [final, *final.rglob('*')]:
        expected_mode = 0o755 if directory.is_dir() else 0o644
        if (directory.stat().st_mode & 0o777) != expected_mode:
            directory.chmod(expected_mode)
    os.utime(final, None)
    builds = sorted(
        (entry for entry in destination.iterdir()
         if re.fullmatch(r'[a-f0-9]{64}', entry.name) and entry.is_dir() and not entry.is_symlink()),
        key=lambda entry: entry.stat().st_mtime, reverse=True,
    )
    # Mindestens zwei Rückfallstände behalten, darüber hinaus 30 Tage.
    for entry in builds[3:]:
        if entry.stat().st_mtime < time.time() - 30 * 86400:
            if entry.parent != destination or entry.resolve().parent != destination:
                raise ValueError('Archivpfad verlässt das Zielverzeichnis')
            shutil.rmtree(entry)


if __name__ == '__main__':
    if len(sys.argv) == 3 and sys.argv[1] == '--deduplicate':
        print(json.dumps(deduplicate_archive(Path(sys.argv[2]))))
    else:
        archive_build(Path(sys.argv[1]), Path(sys.argv[2]))
