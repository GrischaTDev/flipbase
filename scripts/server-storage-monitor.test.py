import importlib.util
import subprocess
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]


def load_script(name):
    spec = importlib.util.spec_from_file_location(name.replace("-", "_"), ROOT / "deploy" / name)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


reporter = load_script("report-server-storage.py")
installer = load_script("install-server-storage-monitor.py")


class StorageMonitorTests(unittest.TestCase):
    def test_measurement_excludes_reserved_blocks_from_available_space(self):
        with patch.object(reporter.os, "statvfs", create=True, return_value=SimpleNamespace(
            f_blocks=100, f_bfree=30, f_bavail=25, f_frsize=4096
        )) as stat:
            self.assertEqual(reporter.measure_storage(), (409600, 286720, 102400))
            stat.assert_called_once_with("/")

    def test_only_measured_numbers_are_sent_without_credentials_in_arguments(self):
        with patch.object(reporter, "measure_storage", return_value=(100, 70, 25)):
            with patch.object(reporter.subprocess, "run") as run:
                reporter.report_storage()
        arguments, = run.call_args.args
        self.assertEqual(arguments[0], "/usr/bin/psql")
        self.assertNotIn("docker", arguments)
        self.assertFalse(any("password" in argument and argument != "--no-password" for argument in arguments))
        self.assertEqual(run.call_args.kwargs["input"], "select public.report_server_storage(100, 70, 25);\n")
        self.assertTrue(run.call_args.kwargs["capture_output"])
        self.assertEqual(run.call_args.kwargs["timeout"], 15)

    def test_invalid_partition_values_are_not_reported(self):
        for snapshot in [(0, 0, 0), (100, -1, 30), (100, 80, 30)]:
            with self.subTest(snapshot=snapshot):
                with patch.object(reporter, "measure_storage", return_value=snapshot):
                    with patch.object(reporter.subprocess, "run") as run:
                        with self.assertRaises(ValueError):
                            reporter.report_storage()
                        run.assert_not_called()

    def test_database_errors_are_not_treated_as_success(self):
        with patch.object(reporter, "measure_storage", return_value=(100, 70, 25)):
            with patch.object(reporter.subprocess, "run", side_effect=subprocess.TimeoutExpired("psql", 15)):
                with self.assertRaises(subprocess.TimeoutExpired):
                    reporter.report_storage()

    def test_installer_refuses_sql_injection_and_grants_only_the_report_function(self):
        with self.assertRaises(ValueError):
            installer.provision_statement("x'; grant postgres to authenticated; --")
        statement = installer.provision_statement("a" * 64)
        self.assertNotIn("a" * 64, statement)
        self.assertIn("SCRAM-SHA-256$4096:", statement)
        self.assertIn("rolsuper or rolcreatedb or rolcreaterole or rolreplication or rolbypassrls", statement)
        self.assertNotIn("nosuperuser", statement)
        self.assertNotIn("noreplication", statement)
        self.assertNotIn("nobypassrls", statement)
        self.assertTrue(statement.strip().startswith("begin;"))
        self.assertTrue(statement.strip().endswith("commit;"))
        self.assertIn("connection limit 1", statement)
        self.assertIn("grant execute on function public.report_server_storage", statement)
        self.assertNotIn("grant select", statement)
        self.assertNotIn("service_role to", statement)
        self.assertNotIn("authenticated to", statement)


if __name__ == "__main__":
    unittest.main()
