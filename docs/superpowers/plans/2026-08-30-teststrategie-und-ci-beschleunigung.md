# Test Strategy and CI Acceleration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die fachliche Testsicherheit von Flipbase erhalten und gezielt verbessern, während Pull-Request-Prüfungen höchstens drei Minuten und der Weg vom Merge bis Produktion höchstens fünf Minuten benötigen.

**Architecture:** Tests werden nach Laufzeitumgebung und Risiko getrennt: reine Logik in Node, Browser-/Angular-Verhalten in einer unterstützten DOM-Testumgebung, Datenintegrität in lokaler Supabase und fünf kritische Benutzerwege in Playwright. GitHub Actions führt unabhängige Prüfungen und den unveränderlichen Image-Build parallel aus; nur ein gemeinsamer Gate-Job darf das serielle Produktionsdeployment freigeben.

**Tech Stack:** Angular 22, `@angular/build:unit-test`, TypeScript 6 strict, Vitest 4.1.x, jsdom 30, Supabase CLI 2.114.x mit pgTAP, Playwright in der bei Umsetzung neuesten stabilen kompatiblen Version, GitHub Actions, Docker Buildx.

**Spec:** `docs/superpowers/specs/2026-08-30-teststrategie-und-ci-beschleunigung-design.md`

## Global Constraints

- Keine fachlich wirksame Prüfung wird ausschließlich zur Laufzeitverkürzung gelöscht.
- Tests werden erst entfernt, nachdem der Ersatz rot gegen den bekannten Fehler und grün gegen die Korrektur gelaufen ist.
- Produktionsdaten und das Produktions-Supabase werden niemals von Browser- oder Datenbanktests beschrieben.
- Die bestehende Migrationsprüfung, das unveränderliche Image-Tag, Container-Healthcheck und öffentlicher Healthcheck bleiben erhalten.
- `master` führt weiterhin alle schnellen Pflichtprüfungen aus, solange Branch Protection im privaten Repository tarifbedingt nicht verfügbar ist.
- Neue Abhängigkeiten werden vor Installation gegen die offizielle stabile Version und Angular-/Node-Kompatibilität geprüft; keine Beta-, RC- oder Canary-Versionen.
- Coverage ist ein Warn- und Regressionssignal, kein Ersatz für risikobasierte Testfälle.
- Zielbudgets: PR p95 ≤ 3 Minuten, Merge bis Live p95 ≤ 5 Minuten, lokaler Gesamtlauf Median ≤ 20 Sekunden.
- GitHub-Runner-Minuten je Produktionslauf dürfen gegenüber Lauf `33299028439` nicht um mehr als 20 Prozent steigen.
- Commits verwenden Conventional Commits ohne Werkzeug- oder Co-Author-Signatur.

## File Structure

### Neue Dateien

- `docs/testing/README.md` — kurze verbindliche Regeln für neue Tests.
- `scripts/test-suite-audit.mjs` — prüft eindeutige Testklassifikation und zählt Dateien/Fälle.
- `scripts/run-test-suites.mjs` — startet unabhaengige lokale Testgruppen parallel und liefert einen gemeinsamen Exitcode.
- `vitest.split.config.ts` — messbare Node-/DOM-Alternative zum aktuellen Runner.
- `src/test-setup.angular-fallback.ts` — zentrale `TestBed`-Initialisierung nur fuer den rohen Vitest-Fallback.
- `.github/workflows/test-benchmark.yml` — ausschließlich manuell gestarteter Drei-Läufe-Vergleich; wird nach der Entscheidung wieder entfernt.
- `playwright.config.ts` — Chromium-Smoke-Konfiguration und Fehlerartefakte.
- `e2e/demo-login.spec.ts` — Anmeldung und Dashboard.
- `e2e/purchase-item-navigation.spec.ts` — Einkaufskontext und Rücknavigation.
- `e2e/inventory-sale.spec.ts` — gemeinsame Inventarsicht und Verkaufskonsistenz.
- `e2e/dashboard-interactions.spec.ts` — Plattformauswahl und Chart-Interaktion.
- `.github/workflows/quality-nightly.yml` — Coverage, Reihenfolgestress, vollständige Datenbank- und Browsermatrix.

### Zu ändernde Dateien

- `package.json` und `package-lock.json` — klar getrennte Testskripte und Playwright.
- `angular.json` — offizieller Angular-Unit-Test-Target für den Vergleich und gegebenenfalls den dauerhaften Runner.
- `vitest.config.ts` — finale Runnerkonfiguration nach dem gemessenen Vergleich.
- `src/test-setup.ts` — nur wirklich gemeinsame, idempotente Browser-/Storage-Polyfills.
- `tsconfig.spec.json` — neue Setup- und Testdateien vollständig typisieren.
- `.github/workflows/ci.yml` — parallele Jobs, Shards, Gate und paralleler Kandidaten-Image-Build.
- `.gitignore` — lokale Testberichte und Playwright-Artefakte.
- Bestehende Spec-Dateien aus den in Task 3 genannten Konsolidierungsgruppen.
- `src/app/core/services/tax-engine.service.spec.ts` — vier tautologische Prüfungen durch Produktionsaufrufe ersetzen.
- `src/app/accessibility-semantics.spec.ts` — nach erfolgreichem Browserersatz entfernen.
- Bestehende Dateien unter `supabase/tests/` — auf einen einheitlichen, durch `supabase test db` ausführbaren pgTAP-Vertrag bringen; reine Fixtures und manuelle Skripte wandern aus diesem rekursiv entdeckten Verzeichnis heraus.

---

### Task 1: Einen reproduzierbaren Runner-Vergleich aufsetzen

**Files:**

- Create: `vitest.split.config.ts`
- Create: `.github/workflows/test-benchmark.yml`
- Create: `scripts/test-suite-audit.mjs`
- Modify: `package.json`

**Interfaces:**

- Produces: `npm run test:current`, `npm run test:split`, `npm run test:audit`.
- Produces: ein manuell gestarteter Workflow, der den unveraenderten Runner und den Umgebungssplit jeweils dreimal kalt ausführt und Laufzeit sowie Ergebnis in `$GITHUB_STEP_SUMMARY` schreibt. Der Split wird erst nach der Klassifikation in Task 2 gestartet.
- Consumes: die unveränderten 131 Live-Testdateien; an dieser Stelle wird noch kein Test gelöscht oder zusammengeführt.

- [ ] **Step 1: Den Testklassifikations-Audit zuerst fehlschlagen lassen**

  Erstelle `scripts/test-suite-audit.mjs` so, dass jede `*.spec.ts` genau einer Kategorie zugeordnet wird. Die erste Version kennt noch keine Browserliste und muss mit `Unklassifizierte Testdateien` fehlschlagen.

  ```js
  import { readFile, readdir } from 'node:fs/promises';
  import { join } from 'node:path';

  const root = join(process.cwd(), 'src');

  async function collect(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    const nested = await Promise.all(
      entries.map((entry) => {
        const path = join(directory, entry.name);
        return entry.isDirectory() ? collect(path) : [path];
      }),
    );
    return nested.flat().filter((path) => path.endsWith('.spec.ts'));
  }

  const files = await collect(root);
  const dom = files.filter((path) => path.endsWith('.dom.spec.ts'));
  const angular = files.filter((path) => path.endsWith('.angular.spec.ts'));
  const node = files.filter(
    (path) => !path.endsWith('.dom.spec.ts') && !path.endsWith('.angular.spec.ts'),
  );

  const browserMarker =
    /\b(TestBed|ComponentFixture|window|document|DOMParser|HTMLElement|FileReader|ImageData)\b/;
  const unclassified = [];
  for (const path of node) {
    if (browserMarker.test(await readFile(path, 'utf8'))) unclassified.push(path);
  }

  if (node.length + dom.length + angular.length !== files.length || unclassified.length) {
    throw new Error(`Unklassifizierte Testdateien:\n${unclassified.join('\n')}`);
  }

  console.log(
    JSON.stringify({
      files: files.length,
      node: node.length,
      dom: dom.length,
      angular: angular.length,
    }),
  );
  ```

- [ ] **Step 2: Den erwarteten ersten Fehler prüfen**

  Run: `node scripts/test-suite-audit.mjs`  
  Expected: Die Dateizählung funktioniert, aber der Audit zeigt, dass noch keine explizite DOM-/Angular-Kategorie existiert.

- [ ] **Step 3: Die gemessene Split-Konfiguration ergänzen**

  Erstelle `vitest.split.config.ts` mit drei eindeutigen Projekten. In diesem Vergleich bleibt `angular` noch ein isoliertes jsdom-Projekt; Task 2 entscheidet gemessen über den Angular-Builder.

  ```ts
  import { defineConfig } from 'vitest/config';

  const jsdomSetup = {
    globals: false,
    setupFiles: ['src/test-setup.ts'],
  };

  export default defineConfig({
    test: {
      projects: [
        {
          extends: true,
          test: {
            name: 'node',
            globals: false,
            environment: 'node',
            include: ['src/**/*.spec.ts'],
            exclude: ['src/**/*.dom.spec.ts', 'src/**/*.angular.spec.ts'],
            pool: 'forks',
            isolate: false,
          },
        },
        {
          extends: true,
          test: {
            ...jsdomSetup,
            name: 'dom',
            environment: 'jsdom',
            include: ['src/**/*.dom.spec.ts'],
            pool: 'vmThreads',
            isolate: true,
            vmMemoryLimit: '1GB',
          },
        },
        {
          extends: true,
          test: {
            ...jsdomSetup,
            name: 'angular-fallback',
            environment: 'jsdom',
            include: ['src/**/*.angular.spec.ts'],
            pool: 'vmThreads',
            isolate: true,
            vmMemoryLimit: '1GB',
          },
        },
      ],
    },
  });
  ```

- [ ] **Step 4: Vergleichsskripte ergänzen**

  ```json
  {
    "scripts": {
      "test:current": "vitest run",
      "test:split": "vitest run --config vitest.split.config.ts",
      "test:audit": "node scripts/test-suite-audit.mjs"
    }
  }
  ```

- [ ] **Step 5: Den manuellen Benchmark-Workflow anlegen**

  Der Workflow hat eine Matrix `runner: [current, split]` und `sample: [1, 2, 3]`. Beide Varianten vergleichen nach Task 2 die vollständige Suite. Jeder Job führt `npm ci`, dann den zugehörigen Befehl aus. `continue-on-error` bleibt `false`; ein fachlich abweichender Runner scheidet aus.

  ```yaml
  name: Test runner benchmark

  on:
    workflow_dispatch:

  jobs:
    benchmark:
      strategy:
        fail-fast: false
        matrix:
          runner: [current, split]
          sample: [1, 2, 3]
      runs-on: ubuntu-latest
      timeout-minutes: 15
      steps:
        - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1
          with:
            persist-credentials: false
        - uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020
          with:
            node-version: '22'
            cache: npm
        - run: npm ci
        - run: npm run test:${{ matrix.runner }}
  ```

- [ ] **Step 6: Commit**

  ```bash
  git add package.json package-lock.json vitest.split.config.ts scripts/test-suite-audit.mjs .github/workflows/test-benchmark.yml
  git commit -m "test(ci): add reproducible runner benchmarks"
  ```

---

### Task 2: Testdateien nach echter Laufzeitumgebung klassifizieren

**Files:**

- Rename: 20 `TestBed`-Dateien von `*.spec.ts` nach `*.angular.spec.ts`
- Rename: 13 übrige Browserdateien von `*.spec.ts` nach `*.dom.spec.ts`
- Modify: `scripts/test-suite-audit.mjs`
- Modify: Imports oder Pfadreferenzen, die einen alten Spec-Dateinamen nennen

**Interfaces:**

- Produces: drei disjunkte Mengen `node`, `dom`, `angular`.
- Invariant: Die Summe aller Testfälle entspricht vor und nach der Umbenennung exakt dem Live-Ausgangswert des Arbeitsstands.
- Invariant: Node-Dateien greifen weder auf `window`, `document`, DOM-Klassen noch `TestBed` zu.

- [ ] **Step 1: Den Auditvertrag für die drei Kategorien vervollständigen**

  Der in Task 1 begonnene Marker wird um Canvas-, Datei-, Navigator- und Storage-APIs ergänzt. Für jede Node-Datei liest das Skript den Quelltext und bricht bei diesem Vertrag ab:

  ```js
  const forbiddenInNode =
    /\b(TestBed|ComponentFixture|window|document|DOMParser|HTMLElement|HTMLCanvasElement|FileReader|File|Blob|Image|ImageData|ResizeObserver|localStorage|navigator)\b/;
  const violations = [];
  for (const path of node) {
    const source = await readFile(path, 'utf8');
    if (forbiddenInNode.test(source)) violations.push(path);
  }
  if (violations.length) {
    throw new Error(`Node-Tests mit Browserzugriff:\n${violations.join('\n')}`);
  }
  ```

- [ ] **Step 2: Audit rot laufen lassen**

  Run: `npm run test:audit`  
  Expected: FAIL und Ausgabe der aktuell falsch als Node klassifizierten Dateien.

- [ ] **Step 3: Die 20 Angular-Dateien eindeutig umbenennen**

  Verwende die durch `rg -l 'TestBed|ComponentFixture' src -g '*.spec.ts'` ermittelte Liste. Dazu gehören unter anderem:

  ```text
  src/app/app-toast-rendering.angular.spec.ts
  src/app/features/dashboard/dashboard.component.angular.spec.ts
  src/app/features/inventory/components/stock-position-list/stock-position-list.component.angular.spec.ts
  src/app/features/inventory/pages/item-detail/item-detail-navigation.angular.spec.ts
  src/app/features/purchases/pages/purchase-detail/purchase-detail-navigation.angular.spec.ts
  src/app/features/sales/components/sale-create-modal/sale-create-modal-ux.angular.spec.ts
  src/app/shared/components/custom-select/custom-select.component.angular.spec.ts
  src/app/shared/components/revenue-chart/revenue-chart.component.angular.spec.ts
  ```

  Die vollständige Liste kommt aus dem Audit und wird im Commit-Diff überprüft; keine Datei wird inhaltlich gelöscht.

- [ ] **Step 4: Die verbleibenden 13 Browserdateien umbenennen**

  Dateien mit `window`, `document`, `DOMParser`, File-/Canvas-APIs oder jsdom-spezifischem Verhalten erhalten `.dom.spec.ts`. `TestBed`-Dateien dürfen nicht noch einmal in dieser Menge vorkommen.

- [ ] **Step 5: Alle drei Projekte ausführen**

  Run: `npm run test:split`  
  Expected: alle bisherigen Testdateien und Testfälle grün; kein Test doppelt.

- [ ] **Step 6: Node-Reihenfolgeabhängigkeiten prüfen**

  ```powershell
  1..20 | ForEach-Object {
    npx vitest run --config vitest.split.config.ts --project=node --sequence.shuffle --sequence.seed=$_
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  }
  ```

  Expected: 20/20 Läufe grün. Bei einem Fehler wird `isolate: true` für Node beibehalten und der Zustandsleck-Test vor jeder weiteren Optimierung korrigiert.

- [ ] **Step 7: Kalten Current-vs.-Split-Benchmark ausführen**

  Run: GitHub `workflow_dispatch` fuer `.github/workflows/test-benchmark.yml`.  
  Expected: sechs abgeschlossene Jobs, jeweils 1.039 Tests, mit Minimum, Median und Maximum fuer `current` und `split`. Ein Lauf mit anderer Testzahl ist ungueltig.

- [ ] **Step 8: Commit**

  ```bash
  git add src scripts/test-suite-audit.mjs
  git commit -m "test: separate node DOM and Angular suites"
  ```

---

### Task 3: Die unterstützte Angular-Testpipeline übernehmen oder den gemessenen Fallback festschreiben

**Files:**

- Modify: `angular.json`
- Modify: `vitest.config.ts`
- Modify: `package.json`
- Modify: `tsconfig.spec.json`
- Modify: `src/test-setup.ts`
- Modify: alle `*.angular.spec.ts`
- Create: `src/test-setup.angular-fallback.ts`
- Create: `scripts/run-test-suites.mjs`
- Delete: `vitest.split.config.ts` nach Übernahme der gewählten Konfiguration
- Delete: `.github/workflows/test-benchmark.yml` nach dokumentierter Entscheidung
- Create: `docs/testing/runner-benchmark-2026-08-30.md`

**Interfaces:**

- Produces: dauerhaft genau `npm run test:node`, `npm run test:dom`, `npm run test:angular`, `npm test`.
- Produces: `npm test` startet die drei voneinander unabhaengigen Gruppen parallel und gibt nur bei drei erfolgreichen Gruppen Exitcode 0 zurueck.
- Decision rule: Angular-Builder nur übernehmen, wenn 100 % der Fälle bestehen, sein Median nicht langsamer als das isolierte Angular-Fallback ist und der parallele lokale Gesamtlauf das Zeitbudget einhaelt.
- Fallback: eigenes Vitest-Projekt `angular` mit `jsdom`, `vmThreads`, `isolate: true`.

- [ ] **Step 1: Den bekannten Kompatibilitaetsfehler reproduzieren**

  Fuege den offiziellen Target zunaechst fuer genau eine heutige `TestBed`-Datei hinzu und starte ihn ohne inhaltliche Aenderung.  
  Expected: FAIL mit `Cannot set base providers because it has already been called`. Dieser am Produktions-Commit bestaetigte Fehler verhindert einen unfairen Laufzeitvergleich vor der Bereinigung.

- [ ] **Step 2: Angular-Target und vollstaendige Typpruefung konfigurieren**

  `tsconfig.spec.json` nimmt `src/test-setup.ts` und die neue Fallback-Setup-Datei in `include` auf. Ergaenze danach unter `projects.flipbase.architect`:

  ```json
  "test": {
    "builder": "@angular/build:unit-test",
    "options": {
      "tsConfig": "tsconfig.spec.json",
      "buildTarget": "flipbase:build:development",
      "include": ["src/**/*.angular.spec.ts"],
      "setupFiles": ["src/test-setup.ts"]
    }
  }
  ```

  `src/test-setup.angular-fallback.ts` initialisiert `TestBed` genau fuer das rohe Vitest-Projekt. Das Angular-Builder-Target darf diese Datei nicht als `setupFiles` laden, weil der Builder seine Umgebung selbst initialisiert.

  Der lokale Storage-Ersatz in `src/test-setup.ts` wird bereits beim Laden der Setup-Datei installiert und in `beforeEach` nur geleert oder erneuert. Damit koennen Anwendungsimporte nicht vorher auf Nodes experimentellen `localStorage`-Getter zugreifen.  
  Expected: keine Serie von `ExperimentalWarning: localStorage is not available` mehr im Testlauf.

- [ ] **Step 3: Doppelte Initialisierung aus allen 20 Angular-Dateien entfernen**

  Entferne aus `*.angular.spec.ts`:

  ```ts
  import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
  TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
  TestBed.resetTestEnvironment();
  ```

  Das Fallback-Projekt erhaelt `setupFiles: ['src/test-setup.ts', 'src/test-setup.angular-fallback.ts']`. Private Ressourcenaufloesung bleibt fuer diesen Vergleich vorerst unveraendert, damit nicht gleichzeitig Runner und Testinhalt gewechselt werden.

- [ ] **Step 4: Beide Angular-Kandidaten funktional pruefen**

  Ergaenze fuer den Vergleich voruebergehend `test:angular` und `test:angular-fallback` mit den in Step 7 gezeigten Runnerbefehlen.

  Run: `npm run test:angular-fallback`  
  Run: `npm run test:angular`  
  Expected: dieselben 20 Dateien und dieselbe Testzahl sind in beiden Kandidaten gruen. Danach `npm run test:split` ausfuehren und ueber Node, DOM und Angular-Fallback weiterhin insgesamt exakt 1.039 Tests verlangen.

- [ ] **Step 5: Angular-vs.-Fallback dreimal kalt messen**

  Stelle die Benchmark-Matrix auf `runner: [angular, angular-fallback]` und `sample: [1, 2, 3]`. Beide Runner muessen exakt dieselben 20 Dateien ausfuehren.  
  Expected: sechs abgeschlossene Jobs mit gleicher Testzahl, Ergebnis, Minimum, Median und Maximum.

- [ ] **Step 6: Entscheidung dokumentieren und private APIs nur beim Builder entfernen**

  `docs/testing/runner-benchmark-2026-08-30.md` enthaelt die Messwerte aus Task 2 und Step 5 sowie die begruendete Entscheidung. Wird der Builder gewaehlt, entferne auch `import '@angular/compiler'` und `ɵresolveComponentResources`; externe Templates kompiliert dann `@angular/build:unit-test`. Beim Fallback bleibt nur die nachweislich notwendige Ressourcenaufloesung erhalten, waehrend die `TestBed`-Initialisierung zentral bleibt.

- [ ] **Step 7: Dauerhafte Skripte und parallelen lokalen Gesamtlauf festlegen**

  Der gewählte Runner erhält diese öffentliche Schnittstelle:

  ```json
  {
    "scripts": {
      "test": "node scripts/run-test-suites.mjs",
      "test:node": "vitest run --project=node",
      "test:dom": "vitest run --project=dom",
      "test:angular": "ng test --watch=false --progress=false",
      "test:stress": "vitest run --project=node --sequence.shuffle"
    }
  }
  ```

  Beim Fallback ersetzt `vitest run --project=angular` nur den Wert von `test:angular`; die übrigen Namen bleiben gleich. `scripts/run-test-suites.mjs` verwendet `spawn`, streamt die Ausgaben getrennt beschriftet, wartet auf alle drei Prozesse und liefert bei mindestens einem Fehler einen Fehlercode. Keine Shell-Verkettung und keine plattformspezifische Syntax.

- [ ] **Step 8: Vollständige Prüfung und lokales Zeitbudget**

  Run: `npm run format:check`  
  Run: `npm run lint`  
  Run: `npm run typecheck`  
  Run: `npm test`  
  Run: `npm run build`  
  Expected: alles grün und dieselbe fachliche Testanzahl wie vor Task 2. `npm test` wird dreimal kalt gemessen. Liegt der Median noch ueber 20 Sekunden, wird die Abweichung dokumentiert und Task 4 muss sie vor der Gesamtabnahme in Task 10 beseitigen; die funktionale Runnerentscheidung bleibt davon getrennt.

- [ ] **Step 9: Temporäre Benchmarkdateien entfernen und committen**

  ```bash
  git add angular.json vitest.config.ts tsconfig.spec.json package.json package-lock.json src scripts/run-test-suites.mjs docs/testing/runner-benchmark-2026-08-30.md
  git rm vitest.split.config.ts .github/workflows/test-benchmark.yml
  git commit -m "test(angular): adopt the measured test runner"
  ```

---

### Task 4: Schwere Modulgraphen ohne Verlust von Szenarien zusammenführen

**Files:**

- Consolidate: fünf `src/app/features/image-optimizer/image-optimizer-*.spec.ts` in `image-optimizer.component.angular.spec.ts`
- Consolidate: `item-detail-actions.spec.ts` und `item-detail-navigation.angular.spec.ts` in `item-detail.component.angular.spec.ts`
- Consolidate: `purchase-detail-actions.spec.ts` und `purchase-detail-navigation.angular.spec.ts` in `purchase-detail.component.angular.spec.ts`
- Consolidate: `sale-create-modal-actions.spec.ts` und `sale-create-modal-ux.angular.spec.ts` in `sale-create-modal.component.angular.spec.ts`
- Consolidate: `settings-toast-actions.spec.ts` und `settings-workspace-config.angular.spec.ts` in `settings.component.angular.spec.ts`
- Consolidate: die sieben `purchase-*`/`einkauf-zusatzkosten`-Specs, die `purchase.service.ts` prüfen, in `src/app/core/services/purchase.service.spec.ts`

**Interfaces:**

- Invariant: Die Zahl der Assertions und Testfälle sinkt in diesem Task nicht.
- Invariant: Jeder zusammengeführte Block behält einen eigenen benannten `describe`-Abschnitt.
- Produces: weniger isolierte Importe derselben Angular-Komponente oder desselben Service-Modulgraphen.

- [ ] **Step 1: Vorher-Zählung festhalten**

  Run: `npm run test:audit`  
  Run: `npm test`  
  Expected: Dateizahl und Testanzahl in `docs/testing/runner-benchmark-2026-08-30.md` ergänzen.

- [ ] **Step 2: Bildoptimierer-Specs zusammenführen**

  Übernimm jeden bisherigen Top-Level-Block unverändert unter einen beschreibenden Block:

  ```ts
  describe('ImageOptimizerComponent', () => {
    describe('Anpassungen', () => {
      /* bisherige Fälle */
    });
    describe('Alles löschen', () => {
      /* bisherige Fälle */
    });
    describe('Metadaten', () => {
      /* bisherige Fälle */
    });
    describe('Prüfschritt', () => {
      /* bisherige Fälle */
    });
    describe('Aktionsmeldungen', () => {
      /* bisherige Fälle */
    });
  });
  ```

- [ ] **Step 3: Jeweils die zwei Specs derselben Seite/Komponente zusammenführen**

  Item Detail, Purchase Detail, Sale Create Modal und Settings erhalten jeweils eine Spec-Datei. Gemeinsames Setup wird einmal als `setup()`-Funktion definiert; Tests teilen keinen veränderlichen Zustand.

- [ ] **Step 4: PurchaseService-Specs zusammenführen**

  Die Bereiche lauten `Persistenz`, `Anlegen`, `Demo-Modus`, `Laderennen`, `Centbeträge`, `Mengen` und `Zusatzkosten`. Produktionsimporte werden einmal geladen; Test-Fixtures bleiben je Test neu erzeugt.

- [ ] **Step 5: Nachher-Zählung und Laufzeit prüfen**

  Run: `npm run test:audit`  
  Run: `npm test`  
  Expected: identische Testfallzahl, geringere Dateizahl, alle Fälle grün.

- [ ] **Step 6: Commit**

  ```bash
  git add src docs/testing/runner-benchmark-2026-08-30.md
  git commit -m "test: consolidate repeated Angular module graphs"
  ```

---

### Task 5: Nutzlose Prüfungen ersetzen und eine verbindliche Testregel dokumentieren

**Files:**

- Create: `docs/testing/README.md`
- Modify: `src/app/core/services/tax-engine.service.spec.ts`
- Modify: passende Produktions- oder Export-Spec für DATEV/Klausel-Verhalten
- Delete later: `src/app/accessibility-semantics.spec.ts`
- Test: `e2e/demo-login.spec.ts` aus Task 8 übernimmt den zugänglichen Registrierungsvertrag

**Interfaces:**

- Produces: Review-Regel `Produktionsaufruf + beobachtbares Ergebnis + fachliches Risiko` für neue Tests.
- Invariant: Die vier tautologischen Steuerfälle werden durch echte Produktionsaufrufe ersetzt, nicht ersatzlos entfernt.

- [ ] **Step 1: Einen absichtlich fehlerhaften Produktionswert gegen den aktuellen Test laufen lassen**

  Ändere in einem temporären Arbeitsstand den Steuerfaktor oder das DATEV-Konto und führe ausschließlich die ersten vier bisherigen Tests aus. Dokumentiere, dass mindestens die rein im Test berechneten Fälle trotz Produktionsfehler grün bleiben. Nimm die temporäre Produktionsänderung danach über einen gezielten Patch zurück.

- [ ] **Step 2: Echte Verhaltenstests schreiben**

  Beispiel für die positive Differenzbesteuerung:

  ```ts
  it('berechnet die Umsatzsteuer aus der positiven Marge', () => {
    const result = service.calculateSaleTax(sale, item, 'diff_25a');

    expect(result.gross_margin).toBe(45);
    expect(result.vat_amount).toBeCloseTo(7.18, 2);
  });
  ```

  Der Verlustfall ruft dieselbe Produktionsmethode auf. Kleinunternehmerklausel und DATEV-Konto werden über die jeweils echte Export-/Klauselfunktion geprüft.

- [ ] **Step 3: Neue Fälle erst rot, dann grün nachweisen**

  Run: die vier neuen Tests mit der temporären fehlerhaften Produktionsmutation.  
  Expected: FAIL.  
  Run: dieselben Tests mit unveränderter Produktion.  
  Expected: PASS.

- [ ] **Step 4: Erst jetzt die vier alten Fälle entfernen**

  Die Gesamtzahl darf sinken, weil jeder entfernte Fall einen dokumentierten stärkeren Ersatz besitzt. Die Coverage der betroffenen Produktionsdateien darf nicht fallen.

- [ ] **Step 5: Testregeln dokumentieren**

  `docs/testing/README.md` enthält:

  ```text
  Behalten: Geld, Bestand, Verkauf, Retoure, Steuer, Export, RLS, Rechte, frühere Produktionsfehler.
  Ersetzen: Quelltextsuche, private Angular-APIs, Prototyp-Aufrufe für eigentlich sichtbares Verhalten.
  Löschen: kein Produktionsaufruf, vollständiges Duplikat, entfernte Funktion oder stabiler stärkerer Ersatz.
  Niemals löschen: nur weil ein Test alt, unbequem oder langsam ist.
  ```

- [ ] **Step 6: Commit**

  ```bash
  git add docs/testing/README.md src/app/core/services/tax-engine.service.spec.ts
  git commit -m "test(tax): replace tautologies with production behavior checks"
  ```

---

### Task 6: GitHub-Prüfungen und Image-Build parallelisieren

**Files:**

- Modify: `.github/workflows/ci.yml`
- Modify: `package.json`

**Interfaces:**

- Produces jobs: `quality`, `unit`, `test-gate`, `image`, `deploy`.
- `unit` ist eine Matrix über die finalen Runnergruppen und Vitest-Shards.
- `deploy` kann in diesem Task nur starten, wenn `quality`, `test-gate` und `image` erfolgreich sind. Task 7 und Task 8 ergänzen anschließend `database-gate` und `browser-smoke` als weitere Pflichtabhängigkeiten.

- [ ] **Step 1: Einen fehlschlagenden Gate-Test in einem Pull Request einbauen**

  Erzeuge zunächst auf einem temporären Pull-Request-Branch eine Matrix mit einem absichtlich fehlschlagenden Shard und bestaetige, dass `test-gate` fehlschlaegt und `deploy` als `skipped` endet. Dieser Lauf prueft das Matrix-Gate; der zusaetzliche Ereignisschutz verhindert im Pull Request ohnehin jedes Deployment. Der absichtliche Fehler wird vor dem Commit entfernt.

- [ ] **Step 2: Quality aus dem seriellen Verify-Job lösen**

  ```yaml
  quality:
    name: Quality
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1
        with:
          persist-credentials: false
      - uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020
        with:
          node-version: '22'
          cache: npm
      - run: npm ci
      - run: npm run format:check
      - run: npm run lint
      - run: npm run typecheck
      - run: npm run build
  ```

- [ ] **Step 3: Testmatrix ergänzen**

  Die endgültige Matrix wird aus dem gemessenen Runner aufgebaut. Für Vitest-Gruppen mit mehr als 40 Dateien werden zwei Shards verwendet; kleinere Gruppen laufen einmal.

  ```yaml
  unit:
    name: Unit ${{ matrix.suite }} ${{ matrix.shard }}
    strategy:
      fail-fast: false
      matrix:
        include:
          - suite: node
            shard: 1/2
          - suite: node
            shard: 2/2
          - suite: dom
            shard: 1/1
          - suite: angular
            shard: 1/1
    runs-on: ubuntu-latest
    timeout-minutes: 5
  ```

  Angular-Builder erhält keinen erfundenen Shard-Parameter. Falls er gewählt wurde, führt sein Matrixeintrag `npm run test:angular` aus; Vitest-Einträge verwenden `--shard=${{ matrix.shard }}`.

- [ ] **Step 4: Einen expliziten Test-Gate-Job hinzufügen**

  ```yaml
  test-gate:
    name: Test gate
    if: ${{ always() }}
    needs: unit
    runs-on: ubuntu-latest
    steps:
      - name: Require every unit shard
        env:
          RESULT: ${{ needs.unit.result }}
        run: test "$RESULT" = "success"
  ```

- [ ] **Step 5: Image-Build auf `master` parallel starten**

  Entferne `needs: verify` aus `image`. Das Image erhält während des parallelen Builds ausschließlich das Tag `${{ steps.tag.outputs.value }}`. Das Tag `latest` wird in diesem Schritt entfernt, damit ein fehlgeschlagener Kandidat nie als allgemeines Image erscheint.

  ```yaml
  tags: ${{ env.IMAGE }}:${{ steps.tag.outputs.value }}
  ```

- [ ] **Step 6: Deployment an alle Gates binden**

  ```yaml
  deploy:
    needs: [quality, test-gate, image]
    if: ${{ github.event_name == 'push' && always() && needs.quality.result == 'success' && needs.test-gate.result == 'success' && needs.image.result == 'success' }}
  ```

  Die bestehenden SSH-, Migrations-, Health- und Commitprüfungen bleiben inhaltlich erhalten.

- [ ] **Step 7: Workflow-Syntax und Sicherheitsverhalten prüfen**

  Run: `npx prettier --check .github/workflows/ci.yml`  
  Run: Pull Request mit einem fehlschlagenden Test.  
  Expected: `test-gate` ist rot; Image und Deployment laufen im Pull Request nicht.  
  Run: Pull Request vollständig grün.  
  Expected: alle PR-Pflichtpruefungen sind gruen; Image und Deployment laufen nicht. Auf `master` darf der Image-Job parallel einen unveraenderlichen SHA-Kandidaten bauen, aber `deploy` bleibt von allen Gates abhaengig.

- [ ] **Step 8: Commit**

  ```bash
  git add .github/workflows/ci.yml package.json package-lock.json
  git commit -m "ci: parallelize verification and candidate image build"
  ```

---

### Task 7: Vorhandene Supabase-Tests als bedingtes Pflicht-Gate aktivieren

**Files:**

- Modify: `.github/workflows/ci.yml`
- Modify: `package.json`
- Modify: `supabase/tests/*.sql`
- Modify: `supabase/tests/**/*.ps1`
- Create: `supabase/test-support/fixtures/`
- Create: `supabase/test-support/manual/`
- Create: `supabase/tests/rls_inventory_sales.test.sql`

**Interfaces:**

- Produces: `npm run test:db`.
- Produces: `database` und `database-gate` in GitHub Actions.
- Trigger: Änderungen unter `supabase/**`; vollständiger Lauf zusätzlich nachts und manuell.

- [ ] **Step 1: Den heutigen Datenbanktestbefehl rot laufen lassen**

  Run: `npx supabase start`  
  Run: `npx supabase test db`  
  Expected auf Produktions-Commit `0768233`: FAIL. `fixtures/inventory_integrity_legacy.sql` wird rekursiv als eigene Suite gestartet, verletzt dabei den Schutztrigger und besitzt keinen TAP-Plan. Weitere `inventory_sales_*.sql`-Dateien melden ebenfalls `No plan found`; durch das vorzeitig ausgefuehrte Fixture kann `inventory_item_sale_integrity.sql` zusaetzlich mit doppelten Schluesseln scheitern. Diesen bestaetigten Ausgang im Bericht dokumentieren.

- [ ] **Step 2: SQL-Dateien auf pgTAP vereinheitlichen**

  Jede ausführbare `*.sql`-Datei verwendet:

  ```sql
  begin;
  select plan(4);
  -- is(), ok(), throws_ok() und lives_ok()
  select * from finish();
  rollback;
  ```

  `supabase test db` entdeckt SQL-Dateien auch in Unterordnern von `supabase/tests/`. Deshalb wandern reine Fixtures nach `supabase/test-support/fixtures/` und nur manuell ausgefuehrte SQL-Pruefungen nach `supabase/test-support/manual/`. Echte Tests unter `supabase/tests/` binden Fixtures von dort explizit ein. Die konkrete Zahl in `plan(...)` entspricht der tatsächlichen Zahl der Assertions der jeweiligen Datei.

  Run: `npx supabase test db` zweimal hintereinander gegen denselben lokalen Stand.  
  Expected: beide Laeufe gruen; Transaktionen hinterlassen keine IDs oder sonstigen Geschaeftsdaten fuer den Folgelauf.

- [ ] **Step 3: RLS-Matrix für kritische Bestands- und Verkaufstabellen ergänzen**

  `rls_inventory_sales.test.sql` prüft für `inventory_items`, `stock_lots`, `stock_movements`, `sales` und `sale_lines` jeweils:

  - eigener Workspace: erlaubte Operation gelingt;
  - fremder Workspace: Select liefert nichts;
  - fremder Workspace: Insert/Update/Delete wird abgelehnt;
  - `anon`: keine geschäftlichen Zeilen les- oder schreibbar.

- [ ] **Step 4: Datenbankskript ergänzen**

  ```json
  {
    "scripts": {
      "test:db": "supabase test db"
    }
  }
  ```

- [ ] **Step 5: Änderungsdetektor ohne Fremd-Action hinzufügen**

  Der Job `changes` setzt `supabase=true`, wenn der Diff Dateien unter `supabase/` enthält. Für Pull Requests wird `github.event.pull_request.base.sha`, für Pushes `github.event.before` verwendet; bei einer Null-SHA wird der direkte Vorgänger von `GITHUB_SHA` verwendet.

- [ ] **Step 6: Datenbankjob hinzufügen**

  ```yaml
  database:
    if: ${{ needs.changes.outputs.supabase == 'true' }}
    needs: changes
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1
      - uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020
        with:
          node-version: '22'
          cache: npm
      - run: npm ci
      - run: npx supabase start
      - run: npm run test:db
      - if: ${{ always() }}
        run: npx supabase stop --no-backup
  ```

- [ ] **Step 7: Skipped und Success korrekt gaten**

  `database-gate` läuft mit `always()` und akzeptiert ausschließlich `success`, wenn `supabase=true`, beziehungsweise `skipped`, wenn `supabase=false`. Ergänze danach `database-gate` zu `deploy.needs` und fordere im Deploy-`if` dessen Ergebnis `success`.

- [ ] **Step 8: Commit**

  ```bash
  git add .github/workflows/ci.yml package.json package-lock.json supabase/tests supabase/test-support
  git commit -m "test(database): gate Supabase changes with local integration tests"
  ```

---

### Task 8: Fünf stabile Browser-Smoke-Tests ergänzen

**Files:**

- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `.gitignore`
- Create: `playwright.config.ts`
- Create: `e2e/demo-login.spec.ts`
- Create: `e2e/purchase-item-navigation.spec.ts`
- Create: `e2e/inventory-sale.spec.ts`
- Create: `e2e/dashboard-interactions.spec.ts`
- Modify: `.github/workflows/ci.yml`
- Delete: `src/app/accessibility-semantics.spec.ts` erst nach grünem Ersatz

**Interfaces:**

- Produces: `npm run test:e2e`.
- Uses: Development-Build mit `allowDemoMode: true`; keine Produktionszugriffe.
- Produces: GitHub-Job `browser-smoke`, der parallel zu Quality, Unit und Image läuft.

- [ ] **Step 1: Stabile Playwright-Version und Kompatibilität prüfen**

  Run: `npm view @playwright/test version`  
  Run: `npm view @playwright/test engines --json`  
  Expected: stabile Version ohne Vorabkennung und Node 22 unterstützt.

- [ ] **Step 2: Exakte stabile Version installieren**

  Run in PowerShell:

  ```powershell
  $playwrightVersion = (npm view @playwright/test version).Trim()
  npm install --save-dev --save-exact "@playwright/test@$playwrightVersion"
  ```

  Run: `npx playwright install chromium`  
  Expected: keine Beta-/RC-Version.

- [ ] **Step 3: Konfiguration anlegen**

  ```ts
  import { defineConfig } from '@playwright/test';

  export default defineConfig({
    testDir: './e2e',
    fullyParallel: true,
    retries: process.env['CI'] ? 1 : 0,
    reporter: process.env['CI'] ? [['github'], ['html', { open: 'never' }]] : 'list',
    use: {
      baseURL: 'http://127.0.0.1:4200',
      trace: 'on-first-retry',
      screenshot: 'only-on-failure',
    },
    webServer: {
      command: 'npm start -- --host 127.0.0.1 --port 4200',
      url: 'http://127.0.0.1:4200',
      reuseExistingServer: !process.env['CI'],
      timeout: 120_000,
    },
    projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  });
  ```

- [ ] **Step 4: Demo-Anmeldung und Registrierungssemantik testen**

  Der Test klickt Schaltflächen über `getByRole`, bestätigt das Dashboard und prüft auf der Registrierung, dass Rechtshinweise ohne Ziel nicht als Links mit `href="#"` erscheinen.

- [ ] **Step 5: Einkaufsnavigation testen**

  Der Test öffnet einen bekannten Demo-Einkauf, öffnet dessen Artikel über den sichtbaren Detail-Button und geht zurück. Erwartet wird weiterhin die Einkaufsdetailseite mit derselben Einkaufskennung, nicht der Inventar-Tab.

- [ ] **Step 6: Inventar und Verkauf testen**

  Der Test bestätigt in der gemeinsamen Tabelle mindestens einen Mengenartikel und ein Einzelstück, verkauft ein verfügbares Einzelstück und erwartet anschließend genau einen wirksamen Verkauf sowie einen nicht erneut verkaufbaren Artikel.

- [ ] **Step 7: Dashboardinteraktionen testen**

  Der Test wählt eine Plattform über die Shared-Select-Rolle aus und löst am Chart einen Tooltip aus. Selektoren verwenden Rollen/Beschriftungen, keine Tailwind-Klassen.

- [ ] **Step 8: Alten Quelltext-A11y-Test erst nach Ersatz entfernen**

  Run: `npm run test:e2e`  
  Expected: Der neue Registrierungsfall ist grün.  
  Danach: `src/app/accessibility-semantics.spec.ts` entfernen und `npm test` erneut grün ausführen.

- [ ] **Step 9: CI-Job ergänzen**

  `browser-smoke` installiert ausschließlich Chromium, führt `npm run test:e2e` aus und lädt `playwright-report/` sowie `test-results/` nur bei Fehlern als Artefakt hoch. Ergänze anschließend `browser-smoke` zu `deploy.needs` und fordere im Deploy-`if` dessen Ergebnis `success`.

- [ ] **Step 10: Commit**

  ```bash
  git add package.json package-lock.json .gitignore playwright.config.ts e2e .github/workflows/ci.yml src/app/accessibility-semantics.spec.ts
  git commit -m "test(e2e): cover critical inventory and sales journeys"
  ```

---

### Task 9: Coverage-Boden und geplante Vollprüfungen einführen

**Files:**

- Modify: `vitest.config.ts` oder `angular.json`, abhängig von Task 3
- Modify: `package.json`
- Create: `.github/workflows/quality-nightly.yml`

**Interfaces:**

- Produces: globaler Coverage-Boden Statements 56 %, Branches 49 %, Functions 55 %, Lines 57 %.
- Produces: nächtliche Vollprüfung ohne Blockade eines normalen Frontend-Deployments.

- [ ] **Step 1: Coverage-Schwellen zunächst gegen den aktuellen Stand rot/grün prüfen**

  Der erneut auf `0768233` gemessene Ausgangswert ist Statements 56,48 %, Branches 49,70 %, Functions 55,44 % und Lines 58,05 %. Setze testweise jede Schwelle einen Prozentpunkt darüber und bestätige einen Fehler. Setze danach die verbindlichen, leicht abgerundeten Regressionsböden:

  ```ts
  coverage: {
    provider: 'v8',
    include: ['src/app/**/*.ts'],
    thresholds: {
      statements: 56,
      branches: 49,
      functions: 55,
      lines: 57,
    },
  }
  ```

- [ ] **Step 2: Kritische Rechenmodule auf Zielwerte bringen**

  Für `profit-engine.service.ts`, `tax-engine.service.ts`, Kostenverteilung und Bestands-Verkaufbarkeit werden fehlende Zweige mit echten Produktionsaufrufen ergänzt, bis Statements ≥ 95 % und Branches ≥ 90 % erreicht sind. Keine Testformel darf die Produktionsformel nachbauen.

- [ ] **Step 3: Nightly-Workflow erstellen**

  Der Workflow läuft per `schedule` und `workflow_dispatch` und führt parallel aus:

  - vollständige Coverage,
  - 20 zufällig sortierte Node-Läufe,
  - alle Supabase-Tests einschließlich Migration/Parallelität,
  - Chromium, Firefox und WebKit für die fünf Smoke-Fälle.

- [ ] **Step 4: Fehlerartefakte und Aufbewahrung begrenzen**

  Berichte werden nur bei Fehlern oder als Coverage-Zusammenfassung hochgeladen und höchstens sieben Tage aufbewahrt.

- [ ] **Step 5: Commit**

  ```bash
  git add vitest.config.ts angular.json package.json package-lock.json .github/workflows/quality-nightly.yml src
  git commit -m "test: enforce coverage floors and nightly full checks"
  ```

---

### Task 10: Zeit-, Sicherheits- und Rollout-Abnahme

**Files:**

- Create: `docs/superpowers/reports/2026-08-30-teststrategie-und-ci-abnahme.md`
- Modify: `docs/AI-CHANGELOG.md`

**Interfaces:**

- Consumes: GitHub-Laufzeiten, Testzahlen, Coverage, Datenbank- und Browserergebnisse.
- Produces: eindeutige Go/No-Go-Entscheidung und dokumentierten Rückfall auf den bisherigen seriellen Workflow.

- [ ] **Step 1: Fünf Pull-Request-Läufe erfassen**

  Pro Lauf werden Dauer jedes Pflichtjobs, Gesamt-Runner-Minuten, Testzahl und Ergebnis erfasst. Abnahme nur, wenn alle grün und p95 des langsamsten Gates ≤ 3 Minuten ist.

- [ ] **Step 2: Vier kontrollierte Fehler einspeisen**

  In getrennten temporären Commits:

  1. falscher Steuerfaktor,
  2. zweiter Verkauf desselben Einzelstücks,
  3. RLS-Zugriff auf fremden Workspace,
  4. Rücknavigation vom Artikel ins Inventar statt zum Einkauf.

  Jeder Fehler muss von genau der vorgesehenen Testebene blockiert werden. Die temporären Fehlercommits werden nicht gemergt.

- [ ] **Step 3: Deployment-Gate negativ prüfen**

  Ein absichtlich fehlschlagender Test-Shard muss `deploy` überspringen. Das unveränderliche Kandidatenimage darf existieren, aber weder ausgerollt noch als `latest` markiert sein.

- [ ] **Step 4: Einen echten Produktionslauf messen**

  Nach Merge werden Verify-Gates, Image und Deployment vollständig beobachtet. Erwartet:

  - Merge bis `healthz=ok` ≤ 5 Minuten,
  - Container gesund,
  - öffentliche Startseite HTTP 200,
  - ausgelieferter Commit entspricht dem Merge-SHA.

- [ ] **Step 5: Rückfallregel festhalten**

  Bei fachlichen Abweichungen, Flakes über 5 % oder überschrittenem Runner-Minuten-Budget wird ausschließlich der CI-/Runner-Commit revertiert. Fachliche Tests bleiben erhalten. Der alte serielle Workflow aus Commit `0768233` ist der dokumentierte Rückfallpunkt.

- [ ] **Step 6: Abschlussbericht und Changelog committen**

  ```bash
  git add docs/superpowers/reports/2026-08-30-teststrategie-und-ci-abnahme.md docs/AI-CHANGELOG.md
  git commit -m "docs: record test strategy rollout evidence"
  ```

## Self-Review

- Spec coverage: Laufzeit, Testwert, Angular/Vitest, GitHub-Parallelisierung, Datenbank, Browser, Coverage, Branch-Protection-Einschränkung und Rollback sind jeweils einer Task zugeordnet.
- Placeholder scan: Es gibt keine offenen Platzhalter. Dynamisch bleibt ausschließlich die ausdrücklich vor Installation zu ermittelnde neueste stabile Playwright-Version.
- Type consistency: Öffentliche Skriptnamen `test:node`, `test:dom`, `test:angular`, `test:db`, `test:e2e` und Gate-Namen bleiben ab ihrer Einführung unverändert.
- Safety: Kein Test schreibt in Produktion; Deployment bleibt von allen Pflicht-Gates abhängig; Kandidatenimages sind unveränderlich und erhalten vor Freigabe kein `latest`.
