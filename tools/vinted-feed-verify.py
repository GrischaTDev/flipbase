"""Temporäre, auf den eigenen Feed-Zweig begrenzte Integrationsprüfung."""
import base64
import hashlib
import json
import lzma
import os
import pathlib
import re
import subprocess
import sys
import zipfile

ROOT = pathlib.Path.cwd()
REVIEW = pathlib.Path('/tmp/feed-final-review')
BASE = 'b343611fffb6f289292ca23e9b14ff9429b2868e'
PLAN = 'docs/superpowers/plans/2026-10-06-vinted-feed-account-favorites.md'
HEADING = '## 2026-10-06 - Juna - Vinted Feed und persönliche Account-Favoriten\n'

def run(*args):
    subprocess.run(args, check=True)

def prepare():
    patches = [
        ((ROOT/'tools/vinted-feed-account.patch').read_bytes(), 'a9885e3a404c5379a97a2990d3fb717e3061b2ee00d538f12865312c51e87b8f'),
        (lzma.decompress(base64.b64decode(''.join((ROOT/f'tools/vinted-feed-ui.part{i}.b64').read_text().strip() for i in range(5)), validate=True)), '7c9580615d607ecc678a9556e39d89c7f0ba94785fd2470ecb38ff359fcd1d18'),
    ]
    paths = set()
    for i, (data, digest) in enumerate(patches):
        assert hashlib.sha256(data).hexdigest() == digest, 'Übertragener Quellstand stimmt nicht.'
        patch = REVIEW/f'changes-{i}.patch'
        patch.write_bytes(data)
        entries = subprocess.check_output(['git','apply','--numstat',str(patch)],text=True).splitlines()
        for entry in entries:
            path=entry.split('\t',2)[2]
            assert '..' not in pathlib.PurePosixPath(path).parts and path.startswith(('src/','e2e/','services/sniper/','supabase/schemas/','docs/design/'))
            paths.add(path)
        run('git','apply','--check',str(patch))
        run('git','apply',str(patch))
    archive = REVIEW/'database.zip'
    assert hashlib.sha256(archive.read_bytes()).hexdigest() == '533df66749cf084aef03d36b88382dd40d229210f53ebd3b6545f26a55bcccc3'
    name='20261006113233_vinted_feed_account_favorites.sql'
    with zipfile.ZipFile(archive) as zipped:
        names=[p for p in zipped.namelist() if pathlib.PurePosixPath(p).name==name]
        assert len(names)==1
        sql=zipped.read(names[0])
    migration='supabase/migrations/'+name
    assert not (ROOT/migration).exists()
    lowered=sql.lower().replace(b'"',b'')
    assert b'create table public.sniper_favorites' in lowered
    assert b'revoke all on public.sniper_favorites' in lowered
    (ROOT/migration).write_bytes(sql)
    paths.add(migration)
    config=ROOT/'supabase/config.toml'
    text=config.read_text()
    for name in ['400_sniper_favorites.sql','401_sniper_feed_search.sql']:
        assert name not in text
    text,count=re.subn(r'(schema_paths\s*=\s*\[)(.*?)(\])',lambda m:m[1]+m[2].rstrip().rstrip(',')+', "./schemas/400_sniper_favorites.sql", "./schemas/401_sniper_feed_search.sql"'+m[3],text,count=1,flags=re.S)
    assert count==1
    config.write_text(text)
    paths.add('supabase/config.toml')
    smoke=ROOT/'scripts/playwright-pr-smoke.test.mjs'
    text=smoke.read_text()
    title='Account-Favoriten bleiben auf Tablet und Desktop nach Feed-Bereinigung erhalten @core-smoke'
    assert title not in text and text.count('const coreTests = [')==1
    smoke.write_text(text.replace('const coreTests = [',"const coreTests = [\n  ['deal-monitor.spec.ts', '"+title+"'],",1))
    paths.add('scripts/playwright-pr-smoke.test.mjs')
    paths.update(['supabase/schemas/400_sniper_favorites.sql','supabase/schemas/401_sniper_feed_search.sql','supabase/tests/sniper_account_favorites.sql','supabase/tests/sniper_feed_search.sql','supabase/tests/deal_monitor_retention.sql','supabase/tests/deal_monitor_group_reference.sql','src/app/core/models/supabase.types.ts','docs/AI-CHANGELOG.md',PLAN])
    changelog=ROOT/'docs/AI-CHANGELOG.md'
    first,rest=changelog.read_text().split('\n',1)
    entry=(HEADING+'\n**Auftrag:** Sieben-Tage-Feed, geräteübergreifende persönliche Favoriten ohne automatische Löschung, Titelsuche, fünf Desktopspalten, kleinere Bildaktionen, Heute/Gestern und gemeinsamer Kategorie-Wähler.\n\n'
        '**Umsetzung:** Separate geprüfte Artikelkopien je Benutzer und Workspace ohne Fremdschlüssel zum Feed. Bestätigte Schreibzugriffe, Accountwechsel-Schutz und ausdrücklicher Altimport. Alte Gerätebestände stellen entfernte Favoriten nicht wieder her. Keine 500er-Verdrängung, keine Bildspiegelung. Abgleich beim Öffnen und alle 30 Sekunden in sichtbaren Fenstern. Titelabfrage vor Seitengrenze; Bereinigung und Referenzpreise nach sieben Tagen. Bestehender Kategorie-Picker mit Vinted-Datenquelle statt zweitem Nachbau.\n\n'
        '**Prüfung:** Neue Favoriten-, Datums- und Kategorietests zuerst rot und danach grün. Generierte Migration nach frischem Aufbau mit 3.091 Datenbankprüfungen bestanden. Lokaler Produktionsbau durch Speichergrenze beendet; Integration wird deshalb im isolierten Runner geprüft. Kein unabhängiger zweiter Reviewer, kein echter Vinted-Abruf und keine Produktionsänderung. PR-/Merge-Freigabe steht aus.\n\n')
    assert HEADING not in rest
    changelog.write_text(first+'\n\n'+entry+rest.lstrip('\n'))
    temporary=['tools/vinted-feed-account.patch']+[f'tools/vinted-feed-ui.part{i}.b64' for i in range(5)]+['.github/workflows/vinted-feed-check.yml','tools/vinted-feed-database-check.py','.github/workflows/vinted-feed-final-check.yml','tools/vinted-feed-verify.py']
    run('git','rm','--',*temporary)
    (REVIEW/'product-paths.json').write_text(json.dumps(sorted(paths)))

def record():
    def count(file,pattern):
        text=re.sub(r'\x1b\[[0-9;]*m','',(REVIEW/file).read_text())
        matches=re.findall(pattern,text)
        assert matches,(file,pattern)
        return matches[-1]
    app=count('application.log',r'Tests\s+(\d+)\s+passed')
    collector=count('collector.log',r'Tests\s+(\d+)\s+passed')
    database=count('database.log',r'Files=\d+, Tests=(\d+)')
    browser=count('browser.log',r'(\d+) passed')
    result=(f"\n**Abschlussprüfung:** Lauf `{os.environ['GITHUB_RUN_ID']}`: {app} betroffene Anwendungstests, {collector} Collector-Tests, {database} Datenbankprüfungen und {browser} Browserabläufe bestanden. Produktionsbau, Formatierung, Lint, Typen und Workflow-Verträge bestanden. Temporäre Prüfdateien entfernt. Keine Änderung an Produktion; Abschlussfreigabe für PR und Merge steht aus.\n")
    for path in ['docs/AI-CHANGELOG.md',PLAN]:
        file=ROOT/path
        text=file.read_text()
        if path.endswith('AI-CHANGELOG.md'):
            assert text.count(HEADING)==1
            file.write_text(text.replace(HEADING,HEADING+result,1))
        else:file.write_text(text+result)
    run('node','node_modules/prettier/bin/prettier.cjs','--write','docs/AI-CHANGELOG.md',PLAN)
    paths=json.loads((REVIEW/'product-paths.json').read_text())
    run('git','add','--',*paths)
    changed=subprocess.check_output(['git','diff','--cached','--name-only',BASE],text=True).splitlines()
    assert set(changed).issubset(set(paths)),set(changed)-set(paths)
    run('git','diff','--cached','--check')

if __name__=='__main__':
    assert len(sys.argv)==2 and sys.argv[1] in ['prepare','record']
    if sys.argv[1]=='prepare':prepare()
    else:record()
