# 🤖 KI-Änderungsprotokoll

## 2026-09-19 – ChatGPT GPT-5.6 Sol (OpenAI) – Ausgaben-Erfassung vereinfacht

**Auftrag:** Die Ausgabenseite flackerfrei machen, Tabellenaktionen an das
gemeinsame Icon-System angleichen, Belege direkt beim Erfassen ermöglichen und
Ausgaben um Händler/Anbieter sowie Stückzahl ergänzen. Die bisher gleichwertig
dargestellten Felder „Bruttobetrag“ und „MwSt.“ sollen im normalen Arbeitsablauf
nicht wie eine Buchhaltungsaufgabe wirken.

**Änderung:** Ausgaben und Wiederholungsregeln speichern jetzt optional den
Anbieter und eine positive ganzzahlige Menge (Standard 1). Der gespeicherte
`gross_amount` bleibt der Gesamtbetrag des Belegs; ein Stückpreis wird nur
berechnet. Neue manuelle und wiederkehrende Einträge starten in der Oberfläche
mit 19 % enthaltener MwSt., während bestehende unbekannte Steuerwerte beim
Bearbeiten unverändert bleiben. Steuerdetails sind standardmäßig eingeklappt;
0 % und „nicht ausgewiesen / unbekannt“ bleiben getrennte Zustände.

Der Erfassungsdialog unterstützt einen optionalen privaten Beleg per Auswahl
oder Drag & Drop. Erst die Ausgabe wird gespeichert, danach der Beleg
hochgeladen. Scheitert nur der Upload, bleibt die Ausgabe erhalten und ein
erneuter Versuch aktualisiert denselben Datensatz statt eine Dublette zu
erzeugen. Die Tabelle zeigt Beleg vorhanden/fehlt über Icons, verwendet
Stift/Papierkorb/Bezahlt-Icons für Zeilenaktionen und nutzt den gemeinsamen
Bestätigungsdialog zum Löschen.

Der Seitenstart verwendet nur noch
`ExpenseService.ensureCurrentWorkspaceLoaded()` als deduplizierten
Ausgaben-Ladepfad. Ein synchroner Initialzustand hält die Tabelle bis zum
Abschluss stabil im Ladezustand; der zusätzliche direkte
`recurringService.load() -> materializeDue() -> expenseService.load()`-Pfad
wurde aus der Komponente entfernt.

**Datenbank:** Neue additive Migration
`20260919063600_expense_vendor_quantity.sql` ergänzt `vendor_name` und
`quantity` in `expenses` und `expense_recurring_rules`, einschließlich
Längen- und Positivitäts-Constraints. Deklaratives Schema, Typen und SQL-Tests
wurden entsprechend angepasst.

**Prüfung:** Regressionstests wurden vor den jeweiligen Implementierungsschritten
für Datenmodell, Stückpreis/Steuerzerlegung, Belegstatus, Beleg-Upload,
Tabellenspalten, Icon-Aktionen, Tabellenpräferenzen und dedupliziertes Laden
ergänzt. Der Branch wurde statisch gegen den aktuellen `master` und auf
Schema-/Migration-Abgleich geprüft. Eine lokale npm-/Supabase-Ausführung ist in
dieser Sitzung nicht verfügbar; die ausführbare Format-, Lint-, Typ-, Angular-,
Anwendungs- und Datenbankprüfung erfolgt im PR-CI-Lauf.

## 2026-09-19 – ChatGPT GPT-5.6 Sol (OpenAI) – Prüfprotokoll wartet auf Workspace-Rolle

**Auftrag:** Beheben, dass „Daten & Protokolle“ trotz Inhaberrolle kurzzeitig
oder dauerhaft die Meldung zeigt, für das globale Prüfprotokoll fehle eine
Inhaber-, Admin- oder Buchhaltungsrolle.

**Ursache:** Die Seite prüfte den Zugriff bereits, während
`WorkspaceMemberService` die Mitgliederliste für den aktuellen Workspace noch
lud. Die vorübergehend leere Liste ergab `currentUserRole() === null`; zugleich
markierte die Seite den Workspace bereits als verarbeitet und startete nach dem
Eintreffen der echten `owner`-Rolle keinen neuen Ladevorgang.

**Änderung:** Der Mitglieder-Service unterscheidet jetzt explizit, ob der
Mitgliederkontext des aktuellen Workspace vollständig aufgelöst wurde. Die
Prüfprotokollseite behandelt den Zugriff als `loading`, `authorized` oder
`forbidden`, invalidiert veraltete Ladeanfragen und lädt automatisch nach,
sobald die echte Rolle feststeht. Während der Rollenauflösung erscheint ein
neutraler Ladehinweis statt einer falschen Rechtewarnung. Das rote Admin-Badge
im Header bleibt unverändert ein Plattform-Operator-Badge.

**Prüfung:** Regressionstests wurden vor der Implementierung für den
Workspace-Mitglieder-Ladezustand und die Audit-Zugriffsentscheidung ergänzt.
Eine lokale Ausführung ist in dieser Sitzung mangels lokalem Repository-/npm-
Runner nicht möglich; die ausführbare Verifikation erfolgt im PR-CI-Lauf.

## 2026-09-19 – ChatGPT GPT-5.6 Sol (OpenAI) – Workspace-Löschung und Datenexport vereinfacht

**Auftrag:** Frisch angelegte Test-Workspaces sollen sich direkt löschen lassen,
ohne zuerst auf „Daten & Protokolle“ zu landen. Gleichzeitig soll diese Seite
übersichtlicher werden und klar zwischen Prüfprotokoll und Export unterscheiden.

**Änderung:** Der Papierkorb bestätigt die Löschung jetzt direkt in der
Workspace-Verwaltung. Leere Workspaces werden ohne Seitenwechsel gelöscht. Wenn
die Datenbank wegen aufbewahrungsrelevanter Geschäftsdaten oder Prüfprotokolle
blockiert, erscheint statt eines technischen Sync-Fehlers eine verständliche
Archivierungsentscheidung; der Datenexport bleibt ausdrücklich optional.
Archivierte Workspaces lassen sich direkt in der Workspace-Liste
wiederherstellen.

„Daten & Protokolle“ enthält nur noch Prüfprotokoll und Datenexport. Die frühere
Sektion „Aufbewahrung & Löschung“ samt eigener Retention-Komponente wurde
entfernt. Das vollständige Datenarchiv ist die sichtbare Hauptaktion; PDF- und
CSV-Ausgaben liegen hinter „Weitere Exporte“. Die erweiterten
Prüfprotokoll-Filter starten eingeklappt. Das vollständige Archiv wird nicht mehr
durch die aktuell gesetzten Prüfprotokoll-Filter eingeschränkt.

**Prüfung:** Regressionstests für direkte Löschung, blockierte Löschung mit
Archivierungsalternative, Wiederherstellung und die vereinfachte Daten-Seite
wurden vor der Implementierung ergänzt. Die lokale Ausführung ist in dieser
Sitzung nicht möglich, weil der bereitgestellte Container keinen Netzwerkzugriff
zum Repository beziehungsweise zu npm besitzt. Die vollständige Prüfung erfolgt
im PR-Lauf.

## 2026-09-19 – ChatGPT GPT-5.6 Sol (OpenAI) – Einheitliches Data-Table-System umgesetzt

**Auftrag:** Alle administrativen verwaltbaren Tabellen und Listen auf ein
einheitliches Shared-System umstellen. Suche, fachliche Filter,
Spalten-/Sortiersteuerung und Zustände sollen überall an denselben Positionen
liegen; neue Features dürfen keine eigene Tabellenvariante mehr einführen.

**Änderung:** Neuer `DataTableComponent` als gemeinsamer Rahmen für
Tabellenfläche, Toolbar, Shared-Suche, Filterprojektionen,
Spalten-/Sortiermenü sowie Lade-, Fehler- und Leerzustände. Die Toolbar-Felder
besitzen jetzt bereits im Ruhezustand eine dezente neutrale Fläche und einen
leichten Rahmen. Ausgaben wurden mit einer eigenen Tabellenkonfiguration in
`TablePreferencesService` aufgenommen. Die verwaltbaren Listen für Einkäufe,
Verkäufe, Artikelübersicht, Bestand, Ausgaben, Verkäufer, Bankabgleich,
Beta-Bewerbungen, zentrale Vinted-Markenfilter und Prüfprotokoll verwenden den
gemeinsamen Rahmen. Statische Vorschau-, Detail-, Druck- und Berichtstabellen
sind ausdrücklich klassifiziert und erhalten keine künstliche Toolbar.

Die zusätzliche Artikelnavigation im Seiteninhalt wurde entfernt.
„Artikelübersicht“ besitzt in der Sidebar nun die Unterpunkte „Alle Artikel“
und „Bestand“. Der alte `TableToolbarComponent` wurde nach der Migration
entfernt. `scripts/check-admin-shared-ui.mjs` beanstandet künftig direkte
Spaltenmenüs, die alte Tabellen-Toolbar, native Suchfelder an verwaltbaren
Tabellen und nicht klassifizierte Tabellen außerhalb des gemeinsamen Rahmens.
Die verbindliche Regel steht zusätzlich in
`docs/design/admin-ui-guidelines.md`.

**Prüfung:** Branch-Diff gegen `master` und die betroffenen Shared-/Feature-
Templates wurden manuell auf den gemeinsamen Komponentenvertrag geprüft. Der
erste PR-Lauf hat den zuvor abgeschnittenen Verkaufstabellen-Block gefunden;
dieser wurde vollständig aus `master` wiederhergestellt. DOM- und Node-Suite
waren danach grün. Die 22 von Prettier gemeldeten Dateien wurden im
GitHub-Runner mit der Projektversion formatiert. Die abschließende vollständige
PR-CI läuft auf dem formatierten Stand erneut.

## 2026-09-18 – ChatGPT GPT-5.6 Sol (OpenAI) – Entwurf: einheitliches Data-Table-System

**Auftrag:** Alle administrativen Tabellen und verwaltbaren Listen sollen dasselbe
Shared-System für Tabellenfläche, Suche, Filterpositionen, Spalten-/Sortiermenü und
Zustände verwenden. Neue Listen dürfen keine eigene Tabellenvariante mehr einführen.
Zusätzlich soll die doppelte Artikelnavigation entfallen und Artikelübersicht in der
Sidebar die Unterpunkte „Alle Artikel“ und „Bestand“ erhalten.

**Befund:** Einkäufe verwenden bereits die gemeinsame TableToolbar-Struktur, während
Verkäufe, Inventar, Artikelstamm, Buchhaltung und Beta-Bewerbungen jeweils eigene
Varianten derselben Leiste besitzen. Ausgaben und Verkäufer bauen Filter und
Tabellenhülle lokal nach. Toolbar-Suche und Toolbar-Selects sind im Ruhezustand teils
transparent und dadurch schlecht als Interaktionen erkennbar.

**Ergebnis:** Entwurf
`docs/superpowers/specs/2026-09-18-unified-data-table-system-design.md`. Vorgesehen ist
ein verbindlicher `DataTableComponent`, der Toolbar-Anordnung, Suche,
Filter-Projektionen, optionales Spalten-/Sortiermenü sowie Lade-, Fehler- und
Leerzustände zentral besitzt. Feature-Seiten liefern nur Fachfilter, Daten, Spalten,
Zeilen und Aktionen. `scripts/check-admin-shared-ui.mjs` soll neue lokale
Tabellenvarianten künftig automatisiert verhindern.

**Prüfung:** Repository-Struktur, aktuelle Tabellenbausteine, Designrichtlinie,
Tabellenpräferenzen und mehrere bestehende Listen wurden analysiert. Noch kein
Anwendungscode geändert.

Neue Sitzungen werden hier oben ergänzt: Datum, Assistent, Thema sowie Auftrag,
Änderung und tatsächlich ausgeführte Prüfungen. Die Vorgaben aus `AGENTS.md` gelten
unverändert.

Die vollständige bisherige Historie ist im
[Archiv bis zum Stand vom 16. September 2026](AI-CHANGELOG-archive-2026-09-16.md)
bytegleich erhalten. Das Archiv liegt im selben Ordner, damit seine relativen
Dateiverweise weiterhin denselben Ausgangspunkt haben.

## 2026-09-18 – Claude Opus 5 (Anthropic) – Demo-Modus entfernen, PR 1: Browser-Tests auf lokale Supabase

**Auftrag:** Umsetzung von PR 1 aus dem Entwurf unten. Die Browser-Tests sollen gegen
die lokale Supabase laufen statt gegen Demo-Daten, damit der Demo-Code danach in PR 2
gefahrlos entfernt werden kann. Sechs Aufgaben aus
`docs/superpowers/plans/2026-09-18-remove-demo-mode-pr-1.md`.

**Änderung:** Ein globales Setup registriert je Testlauf genau ein Konto einmal; alle
Worker teilen sich die Sitzung als `storageState`. Eine automatische Fixture in
`e2e/support/fixtures.ts` legt für jeden Test einen frischen Workspace an und
wechselt per `addInitScript` dorthin. Testdaten entstehen über die echten
Datenbankfunktionen in `e2e/support/sample-data.ts`, nicht über Mocks. Die sechs
Pflichttests des Chromium-Laufs sind auf dieses Muster umgestellt; der Steuertest
verkürzt sich auf die Journalprüfung, weil die Exportsperre bereits der
Angular-Test `accounting-tax-review.angular.spec.ts` abdeckt. Der Browser-Job in der
CI startet jetzt die lokale Supabase, ein neuer Workflow-Test sichert die Trennung
der Testkonten ab (Seed-Isolation). `supabase/seed.sql` legt lokal das Konto
`test@flipbase.local` / `flipbase-test` mit Beispieldaten an. Von den übrigen
Browser-Tests wurden alle fest an Demo-Daten hängenden Fälle gelöscht statt
umgestellt: 29 Einträge in 17 Dateien (rund 34 einzelne Testfälle, Theme-/Breiten-/
Pfad-Varianten mitgezählt), davon sechs Dateien vollständig entfernt
(`badge-text.spec.ts`, `demo-login.spec.ts`, `purchase-item-navigation.spec.ts`,
`purchase-package-contents.spec.ts`, `record-timeline.spec.ts`,
`e2e/support/demo.ts`). Die vollständige Liste steht im Commit `ebee08c`.

**Nachbesserung (Abschlussprüfung):** Der optionale Nightly-Workflow
(`quality-nightly.yml`, Job `browser`) startete und stoppte die lokale Supabase
nicht, obwohl `test:e2e:nightly` dasselbe globale Setup wie der PR-Job nutzt – jetzt
mit denselben Schritten wie `browser-smoke` in `ci.yml` ergänzt, Timeout 15 auf 20
Minuten angehoben. Die geteilte Testsitzung (`jwt_expiry = 900`) lief bei langen
Läufen nach rund 13,5 Minuten in die Token-Rotation und schlug dann unklar fehl;
`e2e/support/test-account.ts` liest jetzt `expires_at` mit, die `workspace`-Fixture
bricht unter 120 Sekunden Restlaufzeit mit einer klaren deutschen Meldung ab, und
eine fehlende `e2e/.auth/session.json` meldet sich jetzt auch verständlich statt mit
rohem ENOENT. Der Steuerjournal-Test in `purchase-tax-costs.spec.ts` bestand nur,
weil die Buchhaltungsseite fest auf 2026/08 startet; er wählt Jahr und Zeitraum jetzt
selbst über die Oberfläche. Nach diesen Korrekturen liefen `npm run test:e2e:pr` (6 von
6 bestanden), `npm run test:workflow`, `scripts/seed-isolation.test.mjs`, Prettier und
ESLint jeweils mit Exitcode 0.

**Befunde:** `deal-monitor.spec.ts` schlägt schon auf dem Ausgangsstand des Zweigs
fehl (zwei Fälle, Workspacewechsel in der Erfassungsmaske gesperrt) - kein neuer
Fehler durch diese Arbeit. Das Kalender-Popover bei 390px öffnet sich manchmal nicht
beim ersten Tastendruck; der Test wiederholt das über `toPass`, ein App-Fehler zum
Nachverfolgen. Die Buchhaltungsseite startet fest auf 2026/08
(`accounting.component.ts:172-173`) statt auf dem aktuellen Monat.

**Prüfung:** `npm run test:db` (1812 Tests in 50 Dateien) mit Exitcode 0. `npm run
verify` (Format, Lint, Typen, Workflow-Tests, Suite-Audit, alle Anwendungstests, Bau)
mit Exitcode 0. `npx playwright test --project=chromium`: 74 von 76 Fällen bestanden;
die zwei Fehlschläge sind die oben genannten vorbestehenden Fälle in
`deal-monitor.spec.ts`. `grep -rn "startDemoMode|support/demo" e2e` ohne Treffer.

## 2026-09-18 – Claude Opus 5 (Anthropic) – Entwurf: Demo-Modus entfernen

**Auftrag:** Der Nutzer will den Demo-Modus komplett entfernen, weil jede Funktion
doppelt gepflegt werden muss. Später soll es einen 14-Tage-Testzugang mit echtem Konto
geben.

**Befund:** Der Demo-Modus ist im Live-Betrieb aus (`allowDemoMode: false`). Die
Ersatz-Datenbank `MockDataStoreService` hat rund 2.550 Zeilen. Dazu kommen rund 185
Weichen in 46 Dateien. 28 von 30 Browser-Tests laufen im Demo-Modus, darunter alle
Pflichttests. Die lokale Anmeldung begrenzt Registrierungen und Anmeldungen auf 30 je
5 Minuten. Der erste Ansatz „ein Konto je Test“ hätte den vollen Testlauf deshalb
blockiert.

**Ergebnis:** Entwurf `docs/superpowers/specs/2026-09-18-remove-demo-mode-design.md`.
PR 1 stellt die Browser-Tests auf die lokale Supabase um: ein Konto je Lauf, ein
Workspace je Test, dazu ein lokales Testkonto mit Beispieldaten und Sicherungen gegen
Datenlecks. PR 2 entfernt den Demo-Code.

**Plan:** `docs/superpowers/plans/2026-09-18-remove-demo-mode-pr-1.md` mit sechs
Aufgaben für PR 1. Beim Planen zeigte sich, dass die Browser-Tests rund 95 Fälle in
28 Dateien umfassen und rund zwölf Dateien fest an Demo-Daten hängen. Nutzerentscheid:
Pflichttests und Tests ohne Datenbedarf umstellen, demo-gebundene Tests löschen. Der
Steuer-Pflichttest verliert den Teil zur Exportsperre, weil ihn kein Mitglied
herstellen kann; er ist im Angular-Test `accounting-tax-review` abgedeckt.

**Prüfung:** Nur Analyse und Entwurf, kein Anwendungscode geändert.

## 2026-09-18 – ChatGPT GPT-5.6 Sol (OpenAI) – Navigation und Upload-Button vereinheitlicht

**Auftrag:** Die nach dem Theme-Umbau ergänzte gelbe Seitenmarkierung an aktiven
Sidebar-Einträgen entfernen, weil sie nicht zur bestehenden Admin-Navigation passt.
Außerdem prüfen, ob „Bilder hinzufügen“ im Bildoptimierer wirklich die gemeinsame
Button-Komponente verwendet.

**Änderung:** Die zusätzliche `box-shadow`-Seitenmarkierung der aktiven Sidebar
sowie die entsprechende Unterkante der mobilen Navigation wurden entfernt; der aktive
Zustand verwendet wieder ausschließlich die gemeinsame abgerundete Brand-Fläche.
„Bilder hinzufügen“ war tatsächlich als lokal gestyltes `label` umgesetzt. Der
sichtbare Auslöser verwendet jetzt `ButtonComponent` mit `variant="primary"` und
`size="lg"`; nur das technisch notwendige versteckte Datei-Input bleibt nativ.
Die Designrichtlinie hält beide Entscheidungen verbindlich fest.

**Prüfung:** Ausstehend bis zum PR-Lauf; betroffen sind Styles und der
Bildoptimierer-Header.

## 2026-09-18 – ChatGPT GPT-5.6 Sol (OpenAI) – Theme-Konsistenz im hellen Design und Bildoptimierer

**Auftrag:** Das helle Theme soll das echte Flipbase-Gelb sichtbarer verwenden statt
gold-brauner Ersatzfarben. Der Admin-Badge soll als auffällige rote Rollenkennzeichnung
erhalten bleiben. Bildoptimierer und Fotoguide sollen dieselbe Flipbase-Designsprache
wie der restliche Admin verwenden.

**Änderung:** Brand-Flächen im hellen Theme sind heller und tragen dunklen Text für
ausreichenden Kontrast; aktive Navigation erhält zusätzlich eine echte gelbe
Markenmarkierung. Brand-Badges verwenden im hellen Theme das Logo-Gelb. Für den
Plattform-Admin gibt es einen eigenen roten Badge-Ton statt Brand oder Critical.
Der gemeinsame `ModalShellComponent` verwendet die zentralen Theme-Farben und bietet
einen Brand-Ton. Der Fotoguide wurde vom eigenen nativen Dialog auf den Shared
`ModalShellComponent` umgestellt. Bildoptimierer-Komponenten verwenden für Auswahl,
Fokus, Warnung, Erfolg, Fehler und Editor-Akzente die zentralen Flipbase-Variablen;
alte Indigo-, Sky-, Amber- und Emerald-Akzente wurden in diesem Feature entfernt.
Die Designrichtlinie dokumentiert diese Nutzerentscheidungen.

**Prüfung:** Ausstehend bis zum PR-Lauf; betroffen sind Theme, Shared Badge/Modal und
der Bildoptimierer. Geplant sind Formatierung, Lint, Typprüfung, Build,
Accessibility-Browser-Smoke sowie die relevanten Angular-Tests.

## 2026-09-18 – ChatGPT GPT-5.6 Sol (OpenAI) – Flipbase Theme und lesbare AI-Regeln

**Auftrag:** Die uneinheitlichen Farben von Toasts, Badges, Header, Navigation und
Statusdarstellungen auf eine gemeinsame Flipbase-Designsprache ausrichten. Danach die
AI-Regeln so ergänzen, dass englische Code-Namen zugleich konkret, lesbar und am
Projektzweck orientiert bleiben; PR-Titel und PR-Beschreibungen ausdrücklich auf
Englisch festlegen.

**Änderung:** Zentrale Theme-Datei `src/styles/flipbase-theme.css` mit verständlichen
Farbrollen für Brand, Erfolg, Warnung, kritisch und neutral in Light/Dark. Shared
Badges, Toasts und Buttons sowie Header, Workspace-Status und Dashboard-KPIs greifen
auf diese Rollen zurück. Toasts erhalten eine neutrale Oberfläche und sauber
ausgerichtete Icon-/Text-/Close-Spalten. `AGENTS.md` verlangt jetzt zusätzlich
intention-revealing English names, bevorzugt konkrete Projekt-/Fachnamen vor
abstraktem Jargon, und definiert PR-Titel sowie PR-Beschreibungen ausdrücklich als
englisch.

**Prüfung:** PR-CI nach den UI-Änderungen: Formatierung, ESLint, Typprüfung, Build,
Browser-Smoke inklusive AXE, Node-, DOM- und beide Angular-Test-Shards erfolgreich.
Die anschließende reine Dokumentationsänderung an `AGENTS.md` wurde im selben PR
ergänzt.

## 2026-09-18 – Claude Opus 5 (Anthropic) – Einkauf drucken

**Auftrag:** Teil 3 des Einkaufsumbaus. Nutzerentscheidungen: eigene Druckseite wie
beim Prüfbeleg, Druckknopf nur auf der Detailseite.

**Änderung:** Neue Seite `/purchases/:id/print` mit Kopf (Einkaufsnummer,
Bezeichnung, Datum), Verkäufer-Snapshot samt Quelle, Bestellnummer und Angebotslink,
Positionstabelle, Kostenaufstellung mit Rabatt und Zusatzkosten, Gesamtkosten nach
derselben Regel wie die Detailseite sowie der Liste hinterlegter Belege. Die
Bedienleiste verschwindet beim Drucken; gedruckt wird über den Browserdialog, auch als
PDF. Die Aufbereitung liegt als reine Funktion in `utils/purchase-print.ts`; die
Kostenart-Bezeichnungen wurden dafür aus der Kostenübersicht in
`utils/purchase-cost-labels.ts` ausgelagert. Der Prüfbeleg mit der Historie bleibt
unverändert und separat. Keine Datenbankänderung.

**Prüfung:** Vitest für den Einkaufsbereich (30 Dateien, 279 Tests), Typprüfung,
ESLint, Prettier, Test-Audit und Shared-UI-Prüfung mit Exitcode 0. Der Angular-Bau
läuft wegen der lokalen Node-Version nur in der CI.

## 2026-09-18 – Claude Opus 5 (Anthropic) – Einkaufsbelege als private Dateien

**Auftrag:** Teil 2 von 3 des Einkaufsumbaus, nach dem veröffentlichten Teil 1 (PR #103).
Nutzerentscheidungen: Löschen nur vor dem Abschluss, im Demo-Modus kein Upload, Anzeige
als Vorschau im Dialog. Konzept und Plan liegen unter
`docs/superpowers/specs/2026-09-18-purchase-documents-design.md` und
`docs/superpowers/plans/2026-09-18-purchase-documents.md`.

**Änderung:** Neuer privater Bucket `purchase-documents` (20 MiB, PDF/JPG/PNG/XML) mit
kanonischem Pfad je Workspace, Einkauf und Beleg. Neue Tabelle `purchase_documents` mit
RLS je Operation: lesen und anlegen für Mitglieder, löschen nur bei nicht abgeschlossenem
Einkauf, kein Ändern. Dieselben Bedingungen gelten für die Datei in `storage.objects`.
Trigger schreiben `purchase_document_added` und `purchase_document_removed` in die
vorhandene Historie. Der neue Dienst prüft Typ, Endung und Größe vor dem Upload, legt
erst die Datei und dann die Metadaten an und nimmt die Datei zurück, wenn die Metadaten
scheitern; das Entfernen löscht erst den Eintrag, damit die Datenbankregeln entscheiden.
Neue Belegkarte auf der Einkaufs-Detailseite mit Liste, Belegart-Auswahl, Vorschau
(Bild oder PDF aus dem privaten Bucket) und Download. Belege lassen sich auch nach dem
Abschluss ergänzen; ein Hinweis erklärt, dass sie dann nicht mehr entfernt werden können.
Im Demo-Modus ist der Upload gesperrt.

**Prüfung:** Datenbanktests und vollständige PR-CI auf `feat/purchase-documents` grün
(Migration, Policies, Bau, Browser-Smoke). Lokal: Vitest node (1423), angular (877) und
dom (250), Typprüfung, ESLint, Prettier, Test-Audit und Shared-UI-Prüfung mit Exitcode 0.
Die Supabase-Typen kommen aus einem GitHub-Lauf, nicht von Hand.

**Offen:** Sichtprüfung im Browser (lokales Node unter dem Minimum der Angular CLI);
Teil 3 (Einkauf drucken) folgt. Ein Wiederherstellungstest der gesicherten
Storage-Dateien ist weiterhin eine Betriebsaufgabe und nicht Teil dieses PRs.

## 2026-09-17 – Claude Opus 5 (Anthropic) – Einkauf: Quelle, Verkäufer-Snapshot und Nachtrag

**Auftrag:** Übernahme des Einkaufsumbaus von ChatGPT. Nutzerentscheidungen: drei PRs
nacheinander (dieser ist Teil 1), Migration und Typen über einen GitHub-Runner statt
lokalem Docker, Weiterarbeit auf `feat/purchase-workflow-20260916`, Bezeichnungsfeld
aus PR #59 mit aufnehmen, Grund beim Nachtrag optional. Konzept und Plan liegen unter
`docs/superpowers/specs/2026-09-17-purchase-seller-details-design.md` und
`docs/superpowers/plans/2026-09-17-purchase-seller-details.md`.

**Vorgefunden:** Der Zweig enthielt nur Transferreste (Base64-Teile und einen
Einmal-Workflow) und lag 18 Commits zurück. Das entpackbare Paket war ein
unvollständiger Diff gegen `08d1707` mit 25 Frontenddateien, ohne Datenbankteil. Es
diente als Nachschlagewerk; übernommen wurde daraus kein Code. Transferdateien
entfernt, `master` gemergt.

**Änderung:** `purchases` erhält Verkäufer-Snapshot (Art, Name, Plattform-Benutzername,
Anschrift, Ländercode), `external_order_id` und `seller_details_version`. Anlegen und
Entwurfsspeichern übernehmen die Felder und zählen die Version bei geänderten
Herkunftsangaben hoch. Die neue Funktion `update_purchase_seller_details` trägt
Herkunftsangaben auch bei abgeschlossenen Einkäufen nach, prüft Mitgliedschaft,
erlaubte Felder, Workspace-Zugehörigkeit und erwartete Version und schreibt ein
Fachereignis `purchase_seller_details_updated` mit Grund. Kosten, Positionen, Bestand
und Abschlussstatus bleiben unberührt. Formular zeigt Bezeichnung, Quelle,
Benutzername, Verkäuferart, Name, Anschrift, Angebotslink und Bestellnummer;
die Auswahl eines gespeicherten Verkäufers kopiert dessen Angaben bewusst. Detailseite
zeigt den Snapshot und öffnet bei abgeschlossenen Einkäufen einen Nachtragsdialog mit
Konfliktmeldung. Liste und Suche berücksichtigen einmalige Verkäufer.

**Prüfung:** Vollständige Vitest-Projekte node (1409) und angular (866), Typprüfung,
ESLint, Prettier, Test-Audit und Shared-UI-Prüfung mit Exitcode 0. Migration und
Supabase-Typen wurden im GitHub-Runner erzeugt; die Typdatei enthielt zusätzlich
bisher nicht übernommene Sniper-Tabellen. Von den neuen Datenbanktests waren im
dritten Lauf neun Prüfungen grün, darunter Nachtrag nach Abschluss, unveränderte
Kosten und Bestände sowie das Ereignis mit Grund.

**Nachtrag 18.09.2026:** Nach der Umstellung des Repositories auf öffentlich laufen die
GitHub-Prüfungen wieder. Migration, erzeugte Typen und Datenbanktests sind bestätigt:
49 Testdateien mit 1803 Prüfungen bestanden, darunter die neue Datei
`purchase_seller_details.test.sql`. Die committeten Typen sind byteweise identisch mit
den im Lauf erzeugten. Der vorläufige Workflow `purchase-seller-schema-preview.yml`
wurde vor dem Review entfernt.

**Offen:** `supabase db diff` scheitert am vorhandenen Schema (50_sniper.sql nutzt
`is_platform_operator` vor 99_platform_admin.sql); die Migration wurde deshalb aus den
Schemadateien zusammengestellt. Teil 2 (Belege) und Teil 3 (Einkauf drucken) folgen als
eigene PRs. Eine Sichtprüfung im Browser steht aus, weil das lokale Node unter dem
Minimum der Angular CLI liegt.

## 2026-09-17 – Claude Opus 5 (Anthropic) – Dashboard mit Gewinn, Ausgaben, Vorzeitraum und offenen Kosten

**Auftrag:** Die Dashboard-Empfehlung vom 13.09. auf aktuellem `master` umsetzen.
Zweig `feat/dashboard-kpis` von `origin/master` (`a971725`). Entscheidungen des
Nutzers: Gewinn als Verkaufsgewinn; Vergleich mit dem gleich langen Zeitraum davor;
offene Kosten wie Shopify (nur Verkäufe mit Kosten im Gewinn, Umsatz ohne Kosten
getrennt) plus Einkaufsliste; Node lokal nicht aktualisieren. Konzept in
`docs/superpowers/specs/2026-09-17-dashboard-kpis-design.md`.

**Änderung:** Oben Gewinn, Umsatz und Ausgaben (Einkäufe nach Kaufdatum plus
Verkaufskosten), darunter Bestandswert, verkaufte Artikel und Marge. Jede
Zeitraumkennzahl mit Veränderung gegenüber dem Vorzeitraum (Prozent, bei der
Marge Prozentpunkte). Gewinn, Marge und Bestandswert bleiben bei einzelnen
offenen Kosten sichtbar und weisen den fehlenden Teil aus. Neuer Bereich
„Offene Kosten“ mit Einkauf, Grund und Link. Diagramm und Verkaufsjournal
unverändert; keine Schemaänderung.

**Prüfung:** Service-, Modell- und Komponententests einschließlich AXE; komplette
Vitest-Projekte node (1389) und angular (859), `npm run typecheck`, ESLint,
Prettier, `npm run test:audit` und Shared-UI-Prüfung mit Exitcode 0. Angular-Bau
und Sichtprüfung im Browser lokal nicht möglich (Node 22.16.0 unter dem Minimum der
Angular CLI); der Bau läuft im PR.

**Nachtrag zu PR #101:** Nach dem Deployment von `sha-a971725` lesend geprüft:
Nike, adidas und Ralph Lauren stehen auf `ready`/`ok`, Vinted-Zugang `ready`,
907 neue Funde in den ersten zehn Minuten, `failed=0`.

## 2026-09-17 – Claude Opus 5 (Anthropic) – Gesperrten Vinted-Filter nachträglich freigegeben

**Auftrag:** Nachprüfung von PR #99 im Betrieb. Zweig
`fix/sniper-legacy-blocked-queries` von `origin/master` (`ea9ba63`).

**Befund (lesend auf dem Hetzner-Server):** Nach dem Deployment von `sha-ea9ba63`
steht `sniper_origin_state` wieder auf `ready`; in den ersten Minuten kamen 212 neue
Funde, Nike und adidas melden `ok`. Der am 16.09. gesperrte Filter „Ralph Lauren“
bleibt aber auf `blocked`: `dueQueries` schloss `blocked` schon in der
Datenbankabfrage aus, sodass der in #99 ergänzte Backoff in `isDue` die Zeile nie
erreichte. Der Test in #99 prüfte nur `isDue`, nicht den Abfragefilter.

**Änderung:** Die Abfrage schließt nur noch `invalid` aus. Alte `blocked`-Zeilen
laufen über den vorhandenen `forbidden`-Backoff und werden beim nächsten
erfolgreichen Abruf auf `ready` gesetzt.

**Prüfung:** Neuer Test auf die tatsächlichen Abfrageparameter schlug vorher fehl
und besteht danach; alle 186 Sniper-Unit-Tests grün, ESLint und Prettier sauber.
Wirkung im Betrieb steht bis zum Deployment aus.

## 2026-09-17 – Claude Opus 5 (Anthropic) – Deutsche Dateinamen auf Englisch umgestellt

**Auftrag:** Die noch deutsch benannten Dateien umbenennen. Zweig
`refactor/english-filenames` von `origin/master` (`ca5a993`).

**Änderung:** Rein mechanischer Commit ohne Logikänderung. Zwölf Dateien unter
`src/` (u. a. `speicher-migration.ts` → `storage-migration.ts`,
`stammdaten-filter.ts` → `master-data-filter.ts`, `supabase-schreiben.ts` →
`supabase-write.ts`, `formular-bindungen.spec.ts` → `form-bindings.spec.ts`) und
`scripts/version-generieren.mjs` → `scripts/generate-version.mjs`; Importe,
npm-Lebenszyklusskripte und Pfadkommentare angepasst. Das npm-Skript
`version:generieren` heißt jetzt `version:generate`.

**Bewusst unverändert:** `deploy/erstinstallation.sh` und
`deploy/cron-aufraeumen-n8n-server`, weil der Server sie unter diesem Namen
verwendet; `landing/datenschutz` als öffentliche Adresse; „kleinanzeigen“ als
Markenname. Deutsche Funktions- und Variablennamen innerhalb der Dateien (z. B.
`uebernehmeAltenBrowserSpeicher`, `nurAktive`, `schreibeImHintergrund`,
`VERSION.nummer`) bleiben offen für einen eigenen Schritt.

**Prüfung:** `npm run typecheck` Exitcode 0, die zehn umbenannten Testdateien
bestehen (125 Tests), `npm run test:audit` Exitcode 0, ESLint und Prettier sauber,
Versionsskript unter neuem Namen ausgeführt. Kein Verweis auf die alten Namen
außerhalb der Dokumentationshistorie. Der Angular-Bau lief lokal nicht, weil das
installierte Node 22.16.0 unter dem Minimum der Angular CLI liegt; er wird im PR
geprüft.

## 2026-09-17 – Claude Opus 5 (Anthropic) – Vinted-Bot nach einzelner 403 dauerhaft gesperrt

**Auftrag:** Der Vinted-Bot sammelt wieder keine Daten. Ursache finden und beheben.
Zweig `fix/sniper-forbidden-recovery` von `origin/master` (`ca5a993`).

**Befund (lesend auf dem Hetzner-Server, vom Nutzer freigegeben):** Container
`flipbase-sniper` läuft gesund, protokolliert aber alle fünf Sekunden nur
`origin_blocked reason=forbidden`. `sniper_origin_state` steht seit 16.09.2026
00:48:35 UTC auf `blocked` ohne Ablaufzeit. Auslöser war eine einzelne 403 beim
Filter „Ralph Lauren“ (`consecutive_failures = 1`); Nike und adidas waren
Sekunden zuvor erfolgreich. Letzter gespeicherter Fund 00:48:05 UTC. Um 15:17 UTC
lud der Bot die Vinted-Startseite erfolgreich (`vinted_last_success_at`), die
Sperre blieb trotzdem bestehen. Seit AP1 vom 15.09. setzt eine 403 Origin und
Filter dauerhaft auf `blocked`; weder Bot noch Admin-Bereich heben das auf, auch
nicht das Reaktivieren eines Filters oder ein Container-Neustart.

**Änderung:** Eine 403 startet eine ablaufende Abkühlphase (5, 10, 20, 40, dann
60 Minuten); danach prüft der vorhandene Einzelprobeabruf den Zugang. Bereits
gespeicherte Dauersperren gelten als abgelaufene Abkühlphase bzw. laufen über
den vorhandenen Backoff für `forbidden`, sodass sich der Produktionszustand nach
dem Deployment ohne Datenmigration löst. Zweiter Commit: Eine Probe-Reservierung,
die ein beendeter Prozess nicht freigeben konnte (z. B. Neustart beim
Deployment), wird nach fünf Minuten übernommen statt dauerhaft zu blockieren.
Keine Schema-, Migrations- oder Frontend-Änderung.

**Prüfung:** Neue Regressionstests für Retry-Politik, Scheduler, `isDue` und
`OriginStateStore` schlugen vor der Änderung fehl und bestehen danach; alle
185 Sniper-Unit-Tests grün, ESLint und Prettier sauber. Lokale Typprüfung meldet
nur das fehlende lokale `dotenv`-Paket, das ebenso auf `master` auftritt. Keine
Produktionsdaten geändert. Die Gegenprüfung gegen eine echte PostgREST-API und
die Wirkung im Betrieb stehen bis zum Deployment aus.

## 2026-09-17 – Claude Opus 5 (Anthropic) – Übersicht offener Punkte

**Auftrag:** Offene Punkte im Projekt zusammenstellen. Reine Analyse, keine
Code-, Schema- oder Zweigänderung.

**Befund:** Offene PRs #58 und #59 (je 128 Commits hinter `master`); auf `master`
fehlt weiterhin ein Eingabefeld für die Einkaufsbezeichnung, das #59 ergänzt.
Unvollständiger Übertragungszweig `feat/purchase-workflow-20260916` mit
Base64-Teilen und Einmal-Workflow. Die drei Fix-Zweige vom 05.09. sind laut
`git cherry` inhaltsgleich in `master` und nur noch aufzuräumen. Produktübergang laut
`2026-09-08-product-transition-checklist.md` noch nicht abgeschlossen
(`tracking_mode`/`line_kind` und Legacy-RPCs vorhanden). Neun deutsch benannte
Dateien in `src/app/core/services/`. Dashboard-Kennzahlen-Empfehlung vom 13.09.
nicht umgesetzt. Viele gemergte Zweige lokal und remote nicht aufgeräumt.

**Prüfung:** `git fetch --prune`, Vorsprung/Rückstand aller Zweige gegen
`origin/master`, `git cherry`, `gh pr list`/`gh issue list` (keine offenen Issues),
Suche nach Offen-Markierungen in Protokoll, Archiv, Plänen und Audits sowie
Stichproben im Code.

## 2026-09-16 – Claude Opus 5 (Anthropic) – Unbenutzte Einkaufskategorie entfernt

**Auftrag:** Offene Reste aus dem Plan
`docs/superpowers/plans/2026-09-14-product-categories-brands.md` erledigen, nachdem
Codex den Zweig `feat/product-categories-brands` am 14.09.2026 zu Ende geführt und
gemergt hat.

**Befund:** `purchase.service.ts` gab noch `single_item_category` und
`addItemToPurchase(…).category` als freien Kategorietext an den Artikel-Service
weiter. Kein Formular und kein Test übergibt diese Werte, und die Datenbank setzt
den Kategorietext seit dem Trigger `sync_category_brand_text()` ausschließlich aus
`category_id`. Die Felder waren damit wirkungslos und irreführend.

**Änderung:** Die vier Zeilen entfernt (Feld im Payload-Typ, Weitergabe beim
Einzelartikel, Parameter und Weitergabe in `addItemToPurchase`). Keine
Verhaltensänderung.

**Prüfung:** Prettier und ESLint auf `purchase.service.ts`, `npm run typecheck`
(Exitcode 0), `purchase.service.spec.ts`, `purchase-create-persistence.spec.ts`
und `purchase-detail.component.angular.spec.ts` (3 Dateien, 88 Tests bestanden).

## 2026-09-16 – ChatGPT – Abschluss der CI-Dokumentation

**Auftrag:** Die nach PR #96 offenen Aufräumpunkte angehen. Keine weitere
Testreduzierung oder Angular-Optimierung beauftragt.

**Änderung:** Den Abschluss der CI-Vereinfachung in das zentrale Protokoll
übernommen. Die vorherige vollständige Protokolldatei wird mit demselben Git-Blob
`17c987d1989d4a9db61bce71e897cf855d4c41d2` archiviert, nicht gekürzt oder
rekonstruiert. Der ursprüngliche
[Arbeitsstand des CI-Nachtrags](development/2026-09-16-lean-ci-log.md) bleibt als
historischer Zwischenstand erhalten; seine offene zentrale Übernahme ist durch
diesen Eintrag erledigt. Anwendung, Tests und Workflows bleiben unverändert.

**Prüfung:** PR #96 und dessen Merge-Stand erneut gelesen. Der Produktionsjob
bestätigt erfolgreiches Deployment und erfolgreiche öffentliche Versionsprüfung.
Die identische Blob-ID sichert den unveränderten Inhalt der bisherigen Historie.
Die Formatprüfung dieser Dokumentationsänderung erfolgt im regulären PR.

**Offen:** Der gemergte Remote-Branch `ci/lean-validation-20260916` konnte über die
verfügbare GitHub-Schnittstelle nicht gelöscht werden. Es wurde keine Löschung
behauptet und kein zusätzlicher Workflow für eine Löschung eingerichtet.

## 2026-09-16 – ChatGPT – CI auf Kernabläufe reduziert und ausgeliefert

**Auftrag:** Die automatische Prüfung einer kleinen SaaS-Lösung vereinfachen und
unnötige Pflicht- und Zusatzläufe entfernen.

**Änderung:** Sechs allgemeine Browser-Kernfälle statt 17. Die vier bestehenden
Daten- und Geldfälle bleiben inhaltlich unverändert. Zwei kurze Fälle prüfen
Appstart/Navigation sowie das Speichern und Wiederöffnen eines Artikels mit Bild.
Die 13 übrigen bisherigen Pflichtfälle bleiben gezielt manuell ausführbar. Der
erweiterte markierte Bestand umfasst einschließlich der zwei neuen Fälle 19
Tests.

Tägliche und wöchentliche Zusatzläufe sowie das separate Benchmark-System wurden
entfernt. Traces im Pflichtlauf sind nur zur gezielten Diagnose einschaltbar;
Fehler-Screenshots bleiben aktiv. Die Prüfung der Browser-Testauswahl wurde auf
zwei tatsächliche Listenaufrufe vereinfacht.

Der Schalter `application_tests` verhindert fachfremde Frontend-Testjobs bei reinen
Änderungen am Bot-Paket `services/sniper/`. V2-Nachweise binden die Wiederverwendung
an den geprüften Dateistand und Umfang. Bei Frontendänderungen bleiben alle
vorhandenen Node-, DOM- und Angular-Fälle aktiv. Die bestehenden Datenbank-, Bot-,
Image-, Migrations- und Deployment-Jobblöcke bleiben unverändert.

**Abwägung:** Zusätzliche Feature- und UI-Browsertests sind außerhalb des
Kernbestands nicht automatisch als Merge-Voraussetzung erzwungen. Bei relevanten
Änderungen sind sie gezielt vor dem Merge auszuführen und im PR zu dokumentieren.
Die Browserfälle verwenden Demo-Daten oder Mocks und ersetzen keine echten
Backend-Auth- oder RLS-Prüfungen. Details stehen in den
[aktuellen Testregeln](testing/lean-ci.md).

**Verifiziertes Ergebnis:**
[PR #96](https://github.com/GrischaTDev/flipbase/pull/96) wurde nach erfolgreicher
CI mit Merge-Commit `b3b41c63182403900aa3e853f04defed249a3500` integriert. Der
[PR-Prüflauf](https://github.com/GrischaTDev/flipbase/actions/runs/35097477856)
bestand im ersten Versuch: Formatierung, ESLint, Typen, actionlint,
Workflowprüfungen, Node/DOM, beide Angular-Gruppen, Datenbankprüfungen,
Migrations-Transaktionstest, Bot-Prüfungen, Build und Required checks.

Der vollständige Browserjob benötigte 1:58 statt zuvor 8:56 Minuten; der
Testschritt einschließlich Appstart 1:22 statt 8:18 Minuten. Die beobachtete
Differenz des Browserjobs beträgt 6:58 Minuten, rund 78 Prozent. Das ist ein
Vergleich regulärer Läufe mit bewusst unterschiedlichem Prüfumfang, keine
Beschleunigung derselben 17 Tests und keine Hochrechnung auf die gesamte
GitHub-Rechnung. Die erste Angular-Gruppe benötigte weiterhin 7:24 Minuten.

Der anschließende
[Produktionslauf](https://github.com/GrischaTDev/flipbase/actions/runs/35098360646)
hat das Image veröffentlicht, das Deployment ausgeführt und die öffentlich
ausgelieferte Version erfolgreich geprüft.
