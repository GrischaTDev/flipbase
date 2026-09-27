"""Einmalige Komprimierung bestehender privater Produktbilder.

backup und apply laufen auf dem Produktionsserver, optimize mit Pillow 12.3.0
auf einer Kopie oder direkt auf dem Server. Originale bleiben gesichert. apply kann
nach einer Unterbrechung erneut laufen und überspringt archivierte Bereiche.
"""

import argparse
import hashlib
import io
import json
from pathlib import Path
import subprocess
import sys
from urllib.parse import quote
from urllib.error import HTTPError
from urllib.request import Request, urlopen


BUCKET = "item-media"
API_URL = "https://api.flipbase.de"
SQL = """
select json_build_object(
  'source', candidates.source,
  'path', candidates.storage_path,
  'size', (objects.metadata->>'size')::bigint,
  'mime', objects.metadata->>'mimetype'
)::text
from (
  select 'catalog' as source, m.storage_path, w.archived_at
  from public.catalog_product_media m
  join public.workspaces w on w.id = m.workspace_id
  union all
  select 'inventory', m.storage_path, w.archived_at
  from public.item_media m
  join public.inventory_items i on i.id = m.inventory_item_id
  join public.workspaces w on w.id = i.workspace_id
  union all
  select 'listing', m.storage_path, w.archived_at
  from public.listing_images m
  join public.workspaces w on w.id = m.workspace_id
) candidates
join storage.objects objects
  on objects.bucket_id = 'item-media' and objects.name = candidates.storage_path
where (objects.metadata->>'size')::bigint > {min_bytes}
  and objects.metadata->>'mimetype' in ('image/jpeg', 'image/png')
  and candidates.archived_at is null
  and ('{source}' = 'all' or candidates.source = '{source}')
order by candidates.source, candidates.storage_path;
"""


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def query(sql: str) -> list[str]:
    result = subprocess.run(
        ["docker", "exec", "-i", "supabase-db", "psql", "-U", "postgres", "-d", "postgres", "-At", "-v", "ON_ERROR_STOP=1", "-f", "-"],
        input=sql,
        text=True,
        capture_output=True,
        check=True,
    )
    return result.stdout.splitlines()


def service_key() -> str:
    for line in Path("/opt/supabase/.env").read_text().splitlines():
        if line.startswith("SERVICE_ROLE_KEY="):
            return line.partition("=")[2].strip().strip('"').strip("'")
    raise RuntimeError("SERVICE_ROLE_KEY fehlt")


def storage_request(method: str, path: str, key: str, data: bytes | None = None, mime: str | None = None) -> bytes:
    operation = "authenticated/" if method == "GET" else ""
    url = f"{API_URL}/storage/v1/object/{operation}{BUCKET}/{quote(path, safe='/')}"
    headers = {"apikey": key, "Authorization": f"Bearer {key}"}
    if mime:
        headers["Content-Type"] = mime
        headers["Cache-Control"] = "3600"
    request = Request(url, data=data, headers=headers, method=method)
    try:
        with urlopen(request, timeout=60) as response:
            return response.read()
    except HTTPError as error:
        raise RuntimeError(f"Speicher-API {method}: HTTP {error.code}, {error.read()[:160]!r}") from error


def load_manifest(directory: Path) -> list[dict]:
    return json.loads((directory / "manifest.json").read_text())


def backup(directory: Path, source: str, min_bytes: int) -> None:
    directory.mkdir(mode=0o700, parents=True, exist_ok=False)
    key = service_key()
    entries = [json.loads(line) for line in query(SQL.format(source=source, min_bytes=min_bytes))]
    paths = [entry["path"] for entry in entries]
    if len(paths) != len(set(paths)):
        raise RuntimeError("Speicherpfad mehrfach referenziert")
    for index, entry in enumerate(entries):
        original = storage_request("GET", entry["path"], key)
        if len(original) != entry["size"]:
            raise RuntimeError(f"Groesse geaendert: {index}")
        entry["sha256"] = digest(original)
        entry["number"] = index
        (directory / f"{index:03d}.original").write_bytes(original)
        print(f"Gesichert {index + 1}/{len(entries)}: {entry['source']}, {len(original)} Bytes", flush=True)
    (directory / "manifest.json").write_text(json.dumps(entries, indent=2) + "\n")
    print(f"Sicherung fertig: {len(entries)} Dateien, {sum(e['size'] for e in entries)} Bytes")


def optimize(directory: Path) -> None:
    from PIL import Image, ImageOps

    for entry in load_manifest(directory):
        number = entry["number"]
        source = (directory / f"{number:03d}.original").read_bytes()
        if digest(source) != entry["sha256"]:
            raise RuntimeError(f"Sicherung ungueltig: {number}")
        with Image.open(io.BytesIO(source)) as original:
            image = ImageOps.exif_transpose(original)
            image.thumbnail((1600, 1600), Image.Resampling.LANCZOS)
            result = io.BytesIO()
            if entry["mime"] == "image/jpeg":
                image = image.convert("RGB")
                image.save(result, format="JPEG", quality=84, optimize=True, progressive=True, icc_profile=original.info.get("icc_profile"))
            else:
                image.save(result, format="PNG", optimize=True, icc_profile=original.info.get("icc_profile"))
            candidate = result.getvalue()
            if len(candidate) <= len(source) * 0.9:
                (directory / f"{number:03d}.optimized").write_bytes(candidate)
            print(f"Geprueft {number + 1}: {original.size} -> {image.size}, {len(source)} -> {len(candidate)} Bytes", flush=True)


def sql_literal(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def is_archived(entry: dict) -> bool:
    path = sql_literal(entry["path"])
    if entry["source"] == "catalog":
        statement = f"select w.archived_at is not null from public.catalog_product_media m join public.workspaces w on w.id=m.workspace_id where m.storage_path={path};"
    elif entry["source"] == "inventory":
        statement = f"select w.archived_at is not null from public.item_media m join public.inventory_items i on i.id=m.inventory_item_id join public.workspaces w on w.id=i.workspace_id where m.storage_path={path};"
    else:
        statement = f"select w.archived_at is not null from public.listing_images m join public.workspaces w on w.id=m.workspace_id where m.storage_path={path};"
    rows = query(statement)
    if len(rows) != 1 or rows[0] not in ("t", "f"):
        raise RuntimeError(f"Arbeitsbereich nicht eindeutig: {entry['number']}")
    return rows[0] == "t"


def apply(directory: Path) -> None:
    key = service_key()
    entries = load_manifest(directory)
    for entry in entries:
        number = entry["number"]
        if is_archived(entry):
            print(f"Uebersprungen {number + 1}: Arbeitsbereich archiviert", flush=True)
            continue
        optimized_path = directory / f"{number:03d}.optimized"
        if not optimized_path.exists():
            print(f"Uebersprungen {number + 1}: kein kleineres Bild", flush=True)
            continue
        optimized = optimized_path.read_bytes()
        original = (directory / f"{number:03d}.original").read_bytes()
        if digest(original) != entry["sha256"] or len(optimized) > len(original) * 0.9:
            raise RuntimeError(f"Dateipruefung fehlgeschlagen: {number}")
        if entry["mime"] == "image/jpeg" and not optimized.startswith(b"\xff\xd8\xff"):
            raise RuntimeError(f"JPEG-Format ungueltig: {number}")
        if entry["mime"] == "image/png" and not optimized.startswith(b"\x89PNG\r\n\x1a\n"):
            raise RuntimeError(f"PNG-Format ungueltig: {number}")
        current = storage_request("GET", entry["path"], key)
        if digest(current) == digest(original):
            storage_request("PUT", entry["path"], key, optimized, entry["mime"])
            current = storage_request("GET", entry["path"], key)
        if digest(current) != digest(optimized):
            raise RuntimeError(f"Speicherdatei veraendert oder Schreibpruefung fehlgeschlagen: {number}")
        if entry["source"] in ("catalog", "inventory"):
            table = "catalog_product_media" if entry["source"] == "catalog" else "item_media"
            rows = query(
                f"with updated as (update public.{table} set file_size = {len(optimized)} "
                f"where storage_path = {sql_literal(entry['path'])} returning id) "
                "select count(*) from updated;\n"
            )
            if rows != ["1"]:
                raise RuntimeError(f"Metadatenaktualisierung fehlgeschlagen: {number}")
        print(f"Ersetzt {number + 1}/{len(entries)}: {len(original)} -> {len(optimized)} Bytes", flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("action", choices=("backup", "optimize", "apply"))
    parser.add_argument("directory", type=Path)
    parser.add_argument("--source", choices=("all", "catalog", "inventory", "listing"), default="all")
    parser.add_argument("--min-bytes", type=int, default=800000)
    args = parser.parse_args()
    try:
        if args.min_bytes < 0:
            raise ValueError("--min-bytes muss mindestens 0 sein")
        if args.action == "backup":
            backup(args.directory, args.source, args.min_bytes)
        else:
            {"optimize": optimize, "apply": apply}[args.action](args.directory)
    except Exception as exc:
        print(f"Abbruch: {exc}", file=sys.stderr)
        sys.exit(1)
