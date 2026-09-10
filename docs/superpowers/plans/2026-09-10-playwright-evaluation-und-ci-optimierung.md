# Evaluierungs- und Empfehlungsplan: Playwright-Ablösung & CI-Optimierung

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Bei beauftragtem Agentenbetrieb klare Dateizuständigkeiten wahren und keine unbeteiligten Dateien verändern.

**Goal:** Evaluierung und schrittweiser Ausstieg bzw. drastische Reduktion von Playwright in den GitHub Actions Workflows, um PR-Prüfzeiten von derzeit 3–5 Minuten auf unter 90 Sekunden zu senken und CI-Flakiness durch visuelle/CSS-Prüfungen vollständig zu eliminieren.

**Architecture:** Verlagerung relevanter Verhaltens- und Interaktionszusicherungen (Modals, Tastaturnavigation, Escape) von schweren Browser-End-to-End-Tests in leichtgewichtige Vitest-DOM-Tests (`*.dom.spec.ts` mit jsdom). Vollständige Entfernung des `browser-smoke`-Jobs aus `ci.yml` und Bereinigung der nächtlichen Workflows.

**Tech Stack:** Angular 22, Vitest 4.1.x (Node & jsdom), Supabase pgTAP, GitHub Actions, Docker Buildx.

---

## 1. Ausgangslage & Problemstellung

### 1.1 Was war ursprünglich geplant?

Laut Teststrategie vom 30.08.2026 (`docs/superpowers/plans/2026-08-30-teststrategie-und-ci-beschleunigung.md`) sollte Playwright lediglich **fünf elementare Benutzerwege** abdecken:

1. Startseite & Demo-Modus (`demo-login.spec.ts`)
2. Dashboard-Interaktion (`dashboard-interactions.spec.ts`)
3. Navigation im Einkauf (`purchase-item-navigation.spec.ts`)
4. Inventar & Verkaufskonsistenz (`inventory-sale.spec.ts`)
5. Minimale Barrierefreiheit (AXE-Grundcheck)

### 1.2 Der aktuelle Zustand: Test-Bloat durch KI-Assistenten

Inzwischen umfasst das Verzeichnis `e2e/` **22 Testdateien**. Für jeden behobenen UI-Fehler oder kosmetischen Detailbefund legten KI-Assistenten defensive Playwright-Tests an:

- `typography.spec.ts`: Iteriert per DOM-Traversal durch alle HTML-Tags der Seite und prüft per `getComputedStyle`, ob die CSS-Schriftart exakt `Inter` heißt.
- `admin-accent.spec.ts`: Prüft Hex-Codes und Tailwind-Farbakzente im echten Browser.
- `badge-text.spec.ts`: Prüft Textbestandteile von Badges im laufenden Browser.
- `table-sorting.spec.ts`, `compact-controls.spec.ts`, `purchase-dropdown-layer.spec.ts` etc.

### 1.3 Warum der Job `browser-smoke` die CI lahmlegt

1. **Kein Cache für Browser-Binaries:** Bei jedem PR-Lauf lädt `npx playwright install --with-deps chromium` rund 150 MB Binaries neu herunter (Dauer: ~30–45s).
2. **Anti-Pattern `ng serve` in CI:** In `playwright.config.ts` startet Playwright über `webServer.command` den vollen Angular-Entwicklungsserver (`npm start`). Auf 2-vCPU-Runnern dauert die Kompilierung 30–45s und erzeugt Spitzenlast bei CPU und RAM.
3. **Erzwungene serielle Ausführung:** Weil der Dev-Server so viele Ressourcen bindet, ist `workers: 1` in CI konfiguriert. 22 Testdateien laufen einzeln nacheinander ab.
4. **Fragilität / Flakiness:** Jede Design- und Layoutanpassung (z. B. 4px mehr Padding oder ein Button-Umbruch) lässt Playwright rot laufen, obwohl die Applikation funktional einwandfrei ist (siehe AI-Changelog vom 09.09.2026).
5. **Kein Mehrwert nächtlicher Wiederholungen:** Code altert nicht. Ein fehlerfreier Stand, der mittags deployed wurde, ändert sein visuelles Verhalten nachts um 02:17 Uhr nicht magisch.

---

## 2. Handlungsoptionen im Vergleich

| Kriterium                    | Option 1: Vollständiger Ausstieg aus Playwright (Empfehlung)     | Option 2: Radikaler 1-Pfad-Smoke-Test | Option 3: Status Quo technisch sanieren      |
| :--------------------------- | :--------------------------------------------------------------- | :------------------------------------ | :------------------------------------------- |
| **PR-Laufzeit (CI)**         | **~60–90 Sekunden** (-70 %)                                      | **~90–120 Sekunden** (-60 %)          | **~2–3 Minuten** (-30 %)                     |
| **Wartungsaufwand**          | **Null** (keine Browser-Dependencies)                            | Gering (1 Datei zu pflegen)           | Hoch (22 Testdateien brechen bei UI-Changes) |
| **Abhängigkeiten**           | Playwright & Chromium fliegen aus `package.json`                 | Playwright bleibt installiert         | Playwright & Chromium bleiben                |
| **Risikoabdeckung**          | Abgedeckt durch Typecheck, ESLint, Unit-, DOM- & DB-Tests, Build | Abgedeckt + Browser-Startprobe        | Abgedeckt + Pixel-/CSS-Validierung           |
| **Geschwindigkeit für Devs** | Maximal                                                          | Sehr hoch                             | Mittel                                       |

---

## 3. Entscheidungsformular für Product Owner & Lead Developer

> Dieses Formular dient als verbindliche Richtungsentscheidung. Eine Folge-KI oder der Entwickler hakt die gewünschte Option ab, bevor mit der Umsetzung begonnen wird.

```markdown
### Richtungsentscheidung zur Playwright-Nutzung in Flipbase

- [ ] **OPTION 1: Vollständige Entfernung von Playwright (Radikale Beschleunigung)**
  - Begründung: Die 6 bestehenden Gates (TypeScript strict, ESLint, Vitest Node, Vitest jsdom, Supabase DB-Tests, Angular Production Build) bieten bereits 99 % Testabsicherung.
  - Relevante Interaktionstests (Escape-Taste, Modal-Rendering) wandern in Vitest-DOM-Tests (`*.dom.spec.ts`).
  - `@playwright/test` und Chromium werden komplett deinstalliert.
  - Job `browser-smoke` entfällt ersatzlos aus `ci.yml`.
  - Freigegeben von: _______________________ Datum: ______________

- [ ] **OPTION 2: Minimaler Single-Flow Smoke-Test im PR (Kompromiss)**
  - Nur `e2e/demo-login.spec.ts` bleibt erhalten (prüft ausschließlich, ob Angular startet und keine Uncaught JS Exceptions wirft).
  - Alle 21 anderen Testdateien (CSS, Typography, Ränder, Badges) werden ersatzlos gelöscht.
  - Umstellung von `ng serve` auf Static Preview Server (`npx serve -s dist/flipbase/browser`).
  - Freigegeben von: _______________________ Datum: ______________

- [ ] **OPTION 3: Beibehaltung aller 22 Tests mit technischer Optimierung**
  - Alle Tests bleiben, aber `ng serve` wird durch Static Preview Server ersetzt und `~/.cache/ms-playwright` gecacht.
  - Freigegeben von: _______________________ Datum: ______________
```

---

## 4. Umsetzungsplan für Option 1 (Vollständige Entfernung)

Sollte Option 1 freigegeben werden, ist folgender Aufgabenplan Schritt für Schritt abzuarbeiten:

### Globale Rahmenbedingungen

- Keine Änderung an fachlichen Berechnungen (Steuer, Marge, Inventar, Supabase).
- Keine Regressionen in den bestehenden 1.700+ Unit-, DOM- und Angular-Tests.
- Verifikation über `npm run verify`.
- Saubere Conventional Commits (`chore(ci): ...` oder `test(ui): ...`).

---

### Task 1: Fachlich wertvolle Interaktionen in DOM-Tests überführen

Einige wenige Playwright-Tests enthalten echte Verhaltensprüfungen, die erhalten bleiben sollten (z. B. Escape-Taste schließt Dialog, Tastaturnavigation). Diese gehören in schnelle Vitest-jsdom-Tests.

- [ ] **Step 1: Identifikation erhaltenswerter Interaktionsprüfungen**
  - Prüfen von `e2e/demo-login.spec.ts` (Modal-Öffnen/Schließen per Escape).
  - Prüfen von `e2e/purchase-dropdown-layer.spec.ts` (Popover/Select-Verhalten).
- [ ] **Step 2: Übertragung in bestehende oder neue `*.dom.spec.ts`**
  - Entsprechende Tests in `src/app/.../*.dom.spec.ts` ergänzen.
  - Lokal ausführen mit `npm run test:dom` (Dauer: < 1 Sekunde).
- [ ] **Step 3: Test-Suite-Audit prüfen**
  - `npm run test:audit` ausführen, um saubere Klassifikation sicherzustellen.

---

### Task 2: Bereinigung der CI-Workflows (`.github/workflows/`)

- [ ] **Step 1: `browser-smoke` Job aus `ci.yml` entfernen**
  - Job `browser-smoke` (Zeilen 293–331) komplett entfernen.
  - Aus `needs`-Array des Jobs `required-checks` (Zeile 464) entfernen.
  - In `scripts/required-checks.mjs` die Bedingung `requireConditional('Browser-Smoke-Test', ...)` entfernen.
  - In `scripts/required-checks.test.mjs` die Testzusicherungen entsprechend anpassen.
- [ ] **Step 2: Nächtliche Workflows (`quality-nightly.yml`) bereinigen**
  - Jobs `browser-webkit` und `browser-firefox` entfernen.
  - Nur noch echte Mehrwertprüfungen behalten: `coverage-critical` (täglich), `coverage-full` (wöchentlich), `node-stress` (wöchentlich) und `database-full` (wöchentlich).
- [ ] **Step 3: Actionlint zur Syntax-Validierung ausführen**
  - Sicherstellen, dass keine verwaisten Workflow-Referenzen verbleiben.

---

### Task 3: Aufräumen von Codebase & Abhängigkeiten

- [ ] **Step 1: Löschen des `e2e/`-Verzeichnisses und Playwright-Configs**
  - Ordner `e2e/` vollständig entfernen.
  - `playwright.config.ts` und `playwright.nightly.config.ts` entfernen.
- [ ] **Step 2: Deinstallation der Playwright-Pakete**
  - Aus `package.json` entfernen:
    - `@playwright/test`
    - Skripte: `test:e2e`, `test:e2e:nightly`
  - `npm install` ausführen, um `package-lock.json` zu synchronisieren.
- [ ] **Step 3: `npm run verify` anpassen**
  - `package.json`-Skript `verify` prüfen; Playwright war dort ohnehin nicht enthalten.

---

### Task 4: Verifikation & Messung

- [ ] **Step 1: Lokale Gesamtprüfung**
  - `npm run verify` ausführen: Format, Lint, Typecheck, Workflow-Verträge, Suite-Audit, alle Vitest-Tests und Angular-Build.
- [ ] **Step 2: CI-Laufzeitvergleich im PR**
  - Messen der neuen PR-Durchlaufzeit auf GitHub Actions (Erwartung: 60–90 Sekunden).
- [ ] **Step 3: Eintrag im `AI-CHANGELOG.md`**
  - Dokumentation der Ausmusterung und der gemessenen Zeitersparnis.
