"""Einmalige, ausschließlich auf den eigenen Featurezweig begrenzte Nachprüfung."""
from pathlib import Path
import base64, gzip, hashlib, json, os, subprocess, textwrap

root = Path.cwd()
review = Path('/tmp/vinted-integration-review')
review.mkdir(exist_ok=True)

def git(*args):
    return subprocess.check_output(['git', *args], text=True)

def run(*args):
    subprocess.run(args, check=True)

assert os.environ['GITHUB_REF'] == 'refs/heads/juna/vinted-central-search-filters'
assert git('rev-parse', 'HEAD').strip() == os.environ['GITHUB_SHA']
# Der bereits geprüfte Generator bleibt unverändert und an seinen Commit gebunden.
old = git('show', 'fa76bbf934b9657b432845e8b8b12e52ad35865d:.github/workflows/vinted-search-filter-check.yml')
start = "          python3 - <<'PY'\n"
prepare = textwrap.dedent(old.split(start, 1)[1].split('          PY\n', 1)[0])
exec(compile(prepare, '<verified-original-preparation>', 'exec'))

patch = gzip.decompress(base64.b64decode('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', validate=True))
assert hashlib.sha256(patch).hexdigest() == '5f358ccc141904488f3c0f71f727a6f92aa5e33e8d8f4c38c365d06a5ae5a2e6'
file = review / 'followup.patch'
file.write_bytes(patch)
run('git', 'apply', '--check', str(file))
run('git', 'apply', str(file))
paths = json.loads((review / 'product-paths.json').read_text())
changed = git('apply', '--numstat', str(file)).splitlines()
paths.extend(line.split('\t', 2)[2] for line in changed)

entry = """**Fortsetzung am 06.10.2026:** Der Browsertest übersprang die eigene Tab-Station
„Suche zurücksetzen“. Die Prüfung bildet jetzt die tatsächliche Vorwärts-/Rückwärts-
Fokusfolge, Enter zum Zurücksetzen sowie Escape und Fokuswiederherstellung ab.
Dabei wurde ein echter Fehler gefunden: Der Markenwähler fing Enter auch auf dem
Zurücksetzen-Button ab. Ein neuer DOM-Regressionstest scheiterte daran zuerst und
besteht nach Begrenzung der Treffersteuerung auf das Eingabefeld. Die anfängliche
Routenprüfung wartet auf den sichtbaren Seiteninhalt; die genaue Zieladresse und
sämtliche übrigen Erwartungen bleiben unverändert. Die vollständige Browserprüfung
läuft erneut auf dem isolierten Runner, nicht gegen produktive Konten.

"""
log = root / 'docs/AI-CHANGELOG.md'
text = log.read_text()
marker = '**Stand:** Eigener Zweig `juna/vinted-central-search-filters`.'
assert text.count(marker) == 1
log.write_text(text.replace(marker, entry + marker, 1))

# Die inzwischen abgeschlossenen PRs werden ausschließlich von master übernommen.
base = '02dbcfbddaba4dfae0736bbd879d265fe2296b5a'
master = 'ba8cf35e3d913b6c304e9357f56c4f4032be0c6a'
assert git('rev-parse', 'origin/master').strip() == master
run('git', 'merge-base', '--is-ancestor', base, master)
upstream_paths = git('diff', '--name-only', base, master).splitlines()
special = {'docs/AI-CHANGELOG.md', 'supabase/config.toml'}
run('git', 'add', '--', *sorted(set(paths)))
normal = [path for path in upstream_paths if path not in special]
if normal:
    delta = subprocess.check_output(['git', 'diff', '--binary', base, master, '--', *normal])
    merge_patch = review / 'master.patch'
    merge_patch.write_bytes(delta)
    run('git', 'apply', '--3way', str(merge_patch))
assert not git('ls-files', '-u').strip()

# Beide unabhängigen Changelog-Ergänzungen behalten; keine fremden Einträge überschreiben.
path = 'docs/AI-CHANGELOG.md'
base_log = git('show', base + ':' + path)
master_log = git('show', master + ':' + path)
header, base_body = base_log.split('\n\n', 1)
ours = (root / path).read_text()
assert ours.startswith(header + '\n\n') and ours.endswith(base_body)
assert master_log.startswith(header + '\n\n')
ours_prefix = ours[len(header) + 2:-len(base_body)]
(root / path).write_text(header + '\n\n' + ours_prefix + master_log[len(header) + 2:])

# Die deklarative Schema-Liste wurde in beiden Zweigen erweitert.
path = 'supabase/config.toml'
ours = (root / path).read_text()
base_config = git('show', base + ':' + path)
master_config = git('show', master + ':' + path)
needle = '"./schemas/108_sniper_search_filters.sql", '
assert ours.count(needle) == 1 and ours.replace(needle, '', 1) == base_config
anchor = '"./schemas/107_sniper_feed_brands.sql", '
assert master_config.count(anchor) == 1 and needle not in master_config
(root / path).write_text(master_config.replace(anchor, anchor + needle, 1))

# Nur die eigentliche Feature-Differenz darf gegenüber aktuellem master übrigbleiben.
paths = sorted(set(paths))
(review / 'product-paths.json').write_text(json.dumps(paths))
(review / 'upstream-paths.json').write_text(json.dumps(upstream_paths))
(review / 'merged-master.txt').write_text(master)
self_path = 'tools/vinted-search-filter-followup.py'
run('git', 'rm', '--', self_path)
temporary = json.loads((review / 'temporary-paths.json').read_text()) + [self_path]
(review / 'temporary-paths.json').write_text(json.dumps(temporary))
run('git', 'add', '--', *sorted(set(paths + upstream_paths)))
remaining = set(git('diff', '--cached', '--name-only', master).splitlines())
assert remaining <= set(paths + temporary), remaining - set(paths + temporary)
run('git', 'diff', '--cached', '--check')
print('Vorbereitet:', len(paths), 'Featurepfade auf aktuellem master', master)
