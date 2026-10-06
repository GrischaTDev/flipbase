"""Einmalige, ausschließlich auf den eigenen Featurezweig begrenzte Nachprüfung."""
from pathlib import Path
import ast, base64, gzip, hashlib, json, os, subprocess, textwrap

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

# Den bereits geprüften Patch aus dem festen Vorgänger lesen, statt Binärtext erneut zu übertragen.
prior = ast.parse(git('show', '1e2243f9ac2b634e7a3f5c732ecbf7d80768142c:tools/vinted-search-filter-followup.py'))
encoded = [node.args[0].value for node in ast.walk(prior)
           if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute)
           and node.func.attr == 'b64decode' and isinstance(node.args[0], ast.Constant)]
assert len(encoded) == 1
patch = gzip.decompress(base64.b64decode(encoded[0], validate=True))
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
special = {'docs/AI-CHANGELOG.md', 'supabase/config.toml', 'scripts/playwright-pr-smoke.test.mjs'}
run('git', 'add', '--', *sorted(set(paths)))
normal = [path for path in upstream_paths if path not in special]
if normal:
    delta = subprocess.check_output(['git', 'diff', '--binary', base, master, '--', *normal])
    merge_patch = review / 'master.patch'
    merge_patch.write_bytes(delta)
    run('git', 'apply', '--3way', str(merge_patch))
assert not git('ls-files', '-u').strip()

# Zwei unabhängig ergänzte Browserfälle an derselben Listenposition behalten.
path = 'scripts/playwright-pr-smoke.test.mjs'
base_smoke = git('show', base + ':' + path)
master_smoke = git('show', master + ':' + path)
ours_smoke = (root / path).read_text()
anchor = "const coreTests = [\n"
feature_entry = """  ...['light', 'dark'].map((theme) => [
    'sniper-administration.spec.ts',
    `verwaltet zentrale Kategorie-, Marken- und Titel-Suchfilter ${theme} @core-smoke`,
  ]),
"""
assert ours_smoke.count(feature_entry) == 1 and base_smoke.count(anchor) == 1
restored = ours_smoke.replace(feature_entry, '', 1)
for theme in ('light', 'dark'):
    old_title = f'Markenfilter verwalten und Kategorien im Botbetrieb {theme} @pr-smoke'
    new_title = f'verwaltet zentrale Kategorie-, Marken- und Titel-Suchfilter {theme} @core-smoke'
    assert restored.count(new_title) == 1 and master_smoke.count(old_title) == 1
    restored = restored.replace(new_title, old_title, 1)
    master_smoke = master_smoke.replace(old_title, new_title, 1)
assert restored == base_smoke
assert master_smoke.count(anchor) == 1 and feature_entry not in master_smoke
(root / path).write_text(master_smoke.replace(anchor, anchor + feature_entry, 1))

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
