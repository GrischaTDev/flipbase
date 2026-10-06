#!/usr/bin/env python3
"""Provisioniert den lokalen Meldezugang nach der freigegebenen Datenbankmigration."""

import base64
import hashlib
import hmac
import os
from pathlib import Path
import secrets
import subprocess
import sys


def provision_statement(password):
    # Keine Klartextpasswörter in SQL: Auch Datenbank-Auditlogs sollen nur den
    # SCRAM-Verifier erhalten. Hexpasswörter benötigen keine SASL-Normalisierung.
    if len(password) != 64 or any(character not in "0123456789abcdef" for character in password):
        raise ValueError("Ungültiges Meldepasswort.")
    salt = secrets.token_bytes(16)
    salted_password = hashlib.pbkdf2_hmac("sha256", password.encode("ascii"), salt, 4096)
    client_key = hmac.digest(salted_password, b"Client Key", "sha256")
    stored_key = hashlib.sha256(client_key).digest()
    server_key = hmac.digest(salted_password, b"Server Key", "sha256")
    salt_base64 = base64.b64encode(salt).decode("ascii")
    stored_key_base64 = base64.b64encode(stored_key).decode("ascii")
    server_key_base64 = base64.b64encode(server_key).decode("ascii")
    verifier = f"SCRAM-SHA-256$4096:{salt_base64}${stored_key_base64}:{server_key_base64}"
    return f"""
do $$
begin
    if to_regprocedure('public.report_server_storage(bigint,bigint,bigint)') is null then
        raise exception 'Die Speicher-Migration fehlt';
    end if;
    if not exists (select 1 from pg_roles where rolname = 'flipbase_storage_reporter') then
        create role flipbase_storage_reporter nologin;
    end if;
    if exists (
        select 1 from pg_auth_members
        where member = 'flipbase_storage_reporter'::regrole
    ) then
        raise exception 'Der Meldezugang besitzt unerwartete Rollenmitgliedschaften';
    end if;
end;
$$;
alter role flipbase_storage_reporter with login noinherit nosuperuser
    nocreatedb nocreaterole noreplication nobypassrls connection limit 1 password '{verifier}';
alter role flipbase_storage_reporter set statement_timeout = '10s';
alter role flipbase_storage_reporter set idle_in_transaction_session_timeout = '10s';
alter role flipbase_storage_reporter set search_path = pg_catalog;
grant connect on database postgres to flipbase_storage_reporter;
grant usage on schema public to flipbase_storage_reporter;
grant execute on function public.report_server_storage(bigint,bigint,bigint)
    to flipbase_storage_reporter;
"""


def install_file(source, target, mode):
    subprocess.run(["install", "-m", mode, "-o", "root", "-g", "root", str(source), str(target) + ".next"], check=True)
    os.replace(str(target) + ".next", target)


def install_monitor():
    if os.geteuid() != 0:
        raise ValueError("Die Einrichtung benötigt Rootrechte.")
    if not Path("/usr/bin/psql").is_file():
        raise ValueError("Voraussetzung fehlt: postgresql-client installieren; danach Einrichtung erneut ausführen.")
    source_directory = Path(__file__).resolve().parent
    source_names = ["report-server-storage.py", "flipbase-server-storage.service", "flipbase-server-storage.timer"]
    for name in source_names:
        source = source_directory / name
        if source.is_symlink() or source.stat().st_uid != 0 or source.stat().st_mode & 0o022:
            raise ValueError("Installationsdateien müssen Root gehören und schreibgeschützt sein.")

    # Keine konkurrierende Meldung während eines bewusst erneuerten Passworts.
    subprocess.run(["systemctl", "stop", "flipbase-server-storage.timer", "flipbase-server-storage.service"], capture_output=True)
    password = secrets.token_hex(32)
    subprocess.run(
        ["docker", "exec", "-i", "supabase-db", "psql", "-X", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-q"],
        input=provision_statement(password), text=True, capture_output=True, check=True, timeout=30,
    )
    credential_directory = Path("/etc/flipbase")
    credential_directory.mkdir(mode=0o700, exist_ok=True)
    credential_path = credential_directory / "server-storage.pg_service.conf"
    temporary_path = credential_path.with_suffix(".next")
    descriptor = os.open(temporary_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        with os.fdopen(descriptor, "w") as credential:
            credential.write(
                "[flipbase_storage]\nhost=127.0.0.1\nport=5432\ndbname=postgres\n"
                f"user=flipbase_storage_reporter\npassword={password}\n"
                "connect_timeout=5\nsslmode=prefer\napplication_name=flipbase-storage-monitor\n"
            )
        os.replace(temporary_path, credential_path)
    finally:
        temporary_path.unlink(missing_ok=True)
    install_file(source_directory / source_names[0], Path("/opt/flipbase/report-server-storage.py"), "644")
    for name in source_names[1:]:
        install_file(source_directory / name, Path("/etc/systemd/system") / name, "644")
    subprocess.run(["systemctl", "daemon-reload"], check=True)
    subprocess.run(["systemctl", "start", "flipbase-server-storage.service"], check=True)
    subprocess.run(["systemctl", "enable", "--now", "flipbase-server-storage.timer"], check=True)
    print("Lokale Speichermeldung eingerichtet und erste Meldung erfolgreich.")


if __name__ == "__main__":
    try:
        install_monitor()
    except (OSError, ValueError, subprocess.SubprocessError) as error:
        reason = str(error) if isinstance(error, ValueError) else type(error).__name__
        print(f"Einrichtung der Speichermeldung abgebrochen: {reason}.", file=sys.stderr)
        sys.exit(1)
