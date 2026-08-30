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
   „Datenschutzerklärung“ sowie rollenbasierte Negativprüfungen auf Links und
   Buttons. Damit erkennt der Browservertrag auch den vollständigen alten
   `href="#"`-/`preventDefault()`-Scheinlink. Dieser Fall lief vor der Löschung
   des alten Quelltexttests gezielt 1/1 grün.
3. **Einkaufsnavigation:** sichtbarer Demo-Einkauf „Retro Gaming & Nintendo
   Konvolut (Mystery Box)“, Tabellenzeile des Game Boy Color, Link „Details →“
   und Link „Zurück zum Einkauf“. Ziel bleibt `/purchases/pur-demo-2`.
4. **Inventar und Verkauf:** zugänglich benannte gemeinsame Inventartabelle,
   eine Mengenposition und eine Einzelstückzeile, Schaltfläche „Super Nintendo
   SNES Original Controller verkaufen“, Formularlabel „Preis je Stück (€)“ und
   „Verkauf abschließen“. Danach existiert in der sichtbaren Verkaufsansicht
   exakt eine Zeile dieses Artikels mit 35,00 €; eine zweite Verkaufszeile ist
   ausgeschlossen. Die Inventarzeile zeigt „Verkauft“ und bietet keine zweite
   Verkaufsschaltfläche.
5. **Dashboardinteraktion:** Combobox „Plattform filtern“, Option „ebay“ und
   Canvas-Rolle `img` mit dem Namen „Umsatz, Ausgaben und realisierter Gewinn im
   gewählten Zeitraum“. Eine Mausbewegung auf den deterministischen Punkt
   14.08. öffnet den externen sichtbaren DOM-Tooltip mit `role="status"`,
   `aria-live="polite"`, 379,00 € Umsatz und 95,62 € realisiertem Gewinn.
   Der Test liest weder Pixel noch Canvas- oder Chart.js-Interna aus.

Keine Auswahl verwendet Tailwind-Klassen, generierte CSS-Klassen oder fragile
DOM-Pfade. Jeder Test erhält einen eigenen Browserkontext und erzeugt seinen
Demo-Zustand über die sichtbare Anmeldung.

## Minimale Produktkorrekturen

`MockDataStoreService` erhielt genau die Demo-Daten, die der sichtbare Vertrag
benötigt:

- einen mengenverfolgten Artikelstamm „USB-C Ladegerät 30 W“;
- einen eigenen empfangenen Demo-Konvoluteinkauf mit fünf Einheiten und 40,00 €
  Gesamtpreis; Einkaufsposition, Bestandslos und Wareneingangsbewegung stimmen
  in Menge, Preis, Verknüpfung und Datum damit überein und hängen nicht mehr am
  Canon-Einzelkauf `pur-demo-4`;
- den expliziten verkaufbaren Ausgangszustand für den vorhandenen
  SNES-Demoartikel.

Die Chart-Interaktion deckte außerdem einen echten sichtbaren Produktfehler auf:
Der eBay-Demoverkauf war nicht mit seinem Inventarartikel und damit nicht mit
236,99 € COGS verknüpft. Der sichtbare Gewinn betrug dadurch fälschlich
332,61 €. Die Demo-Verkäufe tragen nun ihre vorhandene Inventarrelation; die
gespeicherten Gewinn-/ROI-Spiegelwerte wurden mit derselben bestehenden Formel
abgeglichen. Für den eBay-Fall gilt damit fachlich nachvollziehbar
379,00 € - 236,99 € - 46,39 € = 95,62 €. Die allgemeine
Gewinnberechnung wurde nicht geändert.

Chart.js verwendet für die Interaktion jetzt seinen offiziellen externen
Tooltip-Hook. Dieser aktualisiert einen kleinen, nicht interaktiven DOM-Tooltip
mit Datum und allen Reihenwerten. So ist derselbe Tooltip sichtbar und als
Live-Status zugänglich, statt nur Canvas-Pixel zu verändern.

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
- Der Vertrag erzwingt die Abwesenheit von `browser-smoke.needs` und lehnt eine
  künstliche Abhängigkeit von `quality` per Negativfixture ab.
- `actions/checkout` und `actions/setup-node` werden im Browserjob exakt gegen
  ihre vollständigen 40-stelligen SHAs geprüft; bewegliche Tags für beide
  Actions werden durch eigene Negativfixtures abgewiesen.
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

- Lauf 1 der Fixrunde: 5/5 grün, 10,0 Sekunden.
- Lauf 2 der Fixrunde: 5/5 grün, 9,9 Sekunden.

Die Webserver-Prozesse meldeten lediglich die bekannte Node-Warnung, dass
`NO_COLOR` wegen `FORCE_COLOR` ignoriert wird; es gab keine Anwendungs- oder
Browserfehler.

## Vollständige Abnahme

| Prüfung | Ergebnis |
| --- | --- |
| `npm run test:e2e` zweimal hintereinander | 5/5 + 5/5 grün |
| `npm run test:workflow` | 27/27 grün |
| `npm run format:check` | grün |
| `npm run lint` | grün |
| `npm run typecheck` | grün |
| `npm test` | 116 Dateien, 1.041 Tests grün |
| `npm run build` | grün, 6,772 Sekunden |
| `npx prettier --check .github/workflows/ci.yml` | grün |
| `git diff --check` | grün |

## Commit und offene Bedenken

- Task-Commit: `test(e2e): cover critical inventory and sales journeys`.
- Separater Review-Fix-Commit: `fix(test): harden browser smoke contracts`.
- Eine echte GitHub-Actions-Ausführung bleibt ohne Push absichtlich offen.
- Die Smoke-Suite deckt in diesem Task vereinbarungsgemäß nur Chromium und den
  lokalen Demo-Modus ab; Firefox und WebKit gehören zur späteren Nightly-Suite.
- Die dynamische Datenbankabnahme aus Task 7 bleibt unabhängig hiervon wegen
  des dort dokumentierten Docker-Runtime-Problems offen.

## Review-Fixrunde 1: RED/GREEN und Mutationsnachweise

- **Demo-Mengeneinkauf RED:** Der neue Konsistenztest fand für die
  USB-C-Position `pur-demo-4` mit Typ `single`, `items_count: 1` und
  310,00 € statt eines eigenen Fünferpostens. GREEN: eigener `pur-demo-5` mit
  Typ `lot`, fünf Einheiten, 40,00 €, Status `received` und vollständig
  passenden Line-/Lot-/Movement-Beziehungen.
- **Tooltip RED:** Der verschärfte Browsertest fand ohne externen DOM-Tooltip
  keinen zugänglichen Status. Nach der ersten Implementierung machte der
  Status den vorhandenen Fachfehler sichtbar: 14.08., Umsatz 379,00 €, aber
  Gewinn 332,61 € und COGS 0,00 €. GREEN: deterministischer 14.08.-Punkt,
  sichtbarer Live-Tooltip und korrekter Gewinn 95,62 €.
- **Verkaufsmutationen RED:** Eine echte Zustandsmutation mit zwei identischen
  Verkaufseinträgen wurde mit `Expected: 1, Received: 2` abgewiesen. Eine
  zweite Mutation erhöhte den gebuchten Zeilenpreis um 1,00 €; der Browsertest
  wies die sichtbaren 36,00 € gegen erwartete 35,00 € zurück. Beide
  Mutationen wurden danach vollständig entfernt.
- **Registrierungsmutation RED:** Der alte vollständige Scheinvertrag
  `<a href="#" (click)="$event.preventDefault()">AGB</a>` wurde testweise
  wiederhergestellt. Die Rollenprüfung fand einen Link statt der erwarteten
  Anzahl null und lief rot. Nach Entfernung des Mutanten war der Browserfall
  wieder grün.
- **Workflow RED/GREEN:** Der verschärfte Helper ließ die bestehende
  Browser-Fixture wegen fehlender Checkout-/Setup-Node-SHAs rot werden. Nach
  den exakten Pins liefen 27/27 Fälle grün. Drei neue Negativfixtures weisen
  `browser-smoke.needs: quality` sowie bewegliche Tags von Checkout und
  Setup-Node ausdrücklich zurück.
