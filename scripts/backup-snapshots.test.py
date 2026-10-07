"""Prüft Schutzgrenzen ohne Produktionsdaten oder laufende Container."""

import contextlib
from datetime import datetime, timedelta, timezone
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch


deploy = Path(__file__).resolve().parents[1] / "deploy"


def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, deploy / filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


server = load("backup_server", "backup-server.py")
source = server.snapshot
retention = load("backup_retention", "cleanup-server-storage.py")


def fixture(root, completed=None):
    files = {"database.sql": b"database fixture", "configuration/opt/supabase/.env": b"fixture",
             "configuration/postgres-custom/pgsodium_root.key": b"key fixture",
             "storage/stub/stub/item.jpg": b"photo fixture"}
    for name, content in files.items():
        path = root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)
    manifest = {"format": 1, "archive": "nightly-20261007T033000Z-1234abcd",
                "completed_at": (completed or datetime.now(timezone.utc)).isoformat(),
                "storage_fingerprint": "1:fixture", "files": source.describe_files(root)}
    (root / "manifest.json").write_text(json.dumps(manifest, sort_keys=True))
    receipt = {"archive": manifest["archive"], "manifest_sha256": source.digest(root / "manifest.json")}
    (root / f"borg-verified-{manifest['archive']}.json").write_text(json.dumps(receipt, sort_keys=True))
    return manifest


class SnapshotTests(unittest.TestCase):
    def test_failed_source_dump_never_replaces_a_previous_confirmed_snapshot(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            snapshot_root = root / 'snapshots'
            current = snapshot_root / 'current'
            current.mkdir(parents=True)
            (current / 'protected').write_bytes(b'previous snapshot')
            deploy_directory = root / 'deploy'
            deploy_directory.mkdir()
            supabase = root / 'supabase'
            (supabase / 'volumes/storage').mkdir(parents=True)
            (supabase / 'volumes/storage/photo').write_bytes(b'photo')
            with patch.object(source, 'snapshot_locks', return_value=contextlib.nullcontext()), \
                 patch.object(source, 'verify_previous_receipt'), \
                 patch.object(source, 'storage_fingerprint', return_value=b'1:fixture'), \
                 patch.object(source.subprocess, 'run', side_effect=subprocess.CalledProcessError(1, [])):
                with self.assertRaises(subprocess.CalledProcessError):
                    source.create_snapshot(snapshot_root, deploy_directory, supabase, 'fixture')
            self.assertEqual((current / 'protected').read_bytes(), b'previous snapshot')
            self.assertEqual(sorted(path.name for path in snapshot_root.iterdir()), ['current'])

    def test_changed_storage_cannot_publish_a_snapshot(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            deploy_directory = root / 'deploy'
            deploy_directory.mkdir()
            supabase = root / 'supabase'
            (supabase / 'volumes/storage').mkdir(parents=True)
            (supabase / 'volumes/storage/photo').write_bytes(b'photo')
            def dump(arguments, **options):
                options['stdout'].write(b'database fixture')
                return subprocess.CompletedProcess(arguments, 0)
            with patch.object(source, 'snapshot_locks', return_value=contextlib.nullcontext()), \
                 patch.object(source, 'storage_fingerprint', side_effect=[b'1:before', b'1:after']), \
                 patch.object(source.subprocess, 'run', side_effect=dump):
                with self.assertRaises(ValueError):
                    source.create_snapshot(root / 'snapshots', deploy_directory, supabase, 'fixture')
            self.assertFalse((root / 'snapshots/current').exists())

    def test_valid_snapshot_is_accepted_and_every_payload_hash_is_checked(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            expected = fixture(root)
            self.assertEqual(server.validate_snapshot(root), expected)
            (root / "storage/stub/stub/item.jpg").write_bytes(b"corrupted")
            with self.assertRaises(ValueError):
                server.validate_snapshot(root)

    def test_missing_payload_and_unlisted_payload_are_rejected(self):
        for change in ("missing", "extra"):
            with self.subTest(change=change), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                fixture(root)
                if change == "missing":
                    (root / "database.sql").unlink()
                else:
                    (root / "unlisted.sql").write_text("fixture")
                with self.assertRaises((ValueError, KeyError)):
                    server.validate_snapshot(root)

    def test_stale_or_future_snapshot_cannot_acknowledge_a_new_backup(self):
        for delta in (timedelta(hours=-27), timedelta(hours=1)):
            with tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                fixture(root, datetime.now(timezone.utc) + delta)
                with self.assertRaises(ValueError):
                    server.validate_snapshot(root)

    def test_corrupt_receipt_is_rejected(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            manifest = fixture(root)
            (root / f"borg-verified-{manifest['archive']}.json").write_text('{}')
            with self.assertRaises(ValueError):
                server.validate_snapshot(root)

    @unittest.skipIf(os.name == 'nt', 'Symlink-Rechte unter Windows nicht voraussetzen')
    def test_links_outside_snapshot_are_rejected(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            fixture(root)
            (root / "secret-link").symlink_to('/etc/passwd')
            with self.assertRaises(ValueError):
                server.validate_snapshot(root)

    @unittest.skipIf(os.name == 'nt', 'Symlink-Rechte unter Windows nicht voraussetzen')
    def test_receipt_publication_never_follows_a_link_in_the_upload_directory(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            state = root / 'private'
            legacy = root / 'uploads'
            state.mkdir()
            legacy.mkdir()
            sentinel = root / 'protected'
            sentinel.write_bytes(b'protected')
            receipt = root / 'borg-verified-nightly-test.json'
            receipt.write_bytes(b'fixture receipt')
            (legacy / (receipt.name + '.tmp')).symlink_to(sentinel)
            (legacy / receipt.name).symlink_to(sentinel)
            with patch.object(server, 'STATE_DIRECTORY', state), patch.object(server, 'LEGACY_DIRECTORY', legacy):
                server.publish_receipt(receipt)
            self.assertEqual(sentinel.read_bytes(), b'protected')
            self.assertEqual((legacy / receipt.name).read_bytes(), b'fixture receipt')
            self.assertFalse((legacy / receipt.name).is_symlink())

    def test_changed_archive_identity_or_missing_archive_blocks_compaction(self):
        for current in ({}, {"nightly-existing": "different"}):
            with self.assertRaises(ValueError):
                server.verify_ledger(current, {"nightly-existing": "protected"})

    def test_failed_offsite_confirmation_keeps_the_previous_source(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            fixture(root)
            before = source.describe_files(root)
            with patch.object(source, 'run', return_value=subprocess.CompletedProcess([], 0, b'>f receipt', b'')):
                with self.assertRaises(ValueError):
                    source.verify_previous_receipt(root)
            self.assertEqual(before, source.describe_files(root))

    def test_weekly_legacy_history_and_three_releases_are_retained(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            now = datetime.now(timezone.utc)
            for index in range(45):
                stamp = (now - timedelta(days=index)).strftime('%Y-%m-%d_0330')
                for prefix, extension in retention.BACKUP_EXTENSIONS.items():
                    (root / f'{prefix}_{stamp}.{extension}.age').write_bytes(b'age-encryption.org/v1\nfixture-' * 4)
            for index in range(5):
                path = root / f'release-db-{index:08d}.sql.gz.age'
                path.write_bytes(b'age-encryption.org/v1\nfixture-' * 4)
                os.utime(path, (index + 1, index + 1))
            selected, verified, releases, nightly = retention.plan_backups(root, nightly_count=7, weekly_count=4)
            self.assertEqual(len(releases), 3)
            self.assertEqual(len(nightly), 11)
            self.assertEqual(len(verified), 36)
            self.assertFalse(set(selected) & set(verified))
            weeks = {datetime.strptime(stamp, '%Y-%m-%d_%H%M').isocalendar()[:2] for stamp in nightly[7:]}
            self.assertEqual(len(weeks), 4)


if __name__ == '__main__':
    unittest.main()
