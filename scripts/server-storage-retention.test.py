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
