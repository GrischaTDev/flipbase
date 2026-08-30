# Task 8 — Fünf stabile Browser-Smoke-Tests

## Ergebnis

Fünf geschäftskritische Wege laufen im lokalen Demo-Modus mit echtem Chromium.
Der GitHub-Workflow führt sie als paralleles Pflicht-Gate vor dem Deployment aus.
Es gab keinen Zugriff auf Produktionsdaten, keinen Push, keinen Pull Request und
kein Deployment.

## Version und Umgebung

- `npm view @playwright/test version`: `1.62.1`, stabile Version ohne
  Vorabkennung.
- `npm view @playwright/test@1.62.1 engines --json`: Node `>=20`.
- Installiert ist exakt `@playwright/test@1.62.1`; `npm ls` bestätigt diese
  Version ohne Versionsbereich.
- Lokal installiert wurde ausschließlich Chromium über
  `npx playwright install chromium` (Playwright Chromium `v1234`, Chrome for
  Testing `151.0.7922.34`).
- Testziel: `http://127.0.0.1:4200`, Angular-Development-Build mit
  `allowDemoMode: true`; lokaler Standard-Viewport 1280 × 720.
- Der Browser-Skill wurde gemäß Task-Brief nicht für eine einmalige manuelle
  Sitzung verwendet. Das Ergebnis sind eingecheckte Playwright-Tests und deren
  CI-Ausführung.

## RED/GREEN-Nachweise

1. Vor der Installation schlug `npm run test:e2e` mit `Missing script:
   "test:e2e"` und Exitcode 1 fehl.
2. Der erste vollständige Chromium-Lauf hatte vier grüne Fälle. Der
   Inventarfall war rot, weil die mit „Mengenpositionen und Einzelstücke in
   einer Ansicht“ beschriftete Demoansicht keine Mengenposition enthielt.
3. Nach der kleinsten fachlich vollständigen Demo-Mengenposition war diese
   Zeile sichtbar. Der Verkaufsteil blieb rot: Das Inventar bot für den
   SNES-Controller „Verkaufen“ an, der Abschluss meldete jedoch „Der
   Einzelartikel ist nicht verkaufbar.“
4. Eine erste zu breite Zustandsinferenz ließ den Browserfall passieren, wurde
   aber vom bestehenden Unit-Vertrag „fehlender Sale-State fail-closed“ rot
   erkannt. Diese Inferenz wurde entfernt.
5. GREEN: Nur der tatsächlich verkaufbare SNES-Demoartikel erhält im Seed den
   expliziten Zustand `no_active_sale`. Der Fail-closed-Unitvertrag lief danach
   16/16 grün und der Inventar-Browserfall 1/1 grün.
6. Der Workflow-Vertrag war nach seiner Erweiterung erwartungsgemäß rot:
   `browser-smoke` fehlte und `deploy` hing noch nicht davon ab. Nach der
   Workflow-Erweiterung liefen 24/24 Vertragsfälle grün.

## Fünf Szenarien und zugängliche Locators

1. **Demo-Anmeldung:** sichtbare Schaltfläche „Demo-Modus starten (ohne
   Anmeldung)“, Dashboard-Überschrift „Ertrag im Blick“ und Region
   „Kennzahlen“.
2. **Registrierungssemantik:** Link „Registrieren“, sichtbare Texte „AGB“ und
   „Datenschutzerklärung“, keine Links mit `href="#"`. Dieser Fall lief vor
   der Löschung des alten Quelltexttests gezielt 1/1 grün.
3. **Einkaufsnavigation:** sichtbarer Demo-Einkauf „Retro Gaming & Nintendo
   Konvolut (Mystery Box)“, Tabellenzeile des Game Boy Color, Link „Details →“
   und Link „Zurück zum Einkauf“. Ziel bleibt `/purchases/pur-demo-2`.
4. **Inventar und Verkauf:** zugänglich benannte gemeinsame Inventartabelle,
   eine Mengenposition und eine Einzelstückzeile, Schaltfläche „Super Nintendo
   SNES Original Controller verkaufen“, Formularlabel „Preis je Stück (€)“ und
   „Verkauf abschließen“. Danach existiert genau eine Verkaufszeile, die
   Inventarzeile zeigt „Verkauft“ und bietet keine zweite Verkaufsschaltfläche.
5. **Dashboardinteraktion:** Combobox „Plattform filtern“, Option „ebay“ und
   Canvas-Rolle `img` mit dem Namen „Umsatz, Ausgaben und realisierter Gewinn im
   gewählten Zeitraum“. Eine Mausbewegung verändert die sichtbare Canvas durch
   den Chart.js-Tooltip; getestet wird die gerenderte Ausgabe, keine interne
   Chart-Instanz.

Keine Auswahl verwendet Tailwind-Klassen, generierte CSS-Klassen oder fragile
DOM-Pfade. Jeder Test erhält einen eigenen Browserkontext und erzeugt seinen
Demo-Zustand über die sichtbare Anmeldung.

## Minimale Produktkorrekturen

`MockDataStoreService` erhielt genau die Demo-Daten, die der sichtbare Vertrag
benötigt:

- einen mengenverfolgten Artikelstamm „USB-C Ladegerät 30 W“;
- dessen Einkaufsposition, Bestandslos und Wareneingangsbewegung;
- den expliziten verkaufbaren Ausgangszustand für den vorhandenen
  SNES-Demoartikel.

Damit zeigt der Demo-Modus die versprochene gemeinsame Bestandsansicht und der
von der Oberfläche angebotene Einzelverkauf ist tatsächlich ausführbar. Die
allgemeine Sicherheitsregel bleibt unverändert: Ein fehlender oder
widersprüchlicher Verkaufszustand wird weiterhin fail-closed abgelehnt.

## Alter A11y-Test

`e2e/demo-login.spec.ts` lief für die Registrierungssemantik gezielt grün,
bevor `src/app/accessibility-semantics.spec.ts` entfernt wurde. `npm test`
lief anschließend mit 116 Dateien und 1.038 Tests grün statt zuvor 117 Dateien
und 1.039 Tests. Der Unterschied von genau einem Test ist der beabsichtigte
Ersatz durch den stärkeren Browservertrag; keiner der übrigen Testfälle ging
verloren.

## CI-Vertrag

- Job `browser-smoke` läuft parallel ohne `needs` auf Node 22.
- Er verwendet `npm ci`, installiert ausschließlich Chromium mit
  `npx playwright install --with-deps chromium` und startet
  `npm run test:e2e`.
- `playwright-report/` und `test-results/` werden nur bei `failure() ||
  cancelled()` hochgeladen.
- `actions/upload-artifact` ist unveränderlich auf
  `043fb46d1a93c77aae656e7c1c64a875d1fc6a0a` gepinnt.
- `deploy.needs` und der vollständige Deploy-`if` verlangen explizit
  `browser-smoke == success`.
- Negativfixtures erkennen ein fehlendes Browser-Deploy-Gate, den beweglichen
  Upload-Tag und Artefakt-Upload bei Erfolg.

## Zwei abschließende Browserläufe

- Lauf 1: 5/5 grün, 8,9 Sekunden.
- Lauf 2: 5/5 grün, 9,0 Sekunden.

Die Webserver-Prozesse meldeten lediglich die bekannte Node-Warnung, dass
`NO_COLOR` wegen `FORCE_COLOR` ignoriert wird; es gab keine Anwendungs- oder
Browserfehler.

## Vollständige Abnahme

| Prüfung | Ergebnis |
| --- | --- |
| `npm run test:e2e` zweimal hintereinander | 5/5 + 5/5 grün |
| `npm run test:workflow` | 24/24 grün |
| `npm run format:check` | grün |
| `npm run lint` | grün |
| `npm run typecheck` | grün |
| `npm test` | 116 Dateien, 1.038 Tests grün |
| `npm run build` | grün, 7,017 Sekunden |
| `npx prettier --check .github/workflows/ci.yml` | grün |
| `git diff --check` | grün |

## Commit und offene Bedenken

- Task-Commit: `test(e2e): cover critical inventory and sales journeys`.
- Eine echte GitHub-Actions-Ausführung bleibt ohne Push absichtlich offen.
- Die Smoke-Suite deckt in diesem Task vereinbarungsgemäß nur Chromium und den
  lokalen Demo-Modus ab; Firefox und WebKit gehören zur späteren Nightly-Suite.
- Die dynamische Datenbankabnahme aus Task 7 bleibt unabhängig hiervon wegen
  des dort dokumentierten Docker-Runtime-Problems offen.
