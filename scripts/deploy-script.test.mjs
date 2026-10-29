import assert from 'node:assert/strict';
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { chmod, mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import vm from 'node:vm';
import { getCheckCommands } from './ci-checks.mjs';
import { createHash } from 'node:crypto';

const deployScript = fileURLToPath(new URL('../deploy/deploy.sh', import.meta.url));
const dockerfile = fileURLToPath(new URL('../docker/Dockerfile', import.meta.url));

const marketplaceRolloutScript = fileURLToPath(
  new URL('../deploy/marketplace-rollout.py', import.meta.url),
);
const marketplaceRolloutOptions = {
  skip: process.platform !== 'linux' ? 'Das Serverskript benötigt Linux mit fcntl.' : false,
};

function runMarketplaceRolloutPython(source) {
  const python = process.env.FLIPBASE_PYTHON ?? 'python3';
  const harness = String.raw`
import contextlib
import copy
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
from unittest import mock

unexpected_processes = []

def reject_process(*args, **kwargs):
    unexpected_processes.append(args)
    raise AssertionError("Die Fixture darf keine externen Prozesse starten.")

# Auch ein versehentlich neuer Aufruf umgeht den Docker-Mock nicht.
mock.patch("subprocess.run", side_effect=reject_process).start()
mock.patch("subprocess.Popen", side_effect=reject_process).start()
mock.patch("os.system", side_effect=reject_process).start()
mock.patch("os.popen", side_effect=reject_process).start()

spec = importlib.util.spec_from_file_location("marketplace_rollout", sys.argv[1])
rollout = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = rollout
spec.loader.exec_module(rollout)

SECRET = "fixture-private-service-key-must-never-be-printed"
WORKER = "ghcr.io/grischatdev/flipbase-marketplace-worker@sha256:08025a4e1155996cfb5295be312a749843adbe09f630944ee4bfef34c962be18"
BROKER = "ghcr.io/grischatdev/flipbase-chromium-broker@sha256:c59169e0cc01c664bf02a05df140e3ceb94bed1db0e651968bcbf012a3d92dd0"
SESSION = "ghcr.io/grischatdev/flipbase-chromium-session@sha256:6292dee02bc7c8d6e1e29c34c654cbc0c9b6d33d7b582f8e72b5314bf226960c"

def compose_fixture():
    return {
        "name": "flipbase-chromium-pilot",
        "services": {
            "marketplace-worker": {
                "image": "ghcr.io/grischatdev/flipbase-marketplace-worker@sha256:" + "1" * 64,
                "container_name": "flipbase-marketplace-worker",
                "init": True,
                "user": "1000:1000",
                "restart": "unless-stopped",
                "read_only": True,
                "stop_grace_period": "13m",
                "environment": {
                    "MARKETPLACE_CHROMIUM_IMAGE": "ghcr.io/grischatdev/flipbase-chromium-session@sha256:" + "2" * 64,
                    "MARKETPLACE_BROWSER_PROVIDER": "chromium",
                    "MARKETPLACE_CHROMIUM_PILOT_ENABLED": "1",
                    "MARKETPLACE_CHROMIUM_WRITES_ENABLED": "1",
                    "MARKETPLACE_LISTING_PUBLISH_ENABLED": "1",
                    "SUPABASE_SERVICE_ROLE_KEY": SECRET,
                    "EXTRA_VALUE": "leading space # dollar $ and newline\nstay unchanged",
                },
                "volumes": [
                    {"type": "bind", "source": "/opt/flipbase-marketplace/chromium-worker", "target": "/var/lib/flipbase-marketplace"},
                    {"type": "bind", "source": "/opt/flipbase-marketplace/chromium-broker-token", "target": "/run/secrets/chromium-broker-token", "read_only": True},
                ],
                "networks": {"supabase_default": {}, "chromium-control": {}},
                "cap_drop": ["ALL"],
                "security_opt": ["no-new-privileges:true"],
                "labels": {"fixture.retained": "yes"},
            },
            "chromium-host-broker": {
                "image": "ghcr.io/grischatdev/flipbase-chromium-broker@sha256:" + "3" * 64,
                "init": True,
                "user": "1000:1000",
                "restart": "unless-stopped",
                "read_only": True,
                "stop_grace_period": "3m",
                "environment": {
                    "MARKETPLACE_CHROMIUM_IMAGE": "ghcr.io/grischatdev/flipbase-chromium-session@sha256:" + "2" * 64,
                    "MARKETPLACE_CHROMIUM_HOST_ID": "fixture-host",
                },
                "volumes": [
                    {"type": "bind", "source": "/var/run/docker.sock", "target": "/var/run/docker.sock"},
                    {"type": "bind", "source": "/opt/flipbase-marketplace/chromium", "target": "/var/lib/flipbase-chromium"},
                ],
                "networks": {
                    "chromium-control": {"aliases": ["chromium-host-control"]},
                    "flipbase-browser": {"ipv4_address": "172.30.88.3"},
                },
                "cap_drop": ["ALL"],
                "security_opt": ["no-new-privileges:true"],
            },
        },
        "networks": {
            "chromium-control": {"internal": True},
            "flipbase-browser": {"external": True},
            "supabase_default": {"external": True},
        },
    }

def changed_paths(before, after, path=()):
    if isinstance(before, dict) and isinstance(after, dict) and before.keys() == after.keys():
        return [change for key in before for change in changed_paths(before[key], after[key], path + (key,))]
    return [] if before == after else [path]

def assert_rejected(operation):
    try:
        operation()
    except rollout.RolloutError as error:
        assert SECRET not in str(error), "Eine Fehlermeldung enthält ein Geheimnis."
        return error
    raise AssertionError("Der unsichere Zustand wurde nicht abgelehnt.")

def stopped_fixture(code=0, **overrides):
    state = {"Status": "exited", "Running": False, "ExitCode": code, "OOMKilled": False, "Dead": False, "Error": ""}
    state.update(overrides)
    return {"Id": "fixture-container", "State": state}

def idle_snapshot(live=True):
    return {
        "counts": {key: 0 for key in ("listingJobs", "operations", "sessions", "messages", "favorites", "negotiations", "setups")},
        "runtime": {"live": live, "workerId": "11111111-1111-4111-8111-111111111111", "epoch": 1},
        "listingPermissionHash": "a" * 32,
        "scheduleAuthorizationHash": "b" * 32,
        "draft": None,
        "jobs": [],
    }

class RolloutFixture:
    def __enter__(self):
        self.stack = contextlib.ExitStack()
        self.directory = Path(self.stack.enter_context(tempfile.TemporaryDirectory(prefix="flipbase-rollout-test-")))
        self.state_dir = self.directory / "state"
        self.state_dir.mkdir(mode=0o700)
        self.source = self.directory / "active-compose.json"
        self.baseline = compose_fixture()
        self.source.write_text(json.dumps(self.baseline), encoding="utf-8")
        self.source.chmod(0o600)
        self.calls = []
        self.unexpected_calls = []
        self.operation_phases = []
        self.output = io.StringIO()
        self.counts = idle_snapshot()["counts"]
        self.after_worker_counts = {}
        self.after_broker_counts = {}
        self.sessions = []
        self.after_worker_sessions = []
        self.worker_stopped = False
        self.broker_stopped = False
        self.started = False
        self.worker_exit = 0
        self.broker_exit = 143
        self.worker_oom = False
        self.runtime_after_worker = False
        self.active_worker_id = "11111111-1111-4111-8111-111111111111"
        self.active_epoch = 1
        self.next_worker_id = "22222222-2222-4222-8222-222222222222"
        self.next_epoch = 2
        self.worker_restarts = 0
        self.broker_restarts = 0
        self.fail_stage = None
        self.permission_hash = "a" * 32
        self.image_ids = {image: "sha256:" + digit * 64 for image, digit in ((WORKER, "4"), (BROKER, "5"), (SESSION, "6"))}
        self.context = {
            "project": "flipbase-chromium-pilot",
            "source": str(self.source),
            "working_dir": str(self.directory),
        }
        for key, service, digit in (("worker", "marketplace-worker", "a"), ("broker", "chromium-host-broker", "b")):
            self.context[key] = {
                "Id": digit * 64,
                "RestartCount": 0,
                "Name": "/flipbase-marketplace-worker" if key == "worker" else "/fixture-broker",
                "State": {"Status": "running", "Running": True, "OOMKilled": False, "Dead": False, "Health": {"Status": "healthy"}},
                "Config": {
                    "Image": self.baseline["services"][service]["image"],
                    "Env": ["SUPABASE_SERVICE_ROLE_KEY=" + SECRET],
                    "Labels": {"com.docker.compose.config-hash": digit * 64},
                },
            }
        self.stack.enter_context(mock.patch.object(rollout, "BASE_DIR", self.directory))
        self.stack.enter_context(mock.patch.object(rollout, "STATE_DIR", self.state_dir))
        # Root-/Host-Dateirechte sind außerhalb dieser Prozess-Fixture; Journal-I/O bleibt echt.
        self.stack.enter_context(mock.patch.object(rollout, "trusted_path", side_effect=self.trusted_path))
        self.stack.enter_context(mock.patch.object(rollout, "rollout_lock", side_effect=contextlib.nullcontext))
        self.stack.enter_context(mock.patch.object(rollout, "discover_active", side_effect=lambda: copy.deepcopy(self.context)))
        self.stack.enter_context(mock.patch.object(rollout, "run_command", side_effect=self.run_command))
        self.health = self.stack.enter_context(mock.patch.object(rollout, "public_health", return_value={"ok": True, "apiVersion": 2, "readOnly": False}))
        self.stack.enter_context(contextlib.redirect_stdout(self.output))
        self.stack.enter_context(contextlib.redirect_stderr(self.output))
        return self

    def __exit__(self, kind, value, traceback):
        self.stack.close()
        assert not self.unexpected_calls, "Ein nicht modellierter Docker-Aufruf wurde versucht."
        assert SECRET not in self.output.getvalue(), "Eine Konsolenausgabe enthält ein Geheimnis."

    def trusted_path(self, path, **kwargs):
        result = Path(path)
        assert result == self.directory or self.directory in result.parents
        assert result.exists()
        return result

    def journal(self):
        path = self.state_dir / "journal.json"
        return json.loads(path.read_text()) if path.exists() else None

    def snapshot(self):
        snapshot = idle_snapshot(live=not self.worker_stopped or self.started)
        snapshot["counts"].update(self.counts)
        snapshot["listingPermissionHash"] = self.permission_hash
        snapshot["runtime"]["workerId"] = self.next_worker_id if self.started else self.active_worker_id
        snapshot["runtime"]["epoch"] = self.next_epoch if self.started else self.active_epoch
        if self.worker_stopped and not self.started:
            snapshot["runtime"]["live"] = self.runtime_after_worker
            snapshot["counts"].update(self.after_worker_counts)
        if self.broker_stopped and not self.started:
            snapshot["counts"].update(self.after_broker_counts)
        return snapshot

    def run_command(self, args, *, input_text=None, timeout=60):
        args = list(args)
        self.calls.append((args, timeout))
        if args[:2] == ["docker", "pull"]:
            assert args[2] in self.image_ids
            return ""
        if args[:3] == ["docker", "image", "inspect"]:
            image = args[3]
            return json.dumps([{"Id": self.image_ids[image], "RepoDigests": [image], "Os": "linux", "Architecture": "amd64"}])
        if args[:2] == ["docker", "compose"]:
            if "config" in args and "--hash" in args:
                key = "worker" if args[-1] == "marketplace-worker" else "broker"
                return args[-1] + " " + self.context[key]["Config"]["Labels"]["com.docker.compose.config-hash"]
            if args[-3:] == ["config", "--format", "json"]:
                path = Path(args[args.index("--file") + 1])
                value = json.loads(path.read_text())
                if path.parent == self.state_dir and path.name in ("compose.release.json", "compose.previous.json"):
                    def resolve_dollars(item):
                        if isinstance(item, str):
                            return item.replace("$$", "$")
                        if isinstance(item, list):
                            return [resolve_dollars(child) for child in item]
                        if isinstance(item, dict):
                            return {key: resolve_dollars(child) for key, child in item.items()}
                        return item
                    value = resolve_dollars(value)
                return json.dumps(value)
            if "up" in args:
                self.operation_phases.append(("start", self.journal()["phase"]))
                self.started = True
                self.context["source"] = str(self.state_dir / "compose.release.json")
                for key, image, digit in (("worker", WORKER, "c"), ("broker", BROKER, "d")):
                    self.context[key]["Id"] = digit * 64
                    self.context[key]["Config"]["Image"] = image
                    self.context[key]["Image"] = self.image_ids[image]
                    self.context[key]["RestartCount"] = self.worker_restarts if key == "worker" else self.broker_restarts
                    self.context[key]["State"] = {"Status": "running", "Running": True, "OOMKilled": False, "Dead": False, "Health": {"Status": "healthy"}}
                if self.fail_stage == "start":
                    raise rollout.RolloutError("Fixture: Start angenommen, Antwort unterbrochen.")
                return ""
        if args[:2] == ["docker", "ps"] and "label=de.flipbase.chromium.role=session" in args:
            return "\n".join(self.sessions + (self.after_worker_sessions if self.worker_stopped and not self.started else []))
        if args[:4] == ["docker", "exec", "-i", "supabase-db"]:
            return json.dumps(self.snapshot())
        if args[:2] == ["docker", "stop"]:
            key = next(key for key in ("worker", "broker") if self.context[key]["Id"] == args[-1])
            self.operation_phases.append((key, self.journal()["phase"]))
            state = stopped_fixture(self.worker_exit if key == "worker" else self.broker_exit)["State"]
            if key == "worker":
                self.worker_stopped = True
                state["OOMKilled"] = self.worker_oom
            else:
                self.broker_stopped = True
            self.context[key]["State"] = state
            if self.fail_stage == key:
                raise rollout.RolloutError("Fixture: Stopp angenommen, Antwort unterbrochen.")
            return args[-1]
        if args[:2] == ["docker", "inspect"]:
            return json.dumps([next(item for key, item in self.context.items() if key in ("worker", "broker") and item["Id"] == args[2])])
        if args[:2] == ["docker", "run"] and args[-2] in self.image_ids:
            return rollout.RUNTIME_SHA256 + "  " + rollout.RUNTIME_PATH
        if args[:2] == ["docker", "exec"] and args[-2:] == ["sha256sum", rollout.RUNTIME_PATH]:
            return rollout.RUNTIME_SHA256 + "  " + rollout.RUNTIME_PATH
        self.unexpected_calls.append(args)
        raise AssertionError("Nicht modellierter Docker-Aufruf.")

    def mutations(self):
        return [args for args, _timeout in self.calls if args[:2] == ["docker", "stop"] or (args[:2] == ["docker", "compose"] and "up" in args)]
`;
  const result = spawnSync(
    python,
    [
      '-B',
      '-c',
      `${harness}\n${source}\nassert not unexpected_processes, "Ein externer Prozess wurde angesprochen."\n`,
      marketplaceRolloutScript,
    ],
    { encoding: 'utf8', timeout: 15_000, maxBuffer: 1024 * 1024 },
  );
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.signal, null, result.stderr);
  assert.equal(result.status, 0, result.stderr || result.stdout);
}

test(
  'Marketplace-Rollout ersetzt genau vier Imagefelder und erhält den restlichen Compose-Stand',
  marketplaceRolloutOptions,
  () => {
    runMarketplaceRolloutPython(String.raw`
before = compose_fixture()
original = copy.deepcopy(before)
after = rollout.build_release_config(before)
expected = {
    ("services", "marketplace-worker", "image"): WORKER,
    ("services", "chromium-host-broker", "image"): BROKER,
    ("services", "marketplace-worker", "environment", "MARKETPLACE_CHROMIUM_IMAGE"): SESSION,
    ("services", "chromium-host-broker", "environment", "MARKETPLACE_CHROMIUM_IMAGE"): SESSION,
}
assert set(changed_paths(before, after)) == set(expected)
for path, expected_value in expected.items():
    value = after
    for part in path:
        value = value[part]
    assert value == expected_value
assert before == original, "Die aktive Ausgangskonfiguration darf nicht verändert werden."
rollout.assert_image_only_change(before, after)
after["services"]["marketplace-worker"]["environment"]["EXTRA_VALUE"] = "changed later"
after["services"]["chromium-host-broker"]["volumes"][0]["source"] = "/different.sock"
assert before == original, "Verschachtelte Werte benötigen eine unabhängige Kopie."
`);
  },
);

test(
  'Marketplace-Rollout lehnt zusätzliche Konfigurationsänderungen und fremde Zielimages ab',
  marketplaceRolloutOptions,
  () => {
    runMarketplaceRolloutPython(String.raw`
before = compose_fixture()
approved = rollout.build_release_config(before)
changes = [
    lambda c: c["services"]["marketplace-worker"]["environment"].pop("SUPABASE_SERVICE_ROLE_KEY"),
    lambda c: c["services"]["marketplace-worker"].update({"privileged": True}),
    lambda c: c["services"]["chromium-host-broker"]["volumes"][0].update({"source": "/wrong.sock"}),
    lambda c: c["networks"]["chromium-control"].update({"internal": False}),
    lambda c: c["services"].update({"foreign-worker": {"image": WORKER}}),
    lambda c: c["services"]["marketplace-worker"].update({"image": WORKER[:-1] + "0"}),
    lambda c: c["services"]["chromium-host-broker"]["environment"].update({"MARKETPLACE_CHROMIUM_IMAGE": "ghcr.io/grischatdev/flipbase-chromium-session:latest"}),
]
for change in changes:
    candidate = copy.deepcopy(approved)
    change(candidate)
    assert_rejected(lambda: rollout.assert_image_only_change(before, candidate))
assert before == compose_fixture()
`);
  },
);

test(
  'Marketplace-Rollout bricht bei uneindeutiger oder konkurrierender Compose-Konfiguration ab',
  marketplaceRolloutOptions,
  () => {
    runMarketplaceRolloutPython(String.raw`
changes = [
    lambda c: c["services"].pop("marketplace-worker"),
    lambda c: c["services"].pop("chromium-host-broker"),
    lambda c: c["services"].update({"foreign-worker": {"image": WORKER}}),
    lambda c: c["services"]["marketplace-worker"].update({"environment": ["MARKETPLACE_CHROMIUM_IMAGE=" + SESSION]}),
    lambda c: c["services"]["chromium-host-broker"]["environment"].pop("MARKETPLACE_CHROMIUM_IMAGE"),
    lambda c: c["services"]["marketplace-worker"].update({"build": {"context": "."}}),
    lambda c: c["services"]["chromium-host-broker"].update({"extends": {"service": "different-broker"}}),
]
for change in changes:
    candidate = compose_fixture()
    change(candidate)
    original = copy.deepcopy(candidate)
    assert_rejected(lambda: rollout.build_release_config(candidate))
    assert candidate == original
`);
  },
);

test(
  'Marketplace-Rollout akzeptiert SIGTERM-Code 143 ausschließlich beim sauber beendeten Broker',
  marketplaceRolloutOptions,
  () => {
    runMarketplaceRolloutPython(String.raw`
rollout.assert_stopped(stopped_fixture())
rollout.assert_stopped(stopped_fixture(), broker=True)
rollout.assert_stopped(stopped_fixture(143), broker=True)
assert_rejected(lambda: rollout.assert_stopped(stopped_fixture(143)))
for broker in (False, True):
    for state in (
        stopped_fixture(137),
        stopped_fixture(1),
        stopped_fixture(0, Running=True),
        stopped_fixture(0, Status="running"),
        stopped_fixture(0, Status="dead", Dead=True),
        stopped_fixture(0, OOMKilled=True),
        stopped_fixture(143, OOMKilled=True),
        {"State": {"Status": "exited", "ExitCode": 0}},
        {},
    ):
        assert_rejected(lambda: rollout.assert_stopped(state, broker=broker))
`);
  },
);

test(
  'Marketplace-Rollout gibt bei Prozessfehlern und Zeitüberschreitungen keine Zugangsdaten aus',
  marketplaceRolloutOptions,
  () => {
    runMarketplaceRolloutPython(String.raw`
cases = [
    {"return_value": subprocess.CompletedProcess(["fixture"], 1, SECRET, "stderr " + SECRET)},
    {"side_effect": subprocess.TimeoutExpired(["fixture", SECRET], 60, output=SECRET, stderr=SECRET)},
    {"side_effect": OSError("fixture executable " + SECRET)},
]
for behavior in cases:
    captured = io.StringIO()
    with mock.patch("subprocess.run", **behavior), contextlib.redirect_stdout(captured), contextlib.redirect_stderr(captured):
        error = assert_rejected(lambda: rollout.run_command(["fixture", SECRET], input_text=SECRET))
    assert SECRET not in captured.getvalue() + str(error)
`);
  },
);

test(
  'Marketplace-Rollout sperrt jede aktive oder unbekannte Auftragsklasse und eine unklare Runtime',
  marketplaceRolloutOptions,
  () => {
    runMarketplaceRolloutPython(String.raw`
rollout.assert_preflight(idle_snapshot())
rollout.assert_preflight(idle_snapshot(False), drained=True)
assert_rejected(lambda: rollout.assert_preflight(idle_snapshot(), drained=True))
for key in idle_snapshot()["counts"]:
    for value in (1, -1, True, None, "0", SECRET):
        snapshot = idle_snapshot()
        snapshot["counts"][key] = value
        assert_rejected(lambda: rollout.assert_preflight(snapshot))
    snapshot = idle_snapshot()
    del snapshot["counts"][key]
    assert_rejected(lambda: rollout.assert_preflight(snapshot))
for counts in (None, [], {}, {**idle_snapshot()["counts"], "unknownQueue": 0}):
    snapshot = idle_snapshot()
    snapshot["counts"] = counts
    assert_rejected(lambda: rollout.assert_preflight(snapshot))
for runtime in (None, {}, {"live": 0}, {"live": "false"}, {"live": None}):
    snapshot = idle_snapshot()
    snapshot["runtime"] = runtime
    assert_rejected(lambda: rollout.assert_preflight(snapshot))
assert_rejected(lambda: rollout.assert_preflight(None))
`);
  },
);

test(
  'Marketplace-Rollout bereitet private Snapshots vor, ohne Dienste oder Berechtigungen zu ändern',
  marketplaceRolloutOptions,
  () => {
    runMarketplaceRolloutPython(String.raw`
with RolloutFixture() as fixture:
    original_source = fixture.source.read_bytes()
    rollout.prepare()
    assert fixture.journal()["phase"] == "prepared"
    assert fixture.source.read_bytes() == original_source
    assert fixture.mutations() == []
    pulls = [args[2] for args, _timeout in fixture.calls if args[:2] == ["docker", "pull"]]
    assert pulls == [WORKER, BROKER, SESSION]
    plan = rollout.load_plan()
    assert plan["authorization"] == {"listingPermissionHash": "a" * 32, "scheduleAuthorizationHash": "b" * 32}
    assert set(plan["images"]) == {WORKER, BROKER, SESSION}
    for name in ("journal.json", "plan.json", "baseline.json", "compose.previous.json", "compose.release.json"):
        assert (fixture.state_dir / name).stat().st_mode & 0o777 == 0o600
    target = json.loads((fixture.state_dir / "compose.release.json").read_text())
    previous = json.loads((fixture.state_dir / "compose.previous.json").read_text())
    for config in (target, previous):
        assert config["services"]["marketplace-worker"]["environment"]["EXTRA_VALUE"] == "leading space # dollar $$ and newline\nstay unchanged"
    assert SECRET not in (fixture.state_dir / "journal.json").read_text()
    assert_rejected(rollout.prepare)
    assert fixture.mutations() == []
`);
  },
);

test(
  'Marketplace-Rollout hält 780/180 Sekunden und Journal vor Worker, Broker und gemeinsamem Start ein',
  marketplaceRolloutOptions,
  () => {
    runMarketplaceRolloutPython(String.raw`
with RolloutFixture() as fixture:
    rollout.prepare()
    rollout.deploy()
    operations = fixture.mutations()
    assert len(operations) == 3
    assert operations[0] == ["docker", "stop", "--timeout", "780", "a" * 64]
    assert operations[1] == ["docker", "stop", "--timeout", "180", "b" * 64]
    start = operations[2]
    assert start[:2] == ["docker", "compose"]
    assert start[start.index("--file") + 1] == str(fixture.state_dir / "compose.release.json")
    assert start[start.index("--project-name") + 1] == "flipbase-chromium-pilot"
    assert start[start.index("up") + 1:] == ["--detach", "--no-deps", "--no-build", "--pull", "never", "chromium-host-broker", "marketplace-worker"]
    assert [timeout for args, timeout in fixture.calls if args[:2] == ["docker", "stop"]] == [810, 210]
    assert fixture.operation_phases == [
        ("worker", "worker_stop_started"),
        ("broker", "broker_stop_started"),
        ("start", "start_started"),
    ]
    assert [entry["phase"] for entry in fixture.journal()["history"]] == [
        "preparing", "prepared", "worker_stop_started", "worker_stopped",
        "broker_stop_started", "broker_stopped", "start_started", "verifying", "verified",
    ]
    fixture.health.assert_called_once()
    rollout.verify()
    assert fixture.mutations() == operations
    assert fixture.journal()["phase"] == "verified"
`);
  },
);

test(
  'Marketplace-Rollout startet bei unsauberem Drain, neuen Jobs oder verbliebenen Browsern keinen Dienst',
  marketplaceRolloutOptions,
  () => {
    runMarketplaceRolloutPython(String.raw`
scenarios = [
    ("offene Aufträge vor dem Stopp", lambda f: f.counts.update({"listingJobs": 1}), 0),
    ("Browser vor dem Stopp", lambda f: f.sessions.append("e" * 64), 0),
    ("Worker-SIGTERM statt sauberem Exit", lambda f: setattr(f, "worker_exit", 143), 1),
    ("Worker-Kill", lambda f: setattr(f, "worker_exit", 137), 1),
    ("Worker-OOM", lambda f: setattr(f, "worker_oom", True), 1),
    ("Runtime-Lease bleibt aktiv", lambda f: setattr(f, "runtime_after_worker", True), 1),
    ("neue Operation beim Drain", lambda f: f.after_worker_counts.update({"operations": 1}), 1),
    ("neuer Browser beim Drain", lambda f: f.after_worker_sessions.append("e" * 64), 1),
    ("Broker-Fehler", lambda f: setattr(f, "broker_exit", 1), 2),
    ("neue Outbox nach Brokerstopp", lambda f: f.after_broker_counts.update({"messages": 1}), 2),
]
for label, change, expected_stops in scenarios:
    with RolloutFixture() as fixture:
        rollout.prepare()
        change(fixture)
        assert_rejected(rollout.deploy)
        operations = fixture.mutations()
        assert len(operations) == expected_stops, label
        assert all(args[:2] == ["docker", "stop"] for args in operations), label
        fixture.health.assert_not_called()
`);
  },
);

test(
  'Marketplace-Rollout wiederholt nach unklarer Stopp- oder Startantwort keine Mutation',
  marketplaceRolloutOptions,
  () => {
    runMarketplaceRolloutPython(String.raw`
for stage, phase, expected_operations in (
    ("worker", "worker_stop_started", 1),
    ("broker", "broker_stop_started", 2),
    ("start", "start_started", 3),
):
    with RolloutFixture() as fixture:
        rollout.prepare()
        fixture.fail_stage = stage
        assert_rejected(rollout.deploy)
        assert fixture.journal()["phase"] == phase
        operations = copy.deepcopy(fixture.mutations())
        assert len(operations) == expected_operations
        fixture.fail_stage = None
        assert_rejected(rollout.deploy)
        assert_rejected(rollout.prepare)
        assert fixture.mutations() == operations
        assert fixture.journal()["phase"] == phase
        if stage == "start":
            rollout.verify()
            assert fixture.journal()["phase"] == "verified"
            assert fixture.mutations() == operations
`);
  },
);

test(
  'Marketplace-Rollout sperrt veränderte Pläne, Container, Images und Freigaben vor dem ersten Stopp',
  marketplaceRolloutOptions,
  () => {
    runMarketplaceRolloutPython(String.raw`
def alter_release_file(fixture):
    path = fixture.state_dir / "compose.release.json"
    path.write_text(path.read_text() + "\n", encoding="utf-8")

def alter_source_file(fixture):
    fixture.source.write_text(fixture.source.read_text() + "\n", encoding="utf-8")

for change in (
    alter_release_file,
    alter_source_file,
    lambda f: setattr(f, "permission_hash", "c" * 32),
    lambda f: setattr(f, "active_worker_id", "33333333-3333-4333-8333-333333333333"),
    lambda f: setattr(f, "active_epoch", 2),
    lambda f: f.image_ids.update({WORKER: "sha256:" + "f" * 64}),
    lambda f: f.context["worker"].update({"Id": "f" * 64}),
):
    with RolloutFixture() as fixture:
        rollout.prepare()
        change(fixture)
        assert_rejected(rollout.deploy)
        assert fixture.mutations() == []
        assert fixture.journal()["phase"] == "prepared"
`);
  },
);

test(
  'Marketplace-Rollout bestätigt keinen Abschluss mit alter Lease oder neu gestarteten Containern',
  marketplaceRolloutOptions,
  () => {
    runMarketplaceRolloutPython(String.raw`
for change in (
    lambda f: setattr(f, "next_worker_id", f.active_worker_id),
    lambda f: setattr(f, "next_epoch", f.active_epoch),
    lambda f: setattr(f, "next_epoch", 0),
    lambda f: setattr(f, "next_worker_id", "unknown"),
    lambda f: setattr(f, "worker_restarts", 1),
    lambda f: setattr(f, "broker_restarts", 1),
):
    with RolloutFixture() as fixture:
        rollout.prepare()
        change(fixture)
        assert_rejected(rollout.deploy)
        operations = copy.deepcopy(fixture.mutations())
        assert len(operations) == 3
        assert fixture.journal()["phase"] == "verifying"
        assert_rejected(rollout.deploy)
        assert fixture.mutations() == operations
        assert fixture.journal()["phase"] == "verifying"
`);
  },
);

test(
  'Marketplace-Rollout zeigt Status und Jobs ohne Umgebungswerte, Nachrichten oder Providerantworten',
  marketplaceRolloutOptions,
  () => {
    runMarketplaceRolloutPython(String.raw`
with RolloutFixture() as fixture:
    snapshot = idle_snapshot()
    snapshot["counts"]["messages"] = SECRET
    snapshot["draft"] = {"revision": 7, "photos": 10, "priceCents": "7990", "packageSizeId": "2", "content": SECRET}
    snapshot["jobs"] = [{"id": 71, "revision": 7, "state": "failed", "error": "package_match", "receipt": False, "providerResponse": SECRET}]
    snapshot["outbox"] = [{"kind": "message", "id": 9, "state": "outcome_unknown", "error": None, "body": SECRET, "providerResponse": SECRET}]
    snapshot["private"] = SECRET
    with mock.patch.object(rollout, "read_jobs", return_value=snapshot):
        rollout.status()
        rollout.jobs()
    assert "messages: unbekannt" in fixture.output.getvalue()
    assert "GESPERRT" in fixture.output.getvalue()
    assert fixture.mutations() == []
`);
  },
);

test(
  'Marketplace-Rollout lehnt fremde Docker-Endpunkte ab und hält unerwartete CLI-Fehler geheim',
  marketplaceRolloutOptions,
  () => {
    runMarketplaceRolloutPython(String.raw`
for key in ("DOCKER_HOST", "DOCKER_CONTEXT"):
    output = io.StringIO()
    with mock.patch.dict(os.environ, {key: SECRET}, clear=True), mock.patch.object(rollout.os, "geteuid", return_value=0), mock.patch.object(rollout, "run_command") as command, contextlib.redirect_stderr(output):
        assert rollout.main(["status"]) == 1
        command.assert_not_called()
    assert SECRET not in output.getvalue()

output = io.StringIO()
with mock.patch.dict(os.environ, {}, clear=True), mock.patch.object(rollout.os, "geteuid", return_value=0), mock.patch.object(rollout, "run_command", return_value="default\n"), mock.patch.object(rollout, "status", side_effect=RuntimeError(SECRET)), contextlib.redirect_stderr(output):
    assert rollout.main(["status"]) == 1
assert SECRET not in output.getvalue()
`);
  },
);

test('Push-Smoke meldet den ursprünglichen Startfehler auch ohne erzeugte Container', async () => {
  const script = await readFile(
    new URL('../services/push-worker/scripts/smoke-functions.mjs', import.meta.url),
    'utf8',
  );
  const startupError = new Error('fixture: runtime image could not be fetched');
  const commands = [];
  const execution = vm.runInNewContext(
    `(async () => { ${script.replace(/^import .*;\r?\n/gmu, '')} })()`,
    {
      assert,
      resolve: (path) => path,
      process: {
        argv: ['node', 'smoke-functions.mjs', 'fixture-image', '/fixture', 'a'.repeat(40)],
        pid: 123,
        stderr: { write() {} },
      },
      execFileSync: (_command, args) => {
        commands.push([...args]);
        if (args[0] === 'run') throw startupError;
        if (args[0] === 'logs') throw new Error('fixture: no such container');
        return '';
      },
    },
  );
  await assert.rejects(execution, (error) => error === startupError);
  assert.ok(
    commands.find((args) => args[0] === 'run')?.includes('ghcr.io/supabase/edge-runtime:v1.73.5'),
    'Unveränderte Runtime-Version aus der offiziellen GHCR-Registry',
  );
  assert.deepEqual(
    commands.filter((args) => args[0] === 'logs').map((args) => args[1]),
    ['push-functions-smoke-123', 'push-gateway-smoke-123'],
  );
  assert.ok(commands.some((args) => args.join(' ') === 'network rm push-functions-smoke-123'));
});

test('Produktions-Nginx akzeptiert die tatsächlichen Auslieferungsregeln', async () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const source = await readFile(dockerfile, 'utf8');
  const image = source.match(/^FROM (nginx:[^\s]+) AS production$/mu)?.[1];
  assert.ok(image, 'Die Prüfung muss das tatsächliche Produktions-Nginx verwenden.');
  execFileSync(
    'docker',
    [
      'run',
      '--rm',
      '--mount',
      `type=bind,source=${join(root, 'docker/nginx.conf')},target=/etc/nginx/conf.d/default.conf,readonly`,
      '--mount',
      `type=bind,source=${join(root, 'docker/security-headers.conf')},target=/etc/nginx/security-headers.conf,readonly`,
      image,
      'nginx',
      '-t',
    ],
    { stdio: 'pipe' },
  );
  const archiveRoot = await mkdtemp(join(tmpdir(), 'flipbase-nginx-archive-'));
  const container = `flipbase-archive-${process.pid}-${Date.now()}`;
  try {
    // mkdtemp setzt 0700; wie beim echten öffentlichen Archiv muss auch
    // der unprivilegierte Nginx-Prozess dieses Verzeichnis betreten können.
    await chmod(archiveRoot, 0o755);
    await mkdir(join(archiveRoot, 'a'.repeat(64)), { mode: 0o755 });
    await writeFile(join(archiveRoot, 'a'.repeat(64), 'old.js'), 'previous bytes', { mode: 0o644 });
    execFileSync(
      'docker',
      [
        'run',
        '-d',
        '--name',
        container,
        '--mount',
        `type=bind,source=${join(root, 'docker/nginx.conf')},target=/etc/nginx/conf.d/default.conf,readonly`,
        '--mount',
        `type=bind,source=${join(root, 'docker/security-headers.conf')},target=/etc/nginx/security-headers.conf,readonly`,
        '--mount',
        `type=bind,source=${archiveRoot},target=/usr/share/nginx/html/app-builds,readonly`,
        image,
      ],
      { stdio: 'pipe' },
    );
    // HTTP im tatsächlichen Nginx-Container funktioniert auch bei einem
    // getrennten Docker-Daemon, ohne Hostports oder fremde Netzwerke zu ändern.
    const request = (path) =>
      spawnSync('docker', ['exec', container, 'wget', '-S', '-O', '-', `http://127.0.0.1${path}`], {
        encoding: 'utf8',
      });
    let ready;
    for (let attempt = 0; attempt < 50; attempt += 1) {
      ready = request('/healthz');
      if (ready.status === 0) break;
      await new Promise((done) => setTimeout(done, 100));
    }
    assert.equal(ready?.status, 0, ready?.stderr);
    const response = request(`/app-builds/${'a'.repeat(64)}/old.js`);
    assert.equal(response.status, 0, response.stderr);
    assert.match(response.stderr, /HTTP\/1\.1 200/);
    assert.equal(response.stdout, 'previous bytes');
    assert.match(response.stderr, /Cache-Control:.*immutable/i);
    const missing = request(`/app-builds/${'a'.repeat(64)}/missing.js`);
    assert.notEqual(missing.status, 0);
    assert.match(missing.stderr, /HTTP\/1\.1 404/);
    assert.match(response.stderr, /Content-Security-Policy:/i);
  } finally {
    execFileSync('docker', ['rm', '-f', container], { stdio: 'pipe' });
    await rm(archiveRoot, { recursive: true, force: true });
  }
});

test('Push-Compose erbt Supabasezugang und trennt Router/JWT ohne neue Hostports', async () => {
  const root = await mkdtemp(join(tmpdir(), 'flipbase-push-compose-'));
  try {
    const base = join(root, 'docker-compose.yml');
    await writeFile(
      base,
      `services:
  functions:
    image: supabase/edge-runtime:v1.73.5
    command: [start, --main-service, /home/deno/functions/main]
    environment:
      VERIFY_JWT: 'true'
      SUPABASE_URL: http://kong:8000
      SUPABASE_SERVICE_ROLE_KEY: fixture-server-only
    volumes:
      - ./original-functions:/home/deno/functions
`,
    );
    const compose = JSON.parse(
      execFileSync(
        'docker',
        [
          'compose',
          '-f',
          base,
          '-f',
          fileURLToPath(new URL('../deploy/docker-compose.push-functions.yml', import.meta.url)),
          'config',
          '--format',
          'json',
        ],
        {
          encoding: 'utf8',
          env: {
            ...process.env,
            PUSH_FUNCTIONS_DIRECTORY: join(root, 'release-functions'),
            FLIPBASE_SUPABASE_DIRECTORY: root,
            FLIPBASE_PUSH_IMAGE: `ghcr.io/grischatdev/flipbase-push@sha256:${'b'.repeat(64)}`,
            FLIPBASE_PUSH_COMMIT: 'a'.repeat(40),
          },
        },
      ),
    );
    assert.equal(compose.services.functions.environment.VERIFY_JWT, 'true');
    const functions = compose.services['push-functions'];
    assert.equal(functions.environment.VERIFY_JWT, 'false');
    assert.equal(functions.environment.SUPABASE_SERVICE_ROLE_KEY, 'fixture-server-only');
    assert.deepEqual(functions.command, [
      'start',
      '--main-service',
      '/home/deno/functions/push-main',
    ]);
    assert.equal(
      functions.volumes.filter((volume) => volume.target === '/home/deno/functions').length,
      1,
    );
    assert.equal(
      functions.volumes.find((volume) => volume.target === '/home/deno/functions').read_only,
      true,
    );
    assert.equal(functions.ports, undefined);
    const gateway = compose.services['push-gateway'];
    assert.equal(gateway.ports, undefined);
    assert.equal(gateway.environment.SUPABASE_SERVICE_ROLE_KEY, undefined);
    assert.equal(gateway.read_only, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('Geschuetzte Pushkonfiguration gilt fuer Functions und Worker mit Standard-aus und Kill-Switch', async () => {
  const root = await mkdtemp(join(tmpdir(), 'flipbase-push-runtime-'));
  const environmentFile = join(root, 'push.env');
  const supabaseEnvironmentFile = join(root, '.env');
  const defaultsEnvironmentFile = join(root, 'push-defaults.env');
  const base = join(root, 'docker-compose.yml');
  try {
    await writeFile(
      base,
      'services:\n  functions:\n    image: supabase/edge-runtime:v1.73.5\n    environment:\n      SUPABASE_URL: ${SUPABASE_URL}\n      SUPABASE_SERVICE_ROLE_KEY: ${SUPABASE_SERVICE_ROLE_KEY}\n',
    );
    await writeFile(
      supabaseEnvironmentFile,
      'SUPABASE_URL=http://kong:8000\nSUPABASE_SERVICE_ROLE_KEY=fixture-main-server-key\nWEB_PUSH_ENABLED=true\nWEB_PUSH_ALLOW_ALL=true\nWEB_PUSH_PILOT_USER_IDS=stale-main-user\nWEB_PUSH_PILOT_DEVICE_IDS=stale-main-device\nWEB_PUSH_VAPID_PUBLIC_KEY=stale-main-public-key\nWEB_PUSH_VAPID_KEY_ID=stale-main-key-id\nWEB_PUSH_ALLOWED_ORIGINS=https://stale.example.test\n',
    );
    const defaults =
      (await readFile(deployScript, 'utf8')).match(
        /^  cat > "\$PUSH_DEFAULTS_ENV_FILE" <<'PUSH_DEFAULTS'\n([\s\S]*?)\nPUSH_DEFAULTS$/mu,
      )?.[1] ?? '';
    await writeFile(defaultsEnvironmentFile, `${defaults}\n`);
    const environment = {
      ...process.env,
      PUSH_ENV_FILE: environmentFile,
      PUSH_FUNCTIONS_DIRECTORY: join(root, 'release-functions'),
      FLIPBASE_SUPABASE_DIRECTORY: root,
      FLIPBASE_PUSH_IMAGE: `ghcr.io/grischatdev/flipbase-push@sha256:${'b'.repeat(64)}`,
      FLIPBASE_PUSH_COMMIT: 'a'.repeat(40),
    };
    // Fremde Shellwerte sollen den Konfigurationsfall nicht beeinflussen.
    for (const variable of Object.keys(environment)) {
      if (variable.startsWith('WEB_PUSH_')) delete environment[variable];
    }
    const render = (worker, overrides = {}) =>
      JSON.parse(
        execFileSync(
          'docker',
          [
            'compose',
            ...(worker
              ? []
              : ['--env-file', supabaseEnvironmentFile, '--env-file', defaultsEnvironmentFile]),
            '--env-file',
            environmentFile,
            ...(worker ? [] : ['-f', base]),
            '-f',
            fileURLToPath(
              new URL(
                worker
                  ? '../deploy/docker-compose.push.yml'
                  : '../deploy/docker-compose.push-functions.yml',
                import.meta.url,
              ),
            ),
            'config',
            '--format',
            'json',
          ],
          { encoding: 'utf8', env: { ...environment, ...overrides } },
        ),
      ).services[worker ? 'push-worker' : 'push-functions'].environment;
    const protectedConfiguration = {
      WEB_PUSH_ENABLED: 'true',
      WEB_PUSH_ALLOW_ALL: 'false',
      WEB_PUSH_PILOT_USER_IDS: '11111111-1111-4111-8111-111111111111',
      WEB_PUSH_PILOT_DEVICE_IDS: '22222222-2222-4222-8222-222222222222',
      WEB_PUSH_VAPID_PUBLIC_KEY: 'fixture-public-key',
      WEB_PUSH_VAPID_KEY_ID: 'fixture-key-id',
      WEB_PUSH_ALLOWED_ORIGINS: 'https://app.example.test',
    };
    const configurationText = Object.entries(protectedConfiguration)
      .map(([name, setting]) => `${name}=${setting}\n`)
      .join('');
    await writeFile(environmentFile, configurationText, { mode: 0o600 });
    for (const worker of [false, true]) {
      const firstRelease = render(worker);
      const nextRelease = render(worker);
      for (const [name, setting] of Object.entries(protectedConfiguration)) {
        assert.equal(firstRelease[name], setting, name);
        assert.equal(nextRelease[name], setting, name);
      }
      const killed = render(worker, { WEB_PUSH_ENABLED: 'false', WEB_PUSH_ALLOW_ALL: 'false' });
      assert.equal(killed.WEB_PUSH_ENABLED, 'false');
      assert.equal(killed.WEB_PUSH_ALLOW_ALL, 'false');
      // Auch erlaubte Betriebsueberschreibungen muessen beide Dienste gleich erreichen.
      const overridden = render(worker, {
        WEB_PUSH_PILOT_USER_IDS: '33333333-3333-4333-8333-333333333333',
        WEB_PUSH_VAPID_KEY_ID: 'fixture-rotated-key-id',
      });
      assert.equal(overridden.WEB_PUSH_PILOT_USER_IDS, '33333333-3333-4333-8333-333333333333');
      assert.equal(overridden.WEB_PUSH_VAPID_KEY_ID, 'fixture-rotated-key-id');
    }
    assert.equal(await readFile(environmentFile, 'utf8'), configurationText);
    await writeFile(
      environmentFile,
      configurationText.replace('WEB_PUSH_ENABLED=true', 'WEB_PUSH_ENABLED=false'),
    );
    for (const worker of [false, true]) {
      const killed = render(worker);
      assert.equal(killed.WEB_PUSH_ENABLED, 'false');
      assert.equal(killed.WEB_PUSH_ALLOW_ALL, 'false');
      assert.equal(killed.WEB_PUSH_VAPID_KEY_ID, protectedConfiguration.WEB_PUSH_VAPID_KEY_ID);
    }
    await writeFile(environmentFile, 'SUPABASE_URL=https://api.example.test\n');
    for (const worker of [false, true]) {
      const disabled = render(worker);
      assert.equal(disabled.WEB_PUSH_ENABLED, 'false');
      assert.equal(disabled.WEB_PUSH_ALLOW_ALL, 'false');
      assert.equal(disabled.WEB_PUSH_PILOT_USER_IDS, '');
      assert.equal(disabled.WEB_PUSH_PILOT_DEVICE_IDS, '');
      assert.equal(disabled.WEB_PUSH_VAPID_PUBLIC_KEY, '');
      assert.equal(disabled.WEB_PUSH_VAPID_KEY_ID, '');
      assert.equal(disabled.WEB_PUSH_ALLOWED_ORIGINS, 'https://app.flipbase.de');
      if (!worker) {
        assert.equal(disabled.SUPABASE_URL, 'https://api.example.test');
        assert.equal(disabled.SUPABASE_SERVICE_ROLE_KEY, 'fixture-main-server-key');
      }
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test(
  'Pushparser erzwingt Digest, gleiche Commits und Migration vor Functions/Worker/App',
  { skip: process.platform === 'win32' },
  async () => {
    const root = await mkdtemp(join(tmpdir(), 'flipbase-push-deploy-'));
    const bin = join(root, 'bin');
    const runtime = join(root, 'push');
    const supabase = join(root, 'supabase');
    const artifact = join(root, 'artifact');
    const appSource = join(root, 'app-source');
    const log = join(root, 'calls.log');
    const appDigest = `sha256:${'a'.repeat(64)}`;
    const pushDigest = `sha256:${'b'.repeat(64)}`;
    const commit = 'a'.repeat(40);
    try {
      for (const directory of [bin, runtime, supabase]) await mkdir(directory, { recursive: true });
      await mkdir(appSource);
      const html = '<html>combined app and push release</html>';
      await writeFile(join(appSource, 'index.html'), html);
      await writeFile(
        join(appSource, 'pwa-assets.json'),
        JSON.stringify({
          version: 1,
          buildId: 'c'.repeat(64),
          assets: [{ url: '/index.html', sha256: createHash('sha256').update(html).digest('hex') }],
        }),
      );
      await writeFile(
        join(root, 'archive-app-build.py'),
        await readFile(new URL('../deploy/archive-app-build.py', import.meta.url)),
      );
      execFileSync(process.execPath, [
        fileURLToPath(new URL('./package-push-functions.mjs', import.meta.url)),
        artifact,
        commit,
      ]);
      await writeFile(join(supabase, 'docker-compose.yml'), 'services: {}\n');
      await writeFile(join(supabase, '.env'), 'TEST=true\n');
      await writeFile(join(root, 'Caddyfile'), 'old proxy configuration\n');
      const configurationText =
        'SUPABASE_URL=https://api.example.test\nWEB_PUSH_ENABLED=true\nWEB_PUSH_ALLOW_ALL=false\nWEB_PUSH_PILOT_USER_IDS=11111111-1111-4111-8111-111111111111\n';
      await writeFile(join(runtime, 'push.env'), configurationText, {
        mode: 0o600,
      });
      // Der CI-Nutzer ist kein root; nur die serverseitige Metadatenabfrage simulieren.
      await writeFile(
        join(bin, 'stat'),
        `#!/bin/bash
if [[ "$1" = -c && "$2" = '%u:%g:%a' && "$3" = "$FIXTURE_PUSH_ENV_FILE" ]]; then
  printf '%s\\n' "\${FIXTURE_PUSH_ENV_METADATA:-0:0:600}"
else
  exec /usr/bin/stat "$@"
fi
`,
        { mode: 0o755 },
      );
      // Die Commitabfrage bleibt simuliert; das App-Archiv wird mit dem echten
      // Python-Programm geprüft, auch bei einer gemeinsamen Pushauslieferung.
      await writeFile(
        join(bin, 'python3'),
        `#!/bin/bash
if [[ "$1" = -c && "$2" = 'import json,sys; print(json.load(open(sys.argv[1]))["commit"])' ]]; then
  exec node -e 'process.stdout.write(JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8")).commit + "\\n")' "$3"
fi
exec /usr/bin/python3 "$@"
`,
        { mode: 0o755 },
      );
      await writeFile(join(root, 'migration-backup.sh'), '#!/bin/bash\nexit 0\n', { mode: 0o755 });
      await writeFile(
        join(root, 'apply-release-migrations.sh'),
        '#!/bin/bash\necho "apply migrations" >> "$DOCKER_LOG"\n',
        { mode: 0o755 },
      );
      await writeFile(
        join(bin, 'docker'),
        `#!/bin/bash
echo "$*" >> "$DOCKER_LOG"
case "$1" in
 login) cat >/dev/null ;;
 create) echo artifact-container ;;
 cp)
  case "$2" in
   *:*/archive-app-build.py) cp "$REPO_ROOT/deploy/archive-app-build.py" "$3" ;;
   *:*/usr/share/nginx/html/.) cp -R "$APP_SOURCE/." "$3" ;;
   *:*/push-functions) cp -a "$FUNCTION_ARTIFACT" "$3" ;;
   *:*/docker-compose.push.yml) cp "$REPO_ROOT/deploy/docker-compose.push.yml" "$3" ;;
   *:*/docker-compose.push-functions.yml) cp "$REPO_ROOT/deploy/docker-compose.push-functions.yml" "$3" ;;
   *:*/Caddyfile) cp "$REPO_ROOT/deploy/Caddyfile" "$3" ;;
   *:*/migrations/.) mkdir -p "$3" ;;
   *) exit 92 ;;
  esac ;;
 compose)
  if [[ "$*" = *"docker-compose.push"* ]]; then
    [[ "$*" = *"--env-file $FIXTURE_PUSH_ENV_FILE"* ]] || exit 93
    [[ ! -v WEB_PUSH_ENABLED && ! -v WEB_PUSH_ALLOW_ALL ]] || exit 94
    if [[ "$*" = *"docker-compose.push-functions.yml"* ]]; then
      [[ "$*" = *"--env-file .env --env-file $PUSH_DEFAULTS_ENV_FILE --env-file $FIXTURE_PUSH_ENV_FILE"* ]] || exit 96
      [[ -f "$PUSH_DEFAULTS_ENV_FILE" && "$(stat -c '%a' "$PUSH_DEFAULTS_ENV_FILE")" = 600 ]] || exit 97
      grep -qx 'WEB_PUSH_ENABLED=false' "$PUSH_DEFAULTS_ENV_FILE" || exit 98
      grep -qx 'WEB_PUSH_ALLOW_ALL=false' "$PUSH_DEFAULTS_ENV_FILE" || exit 98
    fi
  fi
  case "$*" in
   *"config --images web"*) echo "$EXPECTED_APP_IMAGE" ;;
   *"config --images push-worker"*) echo "\${CONFIGURED_PUSH_IMAGE:-$EXPECTED_PUSH_IMAGE}" ;;
  esac ;;
 inspect)
  case "$*" in
   *org.opencontainers.image.revision*) echo "\${PUSH_REVISION:-$EXPECTED_COMMIT}" ;;
   *State.Health.Status*) echo healthy ;;
   *) echo sha256:fixture ;;
  esac ;;
 exec)
  if [[ "$2" = flipbase-web && "$3" = tar ]]; then tar -C "$APP_SOURCE" -cf - .; fi ;;
 pull|up|rm|logout|image) ;;
 *) exit 91 ;;
esac
`,
        { mode: 0o755 },
      );
      const environment = {
        ...process.env,
        PATH: `${bin}:${process.env.PATH ?? ''}`,
        FLIPBASE_DEPLOY_DIR: root,
        FLIPBASE_LANDING_DIR: join(root, 'absent'),
        FLIPBASE_CADDY_CONFIG_PATH: join(root, 'Caddyfile'),
        FLIPBASE_PUSH_RUNTIME_DIRECTORY: runtime,
        FLIPBASE_SUPABASE_DIRECTORY: supabase,
        SSH_ORIGINAL_COMMAND: `release-v1 ${appDigest} push ${pushDigest}`,
        DOCKER_LOG: log,
        FUNCTION_ARTIFACT: artifact,
        APP_SOURCE: appSource,
        REPO_ROOT: fileURLToPath(new URL('../', import.meta.url)),
        EXPECTED_APP_IMAGE: `ghcr.io/grischatdev/flipbase@${appDigest}`,
        EXPECTED_PUSH_IMAGE: `ghcr.io/grischatdev/flipbase-push@${pushDigest}`,
        EXPECTED_COMMIT: commit,
        FIXTURE_PUSH_ENV_FILE: join(runtime, 'push.env'),
      };
      const result = await runDeploy(environment);
      assert.equal(result.code, 0, result.stderr);
      assert.equal(
        await readFile(join(root, 'app-builds', 'c'.repeat(64), 'index.html'), 'utf8'),
        html,
      );
      assert.equal(await readFile(join(runtime, 'push.env'), 'utf8'), configurationText);
      const nextRelease = await runDeploy(environment);
      assert.equal(nextRelease.code, 0, nextRelease.stderr);
      assert.equal(await readFile(join(runtime, 'push.env'), 'utf8'), configurationText);
      for (const metadata of ['1001:1001:600', '0:0:644']) {
        const rejected = await runDeploy({ ...environment, FIXTURE_PUSH_ENV_METADATA: metadata });
        assert.equal(rejected.code, 1, metadata);
        assert.match(rejected.stderr, /root-Konfiguration mit Modus0600/u);
      }
      const linkedConfiguration = join(root, 'linked-push.env');
      await symlink(join(runtime, 'push.env'), linkedConfiguration);
      const linkedResult = await runDeploy({ ...environment, PUSH_ENV_FILE: linkedConfiguration });
      assert.equal(linkedResult.code, 1);
      assert.match(linkedResult.stderr, /root-Konfiguration mit Modus0600/u);
      const calls = await readFile(log, 'utf8');
      assert.match(
        calls,
        /caddy reload/u,
        'Push routing must activate without a landing directory',
      );
      assert.ok(
        calls.indexOf('apply migrations') <
          calls.indexOf('up -d --no-deps --pull never push-functions push-gateway'),
      );
      assert.ok(
        calls.indexOf('up -d --no-deps --pull never push-functions push-gateway') <
          calls.indexOf('up -d --pull never push-worker'),
      );
      assert.ok(
        calls.indexOf('up -d --pull never push-worker') < calls.indexOf('up -d --pull never web'),
      );
      for (const command of [
        `release-v1 ${appDigest} push latest`,
        `release-v1 ${appDigest} push sha-1234567`,
        `release-v1 ${appDigest} push ${pushDigest} push ${pushDigest}`,
        `web sha-1234567 push ${pushDigest}`,
        `push ${pushDigest};echo pwn`,
        `release-v1 ${appDigest} other ${pushDigest}`,
      ])
        assert.equal(
          (await runDeploy({ ...environment, SSH_ORIGINAL_COMMAND: command })).code,
          2,
          command,
        );
      await writeFile(log, '');
      assert.notEqual((await runDeploy({ ...environment, PUSH_REVISION: 'b'.repeat(40) })).code, 0);
      assert.doesNotMatch(await readFile(log, 'utf8'), /up -d/);
      await writeFile(log, '');
      assert.notEqual(
        (
          await runDeploy({
            ...environment,
            CONFIGURED_PUSH_IMAGE: 'ghcr.io/grischatdev/flipbase-push:latest',
          })
        ).code,
        0,
      );
      assert.doesNotMatch(await readFile(log, 'utf8'), /up -d/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);

test('Pushrelease liefert Functions, Ratelimit und Digest vor der kompatiblen App', async () => {
  const [deploy, image, proxy, workflow] = await Promise.all([
    readFile(deployScript, 'utf8'),
    readFile(dockerfile, 'utf8'),
    readFile(new URL('../deploy/Caddyfile', import.meta.url), 'utf8'),
    readFile(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8'),
  ]);
  assert.match(deploy, /PUSH_REFERENCE/u);
  assert.match(deploy, /prepare_push_runtime/u);
  assert.ok(
    deploy.indexOf('apply-release-migrations.sh" "$temporary/migrations"') <
      deploy.indexOf('activate_push_runtime "$release_container"'),
  );
  assert.ok(
    deploy.indexOf('activate_push_runtime "$release_container"') <
      deploy.indexOf('docker compose up -d --pull never web'),
  );
  assert.match(image, /release-push-functions \/opt\/flipbase\/push-functions/u);
  assert.match(proxy, /reverse_proxy flipbase-push-gateway:4177/u);
  assert.match(proxy, /header_up X-Forwarded-For \{remote_host\}/u);
  assert.ok(proxy.indexOf('handle @push_requests') < proxy.indexOf('handle @supabase_api'));
  assert.match(
    workflow,
    /if: \$\{\{ needs\.changes\.outputs\.push == 'true' \}\}\s+run: node scripts\/ci-checks\.mjs push/u,
  );
  assert.ok(
    getCheckCommands('push').some(
      ({ command, args }) =>
        command === 'npm' &&
        JSON.stringify(args) ===
          JSON.stringify(['ci', '--prefix', 'services/push-worker', '--ignore-scripts']),
    ),
  );
  assert.match(workflow, /push_digest:/u);
  assert.match(workflow, /Gate publication on successful checks/u);
});

test('der Botbrowser wird privat geroutet und mit dem geprüften Release vorbereitet', async () => {
  const [caddy, compose, deploy, webImage] = await Promise.all([
    readFile(new URL('../deploy/Caddyfile', import.meta.url), 'utf8'),
    readFile(new URL('../deploy/docker-compose.sniper.yml', import.meta.url), 'utf8'),
    readFile(deployScript, 'utf8'),
    readFile(dockerfile, 'utf8'),
  ]);
  assert.match(caddy, /handle @sniper_browser\s*\{\s*reverse_proxy 172\.18\.0\.1:8081/u);
  assert.doesNotMatch(caddy, /9228|\/json\/|sniper.*168\.119/u);
  assert.match(compose, /SNIPER_BROWSER_HOST: 172\.18\.0\.1/u);
  assert.match(compose, /shm_size: 128m/u);
  assert.match(compose, /stop_grace_period: 90s/u);
  assert.match(compose, /mem_limit: 2g/u);
  assert.match(compose, /memswap_limit: 3g/u);
  assert.match(compose, /SYS_CHROOT/u);
  assert.match(compose, /seccomp:/u);
  assert.match(
    webImage,
    /\/app\/deploy\/docker-compose\.sniper\.yml \/opt\/flipbase\/docker-compose\.sniper\.yml/u,
  );
  const preparation = deploy.indexOf('prepare_sniper_browser_runtime');
  const start = deploy.indexOf('up -d --pull never sniper');
  assert.ok(preparation >= 0 && start > preparation);
  assert.match(
    deploy,
    /docker cp "\$artifact_container":\/opt\/flipbase\/docker-compose\.sniper\.yml/u,
  );
  assert.match(deploy, /SUPABASE_ANON_KEY/u);
});

test('öffentliche Proxy-Regeln sperren beide MCP-Einstiegspunkte vor der API-Freigabe', async () => {
  const configuration = await readFile(new URL('../deploy/Caddyfile', import.meta.url), 'utf8');
  const publicMatcher = configuration.match(/^\s*@supabase_api path (.+)$/mu)?.[1].split(/\s+/u);
  assert.ok(publicMatcher, 'Die erlaubten öffentlichen API-Pfade müssen ausdrücklich sein.');
  assert.ok(
    publicMatcher.every(
      (path) => !['/mcp', '/mcp/*', '/api/mcp', '/api/mcp/*', '/*'].includes(path),
    ),
    'Verwaltungszugriff darf nicht von einer öffentlichen API-Freigabe erfasst werden.',
  );
  const blockedMatcher = configuration.match(/^\s*@supabase_mcp path (.+)$/mu)?.[1].split(/\s+/u);
  for (const path of ['/mcp', '/mcp/*', '/api/mcp', '/api/mcp/*'])
    assert.ok(blockedMatcher?.includes(path), `MCP-Einstiegspunkt ${path} muss gesperrt sein.`);
  assert.match(configuration, /handle @supabase_mcp\s*\{\s*respond 404\s*\}/u);
  assert.ok(
    configuration.indexOf('handle @supabase_mcp') < configuration.indexOf('handle @supabase_api'),
  );
});

test('jede öffentliche TLS-Domain erhält HSTS ohne pauschale Subdomainbindung', async () => {
  const configuration = await readFile(new URL('../deploy/Caddyfile', import.meta.url), 'utf8');
  const sites = configuration
    .split(/^(?=\S.*\{$)/mu)
    .filter((section) => /^\S.*\{$/mu.test(section));
  assert.equal(sites.length, 5);
  for (const site of sites) {
    assert.match(site, />Strict-Transport-Security "max-age=300"/u);
    assert.doesNotMatch(site, /Strict-Transport-Security "[^"]*(?:includeSubDomains|preload)/u);
  }
});

test('Docker-Kontext enthält alle Quellen des tatsächlich erzeugten Pushpakets', async () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const artifact = await mkdtemp(join(tmpdir(), 'flipbase-push-context-'));
  try {
    execFileSync(process.execPath, [
      join(root, 'scripts/package-push-functions.mjs'),
      artifact,
      'a'.repeat(40),
    ]);
    const rules = (await readFile(join(root, '.dockerignore'), 'utf8')).split(/\r?\n/u);
    const manifest = await readFile(join(artifact, 'manifest.sha256'), 'utf8');
    const files = manifest
      .trim()
      .split('\n')
      .map((entry) => entry.slice(66));
    assert.ok(files.length > 1, 'Die Prüfung muss das tatsächliche Functionpaket erfassen.');
    for (const file of files) {
      if (file === 'deployment.json') continue;
      if (file.startsWith('push-main/')) {
        const source = `deploy/${file}`;
        for (const exclusion of [
          'deploy',
          'deploy/',
          'deploy/*',
          'deploy/push-main/',
          'deploy/push-main/*',
          source,
        ])
          assert.ok(
            !rules.includes(exclusion),
            `${source} wird aus dem Docker-Kontext ausgeschlossen.`,
          );
        continue;
      }
      const source = `supabase/functions/${file}`;
      assert.ok(
        rules.lastIndexOf(`!${source}`) > rules.lastIndexOf(`${posix.dirname(source)}/*`),
        `${source} fehlt im Docker-Kontext des Pushpakets.`,
      );
    }
  } finally {
    await rm(artifact, { recursive: true, force: true });
  }
});

test('Docker-Kontext enthält alle von Angular verwendeten gemeinsamen Verträge', async () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const rules = (await readFile(join(root, '.dockerignore'), 'utf8')).split(/\r?\n/u);
  const sharedPrefix = 'supabase/functions/_shared/';
  const resolveContractFile = (directory, modulePath) => {
    const contractPath = posix.join(directory, modulePath);
    if (/\.[cm]?ts$/u.test(contractPath)) return contractPath;
    return existsSync(join(root, `${contractPath}.ts`))
      ? `${contractPath}.ts`
      : `${contractPath}.d.ts`;
  };
  const pending = new Set();
  for (const file of await readdir(join(root, 'src'), { recursive: true })) {
    if (!file.endsWith('.ts') || file.endsWith('.spec.ts')) continue;
    const source = await readFile(join(root, 'src', file), 'utf8');
    for (const match of source.matchAll(/['"][^'"]*supabase\/functions\/_shared\/([^'"]+)['"]/gu)) {
      pending.add(resolveContractFile(sharedPrefix, match[1]));
    }
  }
  assert.ok(pending.size > 0, 'Die Prüfung muss tatsächliche Angular-Importe erfassen.');
  for (const file of pending) {
    if (file.startsWith(sharedPrefix)) {
      const allowIndex = rules.lastIndexOf(`!${file}`);
      assert.ok(
        allowIndex > rules.lastIndexOf(`${sharedPrefix}*`),
        `${file} fehlt im Docker-Kontext.`,
      );
    }
    const source = await readFile(join(root, file), 'utf8');
    for (const match of source.matchAll(/from ['"](\.\.?\/[^'"]+)['"]/gu)) {
      pending.add(resolveContractFile(posix.dirname(file), match[1]));
    }
  }
});

test('liefert die passende Caddy-Regel vor der Landingpage aus', async () => {
  const [deploySource, dockerfileSource] = await Promise.all([
    readFile(deployScript, 'utf8'),
    readFile(dockerfile, 'utf8'),
  ]);

  assert.match(
    dockerfileSource,
    /COPY --from=build \/app\/deploy\/Caddyfile \/opt\/flipbase\/Caddyfile/u,
    'Das Release-Abbild muss die geprüfte Caddy-Konfiguration enthalten.',
  );

  const caddyCopy = deploySource.indexOf('docker cp flipbase-web:/opt/flipbase/Caddyfile');
  const caddyReloadAfterCopy = deploySource
    .slice(caddyCopy)
    .search(/caddy reload\s+\\\s*\n\s*--config \/etc\/caddy\/Caddyfile/u);
  const landingCopy = deploySource.indexOf(
    'docker cp flipbase-web:/usr/share/nginx/landing/. "$LANDING_DIRECTORY"/',
  );
  const caddyActivation = deploySource.lastIndexOf(
    'activate_release_caddy_configuration',
    landingCopy,
  );
  const caddyRestoreAfterLandingCopy = deploySource
    .slice(landingCopy)
    .indexOf('restore_caddy_configuration');

  assert.ok(caddyCopy >= 0, 'Das Deployment muss das Caddyfile aus demselben Abbild lesen.');
  assert.ok(caddyReloadAfterCopy >= 0, 'Caddy muss nach dem Kopieren neu geladen werden.');
  assert.ok(
    landingCopy > caddyActivation,
    'Die neue Landingpage darf erst nach der passenden CSP-Regel sichtbar werden.',
  );
  assert.ok(
    caddyRestoreAfterLandingCopy >= 0,
    'Ein fehlgeschlagener Landing-Abgleich muss die vorherige Caddy-Konfiguration wiederherstellen.',
  );
});

test(
  'Digest-Release sperrt SQL-Fehler vor Containerstart und verwendet denselben Digest',
  { skip: process.platform === 'win32' },
  async () => {
    const root = await mkdtemp(join(tmpdir(), 'flipbase-release-'));
    const bin = join(root, 'bin');
    await mkdir(bin);
    const digest = `sha256:${'a'.repeat(64)}`;
    const image = `ghcr.io/grischatdev/flipbase@${digest}`;
    try {
      await writeFile(
        join(bin, 'docker'),
        `#!/bin/bash
case "$1" in
 login) cat >/dev/null ;;
 pull) [[ "$2" == "$EXPECTED_IMAGE" ]] || exit 90 ;;
 create) [[ "$2" == "$EXPECTED_IMAGE" ]] || exit 91; echo release-fixture ;;
 cp)
   case "$2" in
     */archive-app-build.py)
       [[ "\${MISSING_ARCHIVER:-0}" != 1 ]] || exit 1
       cp "$ARCHIVE_SCRIPT" "$3" ;;
     */usr/share/nginx/html/.) cp -R "$APP_SOURCE/." "$3" ;;
   esac ;;
 exec) tar -C "$APP_SOURCE" -cf - . ;;
 rm|logout|image) ;;
 compose) [[ "$FLIPBASE_IMAGE" == "$EXPECTED_IMAGE" ]] || exit 92; if [[ "$2" == config ]]; then echo "\${CONFIGURED_IMAGE:-$EXPECTED_IMAGE}"; else echo start; fi ;;
 inspect) echo healthy ;;
 *) exit 93 ;;
esac
`,
        { mode: 0o755 },
      );
      await writeFile(
        join(root, 'apply-release-migrations.sh'),
        '#!/bin/bash\nexit "${MIGRATION_STATUS:-0}"\n',
        { mode: 0o755 },
      );
      await writeFile(join(root, 'migration-backup.sh'), '#!/bin/bash\nexit 0\n', { mode: 0o755 });
      const appSource = join(root, 'app-source');
      await mkdir(appSource);
      const html = '<html>versioned release</html>';
      const buildId = 'b'.repeat(64);
      await writeFile(join(appSource, 'index.html'), html);
      await writeFile(
        join(appSource, 'pwa-assets.json'),
        JSON.stringify({
          version: 1,
          buildId,
          assets: [{ url: '/index.html', sha256: createHash('sha256').update(html).digest('hex') }],
        }),
      );
      const archiveScript = join(root, 'archive-app-build.py');
      await writeFile(
        archiveScript,
        await readFile(new URL('../deploy/archive-app-build.py', import.meta.url)),
      );
      const env = {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        FLIPBASE_DEPLOY_DIR: root,
        FLIPBASE_LANDING_DIR: join(root, 'absent'),
        SSH_ORIGINAL_COMMAND: `release-v1 ${digest}`,
        EXPECTED_IMAGE: image,
        ARCHIVE_SCRIPT: archiveScript,
        APP_SOURCE: appSource,
      };
      const success = await runDeploy(env);
      assert.equal(success.code, 0, success.stderr);
      assert.match(success.stdout, /start/);
      assert.equal(await readFile(join(root, 'app-builds', buildId, 'index.html'), 'utf8'), html);
      const historical = await runDeploy({ ...env, MISSING_ARCHIVER: '1' });
      assert.equal(historical.code, 0, historical.stderr);
      assert.match(historical.stdout, /start/);
      const outdated = await runDeploy({
        ...env,
        CONFIGURED_IMAGE: 'ghcr.io/grischatdev/flipbase:latest',
      });
      assert.notEqual(outdated.code, 0, 'Veraltetes Compose muss vor Migrationen stoppen');
      assert.doesNotMatch(outdated.stdout, /start/);
      const failed = await runDeploy({ ...env, MIGRATION_STATUS: '42' });
      assert.equal(failed.code, 42, failed.stderr);
      assert.doesNotMatch(failed.stdout, /start/);
      for (const command of [
        'release-v1 latest',
        `release-v1 ${digest} extra`,
        '$(touch /tmp/not-allowed)',
        `release-v1 sha256:${'a'.repeat(65)}`,
      ]) {
        assert.equal((await runDeploy({ ...env, SSH_ORIGINAL_COMMAND: command })).code, 2);
      }
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  },
);

function runDeploy(environment) {
  return new Promise((resolve, reject) => {
    const child = spawn('bash', [deployScript], {
      env: environment,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.once('error', reject);
    child.once('close', (code) => resolve({ code, stdout, stderr }));
  });
}

test(
  'meldet einen fehlgeschlagenen Landing-Abgleich als fehlgeschlagenes Deployment',
  {
    skip: process.platform === 'win32' ? 'Die Shell-Fixture benötigt eine POSIX-Umgebung.' : false,
  },
  async () => {
    const fixtureDirectory = await mkdtemp(join(tmpdir(), 'flipbase-deploy-'));
    const deployDirectory = join(fixtureDirectory, 'app');
    const landingDirectory = join(fixtureDirectory, 'landing');
    const binDirectory = join(fixtureDirectory, 'bin');
    const caddyConfig = join(fixtureDirectory, 'Caddyfile');
    const caddyCandidate = 'fixture-caddy-config\n';

    try {
      await Promise.all([mkdir(deployDirectory), mkdir(landingDirectory), mkdir(binDirectory)]);
      await writeFile(caddyConfig, caddyCandidate, 'utf8');
      const dockerFixture = join(binDirectory, 'docker');
      await writeFile(
        dockerFixture,
        `#!/bin/sh
case "$1" in
  login) cat >/dev/null ;;
  compose|logout|image) ;;
  inspect) echo healthy ;;
  cp)
    if [ "$2" = "flipbase-web:/opt/flipbase/Caddyfile" ]; then
      printf '%s' "$CADDY_CANDIDATE" > "$3"
    else
      exit 42
    fi
    ;;
  logs) echo container logs >&2 ;;
esac
`,
        'utf8',
      );
      await chmod(dockerFixture, 0o755);

      const result = await runDeploy({
        ...process.env,
        PATH: `${binDirectory}:${process.env.PATH ?? ''}`,
        SSH_ORIGINAL_COMMAND: 'sha-1234567',
        FLIPBASE_DEPLOY_DIR: deployDirectory,
        FLIPBASE_LANDING_DIR: landingDirectory,
        FLIPBASE_CADDY_CONFIG_PATH: caddyConfig,
        CADDY_CANDIDATE: caddyCandidate,
      });

      assert.equal(result.code, 1);
      assert.match(result.stdout, /flipbase-web ist gesund\./);
      assert.doesNotMatch(result.stdout, /Landingpage synchronisiert\./);
      assert.match(result.stderr, /vorherige Caddy-Konfiguration wieder her/u);
    } finally {
      await rm(fixtureDirectory, { force: true, recursive: true });
    }
  },
);

test(
  'rollt ein separates Sniper-Abbild aus und legt dessen Profil ohne Host-Benutzer an',
  { skip: process.platform === 'win32' },
  async () => {
    const root = await mkdtemp(join(tmpdir(), 'flipbase-sniper-deploy-'));
    const bin = join(root, 'bin');
    const log = join(root, 'docker.log');
    await mkdir(bin);
    try {
      const profileLog = join(root, 'profile.log');
      await writeFile(
        join(bin, 'install'),
        `#!/bin/sh
case " $* " in
  *" -o "*|*" -g "*) echo "install: invalid user: '1000'" >&2; exit 1 ;;
esac
exec /usr/bin/install "$@"
`,
        { mode: 0o755 },
      );
      await writeFile(join(bin, 'chown'), '#!/bin/sh\nprintf "%s\\n" "$*" >> "$PROFILE_LOG"\n', {
        mode: 0o755,
      });
      await writeFile(
        join(root, 'sniper.env'),
        'SUPABASE_ANON_KEY=public-fixture-key-for-authentication\n',
      );
      await writeFile(join(bin, 'stat'), '#!/bin/sh\necho "${PROFILE_OWNER:-1000:1000:700}"\n', {
        mode: 0o755,
      });
      await writeFile(
        join(bin, 'docker'),
        `#!/bin/bash
echo "$*" >> "$DOCKER_LOG"
case "$1" in
 login) cat >/dev/null ;;
 compose)
   if [[ "$2" == "-f" ]]; then
     [[ "$FLIPBASE_SNIPER_IMAGE" == "$EXPECTED_SNIPER_IMAGE" ]] || exit 90
     if [[ "$4" == config ]]; then echo "\${CONFIGURED_SNIPER_IMAGE:-$EXPECTED_SNIPER_IMAGE}"; fi
   fi
   ;;
 inspect) echo healthy ;;
 cp)
   case "$2" in
     *docker-compose.sniper.yml) printf 'services:\\n  sniper:\\n    image: fixture\\n' > "$3" ;;
     *chromium-seccomp.json) printf '{"defaultAction":"SCMP_ACT_ERRNO"}' > "$3" ;;
     *) exit 92 ;;
   esac
   ;;
 logout|image) ;;
 *) exit 91 ;;
esac
`,
        { mode: 0o755 },
      );
      const result = await runDeploy({
        ...process.env,
        PATH: `${bin}:${process.env.PATH ?? ''}`,
        FLIPBASE_DEPLOY_DIR: root,
        FLIPBASE_LANDING_DIR: join(root, 'absent'),
        FLIPBASE_SNIPER_COMPOSE_FILE: join(root, 'docker-compose.sniper.yml'),
        SSH_ORIGINAL_COMMAND: 'web sha-1234567 sniper sha-7654321',
        DOCKER_LOG: log,
        EXPECTED_SNIPER_IMAGE: 'ghcr.io/grischatdev/flipbase-sniper:sha-7654321',
        PROFILE_LOG: profileLog,
      });

      assert.equal(result.code, 0, result.stderr);
      assert.match(result.stdout, /flipbase-web ist gesund\./);
      assert.match(result.stdout, /flipbase-sniper ist gesund\./);
      assert.equal(await readFile(profileLog, 'utf8'), `1000:1000 ${join(root, 'browser')}\n`);
      const dockerCalls = await readFile(log, 'utf8');
      assert.match(dockerCalls, /compose -f .* pull sniper/);
      assert.match(dockerCalls, /compose -f .* up -d --pull never sniper/);
      const digest = `sha256:${'b'.repeat(64)}`;
      const environment = {
        ...process.env,
        PATH: `${bin}:${process.env.PATH ?? ''}`,
        FLIPBASE_DEPLOY_DIR: root,
        FLIPBASE_LANDING_DIR: join(root, 'absent'),
        FLIPBASE_SNIPER_COMPOSE_FILE: join(root, 'docker-compose.sniper.yml'),
        SSH_ORIGINAL_COMMAND: `sniper ${digest}`,
        DOCKER_LOG: log,
        EXPECTED_SNIPER_IMAGE: `ghcr.io/grischatdev/flipbase-sniper@${digest}`,
      };
      const immutable = await runDeploy(environment);
      assert.equal(immutable.code, 0, immutable.stderr);
      await writeFile(log, '');
      const stale = await runDeploy({
        ...environment,
        CONFIGURED_SNIPER_IMAGE: 'ghcr.io/grischatdev/flipbase-sniper:latest',
      });
      assert.notEqual(stale.code, 0);
      assert.doesNotMatch(await readFile(log, 'utf8'), /pull sniper|up .*sniper/);
      for (const command of [
        'sniper latest',
        `sniper sha256:${'b'.repeat(65)}`,
        `sniper ${digest} extra`,
      ])
        assert.equal((await runDeploy({ ...environment, SSH_ORIGINAL_COMMAND: command })).code, 2);
      assert.ok(
        dockerCalls.indexOf('config --quiet') < dockerCalls.indexOf('up -d --pull never sniper'),
      );
      assert.equal(
        await readFile(join(root, 'docker-compose.sniper.yml'), 'utf8'),
        'services:\n  sniper:\n    image: fixture\n',
      );
      assert.equal(
        await readFile(join(root, 'chromium-seccomp.json'), 'utf8'),
        '{"defaultAction":"SCMP_ACT_ERRNO"}',
      );
      await writeFile(join(root, 'sniper.env'), 'SUPABASE_ANON_KEY=""\n');
      await writeFile(log, '');
      const missingKey = await runDeploy({
        ...process.env,
        PATH: `${bin}:${process.env.PATH ?? ''}`,
        FLIPBASE_DEPLOY_DIR: root,
        FLIPBASE_SNIPER_COMPOSE_FILE: join(root, 'docker-compose.sniper.yml'),
        SSH_ORIGINAL_COMMAND: 'sniper sha-7654321',
        DOCKER_LOG: log,
        EXPECTED_SNIPER_IMAGE: 'ghcr.io/grischatdev/flipbase-sniper:sha-7654321',
      });
      assert.notEqual(missingKey.code, 0);
      assert.match(missingKey.stderr, /SUPABASE_ANON_KEY fehlt/);
      assert.doesNotMatch(await readFile(log, 'utf8'), /up -d/);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  },
);
