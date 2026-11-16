"""Prüft die Löschgrenzen ohne Zugriff auf Docker oder Produktionssicherungen."""

import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch


script = Path(__file__).resolve().parents[1] / "deploy" / "cleanup-server-storage.py"
spec = importlib.util.spec_from_file_location("storage_retention", script)
retention = importlib.util.module_from_spec(spec)
spec.loader.exec_module(retention)
repository = "ghcr.io/grischatdev/flipbase"


def image(number, repositories=None, created=None):
    return {
        "id": f"sha256:{number:064x}",
        "created": created or f"2026-10-{number:02d}T12:00:00Z",
        "tags": [f"{name}:sha-{number:07x}" for name in (repositories or [repository])],
        "digests": [],
    }


class ImageRetentionTests(unittest.TestCase):
    def test_keeps_every_container_version_and_two_unique_rollback_versions(self):
        images = [image(number) for number in range(1, 7)]
        # Auch ein alter gestoppter Container behält sein Image.
        referenced = {images[0]["id"], images[-1]["id"]}
        selected = retention.select_old_images(images, referenced)
        self.assertEqual([images[1]["id"], images[2]["id"]], [item["id"] for item in selected])

    def test_keeps_three_versions_when_service_has_no_container(self):
        images = [image(number) for number in range(1, 6)]
        selected = retention.select_old_images(images, set())
        self.assertEqual([images[0], images[1]], selected)

    def test_never_selects_foreign_images_or_shared_foreign_tags(self):
        images = [image(number) for number in range(1, 6)]
        images[0]["tags"].append("private.example/unrelated:keep")
        images.append(image(6, ["supabase/postgres"]))
        selected = retention.select_old_images(images, set())
        self.assertEqual([images[1]], selected)

    def test_digest_only_versions_and_nanoseconds_are_ordered_correctly(self):
        images = [image(number) for number in range(1, 5)]
        images[2]["created"] = "2026-10-04T12:00:00.123456789Z"
        for item in images:
            item["digests"] = [f"{repository}@{item['id']}"]
            item["tags"] = []
        self.assertEqual([images[0]], retention.select_old_images(images, set()))

    def test_apply_skips_new_container_references_and_never_forces_removal(self):
        candidate = image(1)
        with patch.object(retention, "read_referenced_images", return_value={candidate["id"]}):
            with patch.object(retention, "run_command") as command:
                retention.apply_images([candidate])
                command.assert_not_called()
        with patch.object(retention, "read_referenced_images", return_value=set()):
            with patch.object(retention, "run_command") as command:
                command.return_value.stdout = candidate["id"] + "\n"
                retention.apply_images([candidate])
                self.assertEqual(
                    ["docker", "image", "rm", "--no-prune"] + candidate["tags"],
                    command.call_args.args[0],
                )

    def test_changed_tag_aborts_before_removal(self):
        with patch.object(retention, "read_referenced_images", return_value=set()):
            with patch.object(retention, "run_command") as command:
                command.return_value.stdout = "sha256:replacement"
                with self.assertRaises(ValueError):
                    retention.apply_images([image(1)])
                self.assertEqual(1, command.call_count)

    def test_supabase_registry_aliases_share_two_cache_slots(self):
        images = [image(number, ["supabase/postgres"]) for number in range(1, 6)]
        images[2]["tags"].append("public.ecr.aws/supabase/postgres:v3")
        images[3]["tags"] = ["public.ecr.aws/supabase/postgres:v4"]
        selected = retention.select_old_images(images, {images[0]["id"]}, True)
        self.assertEqual(images[1:3], selected)
        self.assertEqual([], retention.select_old_images(images, set()))

    def test_supabase_foreign_alias_and_every_configured_version_are_protected(self):
        images = [image(number, ["supabase/storage-api"]) for number in range(1, 7)]
        images[1]["tags"].append("other.example/storage:keep")
        selected = retention.select_old_images(images, {images[0]["id"], images[2]["id"]}, True)
        self.assertEqual([images[3]], selected)

    def test_supabase_apply_rechecks_compose_before_removal(self):
        candidate = image(1, ["supabase/postgres"])
        with patch.object(retention, "read_referenced_images", return_value=set()), patch.object(
            retention, "read_supabase_compose_images", return_value={candidate["id"]}
        ), patch.object(retention, "run_command") as command:
            retention.apply_images([candidate], True)
            command.assert_not_called()

    def test_compose_queries_only_image_names_and_rejects_missing_configuration(self):
        with patch.object(retention, "run_command") as command, patch.object(
            retention.subprocess, "run"
        ) as inspect:
            command.side_effect = [
                subprocess.CompletedProcess([], 0, json.dumps({
                    "com.docker.compose.project.config_files": "/opt/supabase/docker-compose.yml,/opt/supabase/docker-compose.pg17.yml",
                })),
                subprocess.CompletedProcess([], 0, "supabase/postgres:v1\nsupabase/postgres:v1\n"),
            ]
            inspect.return_value = subprocess.CompletedProcess([], 0, "sha256:protected\n")
            self.assertEqual({"sha256:protected"}, retention.read_supabase_compose_images())
            self.assertEqual([
                "docker", "compose", "-f", "/opt/supabase/docker-compose.yml",
                "-f", "/opt/supabase/docker-compose.pg17.yml", "config", "--images",
            ], command.call_args.args[0])
            self.assertEqual(1, inspect.call_count)
        with patch.object(retention, "run_command") as command:
            command.return_value.stdout = "{}"
            with self.assertRaises(ValueError):
                retention.read_supabase_compose_images()

    def test_broker_and_push_images_follow_two_rollback_retention(self):
        for repo in (
            "ghcr.io/grischatdev/flipbase-chromium-broker",
            "ghcr.io/grischatdev/flipbase-push",
        ):
            with self.subTest(repo=repo):
                images = [image(number, [repo]) for number in range(1, 6)]
                selected = retention.select_old_images(images, {images[-1]["id"]})
                self.assertEqual([images[0]["id"], images[1]["id"]], [item["id"] for item in selected])

    def test_session_images_keep_configured_and_one_rollback(self):
        session_repo = "ghcr.io/grischatdev/flipbase-chromium-session"
        images = [image(number, [session_repo]) for number in range(1, 5)]
        selected = retention.select_old_images(images, {images[-1]["id"]})
        self.assertEqual([images[0]["id"], images[1]["id"]], [item["id"] for item in selected])
        selected_idle = retention.select_old_images(images, set())
        self.assertEqual([images[0]["id"], images[1]["id"]], [item["id"] for item in selected_idle])

    def test_reads_configured_marketplace_session_image_and_protects_on_apply(self):
        session_repo = "ghcr.io/grischatdev/flipbase-chromium-session"
        candidate = image(1, [session_repo])
        with patch.object(retention.subprocess, "run") as inspect:
            inspect.side_effect = [
                subprocess.CompletedProcess([], 0, json.dumps(["OTHER=1", f"MARKETPLACE_CHROMIUM_IMAGE={session_repo}@sha256:abc"])),
                subprocess.CompletedProcess([], 1, "", "Error response from daemon: No such container: broker"),
                subprocess.CompletedProcess([], 0, candidate["id"] + "\n"),
            ]
            self.assertEqual({candidate["id"]}, retention.read_marketplace_session_images())
        with patch.object(retention, "read_referenced_images", return_value=set()), patch.object(
            retention, "read_marketplace_session_images", return_value={candidate["id"]}
        ), patch.object(retention, "run_command") as command:
            retention.apply_images([candidate])
            command.assert_not_called()

    def test_read_referenced_images_ignores_ephemeral_containers_removed_mid_inspect(self):
        with patch.object(retention, "run_command") as ls_cmd, patch.object(
            retention.subprocess, "run"
        ) as inspect:
            ls_cmd.return_value.stdout = "c_live\nc_gone\n"
            inspect.side_effect = [
                subprocess.CompletedProcess([], 1, "", "Error: No such container: c_gone"),
                subprocess.CompletedProcess([], 0, "sha256:live\n"),
                subprocess.CompletedProcess([], 1, "", "Error response from daemon: No such object: c_gone"),
            ]
            self.assertEqual({"sha256:live"}, retention.read_referenced_images())


class ChromiumRetentionTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.chromium = self.root / "chromium"
        self.worker = self.root / "chromium-worker"
        (self.chromium / "profiles").mkdir(parents=True)
        (self.chromium / "archive").mkdir(parents=True)
        (self.worker / "profiles").mkdir(parents=True)
        self.old = 1_700_000_000
        self.now = self.old + 3600

    def tearDown(self):
        self.temporary.cleanup()

    def write_aged(self, path, content=b"x", mtime=None):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)
        stamp = self.old if mtime is None else mtime
        os.utime(path, (stamp, stamp))
        return path

    def test_cleans_only_disposable_telemetry_on_idle_active_and_caches_on_archived(self):
        idle_id = "chromium_00000000-0000-4000-8000-000000000001"
        idle = self.chromium / "profiles" / idle_id
        metric = self.write_aged(idle / "BrowserMetrics" / "old.pma", b"12345")
        fresh_metric = self.write_aged(idle / "BrowserMetrics" / "fresh.pma", b"123", mtime=self.now - 10)
        crash = self.write_aged(idle / "Crashpad" / "reports" / "c.dmp", b"1234")
        cookies = self.write_aged(idle / "Default" / "Cookies", b"session-cookie")
        http_cache = self.write_aged(idle / "Default" / "Cache" / "Cache_Data" / "data_0", b"warm-cache")
        os.utime(idle, (self.old, self.old))

        locked_id = "chromium_00000000-0000-4000-8000-000000000002"
        locked = self.chromium / "profiles" / locked_id
        locked_metric = self.write_aged(locked / "BrowserMetrics" / "keep.pma", b"keep")
        os.utime(locked, (self.old, self.old))
        (self.worker / "profiles" / f"{locked_id}.running").mkdir()

        container_id = "chromium_00000000-0000-4000-8000-000000000003"
        container_prof = self.chromium / "profiles" / container_id
        container_metric = self.write_aged(container_prof / "BrowserMetrics" / "keep.pma", b"keep")
        os.utime(container_prof, (self.old, self.old))

        archived_id = "chromium_00000000-0000-4000-8000-000000000004"
        archived = self.chromium / "archive" / archived_id
        archived_cache = self.write_aged(archived / "Default" / "Cache" / "Cache_Data" / "c0", b"123456")
        archived_cookies = self.write_aged(archived / "Default" / "Cookies", b"archived-cookie")
        archived_json = self.write_aged(self.chromium / "archive" / f"{archived_id}.json", b"{}")

        entries = retention.plan_chromium_cleanup(
            self.chromium, self.worker, min_idle_seconds=120, active_containers={container_id}, now=self.now,
        )
        planned_paths = {entry["path"] for entry in entries}
        self.assertEqual({metric, crash, archived / "Default" / "Cache"}, planned_paths)

        retention.apply_chromium_cleanup(
            entries, worker_directory=self.worker, min_idle_seconds=120, active_containers={container_id},
        )
        self.assertFalse(metric.exists())
        self.assertFalse(crash.exists())
        self.assertTrue(fresh_metric.exists())
        self.assertTrue(cookies.exists())
        self.assertTrue(http_cache.exists())
        self.assertTrue(locked_metric.exists())
        self.assertTrue(container_metric.exists())
        self.assertFalse(archived_cache.exists())
        self.assertTrue(archived_cookies.exists())
        self.assertTrue(archived_json.exists())

    def test_apply_rechecks_locks_before_removing_planned_files(self):
        profile_id = "chromium_00000000-0000-4000-8000-000000000005"
        profile = self.chromium / "profiles" / profile_id
        metric = self.write_aged(profile / "BrowserMetrics" / "old.pma", b"12345")
        os.utime(profile, (self.old, self.old))
        entries = retention.plan_chromium_cleanup(
            self.chromium, self.worker, min_idle_seconds=120, active_containers=set(), now=self.now,
        )
        self.assertEqual(1, len(entries))
        (self.worker / "profiles" / f"{profile_id}.running").mkdir()
        retention.apply_chromium_cleanup(
            entries, worker_directory=self.worker, min_idle_seconds=120, active_containers=set(),
        )
        self.assertTrue(metric.exists())


class BackupRetentionTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.directory = Path(self.temporary.name)

    def tearDown(self):
        self.temporary.cleanup()

    def encrypted(self, name, modified=1):
        path = self.directory / name
        path.write_bytes(b"age-encryption.org/v1\n" + b"encrypted-test-content" * 3)
        os.utime(path, (modified, modified))
        return path

    def nightly(self, day, encrypted=True):
        files = []
        for prefix, extension in retention.BACKUP_EXTENSIONS.items():
            name = f"{prefix}_2026-10-{day:02d}_0330.{extension}"
            if encrypted:
                files.append(self.encrypted(name + ".age", day * 10))
            original = self.directory / name
            original.write_bytes(b"private-test-content")
            os.utime(original, (day * 10 - 1, day * 10 - 1))
            files.append(original)
        return files

    def test_keeps_three_releases_and_seven_complete_sets_without_plain_duplicates(self):
        releases = [self.encrypted(f"release-db-{number:08d}.sql.gz.age", number) for number in range(1, 6)]
        for day in range(1, 10):
            self.nightly(day)
        candidates, verification, kept_releases, kept_sets = retention.plan_backups(self.directory)
        self.assertEqual(set(releases[3:5] + [releases[2]]), set(kept_releases))
        self.assertEqual(7, len(kept_sets))
        self.assertEqual(24, len(verification))
        self.assertEqual(35, len(candidates))  # 27 Duplikate, 6 alte Satzdateien, 2 Releases.
        self.assertFalse(set(candidates) & set(verification))

    def test_incomplete_invalid_and_unrelated_files_stay_untouched(self):
        protected = [self.encrypted("db_2026-10-09_0330.sql.gz.age")]
        protected.extend(self.nightly(10, encrypted=False))
        invalid = self.directory / "release-db-12345678.sql.gz.age"
        invalid.write_text("invalid", encoding="utf8")
        protected.append(invalid)
        foreign = self.directory / "customer-document.pdf"
        foreign.write_text("important", encoding="utf8")
        protected.append(foreign)
        candidates, _, _, _ = retention.plan_backups(self.directory)
        self.assertEqual([], candidates)
        self.assertTrue(all(path.exists() for path in protected))

    def test_changed_plaintext_and_symlinks_are_not_duplicates(self):
        files = self.nightly(1)
        original = next(path for path in files if path.suffix != ".age")
        os.utime(original, (100, 100))
        candidates, _, _, _ = retention.plan_backups(self.directory)
        self.assertNotIn(original, candidates)
        with patch.object(Path, "is_symlink", return_value=True):
            self.assertFalse(retention.is_encrypted_backup(files[0]))
            with self.assertRaises(ValueError):
                retention.plan_backups(self.directory)

    def test_offsite_comparison_checks_content_and_fails_closed(self):
        encrypted = self.encrypted("release-db-12345678.sql.gz.age")
        with patch.object(retention, "run_command") as command:
            command.return_value.stdout = ">f+++++++++ missing-backup\n"
            with self.assertRaises(ValueError):
                retention.verify_offsite(self.directory, [encrypted])
            arguments = command.call_args.args[0]
            self.assertIn("--dry-run", arguments)
            self.assertIn("--checksum", arguments)
            self.assertIn("StrictHostKeyChecking=yes", arguments[arguments.index("-e") + 1])
            self.assertEqual(encrypted.name + "\0", command.call_args.kwargs["input"])
        with patch.object(retention, "run_command", side_effect=subprocess.CalledProcessError(23, "rsync")):
            with self.assertRaises(subprocess.CalledProcessError):
                retention.verify_offsite(self.directory, [encrypted])

    def run_main(self, apply=False):
        argv = [str(script), "--scope", "backups", "--backup-directory", str(self.directory)]
        if apply:
            argv.append("--apply")
        with patch.object(sys, "argv", argv), patch.object(retention, "storage_locks", return_value=contextlib.nullcontext()):
            with contextlib.redirect_stdout(io.StringIO()) as output:
                retention.main()
                return json.loads(output.getvalue().splitlines()[0])

    def test_preview_never_deletes_and_apply_requires_external_verification(self):
        for number in range(1, 6):
            self.encrypted(f"release-db-{number:08d}.sql.gz.age", number)
        original_names = sorted(path.name for path in self.directory.iterdir())
        with patch.object(retention, "verify_offsite") as verification:
            self.assertEqual("preview", self.run_main()["mode"])
            verification.assert_not_called()
        self.assertEqual(original_names, sorted(path.name for path in self.directory.iterdir()))
        with patch.object(retention, "verify_offsite", side_effect=ValueError("not verified")):
            with self.assertRaises(ValueError):
                self.run_main(apply=True)
        self.assertEqual(original_names, sorted(path.name for path in self.directory.iterdir()))
        with patch.object(retention, "verify_offsite"):
            self.run_main(apply=True)
        self.assertEqual(3, len(list(self.directory.iterdir())))

    def test_apply_detects_replaced_backup_before_deleting_any_file(self):
        for number in range(1, 6):
            self.encrypted(f"release-db-{number:08d}.sql.gz.age", number)
        def replace_backup(*_):
            (self.directory / "release-db-00000001.sql.gz.age").write_bytes(b"changed")
        with patch.object(retention, "verify_offsite", side_effect=replace_backup):
            with self.assertRaises(ValueError):
                self.run_main(apply=True)
        self.assertEqual(5, len(list(self.directory.iterdir())))


@unittest.skipUnless(sys.platform == "linux", "Linux-Sperren und Shell-Fixtures")
class LinuxBackupTests(unittest.TestCase):
    def test_storage_locks_block_parallel_deployment_and_backup(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            probe = (
                "import fcntl,sys; backup=open(sys.argv[1], 'a'); "
                "fcntl.flock(backup, fcntl.LOCK_EX | fcntl.LOCK_NB)"
            )
            with retention.storage_locks(directory):
                for name in ("deploy.lock", "backup.lock"):
                    result = subprocess.run(
                        [sys.executable, "-c", probe, str(directory / name)], capture_output=True
                    )
                    self.assertNotEqual(0, result.returncode)
            result = subprocess.run(
                [sys.executable, "-c", probe, str(directory / "backup.lock")], capture_output=True
            )
            self.assertEqual(0, result.returncode)

    def test_locked_migration_backup_requires_dump_encryption_and_offsite_success(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            binary_directory = directory / "bin"
            binary_directory.mkdir()
            commands = {
                "docker": '#!/bin/bash\nprintf "test-dump"\nexit "${DUMP_STATUS:-0}"\n',
                "age": '#!/bin/bash\ncat >/dev/null\nprintf "age-encryption.org/v1\\nencrypted-test-content\\n"\nexit "${AGE_STATUS:-0}"\n',
                "rsync": '#!/bin/bash\nexit "${OFFSITE_STATUS:-0}"\n',
            }
            for name, source in commands.items():
                executable = binary_directory / name
                executable.write_text(source, encoding="utf8")
                executable.chmod(0o700)
            backups = directory / "backups"
            recipient = directory / "recipient.pub"
            environment = {
                **os.environ,
                "PATH": str(binary_directory) + ":" + os.environ["PATH"],
                "FLIPBASE_DEPLOY_DIR": str(directory),
                "FLIPBASE_BACKUP_DIR": str(backups),
                "FLIPBASE_BACKUP_RECIPIENT": str(recipient),
            }
            migration = script.parent / "migration-backup.sh"
            def run(extra=None):
                return subprocess.run(
                    ["bash", str(migration)], env={**environment, **(extra or {})},
                    capture_output=True, text=True, timeout=10,
                )
            self.assertNotEqual(0, run().returncode)
            recipient.write_text("public-test-recipient", encoding="utf8")
            for extra in ({"DUMP_STATUS": "42"}, {"AGE_STATUS": "42"}):
                self.assertNotEqual(0, run(extra).returncode)
                self.assertEqual([], list(backups.iterdir()))
            self.assertNotEqual(0, run({"OFFSITE_STATUS": "42"}).returncode)
            success = run()
            self.assertEqual(0, success.returncode, success.stderr)
            self.assertTrue(all(path.name.endswith(".age") for path in backups.iterdir()))
            self.assertTrue((directory / "backup.lock").exists())


if __name__ == "__main__":
    unittest.main()
