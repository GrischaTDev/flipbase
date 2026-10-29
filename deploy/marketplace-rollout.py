#!/usr/bin/env python3
"""Eng begrenzter, wiederholbar prüfbarer Marketplace-Rollout für 8f9a81a."""

import argparse
import contextlib
import copy
import datetime
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys
import tempfile
import time
import urllib.request


RELEASE = "8f9a81ac02556daf0f7db13b4169c76f703c0d15"
RUNTIME_PATH = "/tools/flipbase-extension/vinted-listing-runtime.js"
RUNTIME_SHA256 = "35664496128a85590a98a13cf0b7aceaa0cc9ef1c6888caa32a2076ddf90df83"
WORKER_IMAGE = "ghcr.io/grischatdev/flipbase-marketplace-worker@sha256:08025a4e1155996cfb5295be312a749843adbe09f630944ee4bfef34c962be18"
BROKER_IMAGE = "ghcr.io/grischatdev/flipbase-chromium-broker@sha256:c59169e0cc01c664bf02a05df140e3ceb94bed1db0e651968bcbf012a3d92dd0"
SESSION_IMAGE = "ghcr.io/grischatdev/flipbase-chromium-session@sha256:6292dee02bc7c8d6e1e29c34c654cbc0c9b6d33d7b582f8e72b5314bf226960c"
SERVICES = ("marketplace-worker", "chromium-host-broker")
IMAGES = (WORKER_IMAGE, BROKER_IMAGE, SESSION_IMAGE)
PROJECT = "flipbase-chromium-pilot"
BASE_DIR = Path("/opt/flipbase-marketplace")
STATE_DIR = BASE_DIR / "rollout-8f9a81a"
GLOBAL_LOCK = Path("/opt/flipbase/deploy.lock")
HEALTH_URL = "https://app.flipbase.de/marketplace-browser/healthz"
COUNT_KEYS = (
    "listingJobs", "operations", "sessions", "messages", "favorites",
    "negotiations", "setups",
)
PHASES = (
    "preparing", "prepared", "worker_stop_started", "worker_stopped",
    "broker_stop_started", "broker_stopped", "start_started", "verifying", "verified",
)

# Keine RPCs: Ein konsistenter Nur-Lese-Schnappschuss, auch für alte unbekannte Jobs.
JOBS_SQL = """
begin isolation level repeatable read read only;
set local statement_timeout = '15s';
select json_build_object(
 'counts', json_build_object(
  'listingJobs',(select count(*) from public.marketplace_listing_jobs where state in ('queued','paused','claimed','writing','outcome_unknown')),
  'operations',(select count(*) from public.marketplace_operations where state in ('queued','running','outcome_unknown')),
  'sessions',(select count(*) from public.marketplace_browser_sessions where state in ('active','stopping')),
  'messages',(select count(*) from public.marketplace_local_message_outbox where execution_mode='cloud' and state in ('queued','claimed','sending','outcome_unknown')),
  'favorites',(select count(*) from public.marketplace_favorite_message_events where state in ('queued','claimed','sending','outcome_unknown') or offer_state in ('pending','claimed','sending','outcome_unknown')),
  'negotiations',(select count(*) from public.marketplace_negotiation_jobs where state in ('queued','claimed','sending','outcome_unknown')),
  'setups',(select count(*) from public.marketplace_cloud_setups where state not in ('completed','cancelled'))
 ),
 'runtime',coalesce((select json_build_object('live',expires_at>clock_timestamp(),
   'workerId',worker_id,'epoch',worker_epoch) from public.marketplace_worker_runtime where id=1),
   json_build_object('live',false)),
 'listingPermissionHash',(select md5(coalesce(string_agg(to_jsonb(p)::text,'' order by id),'')) from public.marketplace_listing_permissions p),
 'scheduleAuthorizationHash',(select md5(coalesce(string_agg(jsonb_build_array(
   workspace_id,connection_id,enabled,interval_minutes,authorization_version,activated_by,paused_reason)::text,
   '' order by connection_id),'')) from public.marketplace_sync_schedules),
 'draft',(select json_build_object('id',id,'revision',revision,'photos',cardinality(image_ids),
   'priceCents',content->>'priceCents','packageSizeId',content->>'packageSizeId',
   'contentHash',md5(content::text),'photoIdsHash',md5(to_jsonb(image_ids)::text))
   from public.marketplace_listing_drafts where id=11 and deleted_at is null),
 'draftBlocked',exists(select 1 from public.marketplace_listing_jobs where draft_id=11
   and (state in ('queued','paused','claimed','writing','outcome_unknown','confirmed') or external_id is not null)),
 'jobs',coalesce((select json_agg(j order by j.id desc) from (
   select job.id,job.draft_revision as revision,job.state,job.action,job.execution_mode as mode,job.error_code as error,
     job.external_id is not null as receipt,job.external_id,job.provider_state,
     job.verified_at is not null as verified,session.state as session_state,
     to_char(job.started_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') as started,
     to_char(job.finished_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') as finished,
     to_char(job.verified_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') as verified_at
   from public.marketplace_listing_jobs job
   left join public.marketplace_browser_sessions session on session.public_id=job.cloud_browser_session_id
   where job.draft_id=11 order by job.id desc limit 6
 ) j),'[]'::json),
 'outbox',coalesce((select json_agg(m order by m.created) from (
   select o.id,o.state,o.error_code as error,
     to_char(o.created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') as created,
     to_char(o.updated_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') as updated,
     o.cloud_browser_session_id as session_id,s.state as session_state,
     to_char(s.provider_stopped_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') as stopped,
     coalesce(o.lease_expires_at>clock_timestamp(),false) as lease_live,
     o.external_message_id is not null as receipt
   from public.marketplace_local_message_outbox o
   left join public.marketplace_browser_sessions s on s.public_id=o.cloud_browser_session_id
   where o.execution_mode='cloud' and o.state in ('queued','claimed','sending','outcome_unknown')
   order by o.created_at,o.id limit 2
 ) m),'[]'::json)
);
rollback;
"""


class RolloutError(Exception):
    """Nur feste, geheimnisfreie Meldungen an die Konsole geben."""


def require(condition, message):
    if not condition:
        raise RolloutError(message)


def run_command(args, *, input_text=None, timeout=60):
    try:
        result = subprocess.run(
            args, input=input_text, capture_output=True, text=True,
            timeout=timeout, check=False,
        )
    except subprocess.TimeoutExpired:
        raise RolloutError("Befehl hat Zeitgrenze erreicht; Journal und Host prüfen.") from None
    except OSError:
        raise RolloutError("Befehl konnte nicht gestartet werden.") from None
    require(result.returncode == 0, "Befehl fehlgeschlagen; keine Fehlerausgabe offengelegt.")
    return result.stdout


def parse_json(text):
    try:
        return json.loads(text)
    except (ValueError, TypeError):
        raise RolloutError("Ungültige JSON-Antwort; keine Zustandsannahme möglich.") from None


def fingerprint(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def validate_config(config):
    require(isinstance(config, dict), "Compose-Konfiguration fehlt.")
    require(config.get("name") == PROJECT, "Unbekanntes Compose-Projekt.")
    services = config.get("services")
    require(isinstance(services, dict) and set(services) == set(SERVICES), "Genau zwei bekannte Compose-Dienste erforderlich.")
    for service in SERVICES:
        item = services[service]
        require(isinstance(item, dict), "Ungültiger Compose-Dienst.")
        require(not any(key in item for key in ("build", "extends", "profiles")), "Konkurrierender Compose-Startpfad erkannt.")
        require(isinstance(item.get("image"), str) and bool(item["image"]), "Compose-Image fehlt.")
        environment = item.get("environment")
        require(isinstance(environment, dict), "Aufgelöste Compose-Umgebung erforderlich.")
        require(isinstance(environment.get("MARKETPLACE_CHROMIUM_IMAGE"), str), "Sitzungs-Image fehlt.")


def build_release_config(config):
    validate_config(config)
    result = copy.deepcopy(config)
    result["services"][SERVICES[0]]["image"] = WORKER_IMAGE
    result["services"][SERVICES[1]]["image"] = BROKER_IMAGE
    for service in SERVICES:
        result["services"][service]["environment"]["MARKETPLACE_CHROMIUM_IMAGE"] = SESSION_IMAGE
    return result


def assert_image_only_change(before, after):
    require(after == build_release_config(before), "Compose-Abweichung außerhalb der vier freigegebenen Imagefelder.")


def assert_preflight(snapshot, drained=False):
    require(isinstance(snapshot, dict), "Datenbank-Prüfung fehlt.")
    counts = snapshot.get("counts")
    require(isinstance(counts, dict) and set(counts) == set(COUNT_KEYS), "Unvollständige Auftragszähler.")
    for key in COUNT_KEYS:
        require(type(counts[key]) is int and counts[key] >= 0, "Ungültiger Auftragszähler.")
        require(counts[key] == 0, "Offene oder unbekannte Aufträge/Sitzungen sperren den Rollout.")
    runtime = snapshot.get("runtime")
    require(isinstance(runtime, dict) and type(runtime.get("live")) is bool, "Runtime-Lease nicht nachgewiesen.")
    if drained:
        require(runtime["live"] is False, "Worker-Runtime ist noch aktiv; Broker bleibt unverändert.")


def assert_stopped(container, broker=False):
    state = container.get("State", {})
    require(
        state.get("Status") == "exited" and state.get("Running") is False
        and state.get("OOMKilled") is False and state.get("Dead") is False
        and not state.get("Error") and type(state.get("ExitCode")) is int
        and state["ExitCode"] in ((0, 143) if broker else (0,)),
        "Container nicht sauber beendet; kein weiterer Stopp oder Start.",
    )


def trusted_path(path, *, directory=False, private=False):
    path = Path(path)
    require(path.is_absolute() and path.resolve() == path, "Pfad ist nicht eindeutig oder enthält einen Symlink.")
    require(path == BASE_DIR or BASE_DIR in path.parents, "Compose-Pfad liegt außerhalb des freigegebenen Verzeichnisses.")
    for parent in (path, *path.parents):
        info = parent.lstat()
        require(info.st_uid == 0 and not info.st_mode & 0o022, "Pfad ist nicht rootgeschützt.")
    info = path.lstat()
    require(stat.S_ISDIR(info.st_mode) if directory else stat.S_ISREG(info.st_mode), "Unerwarteter Dateityp.")
    if private:
        require(not info.st_mode & 0o077, "Rollout-Datei muss ausschließlich root zugänglich sein.")
    return path


def inspect_container(container_id):
    require(bool(re.fullmatch(r"[0-9a-f]{64}", container_id)), "Ungültige Containerkennung.")
    result = parse_json(run_command(["docker", "inspect", container_id]))
    require(isinstance(result, list) and len(result) == 1 and result[0].get("Id") == container_id, "Container nicht eindeutig gefunden.")
    return result[0]


def service_container(service):
    ids = run_command(["docker", "ps", "--all", "--quiet", "--no-trunc", "--filter", "label=com.docker.compose.service=" + service]).split()
    require(len(ids) == 1, "Fehlender Dienst oder mehrere Compose-Projekte erkannt.")
    return inspect_container(ids[0])


def discover_active():
    worker, broker = (service_container(service) for service in SERVICES)
    require(worker.get("Name") == "/flipbase-marketplace-worker", "Unbekannter Worker-Container.")
    contexts = []
    for service, container in zip(SERVICES, (worker, broker)):
        labels = container.get("Config", {}).get("Labels", {})
        require(labels.get("com.docker.compose.service") == service, "Compose-Dienstlabel stimmt nicht.")
        require(labels.get("com.docker.compose.project") == PROJECT, "Unbekanntes Compose-Projekt.")
        source = labels.get("com.docker.compose.project.config_files", "")
        workdir = labels.get("com.docker.compose.project.working_dir", "")
        require(isinstance(source, str) and source and not any(c in source for c in ",\n\r"), "Genau eine aktive Compose-Datei erforderlich.")
        require(isinstance(workdir, str) and workdir, "Compose-Arbeitsverzeichnis fehlt.")
        trusted_path(source)
        trusted_path(workdir, directory=True)
        contexts.append((source, workdir))
    require(contexts[0] == contexts[1], "Worker und Broker verwenden verschiedene Compose-Dateien.")
    return {"project": PROJECT, "source": contexts[0][0], "working_dir": contexts[0][1], "worker": worker, "broker": broker}


def compose_command(context, source=None):
    return ["docker", "compose", "--project-directory", context["working_dir"], "--project-name", PROJECT, "--file", str(source or context["source"])]


def read_compose(context):
    result = parse_json(run_command(compose_command(context) + ["config", "--format", "json"]))
    validate_config(result)
    return result


def assert_config_hashes(context):
    for service, key in zip(SERVICES, ("worker", "broker")):
        output = run_command(compose_command(context) + ["config", "--hash", service]).split()
        require(len(output) == 2 and output[0] == service and bool(re.fullmatch(r"[0-9a-f]{64}", output[1])), "Compose unterstützt keinen eindeutigen Service-Hash.")
        actual = context[key].get("Config", {}).get("Labels", {}).get("com.docker.compose.config-hash")
        require(actual == output[1], "Aktive Container weichen von ihrer Compose-Datei ab.")


def session_containers():
    ids = run_command(["docker", "ps", "--all", "--quiet", "--no-trunc", "--filter", "label=de.flipbase.chromium.role=session"]).split()
    require(all(re.fullmatch(r"[0-9a-f]{64}", item) for item in ids), "Browserzustand nicht lesbar.")
    return ids


def read_jobs():
    result = parse_json(run_command([
        "docker", "exec", "-i", "supabase-db", "psql", "-X", "-q", "-A", "-t",
        "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres",
    ], input_text=JOBS_SQL, timeout=30))
    require(isinstance(result, dict), "Datenbank-Prüfung nicht verfügbar.")
    return result


def authorization_hashes(snapshot):
    result = {}
    for key in ("listingPermissionHash", "scheduleAuthorizationHash"):
        value = snapshot.get(key)
        require(isinstance(value, str) and bool(re.fullmatch(r"[0-9a-f]{32}", value)), "Berechtigungsstand nicht nachgewiesen.")
        result[key] = value
    return result


def runtime_identity(snapshot):
    runtime = snapshot.get("runtime", {})
    require(isinstance(runtime, dict), "Worker-Runtime fehlt.")
    require(isinstance(runtime.get("workerId"), str) and bool(re.fullmatch(
        r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", runtime["workerId"])),
        "Workerkennung der Runtime ist nicht nachgewiesen.")
    require(type(runtime.get("epoch")) is int and runtime["epoch"] > 0, "Worker-Epoch ist nicht nachgewiesen.")
    return {"workerId": runtime["workerId"], "epoch": runtime["epoch"]}


def fresh_preflight(context, *, drained=False, expected=None, expected_runtime=None):
    assert_config_hashes(context)
    require(not session_containers(), "Browsercontainer vorhanden; keine automatische Bereinigung.")
    snapshot = read_jobs()
    assert_preflight(snapshot, drained=drained)
    if not drained:
        require(snapshot["runtime"]["live"] is True, "Ausgangsworker besitzt keine aktive Runtime-Lease.")
    if expected is not None:
        require(authorization_hashes(snapshot) == expected, "Freigaben oder Synchronisationsregeln haben sich geändert.")
    if expected_runtime is not None:
        require(runtime_identity(snapshot) == expected_runtime, "Worker-Runtime wurde zwischenzeitlich ersetzt.")
    return snapshot


def ensure_state_dir():
    require(os.geteuid() == 0, "Der Befehl benötigt die bestehende root-Konsole.")
    trusted_path(BASE_DIR, directory=True)
    STATE_DIR.mkdir(mode=0o700, exist_ok=True)
    trusted_path(STATE_DIR, directory=True, private=True)


@contextlib.contextmanager
def rollout_lock():
    ensure_state_dir()
    # Derselbe Lock wie das Webdeployment; keine parallele Migration beim Drain.
    require(GLOBAL_LOCK.parent.is_dir() and not GLOBAL_LOCK.parent.is_symlink(), "Vorhandenes Deploymentverzeichnis fehlt.")
    parent = GLOBAL_LOCK.parent.stat()
    require(parent.st_uid == 0 and not parent.st_mode & 0o022, "Deploymentverzeichnis ist nicht rootgeschützt.")
    fd = os.open(GLOBAL_LOCK, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    try:
        info = os.fstat(fd)
        require(stat.S_ISREG(info.st_mode) and info.st_uid == 0 and not info.st_mode & 0o022, "Deployment-Lock ist nicht rootgeschützt.")
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise RolloutError("Ein anderer Deploymentbefehl hält den Host-Lock.") from None
        yield
    finally:
        os.close(fd)


def write_json(name, value):
    target = STATE_DIR / name
    if target.exists() or target.is_symlink():
        trusted_path(target, private=True)
    fd, temporary = tempfile.mkstemp(prefix=".rollout-", dir=STATE_DIR)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(value, handle, indent=2, sort_keys=True)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, target)
        directory = os.open(STATE_DIR, os.O_DIRECTORY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def read_json(name):
    return parse_json(trusted_path(STATE_DIR / name, private=True).read_text(encoding="utf-8"))


def read_journal():
    if not (STATE_DIR / "journal.json").exists():
        require(not (STATE_DIR / "journal.json").is_symlink(), "Ungültiger Journalpfad.")
        return None
    result = read_json("journal.json")
    require(isinstance(result, dict) and result.get("release") == RELEASE and result.get("phase") in PHASES, "Journal ungültig; manuellen Zustand prüfen.")
    return result


def write_journal(phase):
    require(phase in PHASES, "Unbekannte Rollout-Phase.")
    previous = read_journal()
    history = previous.get("history", []) if previous else []
    event = {"phase": phase, "at": datetime.datetime.now(datetime.timezone.utc).isoformat()}
    write_json("journal.json", {"release": RELEASE, **event, "history": history + [event]})


def escape_compose_dollars(value):
    # Aufgelöste Geheimnisse dürfen beim erneuten Lesen keine zweite Expansion erfahren.
    if isinstance(value, str):
        return value.replace("$", "$$")
    if isinstance(value, list):
        return [escape_compose_dollars(item) for item in value]
    if isinstance(value, dict):
        return {key: escape_compose_dollars(item) for key, item in value.items()}
    return value


def image_id(image):
    result = parse_json(run_command(["docker", "image", "inspect", image]))
    require(isinstance(result, list) and len(result) == 1, "Image nicht eindeutig vorhanden.")
    item = result[0]
    require(item.get("Os") == "linux" and item.get("Architecture") == "amd64", "Ungeprüfte Image-Plattform.")
    value = item.get("Id", "")
    require(bool(re.fullmatch(r"sha256:[0-9a-f]{64}", value)), "Imagekennung fehlt.")
    require(image in item.get("RepoDigests", []), "Unveränderlicher Image-Digest nicht bestätigt.")
    return value


def assert_runtime_output(output):
    parts = output.split()
    require(parts == [RUNTIME_SHA256, RUNTIME_PATH], "Runtime-Prüfsumme stimmt nicht mit dem geprüften Release überein.")


def check_image_runtime(image):
    assert_runtime_output(run_command([
        "docker", "run", "--rm", "--network", "none", "--read-only",
        "--cap-drop", "ALL", "--security-opt", "no-new-privileges:true",
        "--pids-limit", "32", "--memory", "128m", "--user", "1000:1000",
        "--entrypoint", "sha256sum", image, RUNTIME_PATH,
    ]))


def context_identity(context):
    return {"project": context["project"], "source": context["source"],
            "working_dir": context["working_dir"],
            "worker_id": context["worker"]["Id"], "broker_id": context["broker"]["Id"]}


def assert_running(context):
    for key in ("worker", "broker"):
        state = context[key].get("State", {})
        require(state.get("Status") == "running" and state.get("Running") is True
                and state.get("OOMKilled") is False and state.get("Dead") is False,
                "Beide Ausgangsdienste müssen eindeutig laufen.")


def prepare():
    with rollout_lock():
        require(read_journal() is None, "Rollout-Journal vorhanden; status oder verify verwenden.")
        require(not any(STATE_DIR.iterdir()), "Vorhandene Rollout-Dateien ohne Journal; manuellen Zustand prüfen.")
        context = discover_active()
        assert_running(context)
        baseline = read_compose(context)
        snapshot = fresh_preflight(context)
        require(snapshot["runtime"]["live"] is True, "Aktiver Ausgangsworker hat keine aktive Runtime-Lease.")
        runtime = runtime_identity(snapshot)
        permissions = authorization_hashes(snapshot)
        source_bytes = Path(context["source"]).read_bytes()
        require(context["source"] != str(STATE_DIR / "compose.release.json"), "Ziel-Compose ist bereits aktiv.")
        write_journal("preparing")
        write_json("baseline.json", baseline)
        write_json("compose.previous.json", escape_compose_dollars(baseline))
        previous_context = {**context, "source": str(STATE_DIR / "compose.previous.json")}
        require(read_compose(previous_context) == baseline, "Gesicherte Rückweg-Konfiguration verändert bestehende Werte.")
        target = build_release_config(baseline)
        write_json("compose.release.json", escape_compose_dollars(target))
        release_context = {**context, "source": str(STATE_DIR / "compose.release.json")}
        assert_image_only_change(baseline, read_compose(release_context))
        ids = {}
        for index, image in enumerate(IMAGES, 1):
            print("Image " + str(index) + "/3 laden und Runtime prüfen.", flush=True)
            run_command(["docker", "pull", image], timeout=1200)
            ids[image] = image_id(image)
            check_image_runtime(image)
        current = discover_active()
        require(context_identity(current) == context_identity(context), "Aktive Container wurden zwischenzeitlich geändert.")
        require(read_compose(current) == baseline and Path(current["source"]).read_bytes() == source_bytes, "Aktive Compose-Datei wurde zwischenzeitlich geändert.")
        fresh_preflight(current, expected=permissions, expected_runtime=runtime)
        write_json("plan.json", {
            "release": RELEASE, "context": context_identity(context),
            "source_sha256": hashlib.sha256(source_bytes).hexdigest(),
            "baseline_sha256": fingerprint(baseline), "target_sha256": fingerprint(target),
            "previous_file_sha256": hashlib.sha256((STATE_DIR / "compose.previous.json").read_bytes()).hexdigest(),
            "release_file_sha256": hashlib.sha256((STATE_DIR / "compose.release.json").read_bytes()).hexdigest(),
            "images": ids, "authorization": permissions, "runtime": runtime,
        })
        write_journal("prepared")
        print("Vorbereitet: drei geprüfte Images, ausschließlich vier Imagefelder geändert.")
        print("Noch kein Dienst gestoppt. Nächster Befehl: deploy")


def load_plan():
    plan = read_json("plan.json")
    require(isinstance(plan, dict) and plan.get("release") == RELEASE, "Releaseplan fehlt oder ist veraltet.")
    runtime_identity({"runtime": plan.get("runtime", {})})
    baseline = read_json("baseline.json")
    require(fingerprint(baseline) == plan.get("baseline_sha256"), "Gesicherte Ausgangskonfiguration wurde verändert.")
    require(fingerprint(build_release_config(baseline)) == plan.get("target_sha256"), "Releaseplan enthält eine fremde Zielkonfiguration.")
    target_file = trusted_path(STATE_DIR / "compose.release.json", private=True)
    require(hashlib.sha256(target_file.read_bytes()).hexdigest() == plan.get("release_file_sha256"), "Vorbereitete Compose-Datei wurde verändert.")
    context = plan.get("context", {})
    require(context.get("project") == PROJECT, "Projekt im Releaseplan ungültig.")
    trusted_path(context.get("source", ""))
    trusted_path(context.get("working_dir", ""), directory=True)
    previous_file = trusted_path(STATE_DIR / "compose.previous.json", private=True)
    require(hashlib.sha256(previous_file.read_bytes()).hexdigest() == plan.get("previous_file_sha256"), "Gesicherte Rückweg-Datei wurde verändert.")
    require(read_compose({**context, "source": str(previous_file)}) == baseline, "Gesicherte Rückweg-Konfiguration verändert bestehende Werte.")
    release_context = {**context, "source": str(target_file)}
    assert_image_only_change(baseline, read_compose(release_context))
    require(set(plan.get("images", {})) == set(IMAGES), "Image-Nachweise unvollständig.")
    for image in IMAGES:
        require(image_id(image) == plan["images"][image], "Vorbereitetes lokales Image wurde geändert.")
    return plan


def assert_original_context(context, plan):
    require(context_identity(context) == plan["context"], "Aktiver Compose-Stand ist nicht mehr der vorbereitete Stand.")
    require(hashlib.sha256(Path(context["source"]).read_bytes()).hexdigest() == plan["source_sha256"], "Aktive Compose-Datei wurde verändert.")
    require(fingerprint(read_compose(context)) == plan["baseline_sha256"], "Aufgelöste Ausgangskonfiguration wurde verändert.")


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, response, code, message, headers, new_url):
        raise RolloutError("Öffentliche Healthprüfung wurde unerwartet umgeleitet.")


def public_health():
    try:
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
        with opener.open(HEALTH_URL, timeout=15) as response:
            require(response.status == 200, "Öffentliche Healthprüfung fehlgeschlagen.")
            result = parse_json(response.read(65537))
        require(isinstance(result, dict) and result.get("ok") is True and result.get("apiVersion") == 2
                and result.get("readOnly") is False, "Öffentliche Worker-API meldet keinen gültigen Zustand.")
        return result
    except RolloutError:
        raise
    except Exception:
        raise RolloutError("Öffentliche Worker-API ist nicht erreichbar.") from None


def verify_release(plan):
    deadline = time.monotonic() + 120
    while True:
        context = discover_active()
        require(context["source"] == str(STATE_DIR / "compose.release.json")
                and context["working_dir"] == plan["context"]["working_dir"], "Aktive Dienste verwenden nicht die vorbereitete Release-Datei.")
        assert_running(context)
        health = context["worker"].get("State", {}).get("Health", {}).get("Status")
        if health == "healthy":
            break
        require(health == "starting" and time.monotonic() < deadline, "Worker-Health ist nicht healthy.")
        time.sleep(2)
    assert_config_hashes(context)
    require(fingerprint(read_compose(context)) == plan["target_sha256"], "Aktive Zielkonfiguration weicht vom Plan ab.")
    for key, image in (("worker", WORKER_IMAGE), ("broker", BROKER_IMAGE)):
        container = context[key]
        require(type(container.get("RestartCount")) is int and container["RestartCount"] == 0,
                "Neuer Container wurde bereits neu gestartet; keine saubere Startbestätigung.")
        require(container.get("Config", {}).get("Image") == image
                and container.get("Image") == plan["images"][image], "Laufender Container verwendet nicht das freigegebene Image.")
        assert_runtime_output(run_command(["docker", "exec", container["Id"], "sha256sum", RUNTIME_PATH]))
    check_image_runtime(SESSION_IMAGE)
    snapshot = fresh_preflight(context, expected=plan["authorization"])
    require(snapshot["runtime"]["live"] is True, "Neue Worker-Runtime besitzt noch keine aktive Lease.")
    runtime = runtime_identity(snapshot)
    require(runtime["epoch"] > plan["runtime"]["epoch"] and runtime["workerId"] != plan["runtime"]["workerId"],
            "Neuer Workerbesitzer mit erhöhter Epoch nicht bestätigt.")
    public_health()
    # Hash-/HTTP-Prüfungen dürfen einen zwischenzeitlichen Neustart nicht verdecken.
    final = discover_active()
    require(context_identity(final) == context_identity(context), "Container wurden während der Abschlussprüfung ersetzt.")
    assert_running(final)
    for key in ("worker", "broker"):
        require(type(final[key].get("RestartCount")) is int and final[key]["RestartCount"] == 0,
                "Container wurde während der Abschlussprüfung neu gestartet.")
    require(final["worker"].get("State", {}).get("Health", {}).get("Status") == "healthy", "Worker-Health ist nicht mehr healthy.")
    return final


def deploy():
    with rollout_lock():
        journal = read_journal()
        require(journal is not None and journal["phase"] == "prepared", "Kein unberührter vorbereiteter Rollout; unterbrochene Stopps niemals wiederholen.")
        plan = load_plan()
        context = discover_active()
        assert_running(context)
        assert_original_context(context, plan)
        fresh_preflight(context, expected=plan["authorization"], expected_runtime=plan["runtime"])
        write_journal("worker_stop_started")
        print("Worker geordnet stoppen; maximal 780 Sekunden.", flush=True)
        run_command(["docker", "stop", "--timeout", "780", context["worker"]["Id"]], timeout=810)
        context["worker"] = inspect_container(context["worker"]["Id"])
        assert_stopped(context["worker"])
        fresh_preflight(context, drained=True, expected=plan["authorization"], expected_runtime=plan["runtime"])
        write_journal("worker_stopped")
        write_journal("broker_stop_started")
        print("Broker stoppen; maximal 180 Sekunden.", flush=True)
        run_command(["docker", "stop", "--timeout", "180", context["broker"]["Id"]], timeout=210)
        context["broker"] = inspect_container(context["broker"]["Id"])
        assert_stopped(context["broker"], broker=True)
        fresh_preflight(context, drained=True, expected=plan["authorization"], expected_runtime=plan["runtime"])
        write_journal("broker_stopped")
        current = discover_active()
        assert_original_context(current, plan)
        assert_stopped(current["worker"])
        assert_stopped(current["broker"], broker=True)
        load_plan()
        fresh_preflight(current, drained=True, expected=plan["authorization"], expected_runtime=plan["runtime"])
        write_journal("start_started")
        run_command(compose_command(context, STATE_DIR / "compose.release.json") + [
            "up", "--detach", "--no-deps", "--no-build", "--pull", "never",
            "chromium-host-broker", "marketplace-worker",
        ], timeout=180)
        write_journal("verifying")
        verify_release(plan)
        write_journal("verified")
        print("Rollout verifiziert: Worker, Broker und Sitzungs-Runtime entsprechen 8f9a81a.")
        print("Beide RestartCount=0; neuer Workerbesitzer mit höherer Epoch bestätigt.")
        print("Freigaben und Regeln unverändert; keine Publikation ausgelöst.")


def verify():
    with rollout_lock():
        journal = read_journal()
        require(journal is not None and journal["phase"] in ("start_started", "verifying", "verified"), "Kein gestarteter Release zur Abschlussprüfung vorhanden.")
        verify_release(load_plan())
        if journal["phase"] != "verified":
            write_journal("verified")
        print("Verifiziert: drei Runtime-Prüfsummen, aktive Images, Lease und öffentliche API.")
        print("Beide RestartCount=0; neuer Workerbesitzer mit höherer Epoch bestätigt.")
        print("Keine offenen Jobs oder Browsercontainer; Freigaben unverändert.")


def safe_token(value):
    if value is None:
        return "-"
    text = str(value)
    return text if re.fullmatch(r"[a-zA-Z0-9_.:/-]{1,100}", text) else "unbekannt"


def numeric_token(value):
    return str(value) if type(value) in (int, str) and re.fullmatch(r"[0-9]{1,32}", str(value)) else "unbekannt"


def status():
    context = discover_active()
    assert_config_hashes(context)
    print("Releaseziel: " + RELEASE[:12])
    print("Compose: " + PROJECT)
    print("Datei: " + safe_token(context["source"]))
    for key in ("worker", "broker"):
        container = context[key]
        state = container.get("State", {})
        print(key + ": " + safe_token(state.get("Status")) + " " + container["Id"][:12])
        if state.get("Running") is True:
            output = run_command(["docker", "exec", container["Id"], "sha256sum", RUNTIME_PATH]).split()
            valid = len(output) == 2 and output[0] == RUNTIME_SHA256 and output[1] == RUNTIME_PATH
            print(key + " Runtime: " + ("Zielrelease" if valid else "anderer Stand"))
    snapshot = read_jobs()
    runtime = snapshot.get("runtime", {}).get("live")
    print("Runtime-Lease: " + ("aktiv" if runtime is True else "inaktiv" if runtime is False else "unbekannt"))
    print("Browsercontainer (auch beendet): " + str(len(session_containers())))
    journal = read_journal()
    print("Journal: " + (journal["phase"] if journal else "noch nicht vorbereitet"))


def jobs():
    snapshot = read_jobs()
    counts = snapshot.get("counts", {})
    for key in COUNT_KEYS:
        value = counts.get(key)
        print(key + ": " + (str(value) if type(value) is int and value >= 0 else "unbekannt"))
    draft = snapshot.get("draft")
    if isinstance(draft, dict):
        print("Draft 11: Revision " + numeric_token(draft.get("revision")) + ", Fotos " + numeric_token(draft.get("photos")))
        print("Preis-Cent: " + numeric_token(draft.get("priceCents")) + ", Paket-ID: " + numeric_token(draft.get("packageSizeId")))
    else:
        print("Draft 11: fehlt oder gelöscht")
    rows = snapshot.get("jobs", [])
    require(isinstance(rows, list), "Draft-Auftragsliste ungültig.")
    for row in rows[:6]:
        require(isinstance(row, dict), "Draft-Auftrag ungültig.")
        print("Job " + numeric_token(row.get("id")) + " r" + numeric_token(row.get("revision")) + " "
              + safe_token(row.get("state")) + " " + safe_token(row.get("error"))
              + " Beleg=" + ("ja" if row.get("receipt") is True else "nein"))
    outbox = snapshot.get("outbox", [])
    require(isinstance(outbox, list), "Outbox-Prüfung ungültig.")
    for row in outbox[:2]:
        require(isinstance(row, dict), "Outbox-Zustand ungültig.")
        print("Outbox " + safe_token(row.get("id")) + " " + safe_token(row.get("state")))
        print("Erstellt " + safe_token(row.get("created")) + " geändert " + safe_token(row.get("updated")))
        print("Session " + safe_token(row.get("session_id")) + " " + safe_token(row.get("session_state")))
        print("Stop " + safe_token(row.get("stopped")) + " Lease=" + ("live" if row.get("lease_live") is True else "nein")
              + " Beleg=" + ("ja" if row.get("receipt") is True else "nein") + " " + safe_token(row.get("error")))
    try:
        assert_preflight(snapshot)
    except RolloutError:
        print("Rollout: GESPERRT; keine automatische Job-/Lease-Reparatur.")
    else:
        print("Auftragszähler frei; Hostprüfung erfolgt zusätzlich bei prepare/deploy.")


def draft():
    snapshot = read_jobs()
    blocked = snapshot.get("draftBlocked")
    require(type(blocked) is bool, "Gesamter Draft-Auftragsverlauf ist nicht nachgewiesen.")
    item = snapshot.get("draft")
    require(isinstance(item, dict), "Draft 11 fehlt oder ist gelöscht.")
    print("Draft 11 r" + numeric_token(item.get("revision")) + " Fotos=" + numeric_token(item.get("photos")))
    print("Preis-Cent=" + numeric_token(item.get("priceCents")) + " Paket=" + numeric_token(item.get("packageSizeId")))
    print("Gesamter Verlauf: " + ("PUBLIKATION GESPERRT" if blocked else "kein offener/bestätigter Auftrag oder Beleg"))
    rows = snapshot.get("jobs")
    require(isinstance(rows, list), "Draft-Auftragsliste fehlt.")
    for row in rows[:6]:
        require(isinstance(row, dict), "Draft-Auftrag ungültig.")
        print("Job " + numeric_token(row.get("id")) + " r" + numeric_token(row.get("revision")) + " "
              + safe_token(row.get("action")) + "/" + safe_token(row.get("mode")) + " "
              + safe_token(row.get("state")) + " " + safe_token(row.get("error")))
        print("Start " + safe_token(row.get("started")) + " Ende " + safe_token(row.get("finished")))
        print("Session " + safe_token(row.get("session_state")) + " Anbieter " + safe_token(row.get("provider_state"))
              + " Beleg " + (numeric_token(row.get("external_id")) if row.get("receipt") else "-")
              + " geprüft " + safe_token(row.get("verified_at")))
    print("Nur Prüfbefund; keine Publikation ausgelöst.")


def main(argv=None):
    parser = argparse.ArgumentParser(description="Geprüfter Marketplace-Rollout 8f9a81a")
    parser.add_argument("command", choices=("status", "jobs", "draft", "prepare", "deploy", "verify"))
    args = parser.parse_args(argv)
    try:
        require(os.geteuid() == 0, "Die bestehende root-Konsole ist erforderlich.")
        require(not any(os.environ.get(key) for key in ("DOCKER_HOST", "DOCKER_CONTEXT")), "Abweichender Docker-Endpunkt; nur lokaler Host zulässig.")
        require(run_command(["docker", "context", "show"]).strip() == "default", "Nur der lokale Docker-Standardkontext ist zulässig.")
        globals()[args.command]()
        return 0
    except RolloutError as error:
        print("ABBRUCH: " + str(error), file=sys.stderr)
        return 1
    except (Exception, KeyboardInterrupt):
        print("ABBRUCH: Prüfung fehlgeschlagen; Journal/Host prüfen. Keine automatische Fortsetzung.", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
