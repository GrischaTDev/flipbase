#!/usr/bin/env python3
"""Dauerhafter, begrenzter SSH-Einstieg für Marketplace-Status und geprüfte Releases."""

import contextlib
import importlib.util
import json
import os
from pathlib import Path
import signal
import stat
import sys
import tempfile


BASE_DIR = Path("/opt/flipbase-marketplace")
COMMANDS = frozenset(("marketplace-status-v1", "marketplace-deploy-v1"))
MAX_REQUEST_BYTES = 4096
REQUEST_TIMEOUT_SECONDS = 10


class DeploymentError(Exception):
    """Feste Fehlermeldungen ohne fremde Eingaben oder Prozessausgaben."""


def require(condition, message):
    if not condition:
        raise DeploymentError(message)


def trusted_file(path):
    require(path.is_absolute() and path.resolve() == path and BASE_DIR in path.parents,
            "Deploymentdatei liegt außerhalb des installierten Bundles.")
    for item in (path, *path.parents):
        info = item.lstat()
        require(info.st_uid == 0 and not info.st_mode & 0o022,
                "Installiertes Deploymentbundle ist nicht rootgeschützt.")
    require(stat.S_ISREG(path.stat().st_mode), "Installierte Deploymentdatei ist keine reguläre Datei.")
    return path


def load_engine():
    # Das vollständige versionierte Bundle wird installiert, ohne veränderbare
    # Symlinks oder Module aus dem Arbeitsverzeichnis in den SSH-Pfad aufzunehmen.
    entrypoint = trusted_file(Path(__file__).absolute())
    source = trusted_file(entrypoint.with_name("marketplace-rollout.py"))
    spec = importlib.util.spec_from_file_location("flipbase_marketplace_rollout", source)
    require(spec is not None and spec.loader is not None, "Installierter Rolloutbaustein fehlt.")
    engine = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(engine)
    return engine


def unique_object(pairs):
    value = {}
    for key, item in pairs:
        require(key not in value, "Doppelte JSON-Felder sind nicht zulässig.")
        value[key] = item
    return value


def parse_request(payload):
    require(isinstance(payload, bytes) and 0 < len(payload) <= MAX_REQUEST_BYTES,
            "Release-Manifest fehlt oder überschreitet 4096 Bytes.")
    try:
        return json.loads(payload.decode("utf-8"), object_pairs_hook=unique_object)
    except (ValueError, UnicodeError, RecursionError):
        raise DeploymentError("Release-Manifest ist kein gültiges UTF-8-JSON.") from None


def read_request(stream):
    def timeout(_number, _frame):
        raise DeploymentError("Release-Manifest wurde nicht rechtzeitig vollständig übertragen.")

    previous_handler = signal.signal(signal.SIGALRM, timeout)
    previous_timer = signal.setitimer(signal.ITIMER_REAL, REQUEST_TIMEOUT_SECONDS)
    try:
        return parse_request(stream.read(MAX_REQUEST_BYTES + 1))
    finally:
        signal.setitimer(signal.ITIMER_REAL, *previous_timer)
        signal.signal(signal.SIGALRM, previous_handler)


@contextlib.contextmanager
def clean_environment():
    require(not any(key.startswith(("DOCKER_", "COMPOSE_")) for key in os.environ),
            "Docker- oder Compose-Umgebungsänderungen sind nicht zulässig.")
    previous = dict(os.environ)
    # Leere, kurzlebige Registrykonfiguration: bestehende Zugangsdaten nicht lesen.
    with tempfile.TemporaryDirectory(prefix="flipbase-marketplace-ssh-", dir="/run") as directory:
        os.chmod(directory, 0o700)
        os.environ.clear()
        os.environ.update({
            "PATH": "/usr/bin:/bin", "HOME": "/root", "LANG": "C.UTF-8",
            "LC_ALL": "C.UTF-8", "DOCKER_CONFIG": directory,
        })
        try:
            yield
        finally:
            os.environ.clear()
            os.environ.update(previous)


def main(argv=None):
    engine = None
    try:
        arguments = sys.argv[1:] if argv is None else argv
        require(not arguments, "Der SSH-Einstieg akzeptiert keine Programmargumente.")
        command = os.environ.get("SSH_ORIGINAL_COMMAND", "")
        require(command in COMMANDS, "Nicht erlaubter SSH-Befehl.")
        require(os.geteuid() == 0, "Der installierte Deploymentbefehl benötigt root.")
        os.umask(0o077)
        engine = load_engine()
        manifest = engine.validate_manifest(read_request(sys.stdin.buffer)) if command == "marketplace-deploy-v1" else None
        with clean_environment():
            require(engine.run_command(["docker", "context", "show"]).strip() == "default",
                    "Nur der lokale Docker-Standardkontext ist zulässig.")
            if command == "marketplace-status-v1":
                result = engine.deployment_status()
            else:
                result = engine.apply_release(manifest)
            print(json.dumps(result, sort_keys=True, separators=(",", ":")), flush=True)
        return 0
    except DeploymentError as error:
        print("ABBRUCH: " + str(error), file=sys.stderr)
        return 1
    except (Exception, KeyboardInterrupt) as error:
        # Auch Docker-, Import-, JSON- und Dateifehler können Geheimnisse enthalten.
        message = str(error) if engine is not None and isinstance(error, engine.RolloutError) else (
            "Deploymentprüfung fehlgeschlagen; Betreiber muss Status und Journal prüfen."
        )
        print("ABBRUCH: " + message, file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
