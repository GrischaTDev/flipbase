#!/usr/bin/env python3
"""Einmaliger, getrennter Bootstrap für den begrenzten Marketplace-SSH-Zugang."""

import argparse
import base64
import contextlib
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import stat
import sys
import tempfile
import urllib.request


BASE_DIR = Path("/opt/flipbase-marketplace")
BOOTSTRAP_DIR = BASE_DIR / "access-bootstrap"
COMMAND_DIR = BASE_DIR / "command-v1"
SSH_DIR = Path("/root/.ssh")
AUTHORIZED_KEYS = SSH_DIR / "authorized_keys"
HOST_KEY = Path("/etc/ssh/ssh_host_ed25519_key.pub")
GLOBAL_LOCK = Path("/opt/flipbase/deploy.lock")
TRUST_ROOT = Path("/")
OWNER_UID = 0
FILES = ("marketplace-deploy.py", "marketplace-rollout.py", "marketplace-deploy-key.pub")
LIMITS = {FILES[0]: 262144, FILES[1]: 262144, FILES[2]: 1024}
SOURCE = "https://raw.githubusercontent.com/grischatdev/flipbase/"


class InstallError(Exception):
    """Nur feste Meldungen ohne fremde Dateiinhalte ausgeben."""


def require(condition, message):
    if not condition:
        raise InstallError(message)


def trusted(path, *, directory=False, private=False):
    require(path.is_absolute() and path.resolve() == path, "Symlink oder uneindeutiger Pfad erkannt.")
    require(path == TRUST_ROOT or TRUST_ROOT in path.parents, "Pfad außerhalb des vertrauenswürdigen Wurzelverzeichnisses.")
    for item in (path, *path.parents):
        info = item.lstat()
        require(info.st_uid == OWNER_UID and not info.st_mode & 0o022, "Pfad ist nicht rootgeschützt.")
        if item == TRUST_ROOT:
            break
    info = path.lstat()
    require(stat.S_ISDIR(info.st_mode) if directory else stat.S_ISREG(info.st_mode), "Unerwarteter Dateityp.")
    require(directory or info.st_nlink == 1, "Mehrfach verknüpfte Datei abgewiesen.")
    require(not private or not info.st_mode & 0o077, "Private Bootstrap-Dateirechte erforderlich.")
    return path


def private_directory(path):
    trusted(path.parent, directory=True)
    path.mkdir(mode=0o700, exist_ok=True)
    return trusted(path, directory=True, private=True)


def read_file(path, limit, *, private=True):
    trusted(path, private=private)
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(fd, "rb") as handle:
        info = os.fstat(handle.fileno())
        require(stat.S_ISREG(info.st_mode) and info.st_nlink == 1 and info.st_uid == OWNER_UID
                and not info.st_mode & 0o022 and (not private or not info.st_mode & 0o077), "Dateirechte wurden verändert.")
        data = handle.read(limit + 1)
    require(len(data) <= limit, "Datei überschreitet die feste Größenbegrenzung.")
    return data


def sync_directory(path):
    fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def write_file(path, data):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, "wb") as handle:
        handle.write(data)
        handle.flush()
        os.fsync(handle.fileno())


@contextlib.contextmanager
def installation_lock():
    require(os.geteuid() == 0, "Die einmalige Einrichtung benötigt root.")
    trusted(BASE_DIR, directory=True)
    trusted(GLOBAL_LOCK.parent, directory=True)
    fd = os.open(GLOBAL_LOCK, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    try:
        info = os.fstat(fd)
        require(stat.S_ISREG(info.st_mode) and info.st_nlink == 1 and info.st_uid == OWNER_UID
                and not info.st_mode & 0o022, "Deployment-Lock ist nicht rootgeschützt.")
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise InstallError("Ein anderer Deploymentbefehl hält den Host-Lock.") from None
        yield
    finally:
        os.close(fd)


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, response, code, message, headers, new_url):
        raise InstallError("Quelldownload wurde unerwartet umgeleitet.")


def download(commit, name):
    url = SOURCE + commit + "/deploy/" + name
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
    with opener.open(url, timeout=30) as response:
        require(response.status == 200 and response.geturl() == url, "Quelldownload nicht eindeutig bestätigt.")
        data = response.read(LIMITS[name] + 1)
    require(0 < len(data) <= LIMITS[name], "Quelldownload leer oder zu groß.")
    return data


def public_key(data):
    try:
        text = data.decode("ascii").removesuffix("\n")
        match = re.fullmatch(r"ssh-ed25519 ([A-Za-z0-9+/]{68})(?: [A-Za-z0-9_.@-]{1,100})?", text)
        require(match is not None, "Genau ein optionsfreier Ed25519-Public-Key erforderlich.")
        blob = base64.b64decode(match[1], validate=True)
        require(len(blob) == 51 and blob[:19] == b"\x00\x00\x00\x0bssh-ed25519\x00\x00\x00\x20", "Ungültiges Ed25519-Schlüsselformat.")
        fingerprint = "SHA256:" + base64.b64encode(hashlib.sha256(blob).digest()).decode().rstrip("=")
        return match[1], fingerprint
    except (ValueError, UnicodeError):
        raise InstallError("Ungültiger öffentlicher Schlüssel.") from None


def encoded_json(value):
    return (json.dumps(value, sort_keys=True, separators=(",", ":")) + "\n").encode()


def manifest_for(commit, files):
    hashes = {name: hashlib.sha256(files[name]).hexdigest() for name in FILES}
    return {"version": 1, "commit": commit, "files": hashes,
            "bundle_id": hashlib.sha256(encoded_json(hashes)).hexdigest(),
            "key_fingerprint": public_key(files[FILES[2]])[1]}


def exact_directory(path, files):
    trusted(path, directory=True, private=True)
    require({item.name for item in path.iterdir()} == set(files), "Bundle enthält unerwartete oder fehlende Dateien.")
    for name, data in files.items():
        require(read_file(path / name, max(len(data), 8192)) == data, "Vorhandenes Bundle wurde verändert.")


def publish_directory(parent, name, files):
    target = parent / name
    if target.exists() or target.is_symlink():
        exact_directory(target, files)
        return target
    staging = Path(tempfile.mkdtemp(prefix=".access-", dir=parent))
    try:
        for filename, data in files.items():
            write_file(staging / filename, data)
        exact_directory(staging, files)
        sync_directory(staging)
        require(not target.exists() and not target.is_symlink(), "Bundleziel wurde zwischenzeitlich angelegt.")
        os.rename(staging, target)
        sync_directory(parent)
    finally:
        if staging.exists():
            shutil.rmtree(staging)
    return target


def load_prepared(commit):
    path = BOOTSTRAP_DIR / commit
    trusted(path, directory=True, private=True)
    files = {name: read_file(path / name, LIMITS[name]) for name in FILES}
    manifest = manifest_for(commit, files)
    files["manifest.json"] = encoded_json(manifest)
    exact_directory(path, files)
    return manifest, files


def forced_command(bundle_id):
    return "/usr/bin/python3 -I -B " + str(COMMAND_DIR / bundle_id / FILES[0])


def authorized_key_update(original, key, command):
    blob, _ = public_key(key)
    line = 'restrict,command="' + command + '" ssh-ed25519 ' + blob + ' flipbase-marketplace-deploy-v1'
    try:
        matches = [item for item in original.decode("utf-8").splitlines()
                   if not item.lstrip().startswith("#") and blob in item.split()]
    except UnicodeError:
        raise InstallError("authorized_keys ist nicht eindeutig lesbar.") from None
    if matches:
        require(matches == [line], "Schlüssel bereits mit anderem Befehl, anderen Optionen oder mehrfach vorhanden.")
        return original
    return original + (b"\n" if original and not original.endswith(b"\n") else b"") + line.encode() + b"\n"


def update_authorized_keys(original, updated):
    if original == updated:
        return
    fd, filename = tempfile.mkstemp(prefix=".marketplace-key-", dir=SSH_DIR)
    temporary = Path(filename)
    try:
        with os.fdopen(fd, "wb") as handle:
            handle.write(updated)
            handle.flush()
            os.fsync(handle.fileno())
        current = read_file(AUTHORIZED_KEYS, 1048576, private=False) if AUTHORIZED_KEYS.exists() else b""
        require(not AUTHORIZED_KEYS.is_symlink() and current == original, "authorized_keys wurde zwischenzeitlich verändert.")
        os.replace(temporary, AUTHORIZED_KEYS)
        sync_directory(SSH_DIR)
    finally:
        if temporary.exists():
            temporary.unlink()


def show_summary(manifest, installed=False):
    print("Commit: " + manifest["commit"])
    print("Bundle: " + manifest["bundle_id"])
    print("Deploy-Key: " + manifest["key_fingerprint"])
    print("Forced command: " + forced_command(manifest["bundle_id"]))
    print("Zugang eingerichtet." if installed else "Nur vorbereitet; noch keine SSH-Berechtigung geändert.")
    if HOST_KEY.exists():
        try:
            print("SSH-Hostkey: " + public_key(read_file(HOST_KEY, 1024, private=False))[1])
        except (InstallError, OSError):
            print("SSH-Hostkey: nicht ermittelt; separat über die bestehende Konsole prüfen.")


def prepare(commit):
    with installation_lock():
        private_directory(BOOTSTRAP_DIR)
        if (BOOTSTRAP_DIR / commit).exists() or (BOOTSTRAP_DIR / commit).is_symlink():
            manifest, _ = load_prepared(commit)
        else:
            files = {name: download(commit, name) for name in FILES}
            manifest = manifest_for(commit, files)
            files["manifest.json"] = encoded_json(manifest)
            publish_directory(BOOTSTRAP_DIR, commit, files)
        show_summary(manifest)


def install(commit):
    with installation_lock():
        manifest, files = load_prepared(commit)
        private_directory(SSH_DIR)
        original = read_file(AUTHORIZED_KEYS, 1048576, private=False) if AUTHORIZED_KEYS.exists() else b""
        require(not AUTHORIZED_KEYS.is_symlink(), "authorized_keys darf kein Symlink sein.")
        updated = authorized_key_update(original, files[FILES[2]], forced_command(manifest["bundle_id"]))
        private_directory(COMMAND_DIR)
        publish_directory(COMMAND_DIR, manifest["bundle_id"], files)
        update_authorized_keys(original, updated)
        require(read_file(AUTHORIZED_KEYS, 1048576, private=False) == updated, "Installierter Schlüsselstand nicht bestätigt.")
        show_summary(manifest, installed=True)


def main(argv=None):
    parser = argparse.ArgumentParser(description="Begrenzten Marketplace-SSH-Zugang einmalig einrichten")
    parser.add_argument("command", choices=("prepare", "install"))
    parser.add_argument("commit")
    args = parser.parse_args(argv)
    try:
        require(re.fullmatch(r"[0-9a-f]{40}", args.commit) is not None, "Vollständiger Commit mit 40 kleinen Hexzeichen erforderlich.")
        {"prepare": prepare, "install": install}[args.command](args.commit)
        return 0
    except InstallError as error:
        print("ABBRUCH: " + str(error), file=sys.stderr)
    except (Exception, KeyboardInterrupt):
        print("ABBRUCH: Bootstrap nicht abgeschlossen; vorbereitete Dateien und Schlüsselstand prüfen.", file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())
