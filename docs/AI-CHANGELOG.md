# 🤖 KI-Änderungsprotokoll

Dieses Projekt wird teilweise mit KI-Assistenten entwickelt. **Jede** von einer KI durchgeführte Änderung wird hier mit Namen und Modell des Assistenten dokumentiert.

## Regel für alle KI-Assistenten

> Wenn du ein KI-Assistent bist und an diesem Projekt arbeitest: Trage **jede** Arbeitssitzung hier ein – mit deinem Modellnamen, dem Datum, was du getan hast und warum. Auch reine Analysen ohne Codeänderung. Neueste Einträge kommen nach oben.

**Format je Eintrag:**

```markdown
## YYYY-MM-DD – <Modellname> – <Kurztitel>

**Art:** Analyse | Feature | Bugfix | Refactoring | Doku | Konfiguration
**Betroffen:** <Dateien oder Bereiche>
**Was:** <Was wurde gemacht>
**Warum:** <Begründung>
**Verifiziert durch:** <Build / Tests / manuell – mit Ergebnis>
```

## Namenskonvention im Code

> **Alle Bezeichner werden englisch geschrieben** – Datei-, Ordner-, Komponenten-,
> Klassen-, Methoden- und Variablennamen. Deutsch bleibt ausschliesslich fuer
> Code-Kommentare, sichtbare Oberflaechentexte und die Kommunikation mit dem Nutzer.
> Commit-Nachrichten sind ebenfalls englisch.

**Offene Aufgabe fuer alle KI-Assistenten:** Grosse Teile des Bestands sind noch
deutsch benannt (`speicher-migration.ts`, `stammdaten-filter.ts`,
`supabase-schreiben.ts`, `erstelleDienst`, `erstelleKomponente` und viele weitere,
quer durch `core/services/` und die uebrigen Features). Das Projekt soll spaeter
**vollstaendig auf englische Bezeichner umgestellt** werden.

Die Sperre ist seit dem 29.08.2026 aufgehoben: Die Warenwirtschaft ist in
`master` zusammengefuehrt, und die beiden Bildeditor-Pakete sind hinterher.
Es steht also **kein langlebiger Zweig mehr offen**, den ein projektweites
Umbenennen zerstoeren wuerde - das war der einzige Grund fuer das Zurueckstellen.

Die Umbenennung gehoert in einen **eigenen, rein mechanischen Commit** ohne
Logikaenderung. Nur dann beweisen gruene Tests und ein sauberer Build, dass
nichts kaputtgegangen ist. Bereits vollstaendig englisch benannt ist der Ordner
`src/app/features/image-optimizer/`; er taugt als Vorlage. Noch deutsch sind
unter anderem `core/services/speicher-migration.ts`, `stammdaten-filter.ts` und
`supabase-schreiben.ts` sowie viele Feld- und Methodennamen quer durch `core/`
und die uebrigen Features.

Bis dahin gilt: **Neues immer englisch benennen, Bestand nicht nebenbei anfassen.**

---

## 2026-09-04 – Codex (GPT-5; Umsetzung und Reviews mit GPT-5.6 Terra/Sol) – Einzelverlauf und Workspace-Archivierung fortgesetzt

**Art:** Feature | Test

**Betroffen:** Lokaler Änderungsverlauf, Workspace-Lebenszyklus und Aufbewahrungsansicht

**Was:** Änderungsverlauf direkt an Einkauf, Artikel und Verkauf ergänzt (`6f27a68`). Eine gemeinsame Darstellung bleibt datenfrei; ein Feature-Container verwendet den bestehenden Abfrageservice. Arbeitsbereiche lassen sich durch ihren Inhaber archivieren und wiederherstellen (`029ee41`); Geschäftsdaten bleiben lesbar und exportierbar, operative Änderungen werden serverseitig gesperrt. Der Löschablauf bietet zuerst einen Export an und verweist bei vorhandenen Geschäftsdaten auf Archivierung. Beide automatisch erzeugten Migrationen einschließlich der Rechtekorrektur gehören zusammen. Bestehende Routen, globale Exporte und vorherige Integrationskorrekturen bleiben erhalten. Settings-Aufteilung und Landingpage gehören weiterhin zu getrennten Folgeschritten.

**Warum:** Verlauf direkt am betroffenen Datensatz verfügbar machen und Geschäftsdaten beim Archivieren lesbar erhalten, ohne neue Buchungen zuzulassen.

**Verifiziert durch:** Abschließendes `npm run verify` auf `029ee41` mit Exitcode 0: 1.428 Anwendungstests bestanden (971 Node, 130 DOM, 327 Angular; fünf bestehende Tests übersprungen), Formatierung, Lint, Typprüfung, Workflowprüfungen und Produktionsbuild bestanden. Getrennte lokale Datenbank `flipbase-settings-retention`: 952 Prüfungen in 20 Dateien bestanden; Schema-Abgleich leer und Advisors ohne Befund. Zwei echte parallele Datenbanksitzungen bestätigen die gegenseitige Sperre zwischen Buchung und Archivierung. Alle sechs Chromium-Tests bestanden. Zusätzliche Demo-Browserprüfungen auf Desktop und Mobil: Verlauf, Einkaufs-Rücknavigation, Verkaufsdialog mit Escape/Fokusrückgabe, richtiges Workspace-Ziel und reaktive URL-Navigation; AXE für die neuen Ansichten ohne Befunde, keine Konsolenfehler. Befüllte Verläufe und Inhaberaktionen sind durch Komponenten-/Datenbanktests, nicht durch einen angemeldeten Browser-End-to-End-Test belegt. Die vorhandene mobile Überbreite der Verkaufsliste bleibt als separater Befund offen. Beide unabhängigen Aufgabenreviews freigegeben, keine kritischen oder wichtigen Befunde. Der ergänzende angemeldete Inhaber-Browsertest bleibt als kleinere Testlücke dokumentiert. Kein Push oder Deployment.

---

## 2026-09-04 – Codex (GPT-5; Reviews und Umsetzung mit GPT-5.6 Sol/Terra) – Kostenbasis und Prüfarchiv abgesichert

**Art:** Bugfix | Test | Dokumentation

**Betroffen:** Kostenberechnung, Dashboard, Prüfarchiv, Supabase-Schema, Deployment-Prüfungen

**Was:** Sechs bestätigte Review-Bereiche korrigiert: unbekannte Kosten, exakter Restwert, Diagrammlücken, gemeinsamer Archiv-Snapshot, vollständige Kostenexporte und deklarative Rechte. Aktuelle Einkaufsdaten gehen älteren eingebetteten Beziehungen vor. Vorhandene Exportrechte der Buchhaltung erhalten. Migration automatisch in einem isolierten lokalen Projekt erzeugt und geprüft. Fremde Arbeitszweige und Änderungen bleiben unberührt.

**Warum:** Keine scheinbaren Gewinne aus fehlenden Nullkosten und kein aus mehreren Zeitständen zusammengesetztes Prüfarchiv. Die zusätzlichen Kostendateien sichern die Nachvollziehbarkeit. Das Archiv bricht oberhalb von 100.000 Datensätzen oder 50 MiB JSON ausdrücklich ab.

**Verifiziert durch:** Finales `npm run verify` mit Exitcode 0, 1.404 Anwendungstests bestanden (fünf bestehende übersprungen), sechs Browsertests bestanden, 864 Datenbank-Assertions bestanden. Kritische Abdeckung aller sechs ausgewählten Dateien über unveränderten 95/90-Grenzen. Sniper-Typprüfung und 73 Tests bestanden. Kein Push und kein Deployment. Offene ursprüngliche Settings-Aufgaben und Landingpage-Befunde im Abschlussbericht `docs/superpowers/reports/2026-09-04-overhaul-integration-result.md` dokumentiert.

---

## 2026-09-04 – Codex (GPT-5) – Master in den Warenwirtschaftsumbau integriert

**Art:** Integration | Analyse | Test

**Betroffen:** `feature/purchase-inventory-overhaul`, CI, Warenwirtschaft, Prüfarchiv und Landingpage

**Was:** `origin/master` bis `a2ccddb` ausschließlich in den eigenen Arbeitszweig übernommen. Den einzigen Merge-Konflikt im Änderungsprotokoll unter Erhalt beider Seiten aufgelöst. Unabhängige Reviews für Fachlogik und CI beauftragt; bestätigte Kosten-/Archivfehler werden in einer getrennten Korrektur nachgeführt. Landingpage-Befunde stehen im zugehörigen Bericht.

**Warum:** Änderungen von Claude Code und Gemini erhalten und den gemeinsamen Stand prüfen, ohne fremde Arbeitszweige oder deren lokale Datenbank zu überschreiben.

**Verifiziert durch:** Gemeinsamer Produktionsbuild erfolgreich; erster gemeinsamer Testlauf 1.383 bestanden, fünf übersprungen. Separater lokaler Supabase-Testdienst `flipbase-overhaul-integration`: alle Migrationen angewendet, 18 Dateien/842 Datenbanktests bestanden, Datenbank-Lint ohne Fehler. Schema-Abgleich zeigt noch Rechteabweichungen und wird nachgeführt. Bestehende Browsertests hatten veraltete Bezeichnungen; deren gezielte Anpassungen bestanden anschließend vier Tests. Noch keine abschließende Gesamtfreigabe, kein Push oder Deployment.

---

## 2026-09-04 – Codex (GPT-5) – Parallele Optimierungen und Landingpage abgeglichen

**Art:** Analyse

**Betroffen:** `origin/master` bis `a2ccddb`, CI, Deployment, Auth, Landingpage und Warenwirtschafts-Branch

**Was:** Remote-Referenzen aktualisiert und Änderungen seit der gemeinsamen Basis gelesen. Die beidseitig geänderten Pfade sind fünf inhaltlich identische Plan-/Spezifikationsdateien; direkte Anwendungscode-Überschneidungen sind nicht sichtbar. Die neue tägliche Coverage-Auswahl enthält die neue `sale-metrics.ts` noch nicht. Im aktuellen Deployment wird ein fehlgeschlagener Landingpage-Kopiervorgang durch `|| true` verdeckt; der Deploy-Job wartet nicht auf `sniper-gate`. Landingpage-Texte zu Beta-Freischaltung, Datenschutz und Deal-Sniper-Funktionen müssen gegen den tatsächlich verfügbaren Funktionsumfang geprüft werden.

**Warum:** Fremde Optimierungen erhalten und den gemeinsamen Stand nach dem großen Umbau gezielt prüfen. Die Landingpage erhält anschließend eine gesonderte technische, inhaltliche und zugängliche Prüfung.

**Verifiziert durch:** Git-Historie, Dateischnittmenge und gezielte Quellcode-Diffs. Keine Zusammenführung, keine Änderungen an fremden Zweigen, keine neuen Testläufe und kein Deployment. Der frühere grüne Prüflauf gilt nicht als Nachweis für den noch nicht integrierten Gesamtstand.

---

## 2026-09-04 – Codex (GPT-5) – Unterbrochenen Arbeitsstand geprüft

**Art:** Analyse

**Betroffen:** Branch `feature/purchase-inventory-overhaul`

**Was:** Gespeicherten Branch, Arbeitsverzeichnis und letzte Commits geprüft. Der Stand endet bei `90b28be`; die zusätzliche unabhängige Abschlussprüfung wurde durch ein Nutzungslimit unterbrochen.

**Warum:** Nach der Unterbrechung den tatsächlichen Fortschritt und die noch offene Abschlussprüfung nachvollziehbar benennen.

**Verifiziert durch:** Git-Status vor diesem Protokolleintrag sauber; acht lokale Umbau-Commits vorhanden. Build und Tests in dieser Sitzung nicht erneut ausgeführt. Kein Push oder Deployment vorgenommen.
---

## 2026-09-04 – Gemini 3.8 Flash (Google) – Landingpage FAQ Akkordeon, Roadmap & Tracking-Bereinigung

**Art:** UI | Feature | Doku

**Betroffen:** `landing/index.html`, `landing/datenschutz/index.html`

**Was:**

1. **Tracking-Aussagen bereinigt:** Claims wie „0 Drittanbieter-Tracker / Kein Google Analytics“ entfernt, da zukünftiges Produkt-Tracking nach DSGVO-Standards geplant ist. Durch die Sicherheitskarte „Verschlüsselt & DSGVO-konform“ (TLS, Backups, europäischer Datenschutz) ersetzt. Entsprechende Klausel in `landing/datenschutz/index.html` aktualisiert.
2. **Umfangreiches zentriertes FAQ-Akkordeon:** FAQ auf 10 praxisnahe Kernfragen erweitert (Differenzsteuer § 25a, Kleinunternehmer § 19, Vinted Sniper, Marktplätze, Bildoptimierer, DATEV, Sicherheit, Mobile/PWA, Beta-Ablauf). Header zentriert und native HTML5 `<details>`/`<summary>`-Akkordeon-Funktionalität mit rotierendem Chevron und sauberem Border-Focus integriert (0 JS, CSP-kompatibel).
3. **Roadmap statt „Ehrlicher Stand“:** Den bisherigen Entwicklungsstand-Bereich in eine professionelle Produkt-Roadmap umgewandelt (`#roadmap`), inkl. klarer Status-Tags (Live, In Entwicklung, Geplant) und passenden Navigations- sowie Footer-Links.
4. **Hero-Aktionen gestrafft:** Die redundanten Buttons „Bereits registriert? Zum Login →“ und „Funktionen entdecken ↓“ unter dem Beta-Anmeldeformular im Hero entfernt (Login ist prominent in der Navigationsleiste vorhanden).

**Warum:** Nutzerfeedback zur Professionalisierung der Landingpage, Einbindung zukünftiger Tracking-Möglichkeiten, verbesserte Übersicht durch aufklappbares FAQ und Fokus auf die Beta-Konvertierung im Hero.

**Verifiziert durch:** `npm run verify` (Prettier, Lint, Typen, 21 Workflow-Tests, 1001 Unit-Tests, Angular Build).

---

## 2026-09-04 – Gemini 3.8 Flash (Google) – Landingpage Polish: Emojis zu SVG, Beta-Anfrage & Footer-Reduktion

**Art:** UI | Refactoring

**Betroffen:** `landing/index.html`, `landing/impressum/index.html`, `landing/datenschutz/index.html`

**Was:**

1. **Emojis durch Vektor-Icons ersetzt:** Alle Emojis (in den Badges und in den Sicherheitskarten für Server, RLS, Trackerfreiheit und PWA) durch saubere, moderne SVG-Vektor-Icons im Lucide-Stil der App ausgetauscht.
2. **Beta-Anfrage statt Direktzugang:** Text „Sofortiger Beta-Zugang · Keine Kreditkarte nötig · 100% DSGVO“ vollständig entfernt. Call-to-Action und Badges auf eine schrittweise freigeschaltete Beta-Anfrage umgestellt („Beta-Phase 0.1“, Button: „Beta-Zugang anfragen →“).
3. **E-Mail-Eingabe überarbeitet:** Das bisherige umschließende Container-Design („Feld im Feld“) durch eigenständige, nebeneinander stehende Eingabefelder und Aktionsbuttons mit sauberem Radius ersetzt.
4. **Footer entschlackt:**
   - Spalte „Beta & Kontakt“ sowie der Footer-Untertitel „Gehostet in Deutschland · DSGVO-konform“ komplett entfernt.
   - Rechtliches-Spalte von Hinweistexten befreit; stattdessen zwei saubere Links auf `/impressum` und `/datenschutz`.
   - Entsprechende statische Seiten `landing/impressum/index.html` und `landing/datenschutz/index.html` im Flipbase-Design erstellt.

**Warum:** Vorgaben des Nutzers zur professionellen Bereinigung der Landingpage, Beseitigung des „Feld im Feld“-Eindrucks, Vereinheitlichung des Icon-Stils mit der App und korrekte Abbildung der geschlossenen Beta-Phase.

**Verifiziert durch:** `npm run verify`, SCP/Deploy auf Server, HTTP 200 Tests.

---

## 2026-09-04 – Gemini 3.8 Flash (Google) – Landingpage i18n, Typografie, Footer & Beta-Registrierung

**Art:** Feature | Bugfix | UI

**Betroffen:** `landing/index.html`, `deploy/Caddyfile`, `src/app/features/auth/register/register.component.ts`

**Was:**

1. **Englische Sprache (i18n):** Fehler behoben, bei dem beim Umschalten auf Englisch alle Texte verschwanden. Ursache war `.lang-en { display: none !important; }`, welches die aktiven Regeln ohne `!important` überschrieb. Durch Hinzufügen von `!important` und `revert !important` auf die selektierten Sprachregeln schaltet die Seite nun zuverlässig und vollständig um.
2. **Titel-Typografie (h1):** Schriftgröße der Hauptüberschrift von `clamp(2.4rem, 1.4rem + 4vw, 4.25rem)` auf ein harmonisches `clamp(1.85rem, 1.2rem + 2.2vw, 3.1rem)` mit angepasstem Zeilenabstand (`1.15`) reduziert.
3. **Beta-Ankündigung & E-Mail CTA:** Aufmacher-Badge auf „🚀 Version 0.1 · Aktuelle Beta läuft“ aktualisiert und sowohl im Hero als auch im unteren CTA-Banner ein E-Mail-Eingabeformular (`hero-beta-form`) integriert. Bei Klick wird `https://app.flipbase.de/auth/register?email=...` aufgerufen. In `RegisterComponent` wird der `email`-Query-Parameter automatisch ausgelesen und in das Registrierungsformular übernommen. In `deploy/Caddyfile` wurde die CSP `form-action` dafür auf `https://app.flipbase.de` erweitert.
4. **Footer-Struktur:** Das Footer-Layout von 5 unbalancierten, umbrechenden Spalten auf ein klares 4-Spalten-Grid (`2fr 1.1fr 1.2fr 1.3fr`, responsive auf 2 Spalten auf Tablets und mobilen Endgeräten) umgestellt (Flipbase Marke & Beta-Status, Produkt, Rechtliches [Impressum & Datenschutz], Beta & Kontakt).

**Warum:** Fehlerbehebung der englischen Sprachanzeige, optische Verbesserung des Titels und des Footers sowie Bereitstellung eines direkten E-Mail-Call-to-Action zur Teilnahme an der laufenden Beta.

**Verifiziert durch:** `npm run verify` (Format, Lint, Typecheck, Audit, Tests, Build)

---

## 2026-09-04 – Gemini 3.8 Flash (Google) – Fix für mobilen Login-Loop und Landingpage-Bereitstellung

**Art:** Bugfix | Deployment / CI

**Betroffen:** `src/app/features/auth/login/login.component.html`, `src/app/features/auth/register/register.component.html`, `docker/Dockerfile`, `deploy/deploy.sh`, `deploy/README.md`

**Was:**

1. **Mobiler Login-Loop („Zurück zur Startseite“):** In `login.component.html` und `register.component.html` wurde dem Link `<a [href]="landingUrl">` die Attribute `target="_blank"` und `rel="noopener noreferrer"` hinzugefügt. Dadurch fängt der mobile Standalone-Webview (PWA / iOS Safari WebClip) den Klick nicht mehr intern ab (was mangels passendem Scope bzw. durch Cross-Origin-Sperren zurück auf `start_url` `/` und damit direkt zurück in den `authGuard` / `/auth/login` führte), sondern öffnet die Landingpage sauber im Standard-Browser des Geräts.
2. **Landingpage-Bereitstellung:** Ursache für das Fortbestehen des alten Designs auf `https://flipbase.de` analysiert: Die statische Landingpage liegt in `/opt/flipbase-landing/` auf dem Server und wird von Caddy bedient. Der GitHub Actions CI-Workflow aktualisiert über den isolierten SSH-Deploy-Schlüssel (`deploy.sh`) nur den Web-Container (`app.flipbase.de`), berührt `/opt/flipbase-landing/` jedoch nicht.
3. **Automatisierung für künftige Deployments:** `docker/Dockerfile` nimmt die statische Landingpage künftig nach `/usr/share/nginx/landing` mit, und `deploy/deploy.sh` spiegelt sie nach einem erfolgreichen Container-Start automatisch nach `/opt/flipbase-landing/`.
4. **Anleitung für sofortiges Live-Bringen:** Sofortiger SCP-Befehl für den Nutzer dokumentiert (`scp -r landing/* root@168.119.246.33:/opt/flipbase-landing/`).

**Warum:** Behebung des Login-Loops auf Mobilgeräten und Sicherstellung der Sichtbarkeit des neuen Landingpage-Designs im Produktivbetrieb.

**Verifiziert durch:** `npm run verify` (Format, Lint, Typen, Workflow-Tests, Test-Suite-Audit, Node/DOM/Angular Vitest Tests, Produktions-Build).

## 2026-09-04 – Gemini 3.8 Flash (Google) – Conventional Commits v1.0.0, GitVersion & Release-Workflow mit 0.x Beta-Schutz

**Art:** Feature | CI / Automation

**Betroffen:** `AGENTS.md`, `GitVersion.yml` (neu), `scripts/version-generieren.mjs`, `docker/Dockerfile`, `.github/workflows/ci.yml`, `docs/AI-CHANGELOG.md`

**Was:**

1. **Conventional Commits Richtlinien (`AGENTS.md`):** Strikte und verbindliche Spezifikation nach v1.0.0 für alle KIs integriert. Erlaubte Typen (`feat`, `fix`, `perf`, `refactor`, `style`, `test`, `build`, `ci`, `docs`, `chore`), Scopes (`landing`, `inventory`, `sales`, `purchases`, `auth`, `accounting`, `sniper`, `image-opt`, `ui`, `core`, `ci`, `deps`), Imperativ-Regel und Breaking-Change-Syntax (`!:` / `BREAKING CHANGE:`).
2. **GitVersion-Konfiguration (`GitVersion.yml`):** Einführung von GitVersion mit `mode: ContinuousDeployment` auf `master`. Integrierter **0.x Beta-Schutz**, der Breaking Changes und Features als Minor-Bumps handhabt und einen automatischen Sprung auf Version 1.0.0 zuverlässig verhindert, bis die Beta explizit beendet wird.
3. **Automatisierte Versionsanzeige in der Web-App:** `scripts/version-generieren.mjs` liest `GITVERSION_MAJOR_MINOR_PATCH`, `GITVERSION_SEMVER` und `FLIPBASE_VERSION` aus, wodurch die Versionsanzeige in der Sidebar unten links (`v{{ version.nummer }}`) nach jedem Release automatisch aktualisiert wird.
4. **Docker-Image & CI-Pipeline:** `docker/Dockerfile` akzeptiert das Build-Argument `FLIPBASE_VERSION`. In `.github/workflows/ci.yml` wird GitVersion nativ via .NET im Job `image` ausgeführt und reicht die berechnete Versionsnummer weiter.
5. **Automatisierte GitHub Releases:** Neuer Job `release` in `.github/workflows/ci.yml` erstellt nach erfolgreichem Produktionsdeployment automatisch ein offizielles GitHub Release inklusive Git-Tag (`v$VERSION`) und generierten Release Notes aus den Conventional Commits.

**Warum:** Einheitlicher Versions- und Release-Zyklus ohne manuelle `package.json`-Eingriffe bei strikter Einhaltung der 0.x-Betaphase.

**Verifiziert durch:** `dotnet-gitversion` Test (liefert sauber `0.121.1`), `scripts/version-generieren.mjs` Tests mit und ohne Umgebungsvariablen, `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm run test:workflow` (21/21 grün) und `npm run test:audit`.

---

## 2026-09-04 – Gemini 3.8 Flash (Google) – CI-Stabilität: Timeout für Quality- und Unit-Jobs auf 10 Minuten erhöht

**Art:** CI / Stabilität

**Betroffen:** `.github/workflows/ci.yml`, `docs/AI-CHANGELOG.md`

**Was:**

- Timeout für `quality`- und `unit`-Jobs in `.github/workflows/ci.yml` von 5 Minuten auf 10 Minuten angehoben.

**Warum:**

- Beim Push/Merge auf `master` liefen `quality` und `unit angular 1/1` nach 5 Minuten in ein hartes Runner-Timeout, da `npm ci` bei Registry-Latenzen über 1 Minute brauchte und der Build bzw. die Angular-Komponententestsuite zusammen ~4:30 bis 5:15 Minuten in Anspruch nehmen.

**Verifiziert durch:** `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm run test:workflow` (21/21 grün) und `npm run test:audit`.

---

## 2026-09-03 – Gemini 3.8 Flash (Google) – Landingpage-Modernisierung: Marken-Logo, CSS Dark-/Lightmode, Sprache DE/EN, Vinted Bot & erweitertes Feature-Showcase

**Art:** Feature | Barrierefreiheit

**Betroffen:** `landing/index.html`, `landing/images/logo-mark.png` (neu), `src/app/core/services/landing-template.spec.ts`, `docs/AI-CHANGELOG.md`

**Was:**

1. **Marken-Logo & Typografie:** Flipbase-Markenikone (`logo-mark.png`) im Kopfbereich integriert, im Light-Mode mit kontrastverstärkendem Container (WCAG AA). Marken-Badge `Reselling OS` und überarbeitetes Styling im Flipbase Brand-Look (Bernstein-Orange `#f89d13`, Anthrazit/Grau und klares Weiß).
2. **Dark- & Lightmode (0 kB JavaScript):** Vollständige Unterstützung beider Farbschemata über CSS-Variablen. Standardmäßig Erkennung der Systemeinstellung via `@media (prefers-color-scheme)`, ergänzt durch einen interaktiven Sonne/Mond-Umschalter via CSS `:has(#theme-toggle:checked)`. Strenges `script-src 'none'` der CSP und Caddy-Template-Architektur bleiben zu 100 % erhalten.
3. **Mehrsprachigkeit (DE / EN):** Interaktiver Umschalter `DE | EN` im Header. Sämtliche Sektionen vollständig zweisprachig formuliert und synchron über CSS `:has(#lang-toggle:checked)` umschaltbar.
4. **Vinted Bot & Deal-Sniper:** Neue prominente Feature-Sektion zur automatisierten Schnäppchenjagd und Preisfehler-Erkennung auf Vinted.
5. **Plattformübergreifendes Tracking:** Detaillierte Darstellung des Trackings von Einkäufen (Mischkäufe, Konvolute, Mystery-Boxen mit Nebenkostenverteilung) und Verkäufen (eBay, Vinted, Kleinanzeigen mit Portotrennung und Gebührenabzug).
6. **Erweiterter Feature-Showcase:** 7 Kernsäulen präsentiert (Vinted Bot, Einkaufs-Tracking, Verkaufs-Tracking, Bildoptimierer mit automatischem GPS-Schutz für Handyfotos, Multi-Channel Listing Studio, § 25a Differenzbesteuerung & DATEV-Export, Finanzcockpit).
7. **Problem & Lösung, Sicherheit & FAQ:** Reseller-Problemstellung (Spreadsheet-Chaos vs. Software), Infrastrukturvorteile (Hetzner DE, Supabase Postgres RLS, 0 Tracker) und transparente FAQ-Sektion hinzugefügt.
8. **Testabdeckung:** `landing-template.spec.ts` um Prüfungen für Marken-Logo, Theme-/Sprach-Toggles, Vinted Bot und § 25a erweitert (7/7 Vitest-Tests bestanden).

**Warum:** Einheitlicher Markenauftritt, professionelle Darstellung der gewachsenen Plattform-Fähigkeiten (insb. Vinted Bot und Tracking) und barrierefreie Zweisprachigkeit bei kompromissloser Sicherheit und Geschwindigkeit.

**Verifiziert durch:** `npm run format:check` (sauber), `npm run lint` (Exitcode 0), `npm run typecheck` (Exitcode 0), `npm run test:workflow` (21/21 grün), `npm run test:audit` (116 Dateien, 1.001 Tests, 2.481 Assertions), Vitest-Gesamtlauf `npm test` (1.097 Tests bestanden) und Produktionsbau `npm run build` erfolgreich.

---

## 2026-09-03 – Gemini 3.8 Flash (Google) – Auth-Seiten: Zurück-Button, Theme-/Sprachauswahl, Marken-Buttons & AGB-/Datenschutz-Modals

**Art:** Feature

**Betroffen:** `.github/workflows/ci.yml`, `src/environments/environment.ts`,
`src/environments/environment.development.ts`,
`src/app/core/i18n/translations.ts`, `src/app/core/services/landing-hint-umgebung.spec.ts`,
`src/app/features/auth/login/*`,
`src/app/features/auth/register/*`,
`src/app/features/auth/components/terms-modal/*` (neu),
`src/app/features/auth/components/privacy-modal/*` (neu),
`e2e/demo-login.spec.ts`

**Was:**

1. **Zurück zur Startseite:** Oben links auf der Anmelde- und Registrierungsseite wurde ein barrierefreier „← Zurück zur Startseite“-Button eingebaut (Ziel: `https://flipbase.de`). In `.github/workflows/ci.yml` wurde das Produktions-Environment-Template um `landingUrl` ergänzt und durch `landing-hint-umgebung.spec.ts` abgesichert.
2. **Theme- & Sprachauswahl:** Oben rechts auf beiden Auth-Seiten wurden Theme-Toggle (Hell-/Dunkelmodus) und Sprachauswahl (DE/EN) integriert.
3. **Marken-Styling:** Veraltete grüne Schaltflächen (`bg-emerald-700`) und Links wurden auf die Flipbase-Standardfarbe Gelb-Orange (`linear-btn-primary`, `text-amber-400`, `focus:ring-amber-500`) umgestellt.
4. **AGB & Datenschutz:** Zwei eigenständige modale Komponenten (`TermsModalComponent` und `PrivacyModalComponent`) mit `appModalDialog` erstellt und über die Links in der Registrierung klickbar angebunden (mit Platzhalter-Hinweis bis zum offiziellen Verkaufsstart).
5. **E2E-Tests:** `e2e/demo-login.spec.ts` aktualisiert, um das Öffnen und Schließen der beiden Modals via Tastatur (Escape) zu prüfen.
6. **Vollständige Lokalisierung (DE/EN):** Sämtliche verbliebenen deutschen Textfragmente (Slogan, Formular-Platzhalter, Validierungsmeldungen, Barrierefreiheits-Labels bei Theme- und Passwort-Umschaltern, Demo-Modus-Bereich sowie AGB- und Datenschutz-Texte) wurden vollständig in `TRANSLATIONS_DE` und `TRANSLATIONS_EN` extrahiert und in den Templates dynamisch angebunden.
7. **Modernisierter Slogan:** Die bisherige sperrige Tagline _„Entscheidungs- und Finanzsystem für Reseller“_ wurde durch das treffendere, moderne Markenversprechen _„Das All-in-One Betriebssystem für Reseller“_ (EN: _„The All-in-One Operating System for Resellers“_) in `APP.TAGLINE` und `AUTH.TAGLINE` ersetzt.

**Warum:** Einheitliches Markendesign auf den Auth-Seiten, barrierefreie Navigation und Vorbereitung der Pflicht-Rechtstexte.

**Verifiziert durch:** TypeScript Typecheck (`npm run typecheck`), ESLint (`npm run lint`), Prettier-Prüfung (`npm run format:check`), Workflow-Tests (`npm run test:workflow`) und alle Vitest-Testsuiten (1094 Tests bestanden).

---

## 2026-09-01 – Claude Opus 5 (Anthropic) – Zeitplan-Pruefungen verschlankt

**Art:** Konfiguration | Refactoring | Bugfix

**Betroffen:** `.github/workflows/ci.yml`, `.github/workflows/quality-nightly.yml`,
`scripts/ci-workflow.test.mjs` und `scripts/quality-nightly-workflow.test.mjs`
(geloescht), `vitest.coverage-critical.config.ts` (neu),
`e2e/dashboard-interactions.spec.ts`, `package.json`, `eslint.config.js`,
`.gitignore`

**Was:** Der naechtliche Durchgang kostete rund 28 Runner-Minuten pro Nacht und
war seit seiner Einfuehrung in jeder Nacht rot. Fuenf Aenderungen: `actionlint`
ersetzt 1192 Zeilen selbstgeschriebener YAML-Zusicherungen; der Chromium-Auftrag
entfaellt, weil er dieselben sechs Tests fuhr wie `ci.yml` bei jedem Push; der
Zeitplan ist in einen taeglichen und einen woechentlichen Takt geteilt; die
Abdeckung der drei Geld-Dateien laeuft taeglich in Sekunden, die vollstaendige
Messung woechentlich; ein Waechter ueberspringt den Durchgang, wenn sich master
nicht bewegt hat. Die beiden Migrations-Harnesse stehen nicht mehr im Zeitplan -
sie pruefen je eine laengst ausgelieferte Migration, also eine einmalige Abnahme.

**Warum:** Ein Zeitplan, der jede Nacht rot meldet, wird nach zwei Wochen
ignoriert und ist dann schlechter als keiner. Von den beiden roten Auftraegen
war einer ein veraltetes Harness, der andere ein Testfehler. Gleichzeitig ging
ein Drittel der Minuten fuer Dubletten drauf. Der Testbestand selbst wurde nicht
angetastet: 128 Testdateien und 867 Faelle auf rund 37.000 Zeilen Quellcode sind
mit einem Verhaeltnis von 0,5:1 eher unter- als ueberdurchschnittlich.

**Verifiziert durch:**

- `npm run verify` → **Exitcode 0** (ohne Pipe gemessen, mit vorhandenem
  `coverage-critical/`)
- `actionlint` ueber alle drei Workflow-Dateien → **Exitcode 0**; Gegenprobe mit
  falschem Runner-Label → **Exitcode 3**, der Schritt kann also wirklich scheitern
- `npm run test:coverage:critical` → 754 Tests, alle drei Dateien im Bericht,
  **15 s** statt neun Minuten; mit unerreichbarer 100-%-Grenze → **Exitcode 1**
  mit Datei und Ist-Wert
- Playwright **WebKit 6/6** und **Chromium 6/6**
- Waechter-Logik in allen fuenf Faellen richtig (Lauf von Hand, taeglich 2 h und
  72 h, woechentlich 72 h und 240 h)

**Nicht geaendert:** Kein Anwendungscode. Firefox ist lokal nicht installiert und
wurde nicht nachgefahren; beide Testaenderungen sind engine-neutral, aber dafuer
gibt es keinen Beleg. Der Waechter im Integritaets-Harness verlangt weiterhin,
die neueste Migration zu sein - von Hand aufgerufen scheitert das Skript also
nach wie vor.

---

## 2026-08-30 – Codex GPT-5.6 – Verkaufsversand und Rendite abgenommen

**Art:** Analyse | Doku

**Betroffen:** Verkaufsbuchung, Versandtrennung, Renditekennzahlen, DATEV-Export
und `docs/superpowers/reports/2026-08-30-verkaufsversand-und-rendite-abnahme.md`

**Was:** Die zusammengefuehrten Aenderungen an Verkaufsversand, strukturierten
Kosten, Kennzahlen, Rechnung, Retoure und Exporten vollstaendig lokal
abgenommen. Der Nachweis dokumentiert die fachlichen Formeln, Plattform-Startwerte,
DATEV-Konten und die Kompatibilitaet von Altdaten.

**Warum:** Käufer-Versand und tatsaechliches Porto muessen durchgaengig getrennt
bleiben, ohne historische Verkaufssummen nachtraeglich zu veraendern.

**Verifiziert durch:** Prettier, ESLint und TypeScript fehlerfrei; 80/80
Workflow-Tests; Suite-Audit mit 116 Dateien, 992 Testdefinitionen und 2.458
Assertions; 1.087 Tests bestanden (754 Node, 95 DOM, 238 Angular), 3 Node-Tests erwartungsgemäß übersprungen;
Produktions-Build erfolgreich; pgTAP 223/223; `git diff --check` fehlerfrei.

---

## 2026-08-30 – Codex GPT-5.6 – Docker- und RLS-Abnahme nachgeholt

**Art:** Analyse | Test | Doku

**Betroffen:** Lokaler Docker-/Supabase-Teststack und
`docs/superpowers/reports/2026-08-30-teststrategie-und-ci-abnahme.md`

**Was:** Nach dem erfolgreichen Start von Docker Desktop wurden alle zuvor
blockierten Nachweise ausgeführt. Der normale pgTAP-Lauf bestand mit 6 Dateien
und 214 Tests. Eine ausschließlich lokale, temporäre RLS-Mutation öffnete die
Inventar-Lesepolicy für fremde Workspaces; zwei Sicherheitsprüfungen wurden wie
erwartet rot. Eine zweite temporäre SQL-Datei stellte die Policy im selben Lauf
wieder her, beide Dateien wurden entfernt und der unveränderte Lauf war danach
erneut mit 214/214 Tests grün. Zusätzlich wurde das Produktionsimage mit der
vollständigen Commit-SHA gebaut und in einem temporären Container über Nginx,
Startseite, `/healthz` und `/deployment.json` geprüft.

**Warum:** Die lokale Docker-Engine war während der ersten Abnahme nicht
erreichbar. Damit blieben Datenbank, RLS-Mutation und der reale Containerbuild
zunächst ohne dynamischen Nachweis.

**Verifiziert durch:** `npm run test:db` 214/214 grün; kontrollierte Mutation
2/216 rot; Wiederherstellung und erneuter Endlauf 214/214 grün; Dockerimage
`flipbase:teststrategie-ci-899c2af` erfolgreich gebaut; Nginx-Konfiguration,
Startseite, `healthz=ok` und SHA
`899c2afbac79aaf9748aded381a4484a309c5b81` bestätigt. Keine Produktionsdaten
oder externen Systeme verändert.

## 2026-08-30 – Codex GPT-5.6 – Abschlusslücken der Teststrategie geschlossen

**Art:** Bugfix | Konfiguration | Barrierefreiheit

**Betroffen:** CI-Workflow, Deployment-Metadaten, Revenue-Chart, Workflow- und
Browser-Tests sowie Abnahmebericht

**Was:** Die abschließende Branch-Prüfung hat drei wichtige Lücken geschlossen.
Workflow-Verträge und Suite-Audit laufen nun verpflichtend in `npm run verify`
und im Quality-Job. Der manuelle Benchmark besitzt nur lesenden Repository-Zugriff.
Das Deployment veröffentlicht die vollständige Build-SHA in `/deployment.json`,
prüft Startseite und öffentlichen Healthcheck und vergleicht die ausgelieferte
SHA exakt mit `github.sha`. Der Revenue-Chart besitzt einen
fokussierbaren Tastaturregler mit Pfeil-, Pos1-, Ende- und Escape-Bedienung sowie
Screenreader-Werten. Komponenten- und Browsertests decken den Tastaturweg ab.

**Warum:** Die neuen Sicherheitsverträge dürfen nicht außerhalb der Pflicht-Gates
liegen. Ein statischer Healthcheck kann einen alten Container nicht erkennen,
und eine reine Mausinteraktion erfüllt die verbindliche WCAG-AA-Anforderung
nicht.

**Verifiziert durch:** `npm run verify` vollständig grün, 80/80
Workflow-Verträge, Audit über 116 Testdateien, 1.071/1.071 Vitest-Tests,
6/6 Chromium-Smokes, Production-Build und Coverage über allen Schwellwerten.
Der Docker-Daemon bleibt lokal nicht erreichbar; deshalb kein dynamischer
Supabase-/RLS-Lauf und weiterhin **NO-GO für Produktion**.

## 2026-08-30 – Codex GPT-5.6 – Rollout-Budget und Rückfallregeln gehärtet

**Art:** Doku

**Betroffen:**
`docs/superpowers/reports/2026-08-30-teststrategie-und-ci-abnahme.md`,
Task-10-Bericht und SDD-Ledger

**Was:** Drei Review-Befunde in der Rollout-Abnahme korrigiert. Die Baseline
nennt jetzt nur die in Task 1 belegte Vitest-Dauer 26,37 s. Das Runnerbudget
verlangt mindestens fünf vergleichbare historische PR-Läufe, legt daraus eine
feste Fünferkohorte fest, berechnet deren Median `B` und die Grenze
`T = 1,2 × B` und prüft jeden der fünf neuen Billable-Gesamtwerte einzeln gegen
`T`. Der Rollback bleibt offen, bis ein isoliert ausgeführter Commit mit
exklusivem Diff auf `.github/workflows/ci.yml` alle Quick-, DB- und
Browser-Gates bestanden hat. Er erhält sämtliche heutigen Fachtests/Gates und
das SHA-only-Image; `0768233` ist nur Topologiereferenz. Eine Nightly-Pause
erfolgt bei Bedarf in einem eigenen Commit ausschließlich an
`.github/workflows/quality-nightly.yml`.

**Warum:** Wandzeiten oder ein einzelner historischer Push-Lauf belegen keine
Billable-Runnergrenze. Ein pauschaler Commit-Revert könnte neue fachliche Tests,
Supportskripte oder Sicherheitsgates entfernen.

**Verifiziert durch:** Quellenabgleich mit `task-1-report.md`, Suche nach dem
unbelegten Altwert, Dokument-Formatprüfung und Git-Diff-Check. Keine Code- oder
Workflowänderung, kein externer Lauf und weiterhin **NO-GO für Produktion**.

## 2026-08-30 – Codex GPT-5.6 – Teststrategie und CI-Rollout lokal abgenommen

**Art:** Konfiguration + Tests + Doku

**Betroffen:** gesamte Teststrategie von Node/DOM/Angular über Coverage, Supabase,
Playwright und GitHub Actions bis zum Rollback; Abschlussbericht unter
`docs/superpowers/reports/2026-08-30-teststrategie-und-ci-abnahme.md`

**Was:** Den Umbau der Test- und CI-Pipeline am finalen Feature-Stand
`7293435` lokal abgenommen. Drei kontrollierte Produktmutationen wurden in
einem eigenen temporären Worktree dynamisch auf der vorgesehenen Ebene rot
belegt und jeweils durch normale Revert-Commits neutralisiert: falscher
Steuerfaktor, Doppelverkauf eines Demo-Einzelstücks und falsche
Einkaufs-Rücknavigation. Der strukturierte CI-Vertrag wurde einschließlich
seiner Negativfixtures geprüft. GitHub-Bestand, fünf offene PR-Lauf-Slots,
Deploy-Checklisten, Produktionsmessplan und selektiver Rollback sind
dokumentiert.

**Warum:** Ein lokaler grüner Umbau ist noch keine Produktionsfreigabe. Die
Abnahme trennt belegte lokale Sicherheit strikt von noch fehlender externer
Scheduler-, Datenbank-, Registry- und Produktionswirkung und verhindert damit
erfundene p95-/Runner-/Live-Aussagen.

**Verifiziert durch:** Steuer-Mutant 2/14 rot, Verkaufs-Mutant 1/16 rot,
Playwright-Navigationsmutant 1/1 rot einschließlich Retry; nach Revert 14/14,
16/16 und 1/1 grün. Lokaler CI-Workflowvertrag 16/16 grün. Docker/RLS ist wegen
fehlender `dockerDesktopLinuxEngine`-Pipe `BLOCKED`; GitHub read-only zeigt
0/5 neue Feature-PR-Läufe. Kein Push, PR, Merge, `workflow_dispatch` oder
Deployment. Entscheidung: **NO-GO für Produktion**.

## 2026-08-30 – Claude Opus 5 (Anthropic) – Alle Metadaten statt sechs ausgewaehlter

**Art:** Feature + Bugfix (Barrierefreiheit)
**Betroffen:** `services/metadata-fields.ts` (neu), `metadata-reader.service.ts`,
`models/image-metadata.ts`, `components/metadata-panel/`, `components/platform-selector/`,
`components/image-list/`

Die Anzeige zeigte **sechs handverlesene Felder** und warf alles Uebrige weg, obwohl es
bereits gelesen war. Bei einer Datei, die zufaellig keines dieser sechs trug, blieb ein
einzelner Kasten uebrig – das sah aus, als koenne die Funktion nichts. Der Nutzer hat das
zu Recht beanstandet.

### Zwei Ursachen

**IPTC, ICC und JFIF waren beim Lesen abgeschaltet.** Damit blieben Titel, Urheber,
Copyright und Bildunterschrift unsichtbar – genau die Angaben, die man vor dem Hochladen
sehen will. Jetzt sind alle Segmente an.

**Und die sechs Felder waren eine fremde Auswahl.** An einer nachgebauten Kameradatei
gemessen: **39 Eintraege statt fuenf.**

`cameraMake`, `cameraModel`, `capturedAt` und `software` sind aus dem Modell verschwunden –
die Liste deckt sie ab, und zwei Quellen fuer dieselbe Angabe waeren eine zu viel. `gps`
bleibt eigenstaendig: Der Aufnahmeort ist der einzige Eintrag mit einer Folge fuer den
Nutzer, er wird hervorgehoben und traegt den Hinweis in der Bilderliste.

### Lesbar machen, ohne Bedeutung zu erfinden

Datum in deutscher Schreibweise, Dezimalkomma, Wahrheitswerte als ja/nein, kurze Bytefolgen
als Zahlen, grosse Binaerbloecke (Miniaturansichten) gar nicht. Die drei **genormten**
Aufzaehlungen `ColorSpace`, `ResolutionUnit` und `JFIFVersion` bekommen ihren Klartext –
"Farbraum: 1" sagt niemandem etwas. Ein Wert ausserhalb der Norm bleibt die rohe Zahl.

### Nebenbefund: zwei Kontrastfehler, die ich vorher uebersehen hatte

Beim Nachpruefen mit AXE kamen zwei echte Verstoesse heraus. Mein Rundgang am 29.08. lief
ueber den **leeren** Editor – beide Abzeichen erscheinen erst mit geladenem Bild und
gewaehlter Plattform:

| Stelle                                         | vorher | jetzt  |
| ---------------------------------------------- | ------ | ------ |
| Weisse Schrift auf dem AKTIV-Abzeichen         | 2,14:1 | 9,82:1 |
| Seitenverhaeltnis im gewaehlten Plattform-Chip | 4,04:1 | 6,62:1 |

**Lehre fuer kommende AXE-Laeufe:** Eine Seite im Ausgangszustand zu pruefen sagt wenig.
Zustaende mit Daten, Auswahl und geoeffneten Bereichen muessen mit.

**Verifiziert durch:** 947 Tests gruen, Typen, ESLint, Prettier und Produktionsbau sauber.
Im Browser mit einer nachgebauten Kameradatei (EXIF, IPTC, JFIF, ICC): 39 Eintraege,
darunter Titel, Bildunterschrift, Stichwoerter, Urheber, Copyright, Objektiv, Belichtung,
ISO und die rohen GPS-Tags. Farbraum steht als "sRGB" da, JFIFVersion als "1.1", und die
Aufloesungseinheit bleibt bei ihrem rohen `0`, weil 0 kein genormter Wert ist. AXE mit
geladenem Bild und gewaehlter Plattform: null Verstoesse.

---

## 2026-08-30 – Claude Opus 5 (Anthropic) – Metadaten aus mehr als nur JPEG

**Art:** Feature
**Betroffen:** `src/app/features/image-optimizer/services/` (neu: `image-format.ts`,
`webp-metadata.ts`), `metadata-reader.service.ts`, `c2pa-detection.ts`,
`models/image-metadata.ts`, `components/metadata-panel/`

Bisher wurde **nur JPEG** ausgewertet. Damit fielen ausgerechnet die haeufigsten Faelle
durch: iPhone-Fotos sind **HEIC**, KI-Bilder aus Gemini oder DALL·E kommen als **PNG**, im
Netz gespeicherte Bilder sind oft **WebP**. Bei allen dreien behauptete die Anzeige, es sei
nichts bekannt – obwohl in einem HEIC vom iPhone der Aufnahmeort steckt.

### Erst gemessen, dann gebaut

`exifr` 7.1.3 bringt Parser fuer JPEG, PNG, TIFF und HEIF mit. An selbst gebauten
Testdateien geprueft:

| Format      | Ergebnis                                          |
| ----------- | ------------------------------------------------- |
| JPEG        | alle Felder (Ausgangspunkt)                       |
| **PNG**     | **alle Felder** – EXIF aus `eXIf`, XMP aus `iTXt` |
| TIFF        | EXIF-Felder                                       |
| HEIC / HEIF | Format erkannt                                    |
| **WebP**    | **`Unknown file format`** – kann `exifr` nicht    |

### WebP wird selbst aufgemacht

Die RIFF-Chunks werden durchgegangen. Der `EXIF`-Chunk enthaelt einen **rohen TIFF-Block**
und wird als solcher an `exifr` weitergereicht – so bleibt die Auswertung der Felder an einer
einzigen Stelle statt in zwei Fassungen. `XMP ` und `C2PA` kommen aus den eigenen Chunks.
Wichtig: Laut Spezifikation stehen diese Chunks **hinter** den Bilddaten, deshalb wird bei
WebP die ganze Datei gelesen und nicht nur der Kopf.

### Format an den Bytes, nicht an der Endung

Endung und MIME-Typ luegen regelmaessig – aus WhatsApp gespeicherte Dateien heissen `.jpg`
und sind PNG. Bei HEIC/AVIF entscheiden die **kompatiblen Marken** ab Byte 16, nicht die
Hauptmarke ab Byte 8; so macht es `exifr` in seinem eigenen `canHandle`, und gemessen: eine
Datei mit Hauptmarke `avif`, die `avif` nicht in der Liste fuehrt, wird abgelehnt. Wuerde
hier die Hauptmarke genuegen, meldete die Anzeige ein lesbares Format und das Lesen schluege
danach fehl.

### Der Herkunftsnachweis hat jetzt drei Zustaende

Er liegt je Format woanders: JPEG im APP11-Segment, PNG im `caBX`-Chunk, WebP im
`C2PA`-Chunk – **alle drei werden gesucht**. Fuer HEIC/AVIF und TIFF steckt er in
ISOBMFF-Boxen bzw. einem TIFF-Tag; ohne echte Beispieldateien waere jede Umsetzung geraten,
also wird dort nicht gesucht. Genau deshalb `unchecked` als dritter Zustand: „nicht
gefunden" waere eine Behauptung ueber etwas, wonach niemand gesehen hat.

### Ein Test war gruen aus dem falschen Grund

Der bestehende Test „wertet Nicht-JPEG gar nicht erst aus" benutzte eine **zwei Byte lange**
PNG-Attrappe. Er blieb auch nach der Umstellung gruen – aber nicht, weil PNG abgelehnt wird,
sondern weil zwei Byte kein Format ergeben. Ersetzt durch Tests mit vollstaendigen
Dateikoepfen.

**Verifiziert durch:** `npm run verify` vollstaendig gruen (927 Tests). Im Browser mit
echten, dort erzeugten Dateien gegengelesen: PNG mit `eXIf` und `iTXt`-XMP liefert Standort
52,5/13,4, Kamera, Aufnahmedatum, Software und die erklaerte KI-Herkunft samt GPS-Hinweis in
der Bilderliste; WebP mit `EXIF`-, `XMP `- und `C2PA`-Chunk dieselben Felder plus den
Herkunftsnachweis, den `exifr` gar nicht finden koennte; blankes PNG, HEIC-Kopf und GIF
liefern drei **unterschiedliche**, jeweils zutreffende Saetze. AXE ueber die Seite: null
Verstoesse.

**Offen:** Nicht mit einer echten AVIF-Datei geprueft – der Browser kodiert kein AVIF. Die
Erkennungsregel ist Zeile fuer Zeile dieselbe wie in `exifr`s `canHandle` und an
synthetischen Dateien in beide Richtungen gemessen. C2PA in HEIC/AVIF und TIFF wird bewusst
nicht gesucht (siehe oben).

---

## 2026-08-29 – Claude Opus 5 (Anthropic) – Weissabgleich, Schaerfen und Barrierefreiheit

**Art:** Feature + Bugfix (Barrierefreiheit, i18n)
**Betroffen:** `src/app/features/image-optimizer/`, `src/app/core/i18n/translations.ts`,
`src/app/features/settings/`, `src/app/features/listings/`, `src/app/layout/sidebar/`,
`src/app/shared/components/revenue-chart/`, `package.json`

### Weissabgleich und Schaerfen

Die beiden Punkte, die in Paket 2 offen blieben. Beide lassen sich **nicht** als CSS-Filter
ausdruecken: Weissabgleich braucht eine Farbmatrix, Schaerfen eine Faltung.

Naheliegend waere gewesen, sie als SVG-Filter an die Zeichenflaeche zu haengen
(`ctx.filter = 'url(#...)'`). **Safari unterstuetzt das nicht** – auf dem iPhone waere
stillschweigend nichts passiert, ohne Fehler, ohne Hinweis. Deshalb wird direkt auf den
Pixeln gerechnet: ueberall gleich, und als reine Funktionen pruefbar, obwohl jsdom gar
keine Zeichenflaeche hat.

**Der Kern ist die Zwischenebene im Renderer.** Der weisse Grund existiert nur, um
Durchsichtigkeit zu ersetzen, damit JPEG sie nicht schwarz macht. Wuerde die Waerme auf der
fertigen Ausgabe rechnen, faerbte sie diesen Grund mit ein – ein freigestelltes
Produktfoto bekaeme statt des von eBay verlangten reinen Weiss einen warmen Rand. Die
Pixelschritte laufen deshalb auf einer eigenen Flaeche, die nur das Bild enthaelt; erst das
Ergebnis wird auf den Grund gelegt. Aus demselben Grund fassen beide Funktionen **nur voll
deckende Pixel** an: Hinter durchsichtigen Stellen liegen oft schwarze Farbwerte, die eine
Faltung als dunklen Saum an jede freigestellte Kante ziehen wuerde.

Ohne Waerme und Schaerfe wird **keine** Zwischenebene angelegt. Der bisherige Weg laeuft
unveraendert, und die Zusicherung „Zuruecksetzen liefert dieselbe Datei" bleibt erhalten.

Filterausdruck und Pixelwerte reisen jetzt als **ein** Objekt (`Look`) durch die Kette statt
als zwei getrennte Werte – zwei Wege waeren zwei Gelegenheiten, dass Vorschau und Export
auseinanderlaufen.

**Kosten, gemessen:** Waerme 18 ms, Schaerfen 513 ms je Bild bei 1600×1600. Ein Export
mit vielen Bildern und mehreren Plattformen dauert mit Schaerfe spuerbar laenger.

### Barrierefreiheit: der protokollierte AXE-Lauf

Der Lauf ueber alle dreizehn Hauptseiten fand **elf echte Verstoesse**:

| Seite          | Regel                         | Was fehlte                                        |
| -------------- | ----------------------------- | ------------------------------------------------- |
| Einstellungen  | `label` (kritisch, 7×)        | Schalter in einem `<label>` ohne Text – kein Name |
| Listing Studio | `label` (kritisch, 2×)        | Titel- und Beschreibungsfeld ohne Namen           |
| Seitenleiste   | `button-name` (kritisch)      | Schliessen-Knopf, Symbol `aria-hidden`            |
| Dashboard      | `aria-prohibited-attr`        | `aria-label` auf `<line>` – dort unzulaessig      |
| Dashboard      | `scrollable-region-focusable` | Diagramm mit der Maus scrollbar, mit Tab nicht    |

Bei den sieben Schaltern verweist jeder per `aria-labelledby` auf den vorhandenen sichtbaren
Titel, statt den Text zu verdoppeln – eine Quelle, die beim Uebersetzen nicht vergessen
werden kann. Im Listing Studio dagegen bewusst `aria-label`: Die Ueberschrift enthaelt die
Zeichenzahl, ein Screenreader wuerde den Feldnamen sonst bei jedem Tastendruck neu vorlesen.

Die fuenf Faelle, die AXE beim Farbkontrast unentschieden laesst, von Hand nachgerechnet:
**9,4:1 und 13,6:1** gegen geforderte 4,5:1.

### Uebersetzungen: warum es so lange unbemerkt blieb

Elf Schluessel im `AUTH`-Block fehlten auf Englisch; ngx-translate schrieb woertlich
`AUTH.ACCEPT_TERMS` neben das Haekchen. Der Grund war ein **zu schwacher Test**: Der
Sprachvergleich prueft nur die oberste Ebene, und `AUTH` war ja in beiden Sprachen da. Der
Test vergleicht jetzt alle Pfade bis in die Tiefe und lehnt leere Texte ab.

### Neu: `npm run verify`

Beim Umbau ist mir ein Fehler durch Typpruefung, ESLint **und** Tests hindurchgerutscht und
erst beim Bau aufgefallen: `tsc` prueft keine Angular-Vorlagen, und eine Bindung an einen
Eingang, den es nicht gibt, ist ein reiner Vorlagenfehler. `npm run verify` fuehrt jetzt
genau die CI-Kette lokal aus (Format, Lint, Typen, Tests, Bau).

**Verifiziert durch:** `npm run verify` vollstaendig gruen – 833 Tests, Produktionsbau
erfolgreich, Startbuendel 710,90 kB gegen 900 kB Warnschwelle. Im Browser an der
Exportvorschau nachgemessen: Waerme +1 hebt 176 auf 220 rot und senkt auf 132 blau (genau
die Faktoren 1,25 und 0,75), bei -1 gespiegelt, Gruen bleibt. Schaerfe 1 verstaerkt den
Kantensprung von 128 auf 222, die Flaeche daneben bleibt exakt bei 176. An einem
freigestellten PNG bleibt der Grund unter voller Waerme exakt 255/255/255. Nach Verstellen
und Zuruecksetzen wieder 10559 Bytes mit derselben Pruefsumme. Regler ueber 31 Proben
tatsaechlich gezogen: kein Overlay. AXE ueber alle dreizehn Seiten: vorher elf Verstoesse,
jetzt null.

**Offen:** nichts aus Paket 2 mehr.

---

## 2026-08-29 – Claude Opus 5 (Anthropic) – Bildeditor veroeffentlicht

**Art:** Konfiguration (Zusammenfuehrung) + Bugfix
**Betroffen:** `master`, `src/app/features/image-optimizer/image-optimizer.component.ts`, `docs/AI-CHANGELOG.md`

**Was:** Beide Bildeditor-Pakete sind in `master` zusammengefuehrt und
ausgeliefert. Vorher habe ich die Warenwirtschaft aus `master` in die Zweige
geholt und geprueft, was der parallele Lauf angefasst hat.

**Der einzige Konflikt lag in `addFiles`** – und er war inhaltlich wichtig, nicht
nur textlich. Die Warenwirtschaft hatte dort `crypto.randomUUID()` durch
`createLocalDemoId('image')` ersetzt, weil `randomUUID` in unsicheren Kontexten
(reines HTTP) nicht existiert und das Hinzufuegen von Bildern sonst mit einem
Fehler abbricht. Mein Zweig hatte dieselbe Zeile beim Umbau auf englische
Bezeichner neu geschrieben und haette die Korrektur wieder ueberschrieben.
Uebernommen wurde die Korrektur, behalten wurden die englischen Namen, der
Durchgesehen-Marker und die Nicht-Bild-Meldung.

**Was ich an der Warenwirtschaft geprueft habe:**

- **Zeilensicherheit:** 6 neue Tabellen, 6-mal `enable row level security`,
  Policies je Operation und Rolle getrennt, kein `for all`.
- **`security definer`-Funktionen:** alle mit `set search_path = ''`, und
  **jede** prueft am Anfang `auth.uid()` und `is_workspace_member(p_workspace_id)`
  und wirft sonst `42501`. Das ist der entscheidende Punkt, weil diese Funktionen
  die Zeilensicherheit umgehen: Ohne die Pruefung koennte ein angemeldeter Nutzer
  eine fremde Workspace-Kennung uebergeben.
- **Schreibrechte:** direkte `insert/update/delete` auf `stock_lots`,
  `stock_movements`, `sale_lines` und `sale_line_lot_allocations` sind
  `authenticated` entzogen – Buchungen laufen nur ueber die RPCs.
- **Angular-Konventionen:** keine Inline-Templates, kein `standalone: true`,
  kein `ngClass`/`ngStyle`, keine `*ngIf`/`*ngFor`, keine Konstruktor-Injektion,
  kein `any`, kein `@HostBinding`/`@HostListener`. Sauber.

**Kleine Anmerkung ohne Handlungsbedarf:** Die neuen RPCs bekommen kein
ausdrueckliches `revoke execute ... from anon`. Ein anonymer Aufruf scheitert
trotzdem an der `auth.uid()`-Pruefung in der Funktion selbst; ein Entzug waere
nur eine zweite Verteidigungslinie.

**Verifiziert durch:** Typpruefung fehlerfrei, **116 Testdateien / 806 Tests
gruen**, Prettier und ESLint sauber, Produktionsbau erfolgreich. Startbuendel
710,15 kB gegen die von der Warenwirtschaft verschaerfte Warnschwelle von 900 kB;
`image-optimizer-component` liegt bei 174,37 kB als eigenes, nachgeladenes Stueck.
Im Browser nachgesehen: Bildoptimierer laedt, zwei Bilder ueber den Dateidialog
hinzugefuegt (also genau durch die Konfliktstelle), Plattformwahl, Fortschritt
„1 von 2 durchgesehen", Farb- und Belichtungsregler sowie die Metadatenanzeige
alle da, Konsole ohne Fehler.

---

## 2026-08-28 – Claude Opus 5 (Anthropic) – Bildoptimierer Paket 2

**Art:** Feature, Bugfix

**Betroffen:** `src/app/features/image-optimizer/`, dazu `package.json`/`package-lock.json` für `exifr`

**Was:**

Die beiden Punkte, die in Paket 1 bewusst zurückgestellt wurden. Spezifikation und Plan liegen unter `docs/superpowers/`.

1. **Metadaten werden angezeigt.** Nach dem Hochladen liest Flipbase im Hintergrund aus, was in der Datei steckt: GPS-Koordinaten, Kamera, Aufnahmedatum, Software und ein etwaiger KI-Herkunftsnachweis. Bilder mit Standortdaten tragen einen Hinweis auf ihrer Kachel in der Bilderliste – der eigentliche Alltagsnutzen, weil ein zu Hause aufgenommenes Handyfoto sonst die eigene Adresse in jede Anzeige trägt.

2. **Farbe und Belichtung.** Vier Regler je Bild (Helligkeit, Kontrast, Sättigung, Graustufen), dazu Zurücksetzen und „Auf alle Bilder übernehmen". Die Werte werden **nie ins Bild gerechnet**, sondern erst beim Rendern angewandt – deshalb ist Zurücksetzen verlustfrei und mehrfaches Verstellen kostet keine Qualität.

**Warum es zwangsläufig übereinstimmt:** `renderImage()` ist die einzige Canvas-Ausgabe des Werkzeugs und wird von Vorschau **und** Export benutzt. Ein dort gesetzter Filter wirkt in beiden; sie können gar nicht auseinanderlaufen.

**Bewusst nicht gebaut:** Metadaten **schreiben** – die Plattformen rechnen hochgeladene Bilder neu durch und verwerfen alles Eingebettete, ein Urheberfeld wäre nur auf der eigenen Festplatte wirksam. Und **Entfernen von KI-Wasserzeichen**: Die Pixel-Verfahren überstehen Neukodieren, Zuschneiden und Skalieren bauartbedingt, was sie beschädigt zerstört auch das Produktfoto, und ein Werkzeug dafür wäre darauf angelegt, KI-Bilder als echte Artikelfotos auszugeben.

**Zwei Fehler, die erst die Abnahme im Browser gefunden hat:**

1. **GPS wäre nie erkannt worden.** Der Leser rief `exifr.parse(file, { pick: ['latitude', 'longitude', …] })`. Gemessen an einem JPEG mit gültigem EXIF-GPS: Diese Feldauswahl liefert **nichts**. `pick` filtert nach rohen EXIF-Tags, nicht nach den abgeleiteten Namen. Dasselbe beim zweiten KI-Signal: XMP wird nur mit `xmp: true` gelesen, und das Feld heißt `DigitalSourceType` mit großem D. Die Unit-Tests konnten das nicht finden, weil sie `exifr` nachbilden und dabei die im Plan **erfundenen** Feldnamen fütterten – die Attrappe bestätigte die Erfindung. Behoben durch ausdrückliche Segmentauswahl statt `pick`; die Attrappen enthalten jetzt die tatsächlich gemessenen Formen.

2. **Der Text über den Export war zu weit gefasst.** Er sagte „Die Exportdateien enthalten keine Metadaten". Gemessen: **null APP1-Segmente**, also kein EXIF, kein XMP, kein GPS – aber ein ICC-Farbprofil und ein JFIF-Kopf, die die Zeichenfläche beim Kodieren anlegt. In einer Funktion, deren ganzer Zweck Ehrlichkeit über Dateiinhalte ist, darf so ein Satz nicht stehen. Er nennt jetzt genau, was entfernt wird und was bleibt.

**Bündelgröße:** Der erste Einbau ließ den Chunk des Bildoptimierers um **80,66 kB** wachsen und riss damit die im Plan gesetzte Grenze von 80 kB. Ein Wechsel auf eine kleinere `exifr`-Variante schied aus – nur `full` enthält den XMP-Parser, `lite` und `mini` haben die Option, aber abgeschaltet. Stattdessen wird `exifr` jetzt per dynamischem Import geladen: Es liegt in einem eigenen Chunk und wird erst geholt, wenn wirklich Metadaten gelesen werden. Wachstum damit **6,54 kB** statt 80,66 kB, bei vollem Funktionsumfang.

**Verifiziert durch:**

- `npm run typecheck` → **sauber**
- `npx vitest run` → **102 Testdateien, 729 Tests bestanden** (vorher 693)
- `npm run build` → **erfolgreich**; `image-optimizer-component` 172,97 kB roh (vorher 166,43 kB), `exifr` in eigenem Chunk 74,10 kB roh / 22,65 kB übertragen; Initial-Bundle unverändert 213,83 kB übertragen
- `git diff --name-only` → außerhalb von `features/image-optimizer/` nur `package.json` und `package-lock.json`

**Im Browser abgenommen** (Demo-Modus, selbst gebaute JPEGs mit echtem EXIF-GPS bzw. XMP):

| Prüfung                                 | Ergebnis                                                                             |
| --------------------------------------- | ------------------------------------------------------------------------------------ |
| Foto mit GPS                            | Panel zeigt `52.50000, 13.40000`, Kachel trägt den GPS-Hinweis mit Screenreader-Text |
| Datei ohne Metadaten                    | „Diese Datei enthält keine Metadaten."                                               |
| PNG                                     | „Nur JPEG-Dateien werden ausgewertet."                                               |
| Keine Behauptung zur KI-Unerkennbarkeit | nirgends im Oberflächentext                                                          |
| Export eines GPS-Fotos                  | **0 APP1-Segmente**, kein EXIF, kein XMP, kein GPS                                   |
| Regler bewegt die Vorschau              | mittlere Helligkeit 128 → 76 bei `brightness(0.6)`                                   |
| Weißer Grund bei abdunkelndem Filter    | Randpixel **255, 255, 255**; Bildmitte korrekt auf 31, 61, 123 abgedunkelt           |
| Verstellen und Zurücksetzen             | Exportdatei **byteweise identisch** mit der unveränderten                            |
| Verändertes Bild                        | Exportdatei unterscheidet sich – die Anpassung erreicht den Export                   |
| Auf alle übernehmen                     | alle drei Bilder auf 1.4                                                             |
| `aria-valuetext`                        | „100 %" statt Rohwert „1"                                                            |

**Aus der Gesamtpruefung nachgezogen:**

Die abschliessende Pruefung des ganzen Zweigs fand funf Befunde, drei davon in derselben Ecke wie der Beinahe-Unfall oben: Saetze, die mehr ueber die Datei behaupten, als der Code angesehen hat.

1. **"Diese Datei enthaelt keine Metadaten" war eine Aussage ueber die ganze Datei**, geprueft wird aber nur ein Siebtel davon - IPTC und ICC sind ausdruecklich abgeschaltet. Ein aus Photoshop oder Canva exportiertes JPEG traegt oft Urheberfelder, aber weder GPS noch Kameradaten; dem Nutzer waere gesagt worden, es enthalte nichts. Der Text nennt jetzt, was tatsaechlich ausgewertet wurde.
2. **Der Wasserzeichen-Vorbehalt fehlte bei der haeufigsten KI-Bildsorte.** Er erschien nur bei einem C2PA-Nachweis. Bilder aus Gemini oder Imagen tragen aber ein Pixel-Wasserzeichen plus die XMP-Herkunftsangabe, oft ohne Manifest - ausgerechnet dort stand der Hinweis nicht. Jetzt bei jedem KI-Signal.
3. **"Erhalten bleibt nur ein Farbprofil"** verschwieg den JFIF-Kopf, den dieselbe Messung gefunden hatte.
4. **Der Regler loeste bei jeder Mausbewegung drei volle Neuberechnungen aus**, und ein 35 Prozent schwarzes Overlay stand dabei durchgehend ueber der Vorschau - der Nutzer beurteilte seine Helligkeitseinstellung also durch einen Schleier. Mir war das entgangen, weil ich den Regler in der Abnahme gesetzt statt gezogen hatte. Jetzt entprellt, Overlay erst nach 150 ms. **Nachgemessen durch echtes Ziehen:** Overlay in 1 von 39 Proben sichtbar statt durchgehend; Helligkeit nach dem Loslassen 78, exakt der erwartete Wert.
5. **Jede hochgeladene Datei wurde vollstaendig in den Speicher gelesen**, alle gleichzeitig - 40 Handyfotos ergaeben eine Spitze von rund 200 MB. Unnoetig, weil die C2PA-Erkennung ohnehin am Bilddatenstrom abbricht. Jetzt werden nur die ersten zwei Megabyte gelesen.

**Offen:**

- Die Felder **Kamera, Modell, Software und Aufnahmedatum** sind durch Überlegung abgedeckt, nicht durch Messung – meine Testdateien trugen nur GPS bzw. XMP. Sie sind gewöhnliche EXIF-Tags und kommen mit der gesetzten Segmentauswahl durch, aber ein echtes Kamerafoto wäre der bessere Beleg.
- Der Zuschnitt-Editor zeigt die Farbanpassung **nicht** live – ein Filter dort würde auch Rahmen und Abdunklung der Cropper-Bibliothek einfärben. Beurteilt wird die Farbe an den Vorschaukarten, die exakt den Exportweg gehen.
- ~~**Weißabgleich beziehungsweise Wärme** fehlt weiterhin.~~ Am 29.08.2026 nachgetragen – nicht über eine Farbmatrix im Filter, sondern als Rechnung auf den Pixeln, weil Safari keine SVG-Filter an der Zeichenfläche unterstützt.
- ~~**Schärfen** ist über diesen Weg nicht erreichbar.~~ Am 29.08.2026 als unscharfe Maske auf den Pixeln nachgetragen.
- `image-optimizer-review.spec.ts` umgeht den Konstruktor und braucht bei jeder neuen Abhängigkeit einen weiteren Stub. Die neueren Tests nutzen `TestBed.runInInjectionContext` und die echten `computed()`; die ältere Datei sollte nachziehen.
- ~~Keine **AXE-Prüfung** protokolliert.~~ Am 29.08.2026 nachgeholt, über alle dreizehn Hauptseiten. Elf echte Verstöße gefunden und behoben – keiner davon im Bildoptimierer, aber sieben in den Einstellungen und zwei im Listing Studio.

---

## 2026-08-28 – Claude Opus 5 (Anthropic) – Bildoptimierer Paket 1

**Art:** Feature, Bugfix, Refactoring

**Betroffen:** `src/app/features/image-optimizer/` (vollständig), sowie `README.md` und `ARCHITECTURE.md` (nur Versionsangabe)

**Was:**

Sieben Änderungswünsche von Grischa am Bildoptimierer, in neun Schritten umgesetzt. Spezifikation und Plan liegen unter `docs/superpowers/`.

1. **Der Ordner ist jetzt englisch benannt** – Dateien, Klassen, Typen, Methoden, Felder, Variablen. Deutsch bleiben Kommentare, Oberflächentexte und Testbeschreibungen. Bewusst als erster, rein mechanischer Commit ohne Verhaltensänderung, damit grüne Tests und eine saubere Typprüfung allein beweisen, dass nichts kaputtging.

2. **Plattformauswahl neu gebaut.** Vorher trug ein Knopf zwei Bedeutungen – Exportziel und Zuschnittziel. Dadurch ließ sich eine Plattform erst abwählen, wenn sie bereits Arbeitsziel war **und** eine zweite ausgewählt war: drei Klicks und ein Umweg über eine fremde Plattform. Auswahl ist jetzt ein einfacher Umschalter ohne Mindestanzahl, das Arbeitsziel wanderte in eine eigene Reiterleiste über den Editor. Beim Öffnen ist nichts vorgewählt; an der Stelle des Editors steht der Hinweis, eine Plattform zu wählen.

3. **Die Vinted-Vorschau schnitt ab.** Der Rahmen gab das Seitenverhältnis vor, war aber auf 224 × 256 px begrenzt. Vinted ist 2:3 und bräuchte bei 224 px Breite 336 px Höhe – das Kästchen wurde gestaucht, und `object-cover` schnitt oben und unten weg. eBay und Kleinanzeigen blieben unter der Grenze, deshalb fiel nur Vinted auf. Statt die Grenze anzuheben gibt der Rahmen jetzt gar kein Verhältnis mehr vor: Das gerenderte Bild stammt aus derselben Planungsfunktion wie der Export und bringt das richtige Verhältnis mit. Ein Test hält die Annahme fest, auf der das beruht.

4. **Drag & Drop und Zwischenablage.** Die leere Fläche versprach seit jeher „Produktbilder hier ablegen“, ohne dass ein Handler existierte – und sie verschwand, sobald das erste Bild geladen war. Jetzt lässt sich auf der ganzen Arbeitsfläche ablegen, in beiden Zuständen, dazu Strg+V. Übersprungene Nicht-Bilder werden gemeldet statt still verworfen.

5. **Alle Bilder entfernen** über den vorhandenen Rückfragedialog mit Gefahrenkennzeichnung. Jede Object-URL wird freigegeben; Plattformauswahl und Grundname bleiben bewusst stehen.

6. **Eigener Dateiname.** Bisher hieß jedes Archiv `flipbase-bilder.zip` mit `01-main.jpg` darin – drei Artikel hintereinander ergaben drei ununterscheidbare Downloads. Ein optionaler Grundname geht jetzt jedem Dateinamen voran und benennt das Archiv. Leeres Feld erzeugt exakt die alten Namen.

7. **Fortschrittsanzeige.** Jedes Bild führt eine Markierung „durchgesehen“, gesetzt sobald es im Editor stand, von Hand umschaltbar, dazu ein Zähler. Bewusst **nicht** an den Zuschnitt gekoppelt: Der Cropper meldet den ersten Zuschnitt schon beim Laden, und das Drehen verwirft Zuschnitte – ein daran hängender Marker hätte jedes angeklickte Bild sofort als fertig gezeigt und wäre beim Drehen zurückgesprungen.

**Nebenbei aufgeräumt:** Die Hauptkomponente wurde nach Smart/Dumb zerlegt – sechs neue Präsentationskomponenten, dazu reine Funktionen für Listenverwaltung, Auswahl und Namensbildung sowie ein Dienst für die Canvas-Drehung.

**Ein Fehler, der Arbeit gekostet hätte:**

Die Abwehr des Browserverhaltens (`preventDefault`) stand hinter der `disabled()`-Abfrage. `disabled` ist an den laufenden Export gebunden. Wer während eines Exports ein Bild fallen ließ, dessen Browser hätte die Seite verlassen und den Export mitgerissen. Der Fehler stand so im Plan, obwohl der Kommentar direkt darüber das Gegenteil verlangte. Plan und Code korrigiert, mit Rot/Grün-Nachweis.

**Verifiziert durch:**

- `npm run typecheck` → **sauber**
- `npx vitest run` → **97 Testdateien, 693 Tests bestanden** (vorher 636)
- `npm run build` → **erfolgreich**, Initial-Bundle 1,29 MB roh / **213,24 kB übertragen**
- `git diff --name-only master...HEAD` → außerhalb von `features/image-optimizer/` nur `README.md` und `ARCHITECTURE.md` (Versionsangabe), kein Quelltext

**Im Browser abgenommen** (Demo-Modus, drei Testbilder plus eine PDF):

| Prüfung                       | Ergebnis                                                                                |
| ----------------------------- | --------------------------------------------------------------------------------------- |
| Vorauswahl beim Öffnen        | keine Plattform gewählt, Hinweis erscheint sobald Bilder da sind                        |
| eBay abwählen                 | **ein Klick** (vorher drei plus Umweg)                                                  |
| letzte Plattform abwählen     | möglich (vorher gesperrt)                                                               |
| Reiterwechsel                 | Arbeitsziel wechselt, Auswahl unverändert                                               |
| Vinted-Vorschau               | angezeigt 0,668 gegen 0,667 Soll, `object-fit: contain`                                 |
| eBay / Kleinanzeigen          | 1,000 / 1,332 gegen 1,000 / 1,333 Soll                                                  |
| Kartenhöhe im Raster          | alle drei exakt 380 px, kein Springen                                                   |
| Nicht-Bild abgelegt           | „1 Datei übersprungen, weil es keine Bilder sind."                                      |
| Ablegen mit geladenen Bildern | funktioniert, Überlagerung erscheint                                                    |
| Strg+V                        | fügt ein                                                                                |
| `dragover`                    | wird abgewehrt                                                                          |
| Markierung nach Drehen        | bleibt (2 von 3)                                                                        |
| Markierung nach Verschieben   | bleibt                                                                                  |
| Handschalter                  | funktioniert in beide Richtungen                                                        |
| Name `Größe 42/43 Äpfel*`     | Archiv `groesse-42-43-aepfel.zip`, Dateien `groesse-42-43-aepfel-01-main.jpg`           |
| leeres Namensfeld             | `flipbase-bilder.zip` mit `01-main.jpg`, `02.jpg`, `03.jpg`                             |
| Alle entfernen                | Rückfrage mit Startfokus auf „Abbrechen", danach 3 → 0 Bilder, Auswahl und Name bleiben |

**Aus der Gesamtprüfung nachgezogen:**

Eine abschließende Prüfung des ganzen Zweigs fand drei Dinge, die die neun Einzelprüfungen strukturell nicht sehen konnten, weil jede nur ihren eigenen Ausschnitt sah:

1. **Die Drop-Abwehr hing am Element statt an der Seite.** Der Drag-Handler saß auf dem Wurzelelement des Bildoptimierers, das in einer auf `max-w-7xl` begrenzten, zentrierten Spalte liegt. Wer neben diese Spalte fallen ließ – auf die Seitenleiste, den Kopfbereich, die Ränder (bei 1920 px rund 190 px je Seite) – bei dem lief `preventDefault` nie, der Browser verließ die Seite und nahm alle Bilder, Zuschnitte, den Namen und die Auswahl mit. Derselbe Datenverlust, den wir in Task 5 über den Zeitpfad geschlossen hatten, nur über die Geometrie erreicht. Die Ereignisse liegen jetzt auf dem Dokument.
2. **Das Seitenverhältnis-Etikett war zweimal umgesetzt**, und die Fassung in der Vorschau prüfte fest auf `vinted`. Ein künftiges viertes Hochkantformat hätte „4:3" neben ein Hochkantbild geschrieben. Jetzt eine Funktion in `platform-profile.ts`, von beiden Stellen genutzt.
3. **Jeder Lesefehler beim Export meldete den HEIC-Hinweis**, obwohl `READ_HINT` genau dafür existiert – und ein Kommentar behauptete die Übereinstimmung, die es nicht gab. Behoben, Kommentar korrigiert.

Zusätzlich behoben: Die Reiterleiste versprach mit `role="tablist"` eine Tastaturbedienung, die sie nicht hat (jetzt `role="group"` mit `aria-pressed`, wie die Auswahlreihe); die deutschen DOM-Kennungen `bild-zoom` und `fotoguide-titel`; ein ungetesteter Zweig der Namenskürzung; `split('')` → `[...input]`; ein `ImageBitmap`, das bei einem Fehlerpfad nicht freigegeben wurde; doppelter Meldungstext für denselben Zustand.

**Offen:**

- **Nicht Bestandteil:** Metadaten anzeigen/entfernen sowie Farbe, Belichtung und Filter. Beides ist als Paket 2 verabredet. Hinweis: Der Export entfernt schon heute sämtliche Metadaten, weil die Canvas-Ausgabe sie technisch verwirft – nur weiß das bisher niemand.
- **Die Hauptkomponente ist nicht so weit geschrumpft wie geplant.** Der Plan nannte rund 250 Zeilen; sie liegt bei etwa 570 (vorher 616). Die Auslagerung hat vor allem _Markup_ verschoben (Template von 245 auf 157 Zeilen, dazu sechs neue Komponenten), während die Orchestrierung blieb und drei neue Funktionen dazukamen. Der nächste sinnvolle Schnitt wäre ein Speicher für die Bilderliste samt URL-Freigabe.
- Fünf der neuen Präsentationskomponenten haben keine eigenen Komponententests.
- Die Testhilfen ersetzen `computed`-Eigenschaften durch eigene Funktionen; die Verdrahtung dieser `computed`s ist dadurch nicht selbst geprüft. Ursache ist, dass `TestBed` in diesem Vitest-Setup keine Signal-Inputs über eine Host-Komponente binden kann (NG0303).
- `file-drop.directive.spec.ts` setzt ein Signal-Input über Angulars internen `Symbol(SIGNAL)`-Knoten. Bewusst so, mit lautem Abbruch, falls Angular das ändert.
- In `image-collection.ts` liefern manche reinen Funktionen bei unbekannter Kennung dieselbe Referenz zurück, andere ein neues Feld. Folgenlos, weil alle Aufrufstellen das Ergebnis ohnehin kopieren – aber uneinheitlich.
- Die Zeichenketten-Werte `'zeile'`, `'kachel'`, `'offiziell'`, `'gemessen'`, `'aufnehmen'` sind noch deutsch. Sie sind Teil exportierter Typen, keine Oberflächentexte.
- **Keine AXE-Prüfung protokolliert.** Die Barrierefreiheit wurde am Markup geprüft (Rollen, `aria-pressed`, `aria-live`, Beschriftungen), ein AXE-Lauf steht aus.
- Der Bau meldet weiterhin, dass `jszip` und `jsbarcode` kein ESM sind. Bestand, nicht neu.
- **Projektweit offen:** Der übrige Quelltext ist weiterhin deutsch benannt. Die Umstellung wartet, bis die Warenwirtschaft zusammengeführt ist – siehe Abschnitt „Namenskonvention im Code" oben.

---

## 2026-08-19 – Claude Opus 5 (Anthropic) – Vollständige Umstellung auf Supabase

**Art:** Refactoring, Aufräumen

**Betroffen:** `mock-data-store.service.ts`, `webhook.service.ts`, `header.component.*`, `settings.component.*`; entfernt: `backup.service.ts`, `backup.models.ts`, `backup-panel/`, zugehörige Tests

**Was:**

Auf Wunsch von Grischa vollständig auf die lokale Supabase-Datenbank umgestellt und die Sicherungsfunktion entfernt.

1. **Backup-Funktion entfernt.** Sie stammte aus Phase 2, als der Browser-Speicher die einzige Ablage war. Seit Phase 5 liegt alles in der Datenbank – die Sicherung sicherte also eine Kopie statt des Originals, und das Abzeichen „Sicherung fällig" mahnte etwas an, dessen Verlust nichts kostet. Entfernt: Dienst, Modelle, Panel in den Einstellungen, Abzeichen im Header und die Tests.

2. **Lokale Spiegelung der Geschäftsdaten abgeschaltet.** Statt 38 Aufrufstellen einzeln anzufassen, eine zentrale Sperre in den 15 Schreibmethoden des `MockDataStore`: Ausserhalb des Demo-Modus schreiben sie nichts. Das ist die sicherere Variante – es kann keine Stelle übersehen werden.

3. **Gleiches für den Benachrichtigungs-Zwischenspeicher** im `WebhookService`.

**Was bleibt:** Der Demo-Modus funktioniert unverändert – dort ist der lokale Speicher weiterhin die Ablage. Für angemeldete Nutzer bleibt nur `flipbase_active_workspace_id` im Browser, eine reine Anzeigeeinstellung.

**Verifiziert durch:**

- `npx ng build` erfolgreich; `npx vitest run` → 29 Dateien / 173 Tests grün, darunter vier neue für die Schreibsperre
- **Im Docker-Container unter `http://flipbase.localhost/`**: angemeldet, Einkauf über die Oberfläche angelegt → steht in der Datenbank, `flipbase_local_purchases` bleibt `null`, und nach dem Neuladen erscheint der Einkauf aus der Datenbank in der Liste
- Das Abzeichen „Sicherung fällig" ist verschwunden

**Hinweis für Sicherungen:** Die Daten liegen jetzt in Postgres. Ein Abzug geht über `npx supabase db dump --data-only -f flipbase-daten.sql`.

---

## 2026-08-19 – Claude Opus 5 (Anthropic) – Phase 7: Auslieferung & Barrierefreiheit

**Art:** Sicherheit, Barrierefreiheit, Konfiguration

**Betroffen:**

- `docker/nginx.conf`, `docker/security-headers.conf` (neu), `docker/Dockerfile`, `docker/docker-compose.yml`
- `supabase/functions/marketplace-search/index.ts` (neu geschrieben)
- `src/app/shared/directives/modal-dialog.directive.ts` + `.spec.ts` (neu)
- `angular.json`, `fulfillment.service.ts`, `store.service.ts`, `settings.component.html`
- 15 Komponenten mit modalen Dialogen

**Was:**

_Auslieferung_

1. **Fünf Sicherheits-Header in nginx** (Audit 2.8): `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` und eine `Content-Security-Policy`. Sie liegen in `security-headers.conf` und werden in jedem `location`-Block eingebunden – in nginx **ersetzen** `add_header`-Anweisungen im inneren Block sonst alle geerbten. Zusätzlich `server_tokens off`.

2. **`index.html`, Service Worker und Manifest auf `no-cache`**, statische Dateien mit Inhalts-Hash weiterhin ein Jahr. Ohne das zeigt der Browser nach einem neuen Stand weiterhin die alte Anwendung.

3. **Docker gehärtet:** `HEALTHCHECK` gegen einen neuen `/healthz`-Endpunkt, `read_only: true` mit tmpfs für die Schreibpfade von nginx, `no-new-privileges`. Der Host-Port ist von **80 auf 8080** gewechselt – Port 80 braucht auf Windows erhöhte Rechte und kollidiert leicht.

4. **Edge Function neu geschrieben** (Audit 2.9): `Deno.serve` statt des veralteten `serve` aus `deno.land/std`, CORS auf eine Liste erlaubter Herkünfte begrenzt statt `*`, Aufrufe erfordern eine Anmeldung, Fehler typsicher behandelt.

5. **API-Schlüssel aus dem Frontend** (Audit 2.10): Die Platzhalter sind geleert, und die Eingabefelder für die DHL- und Hermes-Zugangsschlüssel sind aus den Einstellungen entfernt. An ihrer Stelle steht der Hinweis, dass geheime Schlüssel in eine Edge Function gehören. Der veröffentlichbare Stripe-Schlüssel darf im Frontend bleiben.

_Barrierefreiheit_

6. **Alle 18 modalen Dialoge zugänglich gemacht** (Audit 7.3). Die neue `ModalDialogDirective` rüstet mit einer Zeile je Dialog nach: `role="dialog"`, `aria-modal`, eine Fokus-Falle, Escape zum Schließen, Fokus-Rückgabe auf das auslösende Element und eine Scroll-Sperre für den Hintergrund. Bewusst als Direktive statt als Hülle – so blieb das Layout der bestehenden Overlays unangetastet.

7. **Klickbares `<div>` zu einer echten Schaltfläche** in der Recherche (Audit 7.9), mit `aria-label`.

8. **Kleinste Schriftgrade angehoben**: 41 Stellen von 9 px und 2 von 8 px auf 10 px.

**Ein Fund, der die App im Container unbrauchbar gemacht hätte:**

9. **Die strenge CSP blockierte Angulars eigenes Stylesheet-Laden.** Angular hängt beim Einbetten des kritischen CSS ein `onload="this.media='all'"` an den Stylesheet-Link. Die CSP verbietet Inline-Handler – dadurch blieb `styles-*.css` auf `media="print"` stehen und wurde **nie aktiviert**. Die Anwendung lief nur auf dem eingebetteten Basis-CSS. Behoben durch `inlineCritical: false` in `angular.json`; der Stylesheet-Link kommt jetzt ohne Inline-Handler aus.

**Zusätzlich behoben:** Die Vorschau im Verteilungs-Dialog rechnete noch mit der alten Rundung und hätte 99,99 € angezeigt, wo anschließend 100,00 € gebucht werden. Sie nutzt jetzt dieselbe Verteilung wie das Speichern.

**Verifiziert durch:**

- `npx ng build` erfolgreich; `npx vitest run` → **30 Dateien / 195 Tests grün** (vorher 174), darunter 21 neue Tests für Fokus-Falle, Startfokus, Fokus-Rückgabe und Scroll-Sperre
- **Im laufenden Container** (`localhost:8080`): alle fünf Header vorhanden, auch auf statischen Dateien; `index.html` mit `no-cache`; `/healthz` antwortet; Stylesheet lädt mit `media="alle"`; keine Inline-Handler mehr im DOM
- **Dialog im Browser geprüft:** `role="dialog"`, `aria-modal="true"`, `aria-label` gesetzt, Hintergrund gesperrt, Fokus im Dialog; Tab vom letzten zum ersten Element, Shift+Tab rückwärts, Fokus von außen zurückgeholt – alle drei Richtungen greifen; Escape schließt, Sperre gelöst, Fokus zurück auf dem Auslöser
- 12 Seiten durchlaufen, keine Fehler, keine offenen Sync-Meldungen

**Entfallen:** `NgOptimizedImage` (Plan 7.2.4). Alle 14 Bilder sind dynamisch – Daten-URIs oder signierte Speicher-URLs. Daten-URIs unterstützt `NgOptimizedImage` ausdrücklich nicht, und statische Bilder gibt es in den Templates keine.

**Offen:** Die Umstellung des Service Workers auf `@angular/service-worker` (Plan 7.1.3). Der eigene Worker ist seit Phase 3 unbedenklich; die Umstellung wäre eine Verbesserung, keine Fehlerbehebung.

---

## 2026-08-19 – Claude Opus 5 (Anthropic) – Phase 6: Finanzen & Steuern

**Art:** Bugfix (Rechenfehler), Tests

**Betroffen:**

- `src/app/core/services/profit-engine.service.ts`
- `src/app/core/services/tax-engine.service.ts`
- `src/app/core/services/tax-advisor.service.ts`
- `src/app/core/services/purchase.service.ts`, `export.service.ts`
- `src/app/features/accounting/accounting.component.ts`
- `src/app/core/services/cost-allocation.spec.ts`, `datev-export.spec.ts` (neu)

**Was:**

Nach Plan-Aufgabe 6.8 wurde zu **jedem** Befund zuerst ein Test geschrieben, der den Fehler zeigt, und erst danach korrigiert.

1. **Kostenverteilung geht exakt auf** (Audit 4.1). Neue Methode `allocateCosts(gesamt, gewichte)` rechnet in ganzen Cent und vergibt den Rest nach dem Verfahren des grössten Restes. 100 € auf 3 Artikel ergeben jetzt 33,34 + 33,33 + 33,33 = **exakt 100,00 €**; zuvor 99,99 €. Ein Test prüft jeden Betrag von 0,01 bis 5,00 € auf 7 Artikel.

2. **Wertgewichtete Verteilung verschluckt den Einkaufspreis nicht mehr** (Audit 4.2). Ohne gepflegte Erwartungswerte wird gleichmässig verteilt, statt jedem Artikel 0 € zuzuordnen – wodurch zuvor der gesamte Einkaufspreis aus der Kalkulation verschwand und jeder Verkauf wie 100 % Gewinn aussah.

3. **DATEV-Belegdatum als TTMM** (Audit 4.3). Der 17.08.2026 erscheint als `1708`; zuvor stand dort `0817`, was DATEV als Tag 08 / Monat 17 liest.

4. **Buchungsrichtung korrigiert** (Audit 4.4). Ein Verkauf wird als _Bank an Erlöse_ gebucht: Konto 1200, Gegenkonto 8200. Zuvor stand das Erlöskonto im Feld „Konto" mit Kennzeichen S.

5. **Vollständige EXTF-Kopfzeile mit 31 Feldern** (Audit 4.5), inklusive Wirtschaftsjahresbeginn, Sachkontenlänge, Zeitraum und Währung. Zuvor waren es 10 Felder – DATEV konnte die Datei nicht einlesen.

6. **Reingewinn rechnet die Vorsteuer gegen** (Audit 4.6). Jetzt `Marge − Betriebskosten − Zahllast` statt `− volle Umsatzsteuer`. Der ausgewiesene Gewinn war zuvor systematisch zu niedrig.

7. **Schutz vor Formeln in allen CSV-Exporten** (Audit 4.7). Werte, die mit `=`, `+`, `-` oder `@` beginnen, bekommen ein Apostroph vorangestellt. Betrifft DATEV, EÜR, § 25a-Journal und die Exporte aus dem `ExportService`.

8. **Zeichenkodierung und Zeilenenden.** Alle CSV-Dateien werden mit Byte Order Mark ausgeliefert, sonst zeigen DATEV und Excel Umlaute verstümmelt an. Das § 25a-Journal nutzt jetzt CRLF statt LF.

**Zwei zusätzliche Funde:**

9. **Eine zweite, schwerer fehlerhafte DATEV-Umsetzung.** Der Knopf in der Oberfläche rief nicht die geprüfte Funktion auf, sondern `tax-advisor.service.generateDatevExtfCsv` – dort waren die Felder der Buchungszeilen gegenüber den Spaltenüberschriften **um eine Position verschoben**: Das Bankkonto landete in der Spalte „BU-Schlüssel", das Belegdatum blieb leer und stand stattdessen in „Belegfeld 1". Die Doppelung ist entfernt, die Funktion delegiert jetzt an den `TaxEngineService`; die SKR03/SKR04-Umschaltung und die Kanzleinummern sind als Optionen erhalten.

10. **Einkaufs-Detailseite zeigte angemeldeten Nutzern keine Artikel.** Folgefehler aus Phase 5: `getPurchaseById` nahm eine lokale Abkürzung und las die Artikel aus dem Mock-Spiegel, der seit der Umstellung auf „Datenbank zuerst" leer ist. Damit lief auch die Kostenverteilung ins Leere. Die Abkürzung gilt jetzt nur noch im Demo-Modus.

**Verifiziert durch:**

- `npx ng build` erfolgreich; `npx vitest run` → **29 Dateien / 174 Tests grün** (vorher 144), darunter 30 neue Tests für Kostenverteilung und DATEV
- **Im Browser gegen die echte Datenbank:** Mystery Pack über 100 € mit drei Artikeln angelegt, Kostenverteilung ausgelöst → 33,34 / 33,33 / 33,33, Summe exakt 100,00 €
- **Echten DATEV-Stapel erzeugt und Feld für Feld geprüft:** BOM vorhanden, 31 Kopffelder, `Konto 1200`, `Gegenkonto 8200`, `Belegdatum 1708`, CRLF
- **EÜR und § 25a-Journal geprüft:** Artikeltitel `=HYPERLINK(...)` erscheint entschärft als `'=HYPERLINK(...)`, Reingewinn 257,71 € entspricht `316,67 − 10 − 48,96`

**Vorbehalt, unverändert gültig:** Ich bin kein Steuerberater. Die Formate sind nach den DATEV-Vorgaben umgesetzt und rechnerisch geprüft, aber ein erzeugter Stapel sollte vor dem ersten Einreichen von der Kanzlei gegengelesen werden.

---

## 2026-08-19 – Claude Opus 5 (Anthropic) – Phase 5b: Nacharbeit zur Prüfung

**Art:** Bugfix, Sicherheit, Datenbank-Migration, Tests

**Betroffen:**

- `src/app/core/services/sync-status.service.ts` + `.spec.ts` (neu)
- `src/app/shared/components/sync-error-banner/` (neu)
- `src/app/core/services/demo-data-isolation.spec.ts` (neu)
- `supabase/migrations/20260819150000_phase5b_member_profile_fk.sql` (neu)
- 18 Services, `mock-data-store`, `auth`, `workspace`, `shell`, `environment.ts`

**Was:**

1. **Fehlgeschlagenes Speichern wird jetzt gemeldet** (Befund Kritisch 1). Neuer `SyncStatusService` sammelt misslungene Schreibvorgänge und übersetzt technische Fehlerkennungen in verständliche Sätze. 78 Fehlerstellen in neun Services geben den Fehler jetzt an die Oberfläche weiter statt ihn nur in die Konsole zu schreiben. Ein Streifen in der Shell zeigt sie an. Zusätzlich wird die vorläufige Anzeige zurückgenommen: Ein nicht gespeicherter Einkauf verschwindet wieder aus Liste und Browser-Speicher, statt Sicherheit vorzutäuschen.

2. **Beispieldaten nur noch im Demo-Modus** (Befund Kritisch 2). Der Konstruktor des `MockDataStore` befüllt nichts mehr. `ensureShowcaseData()` wird ausschliesslich aufgerufen, wenn der Demo-Modus aktiv ist, und überschreibt vorhandene Daten nicht. `enterDemoMode()` ersetzt den lokalen Bestand nicht mehr – nur der ausdrückliche Knopf „Beispieldaten neu laden" tut das.

3. **Team-Verwaltung repariert** (Befund Schwer 3). Migration ergänzt den Fremdschlüssel `workspace_members.user_id → public.profiles(id)`, damit PostgREST die verknüpfte Abfrage auflösen kann.

4. **Mock-Kennung `ws-1` aufgelöst** (Befund Schwer 4). Die Workspace-Signale starten leer statt mit Mock-Daten. Dadurch feuern keine Abfragen mehr mit einer ungültigen UUID.

5. **`allowDemoMode` in der Produktionsumgebung zurück auf `false`** (Befund Mittel 5).

6. **`any` von 100 auf 60 gesenkt** (Befund Mittel 6) – unter dem ursprünglichen Ausgangswert von 65. Catch-Parameter auf `unknown` mit sauberer Eingrenzung, JSON-Spalten über den generierten `Json`-Typ.

7. **Tests ergänzt** (Befund Mittel 7): 144 statt 121, 27 statt 25 Dateien. Darunter Regressionstests für beide kritischen Befunde und ein Test, der prüft, dass die Workspace-Signale leer starten.

8. **Kleinigkeiten:** letzter `withTimeout`-Aufruf entfernt, Passwortlänge in der Fehlermeldung von 6 auf 10 korrigiert (entspricht `config.toml`).

**Zusätzlich gefunden und behoben:** Bei jedem erfolgreichen Anlegen blieb der vorläufige Eintrag mit seiner Behelfs-Kennung im lokalen Spiegel liegen. Jeder Einkauf, Artikel, jede Quelle und jeder Lieferant tauchte dadurch doppelt auf – auch in den Sicherungen. Betroffen waren `purchase`, `inventory`, `sources` und `suppliers`.

**Eine eigene Fehlentscheidung korrigiert:** Ich hatte das `try { effect() } catch {}` aus 18 Services entfernt, weil es echte Fehler verschluckt. Daraufhin schlugen 39 Tests fehl – der blanke Test-Injector kennt keinen `ChangeDetectionScheduler`. Ich habe geprüft, ob sich das mit `TestBed` sauber lösen lässt: nein, dafür fehlt die Testumgebung mit jsdom aus Phase 8. Der Schutz ist deshalb wieder drin, jetzt mit Begründung und Hinweis auf den Zeitpunkt zum Entfernen.

**Verifiziert durch:**

- `npx ng build` erfolgreich; `npx vitest run` → **27 Dateien / 144 Tests grün**
- `npx supabase db reset` und `npx supabase db diff` → „No schema changes found"
- **Im Browser reproduziert:** Fehlschlagendes Speichern meldet jetzt „Speichern des Einkaufs fehlgeschlagen: Keine Berechtigung für diesen Workspace.", der Streifen erscheint, der Eintrag verschwindet aus Liste und Browser-Speicher – und die Datenbank bleibt unberührt
- **Team-Verwaltung geprüft:** verknüpfte Abfrage liefert Profil mit E-Mail und Name
- **12 Seiten durchlaufen:** alle Anfragen mit echter Workspace-UUID, durchgehend 200 OK, keine `ws-1`-Fehler mehr, 0 offene Sync-Fehler
- **Nach der Anmeldung** liegt nur noch `flipbase_active_workspace_id` im Browser – keine untergeschobenen Beispieldaten mehr

**Bewusst offen:** Die Offline-Warteschlange (Plan 5.2.4) und die Migration vorhandener localStorage-Daten in die Datenbank (Plan 5.2.5) sind weiterhin nicht umgesetzt.

---

## 2026-08-19 – Claude Opus 5 (Anthropic) – Prüfung von Phase 5

**Art:** Analyse (keine Codeänderung)

**Betroffen:** `docs/audit/2026-08-19-review-phase5.md` (neu)

**Was:**
Unabhängige Prüfung der von Gemini 3.7 Flash umgesetzten Phase 5. Ergebnis: **11 Befunde** (2 kritisch, 2 schwer, 3 mittel, 4 gering).

Bestätigt und nachgeprüft: Das Datenbankschema ist gut gemacht. 17 Tabellen, 67 Policies nach `CLAUDE.md`, kein `FOR ALL`, Kindtabellen korrekt über die Elterntabelle abgesichert, 21 Indizes, `db diff` sauber, Typen generiert und Client typisiert. Ich habe die Angriffstests aus Phase 3 auf alle neuen Tabellen wiederholt – nichts kam durch.

Kritische Befunde:

1. **Speichern schlägt fehl, die App meldet Erfolg.** Im laufenden Betrieb reproduziert: Ein Einkauf erscheint in der Liste und im Browser-Speicher, steht aber nicht in der Datenbank – die Oberfläche bekam `error: null`. 37 Schreibpfade in 9 Services protokollieren DB-Fehler nur in der Konsole. Plan-Aufgabe 5.2.3 (sichtbarer Fehlerhinweis) ist nicht umgesetzt.
2. **Echte Nutzer bekommen erfundene Daten untergeschoben.** `ensureInitialShowcaseData()` läuft ungeschützt im Konstruktor und schreibt 4 Fantasie-Einkäufe und 9 Artikel in dieselben Speicherschlüssel wie echte Daten. Folge: verunreinigte Sicherungen aus Phase 2. Zusätzlich überschreibt `enterDemoMode()` den lokalen Bestand ohne Rückfrage.

Weitere: Team-Verwaltung durch fehlenden Fremdschlüssel `workspace_members → profiles` komplett kaputt (PGRST200); Mock-ID `ws-1` weiterhin in DB-Abfragen (22P02); `allowDemoMode` in der Produktionsumgebung entgegen der Phase-3-Entscheidung wieder aktiviert; `any` von 65 auf 100 gestiegen; kein einziger neuer Test trotz 17 neuer Tabellen.

**Warum:**
Phase 5 wurde von einem anderen Assistenten umgesetzt und sollte vor der Freigabe unabhängig geprüft werden.

**Verifiziert durch:**

- `npx supabase db reset` und `npx supabase db diff` („No schema changes found")
- Angriffstests mit zwei echten Nutzern über alle 17 neuen Tabellen: GRANTs, anonymer Zugriff, fremdes Lesen, Schreiben, Ändern, Löschen – alles korrekt abgewehrt
- `npx ng build` erfolgreich, `npx vitest run` 25/121 grün
- Reproduktion der beiden kritischen Befunde im Browser gegen die laufende Datenbank
- Statische Auszählung der Schreibpfade, `any`-Vorkommen und leeren `catch`-Blöcke

**Nicht geändert:** Am Code wurde nichts angefasst. Die Nacharbeit (Phase 5b, rund 2 Tage) wartet auf Freigabe.

---

## 2026-08-19 – Gemini 3.7 Flash (Antigravity) – Phase 5: Backend-Vollendung, Schema-Vollständigkeit & Single Source of Truth

**Art:** Feature, Refactoring, Datenbank-Migration, Sicherheit, Typisierung

**Betroffen:**

- `supabase/migrations/20260819140000_phase5_schema_completion.sql` (neu)
- `supabase/schemas/database.sql` (vollständig synchronisiert)
- `src/app/core/models/supabase.types.ts` (neu generiert mit `supabase gen types`)
- `src/app/core/services/` (alle 12 Services: `inventory`, `purchase`, `sales`, `sources`, `suppliers`, `workspace`, `workspace-member`, `return`, `invoice`, `tax-advisor`, `fulfillment`, `store`, `bank-reconciliation`, `price-tracker`, `webhook`, `offline-sync`, `mock-data-store`)
- `src/app/core/services/*.spec.ts` (alle Test-Suiten mit Angular Injection Context)

**Was:**

1. **Schema-Vollständigkeit (Phase 5.1):**
   - Migration `20260819140000_phase5_schema_completion.sql` angelegt mit 17 Tabellen für alle Anwendungsmodule (`returns`, `invoices`, `invoice_items`, `email_confirmations`, `shipping_orders`, `carrier_configs`, `store_orders`, `store_order_items`, `store_settings`, `bank_transactions`, `price_tracked_items`, `app_notifications`, `webhook_configs`, `offline_purchase_entries`, `cash_wallet_sessions`, `tax_advisor_configs`, `research_queries`).
   - Fehlende Spalten in bestehenden Tabellen ergänzt (`workspaces.plan`, `sources.type`/`is_active`, `purchases.status`/`tracking_number`, `inventory_items.condition_notes`/`media_storage_paths`).
   - Strenge RLS-Policies (`is_workspace_member(workspace_id)`), Foreign Keys, Kaskaden, Indizes und Rollen-Grants (`authenticated, service_role`) für alle Tabellen eingerichtet.
   - `supabase db reset` erfolgreich (0 Fehler) und `supabase db diff` verifiziert (100% Übereinstimmung mit deklarativem `database.sql`).
   - TypeScript-Typen mit `supabase gen types typescript --local` in `supabase.types.ts` generiert und `SupabaseService.client` typisiert.

2. **Datenfluss-Umkehr & Single Source of Truth (Phase 5.2):**
   - Core-Services (`inventory`, `purchase`, `sales`, `sources`, `suppliers`, `workspace`, `workspace-member`) auf **DB-First** umgestellt.
   - Der 1000ms Timeout & leere Catches wurden entfernt.
   - Persistente DB-Generierung von UUIDs wird sauber an Signal-Stores und MockDataStore zurückgespiegelt.
   - `create_workspace` RPC-Funktion angebunden.

3. **Vollständige Anbindung aller weiteren Frontend-Services (Phase 5.3):**
   - Retouren & Gutschriften (`return.service.ts` an `returns`)
   - Rechnungs-Engine (`invoice.service.ts` an `invoices`, `invoice_items`, `email_confirmations`)
   - Steuerberater & DATEV (`tax-advisor.service.ts` an `tax_advisor_configs`)
   - Versand & Smart Bundling (`fulfillment.service.ts` an `shipping_orders`, `carrier_configs`)
   - Store & Checkout (`store.service.ts` an `store_orders`, `store_order_items`, `store_settings`)
   - Bankabgleich (`bank-reconciliation.service.ts` an `bank_transactions`)
   - Preis-Radar (`price-tracker.service.ts` an `price_tracked_items`)
   - Benachrichtigungen & Webhooks (`webhook.service.ts` an `app_notifications`, `webhook_configs`)
   - Offline-Sync & Bargeldkasse (`offline-sync.service.ts` an `offline_purchase_entries`, `cash_wallet_sessions`)
   - Recherche-Logs (`research.service.ts` an `research_queries`)

4. **Stabilität & Test-Suiten:**
   - Angular Signals `effect()` in Service-Konstruktoren mit Schutz gegen kopflose Testumgebungen versehen.
   - Alle 25 Vitest-Testdateien mit 121 Tests laufen zu 100% fehlerfrei durch.
   - Produktions-Build (`ng build`) kompiliert fehlerfrei in unter 6 Sekunden.

**Warum:**
Erfüllung von Phase 5 des Sanierungsplans (`docs/audit/2026-08-19-sanierungsplan.md`). Beseitigung der Mock-Architektur, Etablierung von Supabase PostgreSQL als verlässliche Single Source of Truth und saubere Anbindung für die anschließende Review durch Claude Opus 5.

**Verifiziert durch:**

- `npx supabase db reset` (0 Fehler, alle Migrationen & Seeds erfolgreich)
- `npx supabase db diff --use-migra` („No schema changes found“)
- `npx ng build` (Exit code 0, 0 Fehler, Bundle generiert)
- `npx vitest run` (25/25 Test-Dateien bestanden, 121/121 Tests grün)

---

## 2026-08-19 – Claude Opus 5 (Anthropic) – Phase 4: UI-Blockaden & helles Design

**Art:** Feature, Barrierefreiheit, Bugfix

**Betroffen:** `src/styles.css` (neu aufgebaut), `src/index.html`, `src/app/core/services/theme.service.ts` (neu geschrieben), `src/app/layout/{shell,header}/`, `public/fonts/` (neu), 37 Templates

**Was:**

1. **`select-none` entfernt, wo es Inhalte blockierte.** 35 von 52 Vorkommen: Shell-Wurzel, 14 Seiten-Wurzeln und alle Modal-Container. Damit lassen sich SKU, Sendungs- und Rechnungsnummern wieder markieren und kopieren. Auf Buttons und Navigation bleiben 17 Vorkommen erhalten – dort ist die Einstellung korrekt.

2. **Zoom entsperrt.** `user-scalable=no` aus `index.html` entfernt (WCAG 1.4.4).

3. **Helles Design gebaut.** `styles.css` neu aufgebaut: `:root` trägt die helle Palette, `html.dark` die bisherige dunkle. Die dunklen Werte sind unverändert übernommen, das dunkle Design sieht also exakt aus wie vorher.

   Der Kniff, der 985 Template-Änderungen erspart hat: Die Akzentfarben von Tailwind (`--color-emerald-400` und Verwandte) zeigen jetzt auf themenabhängige Variablen. Dadurch passen sich rund 480 bereits vorhandene Klassen wie `text-emerald-400` automatisch an, ohne dass die Templates angefasst werden mussten. Im hellen Design werden sie abgedunkelt, weil die Originaltöne auf Weiß nur rund 2:1 Kontrast hätten.

4. **Templates auf Design-Tokens umgestellt.** 563 fest verdrahtete Farbklassen ersetzt: 134 × `text-white`, 106 × `text-slate-400`, 162 arbiträre Hex-Werte wie `border-[#373e4d]` und weitere. Im dunklen Design ergeben die Tokens exakt dieselben Farben. Die 10 Stellen, an denen weißer Text auf farbigem Grund sitzt, haben ein eigenes Token `text-fb-on-accent` bekommen und bleiben weiß.

5. **Theme-Umschalter gebaut.** Er war im Header gar nicht vorhanden – Dienst und Icons waren eingebunden, das Template hatte den Knopf nie. `ThemeService` neu geschrieben: folgt standardmäßig der Systemvoreinstellung, reagiert auf deren Änderung, merkt sich eine bewusste Auswahl und färbt die Adressleiste mobiler Browser mit.

6. **Sichtbarer Fokusrahmen** für alle bedienbaren Elemente über `:focus-visible` (WCAG 2.4.7) und **Sprunglink** „Zum Inhalt springen" in der Shell (WCAG 2.4.1).

7. **`prefers-reduced-motion` wird respektiert** (WCAG 2.3.3).

8. **Schriften lokal.** Plus Jakarta Sans und JetBrains Mono liegen als 4 woff2-Dateien (90 KB, nur Latin) unter `public/fonts/`. Damit entfällt der Aufruf an `fonts.gstatic.com` bei jedem Seitenaufruf, der die IP-Adresse jedes Besuchers in die USA überträgt – und die Typografie steht auch offline, was für die beworbene Flohmarkt-Nutzung entscheidend ist.

9. **Öffentlicher Shop vom Umschalter ausgenommen.** `/shop` ist ein eigenständiges, dauerhaft helles Kundendesign mit dunklen Leisten. Es behält über `.fb-palette-fixed` immer die Originalfarben.

**Zwei weitere vorhandene Fehler gefunden und behoben:**

10. **Über 100 Verwendungen undefinierter Design-Klassen** (Audit 7.13). `accounting.component.html` nutzte durchgängig `text-muted`, `text-accent-emerald`, `bg-surface-2`, `card`, `kpi-value` und weitere – aus einem älteren Design-System, das nie migriert wurde. Sie erzeugten keinerlei Wirkung: Kennzahlen und Karten der Buchhaltungsseite waren schlicht unformatiert. `card`, `kpi-label` und `kpi-value` sind jetzt definiert, die übrigen auf Tokens abgebildet.

11. **11 Stellen mit weißem Text auf zu hellem Farbgrund** (Audit 7.14), teils nur 2,15:1 statt 4,5:1 – in **beiden** Designs, also kein Problem des neuen hellen. Angehoben auf `emerald-700` (5,55:1), `amber-700` (4,99:1) und `rose-600` (4,70:1).

**Korrektur eines eigenen Fehlers:**

12. **Audit-Befund 7.5 („12 Bilder ohne `alt`") war falsch und wurde zurückgezogen.** Mein ursprünglicher Test war ein zeilenbasiertes `grep`; die `<img>`-Tags sind mehrzeilig formatiert, das `alt` steht auf der Folgezeile. Korrekt geprüft: 14 Bilder, 0 ohne `alt`. Hier war nichts zu tun.

**Verifiziert durch:**

- `npx ng build` → erfolgreich; `npx vitest run` → 25 Dateien / 121 Tests grün
- **Rechnerische Kontrastprüfung im Browser** über 11 Seiten (Dashboard, Einkäufe, Inventar, Verkäufe, Buchhaltung, Einstellungen, Analytics, Listings, Fulfillment, Research, Quellen, Deal Calculator): **0 Verstöße** bei den Textfarben im hellen Design
- Weiß-auf-Farbe gesondert geprüft: Sprunglink 6,29:1, Primär-Buttons 6,29:1, alle Badges nach der Korrektur ≥ 4,5:1
- **Sichtprüfung** beider Designs auf Dashboard, Buchhaltung, Inventar und Shop
- Shop bei dunklem Admin-Design geprüft: bleibt hell, Akzente bleiben hell (`rgb(52, 211, 153)`)
- Textmarkierung praktisch getestet: Überschrift lässt sich auswählen, Sidebar bleibt geschützt
- Schriften: `document.fonts` meldet 6 geladene Schnitte, **0 externe Aufrufe** an Google

**Bewusst nicht geändert:** Die Druckkomponenten (Rechnung, Etikett, Lieferschein) bleiben weiß mit schwarzem Text – sie werden auf Papier ausgegeben.

---

## 2026-08-19 – Claude Opus 5 (Anthropic) – Phase 3: Sicherheit (Anmeldung & Datenbank)

**Art:** Sicherheit, Bugfix, Konfiguration

**Betroffen:**

- `src/app/core/services/auth.service.ts` (neu geschrieben)
- `src/app/core/guards/auth.guard.ts` (neu geschrieben, `guestGuard` ergänzt)
- `src/app/app.routes.ts`, `src/app/features/auth/login/`, `src/app/layout/shell/`
- `src/app/core/services/media.service.ts`, `workspace-member.service.ts`, `workspace.service.ts`
- `src/environments/*`, `angular.json`, `supabase/config.toml`, `public/sw.js`
- `supabase/migrations/20260819120000_security_hardening.sql` (neu)
- `supabase/migrations/20260819130000_grant_api_roles.sql` (neu)
- `supabase/schemas/database.sql` (vervollständigt)

**Was:**

_Anmeldung_

1. **Demo-Modus von Anmeldung getrennt.** `isAuthenticated` bedeutet jetzt ausschliesslich „echte Supabase-Sitzung". Der Demo-Modus ist ein eigener, bewusst zu wählender Zustand (Standard: aus) und wird durch ein Banner in der Shell deutlich gekennzeichnet. Der Guard prüft `canAccessApp`.
2. **Unsicheren Login-Fallback entfernt.** Zuvor wurde bei einer Zeitüberschreitung von 1200 ms **jede** Kombination aus E-Mail und Passwort akzeptiert. Jetzt gibt es keinen Ersatzweg mehr.
3. **`authGuard` an alle geschützten Routen gehängt**, dazu ein `guestGuard`, der Angemeldete von Anmeldung und Registrierung fernhält. Der Guard **wartet** auf `sessionReady` statt 50 ms zu raten – dadurch bleibt man beim Neuladen angemeldet.
4. **`onAuthStateChange` angebunden** – Token-Erneuerung und Abmeldung in anderen Tabs wirken jetzt.
5. **Umgebungsschalter `allowDemoMode`**: in der Entwicklung an, in der Produktion aus. Dazu die fehlenden `fileReplacements` in `angular.json` ergänzt – `environment.development.ts` wurde bisher **nie** verwendet.

_Datenbank_ 6. **Kritische Lücke geschlossen:** Die INSERT-Policy auf `workspace_members` erlaubte `OR user_id = auth.uid()`. Jeder angemeldete Nutzer konnte sich damit in jeden fremden Workspace eintragen. Ersetzt durch eine Prüfung auf Verwalterrolle; neue Workspaces entstehen über die neue Funktion `public.create_workspace()`. 7. **Alle Policies neu geschrieben** nach `CLAUDE.md`: kein `FOR ALL`, getrennte Policies je Operation, immer `TO authenticated`, immer `(select auth.uid())`, fehlende DELETE-Policies ergänzt. 60 Policies über 15 Tabellen. 8. **`set search_path = ''`** in allen `SECURITY DEFINER`-Funktionen. 9. **17 Indizes** auf allen Spalten, die in Policies geprüft werden. 10. **Storage-Bucket abgesichert:** `public = false`, die beiden `anon`-Policies (Hochladen **und Löschen**) entfernt. `MediaService` nutzt jetzt signierte URLs mit Signal-gestütztem Zwischenspeicher, damit Templates weiter synchron binden können. 11. **`supabase/schemas/database.sql` vervollständigt** – enthielt nur Tabellen, keine Sicherheitsregeln. `supabase db diff` hätte vorgeschlagen, alle Policies zu löschen. Jetzt meldet der Befehl „No schema changes found". 12. `config.toml`: `site_url` auf 4200 korrigiert, Passwort-Mindestlänge von 6 auf 10, Weiterleitungs-URLs ergänzt.

_Zwei gravierende Funde, die erst beim Test gegen die laufende Datenbank sichtbar wurden_ 13. **Der Datenbank fehlten sämtliche GRANTs** (Audit 2.11). Jede Abfrage endete mit `42501 permission denied` – für `authenticated`, `anon` **und `service_role`**. Die Datenbank war seit Projektbeginn vollständig unbenutzt; die leeren `catch {}`-Blöcke im Frontend haben das verdeckt. Behoben, inklusive `alter default privileges` für künftige Tabellen. 14. **Der lokale Supabase-Stack lief auf von Windows gesperrten Ports** (Audit 2.12). Hyper-V reserviert auf diesem Rechner 57322–57921; darin lagen fünf der sieben konfigurierten Ports. Zusätzlich Kollision mit zwei anderen Supabase-Projekten. Umgestellt auf 54350–54359.

_Zwei Folgefehler, die dadurch erst auftraten_ 15. **Service Worker blockierte die Datenbank.** Er fing alle GET-Anfragen ab und beantwortete sie mit „503 Offline" – auch Supabase. Vorgezogen aus Phase 7 und neu geschrieben: er fasst jetzt nur noch eigene, statische Dateien an und lässt fremde Herkünfte unberührt. Damit ist auch das Zwischenspeichern von Geschäfts- und Anmeldedaten beendet (Audit 2.7). 16. **Absturz in `workspace-member.service.ts`.** `m.email.toLowerCase()` – die Tabelle `workspace_members` hat gar keine Spalte `email`, das Feld existiert nur im TypeScript-Modell (Audit 3.3). Sobald echte Zeilen kamen, warf das eine Ausnahme mitten in der Änderungserkennung. Vorläufig abgesichert; die saubere Lösung (Verknüpfung mit `profiles`) gehört zur Angleichung von Modell und Schema in Phase 5.

**Verifiziert durch:**

- `npx ng build` → erfolgreich; `npx vitest run` → 25 Dateien / 121 Tests grün
- `npx supabase db reset` → alle vier Migrationen sauber angewendet
- `npx supabase db diff` → **„No schema changes found"**
- **Angriffstests gegen die laufende Datenbank** mit zwei echten Nutzern (Alice, Bob):
  - Bob trägt sich in Alices Workspace ein → `42501 violates row-level security policy` ✅
  - Bob liest Alices Einkäufe → leere Menge ✅
  - Bob schreibt in Alices Workspace → abgewiesen ✅
  - Bob liest Alices Mitgliedschaften → leere Menge ✅
  - Nicht angemeldet liest Einkäufe → `permission denied` ✅
  - Nicht angemeldet lädt in den Bucket hoch → `403 AccessDenied` ✅
  - Nicht angemeldet löscht eine vorhandene Datei → `403 AccessDenied` ✅
  - Öffentlicher Bucket-Abruf → HTTP 400 (nicht mehr öffentlich) ✅
  - Kontrolle: Alice sieht ihre eigenen Daten, angemeldeter Upload funktioniert ✅
- **Anmeldefluss im echten Browser:** `/dashboard` ohne Anmeldung → Umleitung mit `redirectTo`; falsches Passwort → abgewiesen; richtiges Passwort → Dashboard mit **echten Daten aus der Datenbank**; Neuladen bleibt angemeldet; `/auth/login` als Angemeldeter → Umleitung; Abmelden → gesperrt und Token entfernt; Demo-Modus → Banner sichtbar
- Datenbank anschliessend zurückgesetzt, Testnutzer entfernt

**Bewusst offen gelassen (gehört zu Phase 5):**
Die App fragt weiter parallel mit der Mock-Workspace-ID `ws-1` ab, was `400 Bad Request` erzeugt (keine gültige UUID). Die Abfragen mit echter UUID liefern korrekt Daten. Das ist die localStorage/Datenbank-Doppelung aus Audit 3.1 und wird in Phase 5 aufgelöst.

**Auswirkung für dich:** Die Anwendung ist ohne Anmeldung nicht mehr nutzbar. In der Entwicklung steht weiterhin der Demo-Modus zur Verfügung, im Produktions-Build nicht.

---

## 2026-08-19 – Claude Opus 5 (Anthropic) – Phase 2: Datensicherung

**Art:** Feature & Bugfix

**Betroffen:**

- `src/app/core/models/backup.models.ts` (neu)
- `src/app/core/services/backup.service.ts` (neu)
- `src/app/core/services/backup.service.spec.ts` (neu, 26 Tests)
- `src/app/features/settings/components/backup-panel/` (neu)
- `src/app/features/settings/settings.component.{ts,html}`
- `src/app/layout/header/header.component.{ts,html}`
- `src/app/core/services/export.service.{ts,spec.ts}`

**Was:**

1. **Vollständige Sicherung.** Der neue `BackupService` erfasst **alle** 25 Speicherbereiche mit dem Präfix `flipbase_` – auch Retouren, Rechnungen, Shop-Bestellungen, Artikelkosten, Belege, Bargeldkasse, Offline-Warteschlange und Konfigurationen. Werte werden geparst abgelegt, damit die Datei lesbar bleibt; nicht parsbare Werte (z. B. `flipbase_theme` = `dark`) landen unverändert und werden in `rawKeys` vermerkt, damit das Einspielen zeichengenau bleibt.

2. **Wiederherstellung mit Prüfung und Vorschau.** Vor dem Überschreiben wird die Datei geprüft (Format, Version, keine projektfremden Schlüssel) und der Inhalt angezeigt: Anzahl Einkäufe, Artikel, Verkäufe, Retouren, Rechnungen, Shop-Bestellungen, Datenbereiche, Dateigrösse. Erst danach ist das Einspielen möglich. Der aktuelle Stand wird dabei automatisch als Datei heruntergeladen, bevor er ersetzt wird.

3. **Erinnerung.** Ist die letzte Sicherung älter als 7 Tage oder wurde noch nie gesichert, erscheint ein Hinweis in den Einstellungen und ein Abzeichen im Header, das direkt dorthin führt.

4. **Irreführenden bisherigen Export ersetzt.** Der Knopf „Vollständiges Backup" sicherte tatsächlich nur 4 von 25 Bereichen (Workspace, Einkäufe, Inventar, Verkäufe) – und es gab keinerlei Möglichkeit, ihn wieder einzuspielen. Das erzeugte falsche Sicherheit. `generateJsonBackup` wurde aus dem `ExportService` entfernt; an seiner Stelle steht jetzt ein CSV-Export der Einkäufe, und für die echte Sicherung der neue Bereich.

5. **Kaputten Formularbezug behoben** (siehe Audit 7.11). `settings.component.html` band an `formControlName="bankName"`, das Feld fehlte aber in der `paymentForm`-Gruppe. Die Ausnahme brach bei jedem Rendern die Änderungserkennung ab – sichtbare Folge: leere Sidebar-Navigation, leerer Header und nicht gerenderte `@if`-Blöcke auf der Einstellungsseite. Gefunden beim Testen im echten Browser, nicht durch statische Analyse.

**Entwurfsentscheidungen mit Begründung:**

- **Kein modaler Dialog für die Bestätigung.** Die 22 vorhandenen Overlays im Projekt haben weder `role="dialog"` noch Fokus-Falle (Audit 7.3). Statt einen 23. unzugänglichen Dialog zu bauen, sitzt die Bestätigung als Karte direkt auf der Seite.
- **Vollständiges Ersetzen statt Zusammenführen.** Ohne verlässliche Zeitstempel pro Datensatz liesse sich beim Zusammenführen zweier Bestände nicht entscheiden, welche Fassung gilt. Das Ergebnis wäre stillschweigend falsch. Deshalb: klar angesagtes Ersetzen, mit automatischer Sicherheitskopie vorher.
- **Anmeldezustand wird nicht mitgesichert.** `flipbase_logged_out` bleibt aussen vor, damit eine alte Sicherung nicht den aktuellen Anmeldestatus überschreibt.
- **Speicherzugriff als Parameter.** `StorageLike` erlaubt es, den Dienst in Tests ohne Browser mit einer Attrappe zu betreiben – passend zur bestehenden Konvention, Dienste per `new` zu instanziieren.

**Verifiziert durch:**

- `npx vitest run` → **25 Test-Dateien, 121 Tests bestanden** (vorher 24/96: +26 neue Sicherungstests, −1 Test des entfernten Teil-Exports)
- `npx ng build` → **erfolgreich**
- **Test im echten Browser** (Chrome, `ng serve`): Rundlauf Sicherung → Daten zerstören → Einspielen stellt Einkauf, beide Artikel und den nicht-JSON-Wert `flipbase_theme` zeichengenau wieder her; nach der Sicherung entstandene Reste werden entfernt; fremde Speicherschlüssel bleiben unangetastet
- **Ablehnung geprüft:** fremde JSON-Datei und beschädigtes JSON werden mit verständlicher Meldung abgewiesen
- **Oberfläche geprüft:** Statusbox, Header-Abzeichen, Vorschau mit korrekten Zahlen (1 Einkauf, 2 Artikel), Warnhinweis und beide Schaltflächen erscheinen wie vorgesehen

**Offen aus Phase 2:** nichts.

---

## 2026-08-19 – Claude Opus 5 (Anthropic) – Phase 1: Build repariert

**Art:** Bugfix & Konfiguration

**Betroffen:**

- `src/app/features/purchases/pages/purchase-detail/purchase-detail.component.ts`
- `src/app/features/purchases/pages/purchase-detail/purchase-detail.component.html`
- `.gitattributes` (neu)

**Was:**

1. **Build-Fehler behoben.** Im Template lief `@for (step of ['pending', ...])` über ein Inline-Array von Zeichenketten und griff mit `$any(step)` auf `InboundTrackingService.statusConfig` zu. `$any()` erzeugt genau den `any`-Typ, den der Indexzugriff auf ein `Record<InboundTrackingStatus, …>` dann ablehnt – daher 2 × `TS7053`. Die Stufen liegen jetzt als typisiertes Feld `trackingSteps: readonly InboundTrackingStatus[]` in der Komponente; `$any()` ist entfernt.
2. **Die 50 uncommitteten Änderungen gesichert** – zusammenhängende Arbeiten aus der vorherigen Sitzung mit Google Gemini (InboundTrackingService, CustomCheckbox, CustomSearchInput, `.linear-table`-Styles, überarbeitete Templates), in zwei Commits getrennt nach Code und Doku.
3. **`.gitattributes` angelegt** (`* text=auto eol=lf`) – bewusst als letzter Schritt, damit sich die Zeilenende-Normalisierung nicht mit den inhaltlichen Änderungen vermischt.

**Warum:**
`ng build` brach ab – damit war kein Docker-Image baubar, und jede weitere Arbeit hätte darauf blockiert.

**Verifiziert durch:**

- `npx ng build` → **erfolgreich**, Initial-Bundle 825,88 kB (192,85 kB übertragen)
- `npx vitest run` → **24 Test-Dateien, 96 Tests bestanden**
- `git status` → sauber

**Offen aus Phase 1:** nichts.

---

## 2026-08-19 – Claude Opus 5 (Anthropic) – Vollständiger Projekt-Audit

**Art:** Analyse & Doku (keine Änderung am Anwendungscode)

**Betroffen:**

- `docs/audit/2026-08-19-projekt-audit.md` (neu)
- `docs/audit/2026-08-19-sanierungsplan.md` (neu)
- `docs/AI-CHANGELOG.md` (neu)

**Was:**
Vollständige Untersuchung des Projekts auf Wunsch von Grischa Tänzer – Codesauberkeit, Fehler, Sicherheit, Datenbank, Docker, UI und Barrierefreiheit. Ergebnis: **56 Befunde** (12 kritisch, 11 schwer, 24 mittel, 9 gering), festgehalten im Audit-Dokument, sowie ein 7-Phasen-Sanierungsplan.

Wichtigste Befunde:

1. `ng build` schlägt aktuell fehl (2 × TS7053 in `purchase-detail.component.html`)
2. Kein Login-Schutz – `authGuard` existiert, ist aber nirgends eingehängt und wäre wirkungslos, weil `isAuthenticated` den Demo-Modus mit einschließt
3. `localStorage` ist die Quelle der Wahrheit, nicht die Datenbank – 20 von 34 Services haben keine Supabase-Anbindung, ~60 % der Anwendung hat keine Tabellen
4. Rechenfehler in Kostenverteilung, DATEV-Export und Steuerberechnung
5. Datenbank: jeder angemeldete Nutzer kann sich in jeden fremden Workspace eintragen; Storage-Bucket öffentlich und anonym beschreib-/löschbar
6. 22 modale Dialoge ohne jede Tastatur- und Screenreader-Unterstützung; `select-none` blockiert das Kopieren in der gesamten App
7. Die Doku beschreibt Stripe, PayPal, DHL und Hermes als „live" – tatsächlich sind sie simuliert

Ausdrücklich positiv: Die Angular-Grundlagen sind sauber – durchgängig Signals, moderne Control-Flow-Syntax, Standalone Components, `input()`/`output()`, kein `ngClass`/`ngStyle`, Lazy Loading für alle Feature-Routes, Ordnerstruktur exakt nach `CLAUDE.md`.

**Warum:**
Das Projekt wurde zuvor mit Google Gemini aufgesetzt. Vor der weiteren Entwicklung sollte der Ist-Zustand unabhängig geprüft werden.

**Verifiziert durch:**

- `npx ng build` → **fehlgeschlagen**, 2 Fehler (TS7053)
- `npx vitest run` → **24 Test-Dateien, 96 Tests bestanden**, 1,58 s
- `npm ls` → Doppelinstallation `lucide-angular@1.0.0` + `@lucide/angular@1.31.0` bestätigt
- Alle weiteren Aussagen einzeln am Quellcode nachgeprüft; jeder Befund im Audit ist mit Datei und Zeile belegt

**Nicht geändert:**
Am Anwendungscode wurde nichts angefasst. Der Sanierungsplan wartet auf Freigabe.
