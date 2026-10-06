#!/usr/bin/env python3
"""Meldet nur die Größe und Belegung der Rootpartition über einen begrenzten DB-Zugang."""

import os
import subprocess
import sys


def measure_storage():
    filesystem = os.statvfs("/")
    return (
        filesystem.f_blocks * filesystem.f_frsize,
        (filesystem.f_blocks - filesystem.f_bfree) * filesystem.f_frsize,
        max(0, filesystem.f_bavail) * filesystem.f_frsize,
    )


def report_storage():
    total_bytes, used_bytes, available_bytes = measure_storage()
    if total_bytes <= 0 or min(used_bytes, available_bytes) < 0 or used_bytes + available_bytes > total_bytes:
        raise ValueError("Ungültige Partitionsmessung.")
    # Ausschließlich gemessene Ganzzahlen gelangen ins SQL; Zugangsdaten liest
    # libpq aus dem von Systemd bereitgestellten Credential, nie aus Argumenten.
    statement = (
        "select public.report_server_storage("
        f"{total_bytes}, {used_bytes}, {available_bytes});\n"
    )
    subprocess.run(
        ["/usr/bin/psql", "-X", "--no-password", "--dbname=service=flipbase_storage",
         "--set=ON_ERROR_STOP=1", "--quiet"],
        input=statement,
        text=True,
        capture_output=True,
        check=True,
        timeout=15,
    )
    print("Server-Speicherstand gemeldet.")


if __name__ == "__main__":
    try:
        report_storage()
    except (OSError, ValueError, subprocess.SubprocessError):
        # Verbindungsfehler können Zugangsdaten enthalten, deshalb keine Rohausgabe.
        print("Server-Speicherstand konnte nicht gemeldet werden!", file=sys.stderr)
        sys.exit(1)
