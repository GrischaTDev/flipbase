# Task 2 – PR- und Nightly-Workflows verschlanken

## Status

Abgeschlossen. Der fail-closed Job `browser-smoke` bleibt Teil der
erforderlichen Prüfungen, führt in CI jedoch ausschließlich den acht Tests
umfassenden PR-Kern mit der Chromium Headless Shell aus. Die Nightly-Konfiguration
wählt denselben Kern für Chromium, Firefox und WebKit.

## RED-Nachweis

1. Zuerst wurde der bestehende Vertrag
   `scripts/playwright-pr-smoke.test.mjs` um den Nightly- und Workflow-Vertrag
   erweitert.
2. `node --test scripts/playwright-pr-smoke.test.mjs` war erwartungsgemäß rot:
   Die ungefilterte Nightly-Konfiguration wählte den nicht markierten Test
   `zeigt den primaeren Einkaufsknopf in Logo-Gelb mit lesbarer Schrift` aus.
3. Der Fehler belegt, dass `grep: /@pr-smoke/` noch fehlte und nicht etwa ein
   Testfehler oder eine fehlerhafte Testeinrichtung vorlag.

## Änderungen

- `playwright.nightly.config.ts` filtert mit `grep: /@pr-smoke/`.
- `.github/workflows/ci.yml` installiert Chromium mit
  `--with-deps --only-shell chromium` und startet `npm run test:e2e:pr`.
- `.github/workflows/quality-nightly.yml` nennt im WebKit-Kommentar korrekt
  acht statt sechs Tests; Jobs, Zeitpläne, Browserinstallationen und Artefakte
  bleiben unverändert.
- Der Vertragslauf prüft semantisch genau 24 Nightly-Auflösungen: die acht
  erwarteten Tests für Chromium, Firefox und WebKit. Er prüft außerdem die
  exakten CI-Schritte, die Abhängigkeit von `required-checks`,
  `BROWSER_RESULT`, Zeitpläne sowie die bestehenden Firefox-/WebKit-Befehle.
- `scripts/required-checks.mjs` und dessen Tests wurden nicht verändert.

## Verifikation

- `node --test scripts/playwright-pr-smoke.test.mjs` – 8/8 grün.
- `npm run test:workflow` – 57 grün, 4 bestehende Windows-Skips, keine Fehler.
- `npx playwright test --config=playwright.pr.config.ts --list` – exakt 8
  Chromium-Tests in 8 Dateien.
- `npx playwright test --config=playwright.nightly.config.ts --project=<browser> --list`
  für Chromium, Firefox und WebKit – jeweils exakt 8 Tests in 8 Dateien.
- Actionlint 1.7.12 für beide geänderten Workflows – grün. Das offizielle
  Windows-Archiv wurde gegen die veröffentlichte SHA-256-Prüfsumme
  `6e7241b51e6817ea6a047693d8e6fed13b31819c9a0dd6c5a726e1592d22f6e9`
  abgeglichen; die CI verwendet dieselbe gepinnte Version.
- Prettier und ESLint für die geänderten Code- und Konfigurationsdateien –
  grün.
- `git diff --check` – grün.

## Selbstreview

- Die Nightly-Prüfung wertet die von Playwright aufgelöste JSON-Konfiguration
  aus; sie prüft nicht nur Quelltext. Zusätzliche, fehlende oder einem falschen
  Browser zugeordnete Smoke-Tests führen damit fail-closed zum Fehler.
- Der Workflow-Vertrag sichert den exakten Headless-Shell-Installationsbefehl,
  den PR-Befehl, die fortbestehende Sammelprüfung und die Zeitplan-Grenzen ab.
- Die bestehenden Manipulationsproben nutzen weiterhin ausschließlich eigene
  temporäre Kopien außerhalb verfolgter Projektdateien. Diese Umsetzung hat
  keine verfolgte Datei für eine Probe überschrieben.
- Es wurden keine Caches, Produktions-/Demo-Build-Konfigurationen, Jobs,
  Zeitpläne, Artefakte oder Required-Checks-Logik geändert.

## Commit

`ci: limit browser gates to critical smoke tests`

## Bedenken

Keine. Die lokale Actionlint-Prüfung verwendet wegen Windows das offizielle
Windows-Archiv derselben in CI gepinnten Version; dessen veröffentlichte
Prüfsumme wurde vor der Ausführung geprüft.
