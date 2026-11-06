#!/usr/bin/env python3
"""Gibt nur der Admin-KI-Suche ausreichend Zeit für ihre begrenzte Webrecherche."""
import argparse
import datetime
import os
import pathlib
import shutil
import tempfile


def configure(path):
    if path.is_symlink() or not path.is_file():
        raise ValueError("Reguläre main/index.ts erwartet.")
    source = path.read_text(encoding="utf-8")
    original = "const workerTimeoutMs = 1 * 60 * 1000"
    replacement = "const workerTimeoutMs = service_name === 'vinted-ai-search' ? 95_000 : 1 * 60 * 1000"
    if source.count(replacement) == 1:
        return False
    if source.count(original) != 1 or "const service_name = path_parts[1]" not in source:
        raise ValueError("Unbekannter Functionrouter; keine Änderung vorgenommen.")
    timestamp = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%d%H%M%S%f")
    backup = path.with_name(path.name + ".ai-search-" + timestamp + ".bak")
    shutil.copy2(path, backup)
    descriptor, temporary = tempfile.mkstemp(prefix=".ai-search-", dir=path.parent)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8", newline="") as target:
            target.write(source.replace(original, replacement))
        shutil.copystat(path, temporary)
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)
    return True


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--main-path", type=pathlib.Path, default=pathlib.Path("/opt/supabase/volumes/functions/main/index.ts"))
    arguments = parser.parse_args()
    print("KI-Laufzeit eingerichtet." if configure(arguments.main_path) else "KI-Laufzeit bereits eingerichtet.")
