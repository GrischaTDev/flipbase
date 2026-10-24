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
        r'/(?:images|icons|fonts|i18n)/[\w./-]+\.(?:js|css|woff2?|ttf|otf|svg|png|jpe?g|gif|ico|webp|avif|json)',
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
        stage = Path(tempfile.mkdtemp(prefix='.stage-', dir=destination))
        try:
            for asset in assets:
                target = stage / asset['url'].lstrip('/')
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(source / asset['url'].lstrip('/'), target)
            (stage / 'pwa-assets.json').write_bytes(manifest_bytes)
            # Das Auslieferungsverzeichnis wird erst nach vollständiger Prüfung sichtbar.
            stage.rename(final)
        finally:
            if stage.exists():
                shutil.rmtree(stage)
    for directory in [final, *final.rglob('*')]:
        directory.chmod(0o755 if directory.is_dir() else 0o644)
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
    archive_build(Path(sys.argv[1]), Path(sys.argv[2]))
