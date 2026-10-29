"""Der echte Installer arbeitet ausschließlich in einem privaten Testverzeichnis."""

import base64
import contextlib
import importlib.util
import io
import os
from pathlib import Path
import stat
import tempfile
import unittest
from unittest import mock


SPEC = importlib.util.spec_from_file_location(
    "marketplace_access", Path(__file__).resolve().parents[1] / "deploy" / "install-marketplace-access.py"
)
access = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(access)
COMMIT = "1" * 40
KEY_BLOB = base64.b64encode(b"\x00\x00\x00\x0bssh-ed25519\x00\x00\x00\x20" + bytes(range(32))).decode()
PUBLIC_KEY = ("ssh-ed25519 " + KEY_BLOB + " fixture-key\n").encode()
SOURCES = {
    "marketplace-deploy.py": b"#!/usr/bin/python3\n# Entrypointfixture\n",
    "marketplace-rollout.py": b"#!/usr/bin/python3\n# Enginefixture\n",
    "marketplace-deploy-key.pub": PUBLIC_KEY,
}


class AccessInstallerTest(unittest.TestCase):
    def setUp(self):
        self.stack = contextlib.ExitStack()
        self.addCleanup(self.stack.close)
        self.root = Path(self.stack.enter_context(tempfile.TemporaryDirectory())).resolve()
        self.root.chmod(0o700)
        base = self.root / "marketplace"
        base.mkdir(mode=0o700)
        web = self.root / "web"
        web.mkdir(mode=0o700)
        ssh_parent = self.root / "root"
        ssh_parent.mkdir(mode=0o700)
        patches = {
            "TRUST_ROOT": self.root, "OWNER_UID": os.getuid(), "BASE_DIR": base,
            "BOOTSTRAP_DIR": base / "access-bootstrap", "COMMAND_DIR": base / "command-v1",
            "SSH_DIR": ssh_parent / ".ssh", "AUTHORIZED_KEYS": ssh_parent / ".ssh" / "authorized_keys",
            "GLOBAL_LOCK": web / "deploy.lock", "HOST_KEY": self.root / "absent-host-key.pub",
        }
        self.stack.enter_context(mock.patch.multiple(access, **patches))
        self.stack.enter_context(mock.patch.object(access.os, "geteuid", return_value=0))
        self.output = self.stack.enter_context(contextlib.redirect_stdout(io.StringIO()))

    def prepare(self):
        with mock.patch.object(access, "download", side_effect=lambda commit, name: SOURCES[name]) as download:
            access.prepare(COMMIT)
        self.assertEqual(download.call_args_list, [mock.call(COMMIT, name) for name in access.FILES])
        return access.load_prepared(COMMIT)[0]

    def existing_keys(self, data):
        access.SSH_DIR.mkdir(mode=0o700, exist_ok=True)
        access.AUTHORIZED_KEYS.write_bytes(data)
        access.AUTHORIZED_KEYS.chmod(0o600)

    def test_prepare_records_exact_sources_without_granting_ssh_access(self):
        manifest = self.prepare()
        self.assertFalse(access.SSH_DIR.exists())
        self.assertFalse(access.COMMAND_DIR.exists())
        self.assertEqual(manifest["key_fingerprint"], access.public_key(PUBLIC_KEY)[1])
        for name, expected in SOURCES.items():
            path = access.BOOTSTRAP_DIR / COMMIT / name
            self.assertEqual(path.read_bytes(), expected)
            self.assertEqual(stat.S_IMODE(path.stat().st_mode), 0o600)
        self.assertIn("noch keine SSH-Berechtigung", self.output.getvalue())

    def test_install_preserves_existing_keys_and_has_no_network_path(self):
        manifest = self.prepare()
        original = b'# Existing operator keys\nrestrict,command="/opt/flipbase/deploy.sh" ssh-ed25519 EXISTING web-key'
        self.existing_keys(original)
        with mock.patch.object(access.urllib.request, "build_opener", side_effect=AssertionError("Kein Netzwerk bei install")):
            access.install(COMMIT)
        installed = access.AUTHORIZED_KEYS.read_bytes()
        self.assertTrue(installed.startswith(original + b"\n"))
        self.assertEqual(installed.count(KEY_BLOB.encode()), 1)
        command = access.forced_command(manifest["bundle_id"])
        self.assertIn(('restrict,command="' + command + '" ssh-ed25519 ').encode(), installed)
        self.assertEqual(stat.S_IMODE(access.AUTHORIZED_KEYS.stat().st_mode), 0o600)
        access.exact_directory(access.COMMAND_DIR / manifest["bundle_id"], access.load_prepared(COMMIT)[1])

    def test_identical_install_is_idempotent_without_replacing_keys_or_bundle(self):
        manifest = self.prepare()
        access.install(COMMIT)
        before = access.AUTHORIZED_KEYS.stat()
        bundle_file = access.COMMAND_DIR / manifest["bundle_id"] / access.FILES[0]
        bundle_before = bundle_file.stat()
        access.install(COMMIT)
        self.assertEqual(access.AUTHORIZED_KEYS.stat().st_ino, before.st_ino)
        self.assertEqual(access.AUTHORIZED_KEYS.stat().st_mtime_ns, before.st_mtime_ns)
        self.assertEqual(bundle_file.stat().st_ino, bundle_before.st_ino)
        self.assertEqual(access.AUTHORIZED_KEYS.read_bytes().count(KEY_BLOB.encode()), 1)

    def test_existing_unrestricted_copy_of_key_blocks_install(self):
        self.prepare()
        original = PUBLIC_KEY
        self.existing_keys(original)
        with self.assertRaisesRegex(access.InstallError, "anderem Befehl"):
            access.install(COMMIT)
        self.assertEqual(access.AUTHORIZED_KEYS.read_bytes(), original)
        self.assertFalse(access.COMMAND_DIR.exists())

    def test_existing_other_forced_command_blocks_install(self):
        self.prepare()
        original = b'restrict,command="/bin/false" ' + PUBLIC_KEY
        self.existing_keys(original)
        with self.assertRaises(access.InstallError):
            access.install(COMMIT)
        self.assertEqual(access.AUTHORIZED_KEYS.read_bytes(), original)

    def test_changed_prepared_source_blocks_install(self):
        self.prepare()
        path = access.BOOTSTRAP_DIR / COMMIT / access.FILES[0]
        path.write_bytes(b"changed after preparation")
        with self.assertRaisesRegex(access.InstallError, "verändert"):
            access.install(COMMIT)
        self.assertFalse(access.SSH_DIR.exists())

    def test_existing_changed_bundle_is_never_overwritten(self):
        manifest = self.prepare()
        access.private_directory(access.COMMAND_DIR)
        target = access.COMMAND_DIR / manifest["bundle_id"]
        access.publish_directory(access.COMMAND_DIR, manifest["bundle_id"], access.load_prepared(COMMIT)[1])
        source = target / access.FILES[0]
        source.write_bytes(b"foreign existing content")
        with self.assertRaises(access.InstallError):
            access.install(COMMIT)
        self.assertEqual(source.read_bytes(), b"foreign existing content")
        self.assertFalse(access.AUTHORIZED_KEYS.exists())

    def test_symlink_authorized_keys_is_rejected_without_touching_target(self):
        self.prepare()
        access.SSH_DIR.mkdir(mode=0o700)
        foreign = self.root / "foreign-keys"
        foreign.write_bytes(b"operator")
        foreign.chmod(0o600)
        access.AUTHORIZED_KEYS.symlink_to(foreign)
        with self.assertRaises(access.InstallError):
            access.install(COMMIT)
        self.assertEqual(foreign.read_bytes(), b"operator")

    def test_symlink_in_prepared_sources_is_rejected(self):
        self.prepare()
        target = access.BOOTSTRAP_DIR / COMMIT / access.FILES[0]
        foreign = self.root / "source.py"
        target.rename(foreign)
        target.symlink_to(foreign)
        with self.assertRaises(access.InstallError):
            access.install(COMMIT)
        self.assertFalse(access.SSH_DIR.exists())

    def test_writable_parent_blocks_install(self):
        self.prepare()
        access.BASE_DIR.chmod(0o777)
        with self.assertRaisesRegex(access.InstallError, "rootgeschützt"):
            access.install(COMMIT)
        self.assertFalse(access.SSH_DIR.exists())

    def test_wrong_owner_blocks_install(self):
        self.prepare()
        with mock.patch.object(access, "OWNER_UID", os.getuid() + 1):
            with self.assertRaisesRegex(access.InstallError, "rootgeschützt"):
                access.install(COMMIT)
        self.assertFalse(access.SSH_DIR.exists())

    def test_key_file_rejects_options_multiple_lines_and_wrong_wire_type(self):
        malformed = (
            b"restrict " + PUBLIC_KEY, PUBLIC_KEY + PUBLIC_KEY,
            b"ssh-rsa " + KEY_BLOB.encode(),
            ("ssh-ed25519 " + base64.b64encode(b"x" * 51).decode()).encode(),
        )
        for data in malformed:
            with self.subTest(data=data):
                with self.assertRaises(access.InstallError):
                    access.public_key(data)

    def test_changes_to_authorized_keys_during_install_are_preserved(self):
        self.prepare()
        self.existing_keys(b"old\n")
        publish = access.publish_directory

        def concurrent_change(*args):
            result = publish(*args)
            access.AUTHORIZED_KEYS.write_bytes(b"concurrent admin change\n")
            return result

        with mock.patch.object(access, "publish_directory", side_effect=concurrent_change):
            with self.assertRaisesRegex(access.InstallError, "zwischenzeitlich"):
                access.install(COMMIT)
        self.assertEqual(access.AUTHORIZED_KEYS.read_bytes(), b"concurrent admin change\n")

    def test_prepare_repeat_checks_existing_files_without_network(self):
        self.prepare()
        with mock.patch.object(access, "download", side_effect=AssertionError("Unnötiger Download")):
            access.prepare(COMMIT)
        self.assertFalse(access.SSH_DIR.exists())

    def test_invalid_commit_is_rejected_before_any_filesystem_action(self):
        for commit in ("master", "../" + COMMIT, COMMIT.upper().replace("1", "A"), "1" * 39):
            with self.subTest(commit=commit), contextlib.redirect_stderr(io.StringIO()):
                self.assertEqual(access.main(["prepare", commit]), 1)
        self.assertFalse(access.BOOTSTRAP_DIR.exists())

    def test_download_binds_fixed_https_source_and_enforces_size_limit(self):
        response = mock.MagicMock()
        response.__enter__.return_value = response
        response.status = 200
        url = access.SOURCE + COMMIT + "/deploy/marketplace-deploy-key.pub"
        response.geturl.return_value = url
        response.read.return_value = PUBLIC_KEY
        opener = mock.Mock()
        opener.open.return_value = response
        with mock.patch.object(access.urllib.request, "build_opener", return_value=opener):
            self.assertEqual(access.download(COMMIT, access.FILES[2]), PUBLIC_KEY)
            opener.open.assert_called_once_with(url, timeout=30)
            response.read.assert_called_once_with(1025)
            response.read.return_value = b"x" * 1025
            with self.assertRaises(access.InstallError):
                access.download(COMMIT, access.FILES[2])

    def test_download_redirect_is_rejected(self):
        with self.assertRaisesRegex(access.InstallError, "umgeleitet"):
            access.NoRedirect().redirect_request(None, None, 302, "redirect", {}, "https://other.example/")


if __name__ == "__main__":
    unittest.main()
