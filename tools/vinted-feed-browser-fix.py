"""Gezielte Korrektur der belegten Browserfehler im eigenen, isolierten Feed-Zweig."""
import json
import pathlib
import re
import subprocess

root = pathlib.Path.cwd()
review = pathlib.Path('/tmp/feed-final-review')
paths = set(json.loads((review / 'product-paths.json').read_text()))

def replace_once(path, before, after):
    file = root / path
    text = file.read_text()
    assert text.count(before) == 1, (path, before, text.count(before))
    file.write_text(text.replace(before, after, 1))
    paths.add(path)

replace_once('e2e/deal-monitor.spec.ts',
    "page.getByRole('textbox', { name: 'Artikel im Titel durchsuchen' })",
    "page.getByRole('searchbox', { name: 'Artikel im Titel durchsuchen', exact: true })")
replace_once('e2e/deal-monitor.spec.ts',
    "const tabletContext = await browser.newContext({\n    viewport: { width: 1024, height: 900 },",
    "const tabletContext = await browser.newContext({\n    baseURL: new URL(page.url()).origin,\n    hasTouch: true,\n    isMobile: true,\n    viewport: { width: 1024, height: 900 },")
replace_once('e2e/sniper-administration.spec.ts',
    "await second.getByRole('combobox', { name: 'Bereich auswählen', exact: true }).click();\n    await page.getByRole('option', { name: 'Herren', exact: true }).click();",
    "await second.locator('app-vinted-category-picker button[aria-haspopup=\"dialog\"]').click();\n    const parentCategoryPanel = page.getByRole('dialog', { name: 'Kategorie · optional', exact: true });\n    await parentCategoryPanel.getByRole('option', { name: /^Herren.*Unterkategorien$/ }).click();\n    await parentCategoryPanel.getByRole('button', { name: 'Herren auswählen', exact: true }).click();\n    await expect(parentCategoryPanel).not.toBeVisible();")

# Der Größenanteil wird separat aufgebaut. Nur die vollständige Ausdrucksgrenze
# der Bildaktionsvariante verwenden, nicht die Reihenfolge einzelner CSS-Klassen.
button = root / 'src/app/shared/components/button/button.component.ts'
text = button.read_text()
match = re.search(r"('image-overlay':\s*)(.*?)(,\s*\n\s*destructive:)", text, re.S)
assert match and 'bg-zinc-900/60' in match[2], 'Erwartete Bildaktionsvariante fehlt.'
assert 'max-sm:min-w-11' not in match[2]
replacement = "'max-sm:min-h-11 max-sm:min-w-11 ' + (" + match[2] + ')'
button.write_text(text[:match.start(2)] + replacement + text[match.end(2):])
paths.add('src/app/shared/components/button/button.component.ts')

path = 'src/app/shared/components/button/button.component.angular.spec.ts'
regression = """describe('ButtonComponent', () => {
  it('sichert kleine Bildaktionen in schmalen Ansichten ohne globale Größenänderung ab', () => {
    fixture.componentRef.setInput('variant', 'image-overlay');
    fixture.componentRef.setInput('iconOnly', true);
    fixture.componentRef.setInput('size', 'slim');
    fixture.detectChanges();
    const button: HTMLButtonElement = fixture.nativeElement.querySelector('button');
    expect(button.classList).toContain('max-sm:min-h-11');
    expect(button.classList).toContain('max-sm:min-w-11');
    expect(button.classList).toContain('pointer-coarse:min-w-11');
    expect(button.classList).toContain('w-7');
    fixture.componentRef.setInput('variant', 'secondary');
    fixture.detectChanges();
    expect(button.classList).not.toContain('max-sm:min-w-11');
  });
"""
replace_once(path, "describe('ButtonComponent', () => {\n", regression)

# Der Trace zeigt erfolgreiche API-Antworten und die richtige Seite erst rund
# acht Sekunden nach dem vollständigen Dokumentwechsel. Die bisherigen
# Fünf-Sekunden-Assertions liefen davor auf der leeren App-Hülle. Zunächst auf
# den sichtbaren Seitenkopf warten; sämtliche fachlichen Assertions behalten.
navigation = r"^([ \t]*)await (page|tablet)\.(?:goto\('[^'\n]+'\)|reload\(\));$"
for path, expected in [('e2e/deal-monitor.spec.ts', 11), ('e2e/sniper-administration.spec.ts', 4)]:
    file = root / path
    text = file.read_text()
    assert len(re.findall(navigation, text, re.M)) == expected
    text = re.sub(navigation, lambda m: m[0] + '\n' + m[1] + 'await ' + m[2] + ".locator('app-page-header').waitFor({ state: 'visible', timeout: 30_000 });", text, flags=re.M)
    file.write_text(text)
    paths.add(path)

verification = review / 'verify.py'
text = verification.read_text()
assert text.count("BASE = 'b343611fffb6f289292ca23e9b14ff9429b2868e'") == 1
verification.write_text(text.replace("BASE = 'b343611fffb6f289292ca23e9b14ff9429b2868e'", "BASE = '4cd2e7f5bacde0fb53e73c56432de5c792b3dbaa'", 1))
entry = ('\n**Nachprüfung:** Die Browserfehler wurden auf zwei veraltete Rollen-/Komponentenannahmen '
         'und ein 28-px-Bildziel bei schmaler Ansicht mit feinem Zeiger zurückgeführt. '
         'Die Suchfeldrolle und die Auswahl einer Oberkategorie entsprechen nun der wirklichen '
         'Shared-Komponente. Ein eigener Tablet-Kontext bekommt ausdrücklich seine Basisadresse '
         'und Touch-Einstellungen. Die Bildaktionen bleiben am Desktop klein; schmale Ansichten '
         'haben zusätzlich zur Touch-Regel mindestens 44 px. Die vorhandenen Größenassertions '
         'bleiben erhalten. Lokaler CSS-Browsernachweis: vorher 28 px, nachher 44 px bei 390 px; '
         'bei 1440 px unverändert 28 px. Der nächste Trace belegte zusätzlich den sichtbaren '
         'Seitenaufbau erst nach rund acht Sekunden bei bereits nach fünf Sekunden abgelaufenen '
         'Assertions. Dokumentwechsel warten jetzt begrenzt auf den Seitenkopf, ohne Zieladressen '
         'oder fachliche Prüfungen abzuschwächen. Die vollständige Integrationsnachprüfung steht noch aus.\n')
changelog = root / 'docs/AI-CHANGELOG.md'
text = changelog.read_text()
heading = '## 2026-10-06 - Juna - Vinted Feed und persönliche Account-Favoriten\n'
assert text.count(heading) == 1
changelog.write_text(text.replace(heading, heading + entry, 1))
paths.add('docs/AI-CHANGELOG.md')
(review / 'product-paths.json').write_text(json.dumps(sorted(paths)))
subprocess.run(['git', 'rm', '--', 'tools/vinted-feed-browser-fix.py'], check=True)
