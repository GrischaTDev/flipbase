# Demo-Modus entfernen

Stand: 18.09.2026 · Zweig `chore/remove-demo-mode`

## Ziel

Flipbase pflegt heute jede Funktion zweimal: einmal gegen die echte Datenbank und
einmal gegen eine Nachbildung im Browser, den Demo-Modus. Kunden sehen ihn nie, denn
in `src/environments/environment.ts` gilt `allowDemoMode: false`. Er dient nur der
Entwicklung und den Browser-Tests. Jede neue Funktion braucht trotzdem einen
Demo-Zweig und Demo-Tests. Das kostet Zeit und KI-Kontingent.

Der Demo-Modus wird vollständig entfernt. Wer die App später ausprobieren will,
bekommt einen 14-Tage-Testzugang mit echtem Konto. Der ist nicht Teil dieses Projekts.

## Ausgangslage (gemessen am 18.09.2026)

- `src/app/core/services/mock-data-store.service.ts`: rund 2.550 Zeilen. Die Datei
  bildet Einkäufe, Kostenverteilung, Wareneingang, Verkäufe, Retouren, Lager,
  Kategorien, Marken und Medien im Browser-Speicher nach.
- Rund 185 `isDemoMode()`-Weichen in 46 App-Dateien, rund 57 Testdateien mit
  Demo-Bezug.
- 28 von 30 Playwright-Dateien mit zusammen rund 95 Tests starten über
  `e2e/support/demo.ts` den Demo-Modus, darunter alle sechs Pflichttests aus
  `playwright.pr.config.ts` (zwei `@core-smoke`-Fälle und die vier benannten
  `@pr-smoke`-Fälle). Rund zwölf Dateien hängen fest an Demo-Daten: Sie schreiben
  `flipbase_local_*` direkt in den Browser-Speicher, nutzen Demo-Kennungen wie
  `pur-demo-4` oder setzen gefüllte Tabellen voraus.
- Jeder Bereich hat einen echten Datenbankweg. Die Ersatz-Datenbank wird außerhalb des
  Demo-Modus nicht genutzt; `saveItem` und Co. tun dort nichts.
- Die Entwicklungsumgebung (`environment.development.ts`) nutzt die lokale Supabase
  unter `http://127.0.0.1:54351`.
- Bei der Registrierung legt der Trigger `handle_new_user()` automatisch Profil,
  Workspace und Mitgliedschaft an. Lokal ist die E-Mail-Bestätigung aus.
- Die lokale Anmeldung erlaubt höchstens 30 Registrierungen und Anmeldungen je
  5 Minuten und Adresse (`[auth.rate_limit] sign_in_sign_ups = 30`).
- `supabase/seed.sql` ist heute leer. Weder die Veröffentlichung (`deploy/`) noch das
  Migrationspaket nutzen die Datei.
- Die aktive Workspace-Wahl steht im Browser unter `flipbase_active_workspace_id`.

## Entscheidungen des Nutzers

| Frage                          | Entscheidung                                                                                  |
| ------------------------------ | --------------------------------------------------------------------------------------------- |
| Demo-Modus behalten?           | Nein, komplett entfernen                                                                      |
| Lokale Anmeldung danach        | Testkonto mit Beispieldaten, automatisch angelegt                                             |
| Vorgehen                       | Zwei PRs: erst Browser-Tests umstellen, dann Demo-Code löschen                                |
| Umgang mit bestehenden Tests   | Pflichttests und Tests ohne Datenbedarf umstellen, fest an Demo-Daten gebundene Tests löschen |
| Testlauf und Anmeldebegrenzung | Ein Konto je Testlauf, ein frischer Workspace je Test                                         |

Nicht betroffen ist das „Demo“-Schild am Online-Shop in der Seitenleiste
(`WorkspaceNavigationItem.demo`). Es markiert eine unfertige Seite und bleibt.

## 1. Lokales Testkonto mit Beispieldaten

- `supabase/seed.sql` legt bei jedem `supabase db reset` das Konto
  `test@flipbase.local` mit dem Passwort `flipbase-test` an. Workspace und
  Mitgliedschaft entstehen über `handle_new_user()`.
- **Beispieldaten im Workspace:** ein abgeschlossener Einkauf mit drei Artikeln, zwei
  Artikel ohne Einkauf und ein gebuchter Verkauf.
- **Anlage über die geprüften Datenbankfunktionen** (Einkauf anlegen und abschließen,
  `record_sale`), nicht über rohe Einfügungen. Die Seed-Datei setzt dafür die
  Anmeldung des Testkontos per `request.jwt.claims`. So erfüllen die Daten alle
  Schutzregeln.
- **Die Seed-Datei läuft nur lokal und in CI** (`supabase db reset`/`start`), nie auf
  dem Live-Server.
- Nach PR 2 meldet man sich lokal ganz normal an. Einen Ersatzknopf für den Demo-Modus
  gibt es nicht.

## 2. Browser-Tests auf die lokale Datenbank (PR 1)

**Ablauf je Testlauf**

1. **Globales Setup** (Playwright `globalSetup`): registriert ein Testkonto
   `e2e-<zufall>@flipbase.local` mit zufälligem Passwort über die öffentliche lokale
   Anmeldung. Weil lokal keine Bestätigung nötig ist, liefert die Registrierung
   direkt die Sitzung. Sie wird als Playwright-`storageState` gespeichert, also als
   derselbe Browser-Speichereintrag, den die App selbst schreibt. Das kostet eine
   Anmeldeanfrage je Lauf.
2. **Je Test** (Fixture): legt über `create_workspace` mit dem Zugangs-Token dieser
   Sitzung einen frischen Workspace an, setzt `flipbase_active_workspace_id` per
   `addInitScript` und öffnet die App angemeldet.
3. **Testdaten:** Ein kleines Hilfsmodul legt über dieselben Datenbankfunktionen wie
   die App einen abgeschlossenen Einkauf mit verkaufbaren Artikeln an
   (`create_purchase`, `receive_individual_purchase_line`,
   `finalize_purchase_costing`) und bucht Verkäufe (`record_sale`).
4. Ein eigener Test prüft die echte Anmeldung über die Login-Seite mit einem eigenen
   Konto. Er ersetzt `e2e/demo-login.spec.ts`.

**Umfang (Nutzerentscheid a):**

- Die sechs Pflichttests ziehen um. „Verkauf eines Einzelstücks“ und „Steuer je
  Artikel“ legen ihre Daten über das Hilfsmodul an.
- Der Steuertest prüft danach nur noch das Steuerjournal mit echten Daten. Die
  Exportsperre bei ungeprüften Kosten verlangt einen Zustand, den kein Mitglied
  herstellen kann. Sie ist in `accounting-tax-review.angular.spec.ts` abgedeckt.
  Der Testname und die Auswahllisten in `playwright.pr.config.ts` und
  `scripts/playwright-pr-smoke.test.mjs` werden angepasst.
- Tests ohne Datenbedarf ziehen mit dem Tausch der Anmeldung um.
- Tests, die fest an Demo-Daten hängen, werden gelöscht. Dazu gehören Tests, die
  `flipbase_local_*` schreiben, Demo-Kennungen oder -Artikel nutzen oder gefüllte
  Tabellen voraussetzen. Die gelöschten Tests nennt der Commit-Body; die Liste der
  manuellen Regressionsfälle in `scripts/playwright-pr-smoke.test.mjs` wird angepasst.
- Der Demo-Modus selbst bleibt in PR 1 bestehen, wird aber von keinem Test mehr
  benutzt.

**CI:** Der Job „Browser smoke“ startet vorher `npx supabase start`. Das kostet
voraussichtlich 2–4 Minuten je Lauf. Dafür prüfen die Browser-Tests erstmals die echten
Datenbankregeln.

**Sicherungen gegen Datenlecks**

- Zugangsdaten im Repo: nur das lokale Seed-Passwort und der öffentliche
  Standardschlüssel der lokalen Supabase, der schon heute in
  `environment.development.ts` steht. Beide gelten nur für `127.0.0.1`.
- Test-Passwörter entstehen zufällig zur Laufzeit und werden nicht gespeichert.
  `storageState` liegt in einem von Git ignorierten Ordner.
- Die Test-Hilfsfunktionen brechen ab, wenn die Supabase-Adresse nicht auf
  `127.0.0.1` oder `localhost` zeigt.
- Ein Workflow-Test schlägt fehl, wenn `seed.sql` ins Migrationspaket oder in die
  Veröffentlichung gerät.
- Test- und Seed-Adressen enden auf `.local`.
- Kein Service-Role-Schlüssel in Tests oder Repo.

**Lokal:** Für Browser-Tests muss Docker mit der lokalen Supabase laufen. Testkonten
sammeln sich dort an; `supabase db reset` räumt sie weg.

## 3. Demo-Modus entfernen (PR 2)

**Entfällt**

- Der Knopf „Demo-Modus starten (ohne Anmeldung)“ auf der Login-Seite und
  `allowDemoMode` in beiden Umgebungsdateien.
- In `AuthService`: `enterDemoMode`, `isDemoMode`, `isDemoModeAllowed` und alle
  Verwendungen.
- `MockDataStoreService`, `demo-product-categories.ts` und die Demo-Startdaten
  (`ensureShowcaseData`, `resetToDemoShowcase`).
- Alle `isDemoMode()`-Weichen. Es bleibt jeweils nur der Datenbankweg.
- Demo-Sonderwege in Tabellen-Einstellungen, Dashboard-Layout, Bestandsansicht,
  Vinted-Favoriten, „Daten & Prüfung“ und Buchhaltung.
- Die reinen Demo-Tests:
  - `demo-data-isolation.spec.ts`
  - `demo-mode-server-isolation.spec.ts`
  - `mock-data-store-individual-receipt.dom.spec.ts`
  - `mock-data-store-package.dom.spec.ts`
  - `mock-data-store-product-stock.dom.spec.ts`
  - `purchase-demo-create.dom.spec.ts`

  In den übrigen Testdateien entfallen der Demo-Ersatz und die Demo-Fälle; die Tests
  des Datenbankwegs bleiben.

- Hinweise auf Demo-Daten in `README.md`, `ARCHITECTURE.md` und
  `docs/testing/lean-ci.md`.

**Bleibt:** Im Live-Betrieb ändert sich nichts, dort war der Demo-Modus aus. Alte
`flipbase_local_*`-Einträge in Entwickler-Browsern bleiben ungenutzt liegen; ein
eigenes Aufräumen lohnt sich nicht.

**Abschlussprüfung:** `npm run verify`, `npx supabase test db`, die Browser-Tests aus
PR 1 ohne Demo-Modus. Eine Suche nach `isDemoMode`, `MockDataStore`, `enterDemoMode`
und `allowDemoMode` in `src/` und `e2e/` muss null Treffer liefern.

## Folgen für andere Arbeit

- Plan `docs/superpowers/plans/2026-09-17-listing-studio-listings-step-1.md` (Zweig
  `feat/listing-studio-listings`): Demo-Speicher in Aufgabe 3, die Demo-Zweige in
  Aufgabe 4 und die Demo-Sichtprüfung in Aufgabe 9 entfallen. Das passe ich an, bevor
  die Umsetzung dort beginnt.
- Neue Pläne enthalten keine Demo-Zweige mehr.

## Nicht Teil dieses Projekts

- 14-Tage-Testzugang, Abo und Bezahlung.
- Das „Demo“-Schild am Online-Shop.
- Änderungen an Anmeldegrenzen oder Auth-Einstellungen des Live-Systems.
