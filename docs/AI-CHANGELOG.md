# 🤖 KI-Änderungsprotokoll

## 2026-09-24 – Juna – Artikelauswahl im Einkauf filtern und Erstellen platzieren

**Auftrag:** Den Button zum Erstellen eines Artikels im Einkaufsdialog dauerhaft
sichtbar machen und kompakte Filter für vorhandene Kategorien und Marken ergänzen.

**Änderung:** „Produkt erstellen“ steht links im Dialog-Footer. Neben der Suche
filtern Dropdowns nach den Kategorien und Marken, die im geladenen Artikelstamm
vorkommen. Die Filter lassen sich gemeinsam zurücksetzen.

**Prüfung:** Drei fokussierte Angular-Tests sowie ESLint, Prettier,
`git diff --check` und der Angular-Produktionsbau mit Node 24.19 bestanden.
Die vollständige Vitest-Suite lief nicht. Der Bau zeigt weiterhin die bekannte
CommonJS-Warnung zu `pako`.

## 2026-09-24 – Juna – Aktive Einkaufsfilter kenntlich gemacht

**Auftrag:** Den redundanten, wegklickbaren Verkäuferchip unter der
Einkaufsleiste durch einen allgemeinen Hinweis auf aktive Filter ersetzen.

**Änderung:** Ein mittig über der Tabelle platzierter, nicht klickbarer
orangefarbener Badge „Filter aktiv“ erscheint bei Such-, Status- oder
Verkäuferfilterung. Änderungen an Sortierung und Spalten allein lösen ihn
nicht aus. Die vorhandene Rücksetzung bleibt unverändert.

**Prüfung:** Die angepassten und ergänzten Komponententests scheiterten vor
der Umsetzung und bestanden danach. Die vollständige Vitest-Suite bestand
mit 297 Dateien und 2.779 Tests; Prettier, ESLint, beide TypeScript-Prüfungen
und der Angular-Produktionsbau bestanden. Für den Bau wurde wegen des
laufwerksübergreifenden Abhängigkeitspfads ein temporärer Worktree auf `D:`
verwendet und anschließend entfernt. Es blieb nur die bekannte
`pako`-CommonJS-Warnung. Lokale Browser-End-to-End-Tests wurden in dieser
Sitzung nicht ausgeführt. Beim ersten PR-Browserlauf fiel ein veralteter
Wareneingangs-Ablauf in zwei Browserfällen auf; sie wurden an die vorhandene
Oberfläche mit „Wareneingang erfassen“ und „Eingang bestätigen“ angepasst.

## 2026-09-24 – Juna – Suchfeld und Verkäuferfilter bei Einkäufen bereinigt

**Auftrag:** Das zusätzliche blaue Browser-X im Suchfeld entfernen, den
Verkäuferfilter verständlicher benennen und technische Verkäufer-IDs aus der
Auswahl sowie dem aktiven Filter entfernen.

**Änderung:** Das gemeinsame Suchfeld behält seine eigene Zurücksetzen-Aktion
und Suchfeld-Semantik, ohne den nativen Browser-Löschknopf zu erzeugen. Der
Einkaufsfilter heißt „Nach Verkäufer filtern“ und zeigt nur Verkäufernamen;
die ID bleibt für die eindeutige interne Filterung erhalten.

**Prüfung:** Beide neuen Einkaufslisten-Tests scheiterten vor der Änderung und
bestanden danach. Die vollständige Vitest-Suite bestand mit 297 Dateien und
2.778 Tests. Prettier, ESLint, beide TypeScript-Prüfungen und der
Angular-Produktionsbau bestanden. Für den Bau war wegen laufwerksübergreifender
Pfade der wiederverwendeten Abhängigkeiten ein temporärer Worktree auf demselben
Laufwerk nötig; er wurde danach entfernt. Es blieb nur die bekannte
`pako`-CommonJS-Warnung. Browser-End-to-End-Tests liefen lokal nicht, da die
Supabase-Testinstanz nicht verfügbar ist.

## 2026-09-24 – Juna – Barcode-Erfassung mit Artikelabgleich und Produktvorschlägen

**Auftrag:** Barcode-Scans beim Einkauf und beim Erstellen eines Artikels mit
einem nutzbaren Such- und Übernahmeablauf verbinden; den Scanrahmen auf das
gesamte Kamerabild ausdehnen.

**Änderung:** Der Scan gleicht EAN/GTIN zuerst mit vorhandenen Artikeln ab. Beim
Einkauf werden eindeutige Treffer unmittelbar als Position übernommen. Fehlt
der Stammartikel, können Daten eines vorhandenen Inventarstücks für dessen
Anlage übernommen werden. Fehlt auch ein Inventartreffer, fragt Flipbase über
die universelle Open-Facts-API Produktdaten ab und zeigt sie mit Quelle zur
Prüfung an. Ein Treffer kann in
die bearbeitbare Artikelerstellung übernommen werden; ohne Online-Treffer bleibt
die manuelle Anlage möglich. Die direkte Artikelerstellung besitzt Scan und
EAN-Suche. Manuelle Eingaben funktionieren auch bei fehlendem Kamerazugriff;
der grüne Scanrahmen umfasst das gesamte Kamerabild. Die CSP erlaubt die
Weiterleitung zu den vier Open-Facts-Datenbanken.

**Prüfung:** Gezielte Barcode-, Einkaufs-, Artikel- und Scanner-Tests bestanden.
ESLint der geänderten TypeScript-Dateien, Typprüfung, Angular-Produktionsbau
und `git diff --check` bestanden. Echte Kamera und Online-Datenquelle wurden
in dieser Sitzung nicht live geprüft.

## 2026-09-24 – Juna – Dashboard-, Einkaufs- und Statusfarben vereinheitlicht

**Auftrag:** Die dunkle Kontur der gelben Dashboard-Säule entfernen,
Gesamtausgaben oben rot darstellen, Einkaufsdetails auch nach Abschluss rechts
belassen und Statusbadges sowie aktive Navigation mit klaren Farben zeigen.

**Änderung:** Alle Diagrammsäulen haben keine Kontur mehr. Bekannte positive
Gesamtausgaben nutzen die kontrastgerechte rote Finanztextfarbe; unbekannte und
Nullwerte bleiben neutral. In der schreibgeschützten Einkaufsansicht stehen
Kaufdatum, Referenznummer und Beschreibung rechts, Verkäufer und Bezugsquelle
links; doppelte Angaben entfallen. Statusbadges verwenden zentral volle
Gelb-, Grün-, Orange-, Rot- und Grautöne mit WCAG-AA-kontrastreicher Schrift.
Aktive Navigation ist in beiden Themes vollflächig gelb mit dunkler Schrift.

**Prüfung:** Die gezielten Komponenten-Tests scheiterten vor den Änderungen und
bestanden danach; die vollständige Vitest-Suite bestand auf dem letzten
Code-Stand (297 Dateien, 2.776 Tests). ESLint, Typprüfung, Produktionsbau,
Workflow-Tests und die Auswahl der elf PR-Browserfälle bestanden. Das gebaute
CSS lieferte in beiden Themes gelbe Navigation mit dunkler Schrift und den
kräftigen grünen Status-Badge. Der Bau meldete nur die bestehende
`pako`-CommonJS-Warnung. Der lokale Browserlauf blieb vor dem Test an der nicht
laufenden Supabase-Testinstanz hängen; die zugehörigen Browserfälle sind deshalb
als Pflichtprüfungen für den PR eingetragen.

## 2026-09-23 – Juna – Gewinn-Kachel farblich ans Verkaufsjournal angeglichen

**Auftrag:** Den grünen Gewinnwert oben im Dashboard an die Gewinne im
Diagramm und in der Tabelle angleichen.

**Änderung:** Die Dashboard-Gewinnkachel verwendete bisher die weiche allgemeine
Erfolgsfarbe. Positive und negative Werte nutzen jetzt dieselben
kontrastgerechten Finanztextfarben wie das Verkaufsjournal; die Diagrammsäule
behält ihre kräftige, für Flächen geeignete Grünfarbe. Vergleichshinweise in
der Kachel bleiben bei ihren bisherigen Statusfarben.

**Prüfung:** Zwei gezielte Erwartungen scheiterten vor der Änderung an den
alten Farben und bestanden danach. Der unveränderte Analytics-Test bestand
isoliert (11/11). `npm test` erreichte bei hoher Parallelität in dessen
`beforeAll` einen 10-Sekunden-Timeout; die übrigen 119 Angular-Dateien
bestanden. Die vollständige Vitest-Suite bestand anschließend mit vier Workern
(297 Dateien, 2.772 Tests). Prettier, ESLint, Typprüfung und Angular-Produktionsbau
bestanden; der Bau meldete nur die bestehende `pako`-CommonJS-Warnung.

## 2026-09-23 – Juna – Auslieferungsstatus der Dashboard-Säulen geprüft

**Auftrag:** Unveränderte Säulenfarben in der angezeigten Dashboard-Ansicht einordnen.

**Ergebnis:** Die neue Gelb-Rot-Grün-Palette ist im lokalen Commit `713dbb84`
auf `juna/dashboard-chart-colors` enthalten. `master` steht noch auf
`64233f0b`; für den Farbzweig existiert auf GitHub kein PR. Eine Änderung auf
der veröffentlichten Seite ist damit noch nicht zu erwarten. Ob die gemeldete
Ansicht die öffentliche Seite oder eine lokale Vorschau ist, bleibt offen.

**Prüfung:** Lokalen Branch, Chart-Konfiguration, Commit-Abstand zu `master`
und GitHub-PR-Liste lesend geprüft; keine Anwendungsdateien geändert.

## 2026-09-23 – Juna – Dashboard-Diagramm mit Marken- und Finanzfarben

**Auftrag:** Die Betragszahlen an den Säulen entfernen, Umsatz in Flipbase-Gelb,
Ausgaben in kräftigem Rot und Gewinn in kräftigem Grün darstellen. Admin-Badge
und hervorgehobene Finanzwerte in Tabellen an diese Farben angleichen.

**Änderung:** Die drei Säulenreihen verwenden Gelb `#fcc601`, Rot `#dc2626` und
Grün `#16a34a` in beiden Themes. Apex-Datenbeschriftungen sind deaktiviert;
Detailwerte bleiben über die vorhandene Tastatur-/Touchansicht und Datentabelle
zugänglich. Im hellen Theme macht eine schmale dunkle Kontur die gelbe Säule auf
weißem Hintergrund besser erkennbar. Das Admin-Badge nutzt dasselbe Rot wie die
Ausgaben-Säule. Finanzwerte in Dashboard-, Verkaufs-, Buchhaltungs- und
Analysetabellen nutzen kontrastgerechte Rot- und Grüntöne; Nullwerte, unbekannte
Ergebnisse und normale Kosten bleiben neutral.

**Prüfung:** Chart- und Tabellen-Erwartungen schlugen vor den jeweiligen
Änderungen gezielt fehl. Gezielte Tests für Farben, Vorzeichen und neutrale
Werte bestanden anschließend (56/56). Die Gesamtsuite bestand mit 297 Dateien
und 2.771 Tests. Prettier, ESLint, Typprüfung und Angular-Produktionsbau mit
Node 24 bestanden. Der Bau meldete nur die bestehende `pako`-CommonJS-Warnung.

## 2026-09-23 – Juna – Dashboard ohne Cashflow und mit Gewinn im Diagramm

**Auftrag:** Cashflow aus dem Dashboard entfernen, Gewinn in das Diagramm aufnehmen,
die Kennzahlen kompakter anordnen und die Darstellung von Filtern und Säulen prüfen.

**Änderung:** Cashflow entfällt aus Kacheln, Diagrammlegende, Diagrammtext,
zugänglicher Datentabelle und dem ungenutzten Feld im Berichtsmodell. Der
verkaufsbezogene Gewinn nutzt stattdessen die
dritte Säulenreihe. Sechs Kacheln ordnen sich bei ausreichender Breite in einer
Zeile an; die überflüssige „Übersicht“-Zeile ist entfernt und Zeitraumwahl und
Plattformauswahl haben dieselbe Desktophöhe. Die Diagrammfarben sind ruhiger;
Nicht-Null-Werte erscheinen direkt an den Säulen, während echte Nullen und
unbekannte Werte fachlich unverändert bleiben. Die gemeldeten Nullwerte konnten
ohne befüllte Browseransicht nicht vollständig nachgestellt werden.

**Prüfung:** Drei Node- und sechs Angular-Erwartungen schlugen vor der Änderung
gezielt fehl. Danach bestanden 34 fokussierte Node- und 20 fokussierte
Angular-Tests. Lint, Typprüfung und der Produktionsbau mit Node 24 bestanden.
Die Gesamtsuite bestand mit 1.458 Node- und 245 DOM-Tests; vier fachfremde
Angular-AXE-Tests liefen unter unbeschränkter Parallelität in das
5-Sekunden-Timeout. Dieselben vier Tests bestanden gezielt (34/34), danach die
gesamte Angular-Suite mit vier Workern (1.053/1.053). Browser-Tests konnten
ohne lokale Supabase nicht laufen; ihre CLI stürzte bereits bei `status` ab.

## 2026-09-23 – Juna – Dashboard-Ausgaben und Diagrammbegriffe getrennt

**Auftrag:** Einkäufe als alle im Zeitraum gekauften Waren zeigen, Betriebsausgaben
für Fix- und Materialkosten getrennt halten und zusätzlich die Gesamtausgaben
einschließlich Gebühren und Versand sichtbar machen. Die Diagrammbegriffe und
den störenden Cashflow-Hinweis korrigieren.

**Änderung:** Sieben Kennzahlen zeigen Umsatz, Einkäufe, Betriebsausgaben,
Ausgaben gesamt, verkaufsbezogenen Gewinn, Marge und Cashflow. Das
Säulendiagramm nutzt dieselben Werte für Umsatz, Ausgaben gesamt und Cashflow;
seine Tages- und Monatswerte berücksichtigen Einkäufe nach Kaufdatum,
Verkaufsgebühren und Versand sowie bezahlte Betriebsausgaben nach Zahlungsdatum.
Bei Plattformfiltern bleiben nicht zurechenbare Ausgaben und Cashflow unbekannt.
Die lange Erläuterung unter der Cashflow-Kachel entfällt.

**Prüfung:** Die neuen Berichts-, Karten- und Diagrammtests schlugen vor der
Umsetzung gezielt fehl. Danach bestanden 34 fokussierte Node- und 20 fokussierte
Angular-Tests sowie die vollständige Anwendungssuite mit 1.458 Node-, 245 DOM-
und 1.053 Angular-Tests. ESLint, Typprüfung und Produktionsbau bestanden; der
Bau meldete nur den bekannten `pako`-Hinweis aus `pdf-lib`. Die Browsertests
erfordern eine lokale Supabase und wurden hier nicht ausgeführt.

## 2026-09-23 – Juna – Dashboard-Kennzahlen und Säulendiagramm vereinfacht

**Auftrag:** Das bisherige Liniendiagramm durch ein ruhiges Apex-Säulendiagramm
ersetzen und die Ausgaben im Dashboard klarer darstellen. Die separate
Ausgabenkarte soll entfallen, weil Gebühren, Versand und bezahlte
Betriebsausgaben bereits in den Cashflow einfließen; Einkäufe sollen stattdessen
als eigene Kennzahl erscheinen.

**Änderung:** Der gemeinsame Verkaufsbericht zeigt die vier unveränderten
Kennzahlen nun als gruppierte, gerundete Säulen mit quadratischen
Legendenmarkern. Die bestehende Tastatursteuerung, Fehlerdarstellung,
Datentabelle und Reihenfilterung bleiben erhalten. Im Kennzahlenbereich ersetzt
die neue Kachel „Einkäufe“ die bisherige Ausgabenkarte; der Cashflow erklärt
knapp, dass Einkäufe, Gebühren, Versand und bezahlte Betriebsausgaben enthalten
sind. Bei einem einzelnen Plattformfilter bleiben Cashflow und Einkäufe wie
bisher unbekannt, weil diese Ausgaben nicht verlässlich einer Plattform
zugeordnet sind.

**Prüfung:** Die neuen Erwartungen schlugen vor der Umsetzung gezielt für das
Linienchart und die fehlende fünfte Kachel fehl. Danach bestanden 35 fokussierte
Chart- und Dashboardtests sowie die vollständige Anwendungssuite mit 1.458
Node-, 245 DOM- und 1.053 Angular-Tests. ESLint, Typprüfung und Produktionsbau
bestanden; der Bau meldete nur den bekannten `pako`-Hinweis aus `pdf-lib`. Die
zwei Dashboard-Browsertests konnten nicht starten, weil die dafür erforderliche
lokale Supabase unter `127.0.0.1:54351` nicht lief.

## 2026-09-23 – Juna – Wieder geöffnete Einkäufe und Chronik bereinigt

**Auftrag:** Nach gebuchtem Wareneingang den redundanten Hinweis unter der
gesperrten Menge entfernen und die Uhrzeiten aller Systemereignisse in der
Einkaufschronik an derselben rechten Kante ausrichten. Außerdem die unerwartet
erscheinende Eigenbeleg-PDF nach dem Abschluss untersuchen. Beim erneuten Öffnen
einer Erfassung sollen der Warenwert und die vorhandenen Positionen vollständig
erhalten bleiben; nicht nutzbare Artikel- und Wareneingangsaktionen sollen
verschwinden.

**Änderung:** Bereits eingegangene Mengen bleiben als deaktivierte Felder
geschützt, werden aber nicht mehr durch den Text „Menge nur über eine Korrektur
ändern“ ergänzt. Aufklappbare und einfache Chronikereignisse verwenden nun
dieselbe vollbreite Zweispaltenanordnung; ihre Uhrzeiten stehen dadurch gemeinsam
am rechten Rand. Nach dem Wiederöffnen wechselt die Detailseite direkt in die
Erfassungsmaske und bildet den Warenwert wieder aus sämtlichen gespeicherten
Positionssummen, einschließlich bereits erfasster und daher gesperrter Artikel.
Vollständig erfasste Positionen bieten keinen leeren Wareneingang mehr an; der
zusätzliche Link „Artikel bearbeiten“ wurde aus der reinen Ansicht entfernt. Die
Eigenbeleg-Erzeugung wurde nicht geändert: Sie läuft nur für Einkäufe, die
ausdrücklich mit dem Modus `self` gespeichert wurden, und nicht allein durch den
Abschluss oder einen vorhandenen Upload.

**Prüfung:** Sechs neue Regressionstests schlugen vor den Änderungen an den
gemeldeten Stellen fehl. Danach bestanden 110 fokussierte Tests der betroffenen
Einkaufs- und Chronikkomponenten. Formatprüfung, ESLint, Typprüfung und 84
Workflow-Tests bestanden. Der Produktionsbau bestand mit Node 22.22.3 und
meldete nur den bekannten Hinweis zu `pako` aus `pdf-lib`.

## 2026-09-23 – Juna – Einkaufs-Kostenübersicht vereinfacht

**Auftrag:** Zusatzausgaben ohne Trennlinien und ohne „Noch prüfen“ in der
Kostenübersicht anzeigen. Die Auswahlliste im Kostendialog um die
Käuferschutzgebühr ergänzen und seltene oder doppelte Einträge entfernen.

**Änderung:** Die Kostenübersicht und der Kostendialog zeigen die Zeilen direkt
untereinander; nur die Gesamtsumme bleibt optisch abgesetzt. Die Auswahlliste
enthält nun Versandkosten, Käuferschutzgebühr, Zollgebühren, Versicherung,
Rabatt und Sonstiges in dieser Reihenfolge. Ältere Kosten mit entfernten
Bezeichnungen bleiben beim Bearbeiten erhalten. Der Fallback für Zollkosten
lautet einheitlich „Zollgebühren“.

**Prüfung:** Fokussierte Angular- und Logiktests, Typprüfung, ESLint,
Formatprüfung und Produktionsbau bestanden. Auf dem aktuellen `origin/master`
bestanden 143 fokussierte Anwendungstests, 84 Workflow-Tests, Typprüfung,
ESLint und Produktionsbau. Vier passende Datenbanktestdateien mit 60
Einzelprüfungen bestanden. Der Bau meldet den bekannten Hinweis zu `pako` aus
`pdf-lib`.

## 2026-09-23 – Juna – Eigenbelege für Einkäufe eingeführt

**Auftrag:** Einkäufe ohne eindeutig identifizierbaren Verkäufer einfach erfassen,
auch außerhalb von Vinted. Den überflüssigen Untertitel in der Belegkarte entfernen.

**Änderung:** Das Einkaufsformular bietet einen einfachen Wechsel zwischen
Verkäuferauswahl und Eigenbeleg. Im Eigenbelegmodus ist ein Verkäuferstammsatz
entbehrlich; eine bekannte Verkäuferangabe kann als Freitext erfasst werden.
Kaufdatum, Positionen, Preis, Bezugsquelle, Referenznummer und hochgeladene
Nachweise bleiben im bestehenden Ablauf. Beim Abschluss wird ein PDF-Eigenbeleg
erstellt und im privaten Belegspeicher abgelegt. Ein fehlgeschlagener Upload kann
auf der Einkaufsdetailseite erneut angestoßen werden. Erzeugte Eigenbelege sind
vor dem Löschen geschützt. Der Untertitel „Originaldateien zu diesem Einkauf“
wurde aus der Belegkarte entfernt.

**Datenbank:** Deklaratives Schema, erzeugte Migrationen und Supabase-Typen
erweitern Einkäufe und Belege um den Eigenbelegmodus und die eindeutige
Zuordnung zum jeweiligen Abschluss. Zugriffsregeln schützen den erzeugten Beleg.

**Prüfung:** Beigefügten Text, bisherigen Ablauf und amtliche GoBD-Quellen
geprüft. `npm run verify` bestand mit Formatprüfung, ESLint, Typprüfung,
81 Workflow-Tests, 16 Edge-Tests, Suite-Audit, 2.744 Anwendungstests,
23 Landingpage-Tests und Produktionsbau. Danach ergänzte Regressionstests für
Abschlussfehler, erneuten Belegversuch und Verkäuferanzeige bestanden gezielt.
Alle 54 Datenbanktestdateien mit 1.967 Einzelprüfungen bestanden. Die erzeugte Migration wurde am lokalen
Migrationsstand geprüft; der öffentliche Schemaabgleich war anschließend leer.

## 2026-09-22 – Juna – Inserate: Unterstützung von Bestandsprodukten und Mengenartikeln im Listing Studio

**Auftrag:** Im Inserate-Modul (`/listings/new`) neben Einzelstücken (`inventory_items`) auch Bestandsprodukte und Mengenartikel (`catalog_products` mit verfügbarem Bestand in `stock_lots`) zur Auswahl und zum Inserieren bereitstellen.

**Änderung:**

- In `supabase/schemas/230_listings.sql` und der Migration `20260922201500_listings_catalog_products.sql`:
  - `inventory_item_id` in `public.listings` als optional definiert und `catalog_product_id` hinzugefügt (`REFERENCES public.catalog_products(workspace_id, id) ON DELETE CASCADE`).
  - Constraint `listings_target_check` hinzugefügt: genau eines von `inventory_item_id` oder `catalog_product_id` muss gesetzt sein.
  - Eindeutige Indizes `listings_one_open_per_item` und `listings_one_open_per_product` sowie `listings_catalog_product_id_idx` definiert.
  - RPCs `prepare_listing`, `set_listing_online` und `end_listing` aktualisiert, um sowohl Einzelstücke als auch Katalogprodukte (mit Advisory Lock und Bestandsprüfung) zu unterstützen.
- In `src/app/features/listings/models/listing.models.ts`:
  - Typ `ListingTargetKind = 'inventory_item' | 'catalog_product'` definiert.
  - `Listing`: `inventoryItemId?: string | null` und `catalogProductId?: string | null`.
  - `ListingEditorItem`: `targetKind?: ListingTargetKind`, `availableQuantity?: number`, `condition: InventoryItem['condition'] | null`.
- In `src/app/features/listings/models/listing.rules.ts`:
  - `canPrepareListing` erweitert, um für Katalogprodukte anhand von `availableQuantity > 0` die Inserierbarkeit zu prüfen.
- In `src/app/features/listings/services/listing.service.ts`:
  - `load(workspaceId)` lädt neben Inseraten und Einzelstücken auch `catalog_products` (inklusive Medien) sowie `stock_lots` (zur Bestandsberechnung).
  - Beide Zieltypen werden in `items` und `rows` gemappt.
  - `prepare` übergibt je nach Zieltyp `p_inventory_item_id` oder `p_catalog_product_id` an die RPC.
- In `src/app/features/listings/pages/listing-editor/listing-editor.component.ts` & `.html`:
  - Dropdown zeigt Mengenprodukte mit `${title} · Mengenbestand: ${availableQuantity}` und Einzelstücke mit `${title} · Einzelstück` an (analog zum Verkaufsdialog).
  - Produkte ohne verfügbaren Bestand werden ausgefiltert.
  - Zustand bei leerem Bestand, Ladezustand (`Lade Bestände…`) und Fehleranzeige integriert.
  - Beim Auswählen eines Produkts werden Preis und Artikeldetails passend vorbelegt und angezeigt.
- In `src/app/features/listings/pages/listing-overview/listing-overview.component.ts` & `.html`:
  - Verlinkung von Artikeln dynamisch: `/catalog/:id` für Katalogprodukte und `/inventory/:id` für Einzelstücke.
- Tests in `listing.rules.spec.ts`, `listing.service.angular.spec.ts`, `listing-editor.component.angular.spec.ts` und `listing-overview.component.angular.spec.ts` ergänzt und aktualisiert.

**Prüfung:** `npm run test:workflow` (84/84 bestanden, 0 Findings), `npm run lint` (0 Fehler), `npm run typecheck` (0 Fehler), `npm run test:angular -- src/app/features/listings` (35/35 bestanden), `npm run test:node -- src/app/features/listings` (16/16 bestanden), `npm run test:dom -- src/app/features/listings` (18/18 bestanden).

## 2026-09-22 – Juna – Steuer- & DATEV-Designangleichung: Umstellung auf PageHeader, CardComponent und Polaris-Geometrie

**Auftrag:** Die Buchhaltungsansicht (`src/app/features/accounting/`) an die einheitliche Shopify-Admin-Geometrie und Shared-UI-Komponenten angleichen. Veraltete `.card`- und `.kpi-card`-Container durch `CardComponent` ersetzen, den Kopfbereich auf `PageHeaderComponent` und segmentierte `ButtonComponent`-Tabs umstellen, Aktionsschaltflächen auf `ButtonComponent` migrieren und unzulässige Versalschrift entfernen.

**Änderung:**

- In `accounting.component.ts` wurden `PageHeaderComponent` und `CardComponent` importiert und in die Komponenten-Imports aufgenommen.
- In `accounting.component.html` wurde der handgestylte Kopfbereich durch `PageHeaderComponent` mit segmentierter Button-Gruppe für die Ansichtsumschaltung (§ 25a Steuer & DATEV / Bankabgleich) ersetzt.
- Der Datei-Upload-Auslöser und der Zurücksetzen-Button im Bankabgleich nutzen nun standardisierte `ButtonComponent`-Instanzen (`variant="primary"` bzw. `variant="ghost"`).
- Die vier Kennzahlenkarten im Bankabgleich und die vier Kennzahlenkarten im Steuerjournal wurden durch `CardComponent` mit `rounded="xl"` und `padding="sm"` ersetzt; `.kpi-value` sowie semantische Erfolgs- und Verlustfarben bleiben zur Gewährleistung bestehender Testverträge erhalten.
- Der Aktionsbereich und die Steuerhinweisbox im Steuerjournal wurden in `CardComponent` eingebettet; die Export-Buttons (`DATEV EXTF CSV`, `§ 25a Journal`, `Berichtspaket vorbereiten`) wurden auf `ButtonComponent` umgestellt.
- Die statische Steuerjournal-Tabelle wurde in `<app-card padding="none" rounded="xl">` mit strukturierter `[card-header]`-Projektion (Titel, Untertitel und `BadgeComponent` für die Eintragszahl) gekapselt; die Rechnungsanzeige-Schaltfläche wurde auf `ButtonComponent` umgestellt.
- Die Formularbeschriftung für den Kontenrahmen im Steuerberater-Modal wurde von dekorativer Versalschrift (`uppercase tracking-wider`) auf standardisiertes Label-Styling umgestellt.
- In `accounting-tax-review.angular.spec.ts` wurden `PageHeaderComponent` und `CardComponent` registriert sowie `iconOnly` und `title` für `ButtonComponent` in den Test-Metadaten hinterlegt.

**Prüfung:** `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm run test:workflow` (84/84 bestanden, 0 Findings in `check-admin-shared-ui`), `node --test scripts/check-admin-shared-ui.test.mjs` (14/14 bestanden) sowie alle 20 Vitest-Tests in `src/app/features/accounting/` erfolgreich ausgeführt.

## 2026-09-22 – Juna – Repository-Hygiene: Dependabot-Upgrades und Bereinigung veralteter Tracking-Branches

**Auftrag:** Veraltete Remote-Tracking-Branches aufräumen und freigegebene CI-Abhängigkeitsupdates von Dependabot mergen.

**Änderung:**

- Die beiden erfolgreich getesteten Dependabot-Pull-Requests [#142](https://github.com/GrischaTDev/flipbase/pull/142) (`docker/build-push-action` 7.3.0 → 7.4.0) und [#143](https://github.com/GrischaTDev/flipbase/pull/143) (`docker/setup-buildx-action` 4.3.0 → 4.4.1) per Merge-Commit in `master` übernommen.
- Veraltete Remote-Tracking-Referenzen (`origin/juna/shared-ui-cleanup-core`, `origin/juna/shared-ui-cleanup-forms`) über `git remote prune origin` entfernt.

**Prüfung:** PR-Checks auf GitHub Actions erfolgreich; Master-Zweig synchronisiert und auf aktuellem Stand.

## 2026-09-22 – Juna – Bereinigung von Compiler-Warnungen: Ungenutzte LucideDynamicIcon-Importe und stabile @for-Identität im Steuerjournal

**Auftrag:** Die bekannten Angular-Compiler-Warnungen NG8113 (ungenutzte `LucideDynamicIcon`-Importe) in `DashboardComponent` und `SellersComponent` entfernen sowie die NG0956-Laufzeitwarnung für die identitätsbasierte `@for`-Schleife im Steuerjournal der Buchhaltungsansicht (`accounting.component.html`) durch stabiles Tracking nach Verkaufs-ID und Index beheben.

**Änderung:**

- In `src/app/features/dashboard/dashboard.component.ts` und `src/app/features/sellers/sellers.component.ts` wurde der ungenutzte Import `LucideDynamicIcon` aus `@lucide/angular` und aus den `imports`-Arrays der Komponenten entfernt (behebt NG8113).
- In `src/app/features/accounting/accounting.component.html` wurde `@for (row of filteredTaxResults(); track row)` auf `@for (row of filteredTaxResults(); track row.sale_id + ':' + $index)` umgestellt, um instabiles Objekt-Identitäts-Tracking zu vermeiden (behebt NG0956).

**Prüfung:** `npm run format:check`, `npm run lint`, `npm run typecheck`, lokaler Angular-Produktionsbau ohne Warnungen (`Application bundle generation complete`), `npm run test:workflow` (84/84 bestanden, 0 Findings in check-admin-shared-ui) sowie alle 88 Vitest-Tests in Dashboard, Sellers und Accounting erfolgreich ausgeführt.

## 2026-09-22 – Juna – Shared-UI-Bereinigung: Vollständige Migration aller verbleibenden Vorlagen und Leerung der Ausnahmelisten

**Auftrag:** Alle verbleibenden Legacy-Formularfelder und modalen Dialoge in den verbleibenden 15 Vorlagen (Accounting, Audit-Timeline, Auth-Login, Privacy/Terms-Modals, Deal-Calculator, Fulfillment, Image-Optimizer, Listing-Editor, Onboarding-Workspace-Setup, Research, Sales, Sale-Create-Modal) auf die standardisierten Shared Components (`TextFieldComponent`, `NumberInputComponent`, `CustomCheckboxComponent`, `ModalShellComponent`, `ButtonComponent`) umstellen. Die Ausnahmelisten `legacyNativeFormControlPaths` und `legacyCustomModalPaths` in `scripts/check-admin-shared-ui.mjs` vollständig auf leere Sets leeren und alle Tests sowie den Produktionsbau grünstellen.

**Änderung:**

- In `TextFieldComponent` wurde das `value`-Property auf `model<string>('')` erweitert, um Zwei-Wege-Bindung `[(value)]` und `(valueChange)` zu unterstützen; zusätzliche ARIA-Inputs (`ariaRequired`, `ariaDescribedby`, `ariaInvalid`) wurden ergänzt.
- In `NumberInputComponent` wurde das Input `ariaInvalid` ergänzt und an `[attr.aria-invalid]` angebunden.
- In `scripts/check-admin-shared-ui.mjs` wurden `legacyNativeFormControlPaths` und `legacyCustomModalPaths` vollständig geleert (`new Set()`).
- Alle 15 betroffenen Feature-Templates wurden vollständig auf die Shared Controls migriert: native `<input>`- und `<textarea>`-Felder durch `app-text-field` und `app-number-input`, native `<input type="checkbox">` durch `app-custom-checkbox`, native Custom-Dialoge durch `app-modal-shell` und Aktionsschaltflächen durch `app-button`. Für Zahlenfelder (`app-number-input`) in Sales und Deal-Calculator wurden explizite Labels und ARIA-Labels für Barrierefreiheit und End-to-End-Selektoren beibehalten.
- In Vitest-Komponententests (`workspace-setup.component.angular.spec.ts`, `listing-editor.component.angular.spec.ts`, `sale-create-modal.component.angular.spec.ts`, `record-timeline.component.angular.spec.ts`, `record-history.container.angular.spec.ts`) wurden die Signal-Input- und Binding-Metadaten für die Shared Components registriert und Template-Ressourcen aufgelöst.

**Prüfung:** `npm run format:check`, `npm run lint`, `npm run typecheck`, `node --test scripts/check-admin-shared-ui.test.mjs` (14/14 bestanden), `node scripts/check-admin-shared-ui.mjs` (0 Findings bei 96 Dateien), `npm run test:workflow` (84/84 bestanden), gesamte Vitest-Suite (`npx vitest run`: 294 Test-Dateien, 2729 Tests alle bestanden), E2E-Smoke-Lokalisierung sowie Angular-Produktionsbau (`ng build`) fehlerfrei ausgeführt.

## 2026-09-22 – Juna – Shared-UI-Bereinigung: Alle neun Einstellungsseiten auf Shared Controls migriert

**Auftrag:** Alle 9 Seiten unter `src/app/features/settings/` (`account-settings`, `app-settings`, `data-and-audit`, `notification-settings`, `numbering-settings`, `shipping-settings`, `store-settings`, `team-settings`, `workspace-settings`) auf Shared Components (`TextFieldComponent`, `NumberInputComponent`, `CustomCheckboxComponent`, `DatePickerComponent`, `ModalShellComponent`, `ButtonComponent`) umstellen, alle 9 Pfade aus `legacyNativeFormControlPaths` und `team-settings.component.html` aus `legacyCustomModalPaths` entfernen sowie strikte 0-Native-Controls-Prüfung für `settings` in `scripts/check-admin-shared-ui.mjs` aktivieren.

**Änderung:** In `TextFieldComponent` wurde das `maxLength`-Input ergänzt und an `[attr.maxlength]` angebunden. In `NumberInputComponent` wurde `ariaDescribedby` ergänzt. Alle 9 Einstellungsseiten wurden von nativen `<input>`- und Formularfeldern sowie dem individuellen Einladungsdialog auf die zentralen Shared Components umgestellt. In `expense-documents.component.html` wurde der native Datei-Upload mit dem Attribut `data-shared-ui-exception="native-file-picker"` markiert. `scripts/check-admin-shared-ui.mjs` erzwingt nun strikt 0 native Form-Controls im Settings- und Expenses-Bereich. Sämtliche Test-Dateien und -Metadatenbridges in `settings-behavior.angular.spec.ts` und `numbering-settings.component.angular.spec.ts` wurden aktualisiert.

**Prüfung:** `npm run format:check`, `npm run lint`, `npm run typecheck`, `node --test scripts/check-admin-shared-ui.test.mjs` (14/14), `npm run test:workflow` (84/84 bestanden, 0 Findings in check-admin-shared-ui), alle 68 Angular- und 30 Node-Tests unter `src/app/features/settings` sowie der Angular-Produktionsbau (`ng build`) erfolgreich mit Exitcode 0 ausgeführt.

## 2026-09-22 – Juna – Richtlinie für Pull Requests auf Deutsch aktualisiert

**Auftrag:** Die verbindlichen Projektrichtlinien in `AGENTS.md` anpassen, sodass Pull-Request-Titel und -Beschreibungen ab sofort immer auf Deutsch verfasst werden.

**Änderung:** In `AGENTS.md` wurden die Abschnitte „Sprache“ und „Pull Requests“ aktualisiert. Pull Requests sind nun ausdrücklich auf Deutsch gefordert; Commit-Nachrichten verbleiben im Conventional-Commit-Format auf Englisch.

**Prüfung:** `npm run format:check` erfolgreich ausgeführt.

## 2026-09-22 – Juna – Shared-UI-Bereinigung: Inventar-Formulare und Dialoge migriert

**Auftrag:** Legacy-Formulare, native Eingabefelder und eigene Dialograhmen im Bereich Inventar auf die zentralen Shared Components (`ModalShellComponent`, `TextFieldComponent`, `NumberInputComponent`, `CustomCheckboxComponent`, `ButtonComponent`) umstellen und die Pfade aus den Ausnahmelisten in `scripts/check-admin-shared-ui.mjs` entfernen.

**Änderung:** In `item-create-modal` wurde der eigene Modalrahmen durch `ModalShellComponent` ersetzt, die sechs nativen Form-Inputs auf `TextFieldComponent` und `NumberInputComponent` umgestellt und Aktions- sowie Footer-Buttons auf `ButtonComponent` migriert. In `item-detail` wurde das Erfassen von Zusatzkosten auf `NumberInputComponent`, `TextFieldComponent` und `ButtonComponent` umgestellt sowie der Vollbild-Vorschau-Dialog auf `ModalShellComponent` migriert. In `stock-position-list` wurde die Checkbox der Zeilenauswahl auf `CustomCheckboxComponent` umgestellt. `NumberInputComponent` unterdrückt nun `[attr.id]` auf dem Host-Element zur Vermeidung doppelter Element-IDs. In `scripts/check-admin-shared-ui.mjs` wurden die beiden Inventar-Vorlagen aus `legacyNativeFormControlPaths` und `legacyCustomModalPaths` entfernt.

**Prüfung:** `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm run test:workflow` (83 bestanden, 0 Findings in check-admin-shared-ui), alle 13 Test-Dateien mit 176 Tests unter `src/app/features/inventory/` sowie der Angular-Produktionsbau (`ng build`) erfolgreich mit Exitcode 0 ausgeführt.

## 2026-09-22 – Juna – Shared-UI-Bereinigung: Test-Ressourcen und Form-Control-Anbindung in PR #149 gefixt

**Auftrag:** CI-Fehler in PR #149 (refactor(ui): migrate forms to shared controls) analysieren und beheben.

**Änderung:** In `expense-category-dialog.component.angular.spec.ts` wurde der Zugriff auf das neu eingeführte `newNameControl` anstelle des früheren Signals aktualisiert. In `purchase-correction-dialog.component.angular.spec.ts` wurde das Laden von Template-Ressourcen auf dynamisches `glob` für die neu verwendeten Shared Components (`ButtonComponent`, `ModalShellComponent`, `TextFieldComponent`) umgestellt, Binding-Bridges für Shared Controls ergänzt und der asynchrone Abschluss von `submit()` im Test mit Change Detection synchronisiert. Zudem wurden die Vorlagen `recurring-expense-dialog.component.html` und `purchase-correction-dialog.component.html` sowie die Spec Prettier-konform formatiert.

**Prüfung:** `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm run test:workflow` (83 bestanden, 0 Findings in check-admin-shared-ui), `npm run test:audit` sowie alle betroffenen Vitest-Specs in `expenses` und `purchases` lokal erfolgreich ausgeführt (Exitcode 0).

## 2026-09-22 – Juna – Beta-, Einkaufs- und Artikelflüsse nachgeschärft

**Auftrag:** Die bei der manuellen Abnahme gefundenen Rückmeldungen zur
Beta-Bewerbung, zu Einkäufen, Verkäufen, Marken und zur Artikelerfassung beheben.
Abgeschlossene Einkäufe dürfen nach dem Wiederöffnen keine bereits eingegangenen
Mengen still verändern; Status und Kosten sollen ohne Seitenneuladen aktuell sein.

**Änderung:** Der Beta-Erfolgsdialog nutzt die volle Breite und die Einladungs-
Betreffzeile ist ohne Schrägstriche konfiguriert. Vorhandene Bewerbungen behalten
ihren eigenen Konfliktpfad. Einkaufsentwürfe öffnen nach dem Speichern ihre
Detailseite. Statusfarben unterscheiden angekommen und abgeschlossen. Der
Wareneingang wird über einen gemeinsamen Dialog gebucht und setzt den
Ankunftsstatus automatisch. Bereits eingegangene Mengen sind bei einer späteren
Bearbeitung strukturell gesperrt. Bestätigte Status- und Kostendaten werden sofort
in die zentralen Einkaufs- und Verkaufssignale übernommen. Die Artikelerfassung
unterstützt zusätzliche Stammdaten, mehrere Bilder sowie eine lokale
Markenverwaltung mit sicherer Neuzuordnung vor dem Löschen. Die Artikeldetailseite
stellt dieselben Stammdaten zur späteren Bearbeitung bereit.

**Datenbank:** Die deklarativen Schemadateien ergänzen Artikelfelder, eine
workspace-gebundene Marken-Ersetzungsfunktion und den automatisch abgeleiteten
Wareneingangsstatus. Die zugehörige Migration wurde lokal erzeugt, auf den
tatsächlich beabsichtigten Umfang geprüft und erfolgreich angewendet. Die lokalen
Supabase-Typen wurden anschließend neu erzeugt.

**Prüfung:** 239 fokussierte Angular-Tests, 24 Landingpage- und Beta-Vertragstests
sowie alle 53 Datenbanktestdateien mit 1.959 Einzelprüfungen bestanden. Der
vollständige Aufruf `npm run verify` bestand anschließend mit Exitcode 0:
Formatprüfung, ESLint, strikte Typprüfung, Workflowtests (81 bestanden, fünf
Umgebungs-Skips), Edge-Tests (16), Suite-Audit, 2.729 Anwendungstests,
23 Landingpage-Tests und der Produktionsbau. Der Bau enthält weiterhin nur die
zwei bekannten NG8113-Hinweise im Dashboard und in der Verkäuferliste.

## 2026-09-21 – Juna – PR-Browserprüfung an vereinfachte Zusatzausgaben angepasst

**Auftrag:** Den bestätigten UI-Regression-PR nach erfolgreichen Pflichtprüfungen
mergen und einen dabei gefundenen Browserfehler vor dem Merge beheben.

**Änderung:** Die Browserfälle verwenden jetzt die sichtbaren Begriffe
„Zusatzausgaben verwalten“ und „Zusatzausgabe“. Der bisherige Pflichtfall zur
entfernten Kostenherkunft prüft stattdessen den aktuellen Nutzerablauf: zusätzliche
Versandkosten erfassen, nach erneutem Öffnen ändern und nach einem Reload
wiederfinden. Die PR-Auswahl und ihre Dokumentation wurden entsprechend
aktualisiert. Das gemeinsame Textfeld entfernt eine explizite Feld-ID vom
Komponenten-Host, damit Label und Fehlermeldung eindeutig mit dem inneren
Eingabefeld verknüpft sind. Dadurch ist auch das Namensfeld beim Erstellen eines
Verkäufers wieder zugänglich benannt.

**Prüfung:** Der ursprüngliche Pflichtfall wurde in CI und lokal rot reproduziert.
Der neue ID-Regressionsfall scheiterte zunächst erwartungsgemäß an zwei Elementen
mit `seller-name`. Danach bestanden 23 fokussierte Angular-Tests, der gezielte
Verkäufer-Browserfall, elf weitere Einkaufs-Browserfälle und der vollständige
PR-Browserlauf mit 9/9 Fällen. Außerdem bestanden Formatprüfung, ESLint, strikte
Typprüfung, die zwei Verträge der Playwright-Auswahl und der Produktionsbau.

**Prüfhinweise:** Der Bau enthält weiterhin die zwei bekannten NG8113-Hinweise
im Dashboard und in der Verkäuferliste. Keine Datenbank-, Migrations- oder
Abhängigkeitsänderung.

## 2026-09-21 – Juna – Vier abschließende UI-Fehlerpfade korrigiert

**Auftrag:** Die vier wichtigen Funde der Gesamtprüfung in einer begrenzten
Fix-Runde beheben und die bestehenden Karten-, Button- und Formularverträge
bewahren.

**Änderung:** Ein Ladefehler beendet jetzt den Ladezustand der Einkaufsliste und
bietet einen zugänglichen erneuten Versuch für den aktiven Workspace an.
Verwaiste direkte Zusatzausgaben werden mit sichtbarem Statushinweis auf die
Standardverteilung des Einkaufs umgestellt. Steuerherkunft, Ursprungsdaten,
Kostenart und Betrag bleiben unverändert; gültige direkte Zuordnungen bleiben
auch bei Mystery-Einkäufen erhalten. Der Bezugsquellendialog blockiert alle
Schließwege während des Speicherns. Der gemeinsame Button unterstützt eine
optionale native Formularzuordnung; Verkäufer und Bezugsquelle speichern damit
über genau einen Submit-Weg. Die standardmäßige Buttonzentrierung bleibt erhalten.

**Prüfung:** Jeder Fund wurde vor der Korrektur mit roten Regressionstests
reproduziert: zwei Listenfehler, drei Kostenfehler, drei ungeschützte Schließwege
und vier fehlende Submit-Verknüpfungen. Danach bestanden gemeinsam 110 fokussierte
Angular-Tests einschließlich Einkaufserfassung und vorhandener AXE-Prüfungen
sowie acht Kostenlogiktests. Gezieltes ESLint, Prettier und die strikte Typprüfung
bestanden. Der einmalige Gesamtaufruf `npm run verify` bestand mit direkt
gesichertem **Exitcode 0**: Format, Lint, Typen, Workflow (81 bestanden, fünf
Umgebungs-Skips), Edge (16), Suite-Audit, Anwendung (2.715 Tests in 293 Dateien),
Landingpage (22) und Produktionsbau. Die darin enthaltenen Orchestratorprüfungen
bestanden mit acht Tests und drei Windows-Skips.

**Prüfhinweise:** Vitest meldete bei neun unveränderten Node-Testdateien ein
verzögertes Beenden der Worker, obwohl alle Tests bestanden. jsdom meldete eine
fehlende Canvas-Funktion und neun nicht lesbare CSS-Stylesheets. Der Bau enthält
weiterhin die zwei bekannten NG8113-Hinweise in Dashboard und Verkäuferliste.
Diese Hinweise wurden dokumentiert; die vier Fehlerpfade und der Gesamtaufruf
sind grün.

**Abgrenzung:** Keine Datenbank-, Migrations-, Snapshot-, Abhängigkeits-, Browser-
oder Dockeränderung. Die zuvor dokumentierte visuelle Abnahme bleibt offen.

## 2026-09-21 – Juna – UI-Regressionen integriert und Prüfgrenzen dokumentiert

**Auftrag:** Die elf UI-Aufgaben gemeinsam prüfen, neue Integrationsfehler
beheben und die manuelle Abnahme in der bereits laufenden Umgebung dokumentieren.

**Änderung:** Die strikte Typprüfung der neuen DOM-Tests und des
Bezugsquellen-Mocks korrigiert; historische Stornostatuswerte werden ausdrücklich
als Altbestand geprüft. Einen ungenutzten Icon-Import in der Einkaufsliste
entfernt. Die gemeinsame Architekturprüfung fand außerdem den neu eingeführten
nativen Entfernen-Button im Kosteneditor. Er verwendet jetzt den vorhandenen
roten Shared-Button; ein zunächst roter DOM-Test prüft Gestaltung und Entfernen
der richtigen Zeile. Keine Datenbank-, Migrations- oder Snapshotänderung.

**Prüfung:** Die Formatierung gemäß Task 12 sowie `npm run lint`,
`npm run typecheck` und `npm run build` bestanden. Die Typprüfung war vor der
Korrektur mit 13 Diagnosen rot. Fokussiert bestanden 92 Angular-Tests, 48
Präsentationstests und nach der zweiten Korrektur elf Kosteneditor-/Dialogtests.
`node scripts/check-admin-shared-ui.mjs` bestand anschließend mit 95 geprüften
Dateien ohne Befund. Erfolgreich waren außerdem `npm run test:workflow` (81 Tests,
fünf Windows-/Umgebungs-Skips), `npm run test:edge` (16 Tests), `npm run test:audit`,
`npm test` (2.704 Anwendungstests in 293 Dateien) und `npm run test:landing`
(22 Tests).

**Gesamtaufruf:** Der erste `npm run verify` endete mit Exitcode 1 am nativen
Kosteneditor-Button. Nach dessen Reparatur bestanden zunächst alle Prüfstufen
einzeln. Der ausdrücklich angeforderte erneute Gesamtaufruf auf dem reparierten
Endstand `5dff9b79` bestand anschließend vollständig mit **Exitcode 0**:
Formatierung, Lint, Typen, Workflow, Edge, Suite-Audit, sämtliche Anwendungstests,
Landingpage und Produktionsbau. Der Exitcode wurde unmittelbar aus
`$LASTEXITCODE` gesichert, ohne Pipe.
Der Produktionsbau enthält weiterhin zwei bekannte NG8113-Hinweise im
unveränderten Dashboard und in der unveränderten Verkäuferliste.

**Browserabnahme offen:** `browser-use` zeigte auf `http://localhost/`,
`http://localhost/landing/` und `http://flipbase.localhost/` den älteren
„ReFlip“-Build mit Loginseite. Das ausgelieferte Skript stimmt nicht mit dem
aktuellen Branch-Bau überein. Deshalb sind sämtliche zehn visuellen Abnahmefälle
einschließlich DE/EN, Themes und Druckvorschau noch ungeprüft. Keine Daten
angelegt, keine Server oder Docker-Container gestartet oder gestoppt. Eine
Veröffentlichung erfolgte nicht.

## 2026-09-21 – Juna – Druck-CSS-Vertrag regelblockweise gekoppelt

**Auftrag:** Der verbleibende Review-Fund sollte verhindern, dass ungebundene
Druckdeklarationen und leere route-bezogene Selektoren den CSS-Test gemeinsam
grün machen.

**Änderung:** Der Test extrahiert jetzt den konkreten Regelblock für den
Shell-Rahmen, Inhalts- und Hauptbereich, Empfang sowie Umbruchschutz. Jede
geforderte Eigenschaft wird in ihrem eigenen, mit
`body:has(app-purchase-print)` beginnenden Block erwartet. Die benannte
`@page`-Regel bleibt ebenfalls separat und eng geprüft.

**Prüfung:** Die fokussierten Druck- und Shelltests bestanden mit sieben Tests;
Prettier und fokussiertes ESLint ebenfalls. Es wurden keine Produktdateien
geändert.

## 2026-09-21 – Juna – Drucktests auf gerenderte Shell und enge CSS-Verträge nachgeschärft

**Auftrag:** Drei Review-Funde am Einkaufsdruck beheben: Die Shell-Haken über
einen echten Angular-TestBed-Render prüfen, den CSS-Vertrag vollständig
absichern und den Browserhinweis auf die sichtbare Aktionsleiste begrenzen.

**Änderung:** Der Shelltest verwendet gezielte Kindkomponenten-Stubs und die
echte Shell-Vorlage als TestBed-Template; alle fünf Haken werden dadurch im
tatsächlich von Angular erzeugten DOM geprüft. Der CSS-Test liest nur die
beiden relevanten Regeln aus und prüft Rahmen-Ausblendung, Inhalts-Resets,
benannte Seite, Umbruchschutz und A4-Ränder. Der Hinweis wird direkt unterhalb
der gefundenen `print:hidden`-Leiste geprüft.

**Prüfung:** Fokussierte Shell- und Drucktests bestanden mit sieben Tests;
Prettier und fokussiertes ESLint ebenfalls. Keine Produktlogik, Datenbank- oder
Docker-Dateien geändert.

## 2026-09-21 – Juna – Einkaufsdruck vom Admin-Rahmen getrennt

**Auftrag:** Der Einkaufsdruck sollte innerhalb der Shell bleiben, beim
Drucken aber weder Navigation noch Kopfzeile, Sprunglink oder Dialoghülle
zeigen. Andere Druckansichten und normale Verwaltungsseiten durften sich nicht
verändern.

**Änderung:** Die Shell markiert Sidebar, Inhaltsbereich, Kopfzeile,
Hauptinhalt und mobile Navigation mit eindeutigen Datenattributen. Der
Einkaufsdruck zeigt einen Hinweis zu Browser-Kopf- und Fußzeilen. Neue
Druckregeln greifen ausschließlich bei `app-purchase-print`, entfernen dort
den Admin-Rahmen, verwenden eine benannte A4-Seite mit 12 mm Rand und vermeiden
Umbrüche in zusammengehörenden Empfangsabschnitten.

**Prüfung:** Die neuen Shell- und Drucktests waren zuerst rot und sind danach
mit sieben fokussierten Angular-Tests grün. Prettier, fokussiertes ESLint und
der Produktionsbau bestanden. Der Bau meldet weiterhin drei bekannte
NG8113-Hinweise zu ungenutzten `LucideDynamicIcon`-Imports außerhalb dieses
Scopes.

## 2026-09-21 – Juna – Chronikzeit unabhängig vom Detailschalter ausgerichtet

**Auftrag:** Zeitangaben in der Einkaufschronik sollten unabhängig davon an
derselben rechten Stelle stehen, ob ein Ereignis Details anbietet.

**Änderung:** Jede Ereigniszeile verwendet jetzt ein festes zweispaltiges Grid.
Vorgang, Akteur, Grund und Detailschalter bleiben in der Inhaltsseite; die
Zeitangabe liegt als eigene `time`-Zelle mit `data-record-history-time` in der
zweiten Spalte.

**Prüfung:** Der neue DOM-Test war vor der Umsetzung rot (keine markierten
Chronikzeilen) und ist danach zusammen mit den bestehenden Chroniktests grün.
Prettier, fokussiertes ESLint und der Produktionsbau bestanden; die vollständige
Test-Suite blieb ebenfalls grün.

## 2026-09-21 – Juna – Einkaufsstatus nach fachlichem Fortschritt priorisiert

**Auftrag:** Die zentrale Einkaufsstatus-Präsentation sollte den fachlichen
Fortschritt vor technischen Lieferzuständen abbilden und für jeden Status den
vorgegebenen Ton verwenden.

**Änderung:** Archivierte und stornierte Einkäufe überschreiben alle anderen
Zustände. Danach überschreibt „Abgeschlossen“ bei finalisierten Einkäufen die
Lieferzustände; Teillieferung, Ankunft, Bestellung und Entwurf folgen in der
fachlich festgelegten Reihenfolge. Die Einkaufsliste selbst blieb unverändert.

**Prüfung:** Die vollständige Statusmatrix war zunächst mit den erwarteten
Fehlern rot und bestand nach der zentralen Korrektur mit 47 fokussierten
Node-Tests. Prettier, ESLint und der Produktionsbau wurden anschließend
ausgeführt.

## 2026-09-21 – Juna – Einkaufsliste zeigt Laden und Leerstand korrekt

**Auftrag:** Die Einkaufsliste zwischen bestätigtem Laden, echtem Leerstand und
Filtertreffern unterscheiden sowie lange Beschreibungen in der Tabelle lesbar
begrenzen.

**Änderung:** Die Tabelle erhält ihren Ladezustand aus dem bestehenden
Einkaufs- und Workspace-Vertrag. Solange der aktive Workspace nicht bestätigt
geladen ist, zeigt sie ausschließlich „Einkäufe werden geladen …“ statt eines
Leerzustands oder Daten des vorherigen Workspace. Der echte Leerzustand heißt
nun „Keine Einkäufe vorhanden“; Filtertreffer behalten „Keine passenden
Einkäufe“. Beschreibungen sind auf eine Tabellenzeile begrenzt, bleiben aber
vollständig im DOM und über den Titelhinweis verfügbar.

**Prüfung:** Die beiden neuen Regressionen waren zuerst rot (fehlender
Ladezustand und fehlender Beschreibungscontainer) und bestanden anschließend
mit 13 fokussierten Angular-Tests einschließlich AXE. Prettier und ESLint für
die betroffenen Dateien sowie der Produktionsbau bestanden. Der Bau meldet
weiterhin drei bekannte NG8113-Hinweise zu ungenutzten `LucideDynamicIcon`-
Importen in Dashboard, Einkaufsliste und Verkäuferliste.

## 2026-09-21 – Juna – Kosteneditor auf Zusatzausgaben reduziert

**Auftrag:** Im Kosteneditor nur noch Zusatzausgabe und Betrag zeigen, ohne
technische Steuer- und Zuordnungswerte bereits vorhandener Kosten beim Speichern
zu verlieren.

**Änderung:** Der Editor zeigt nur noch Auswahl, Betrag und eine zugängliche
Papierkorb-Aktion. Steuerherkunft, Verteilung und Zielposition bleiben in den
internen Formularwerten erhalten, werden jedoch nicht mehr dargestellt. Neue
normale Zeilen behalten `taxTreatment: null` und die Verteilung nach Warenwert;
Mystery-Pakete verwenden weiter die Verteilung nach Menge. Der Dialog heißt nun
„Zusatzausgaben verwalten“; sein lokaler Speichern- und Abbrechen-Vertrag bleibt
unverändert.

**Prüfung:** Die neuen Editor- und Dialogtests waren zuerst rot (3 erwartete
Fehler wegen der alten sichtbaren Begriffe und Dialogüberschrift) und bestanden
nach der Umsetzung. Die Kostenlogik (8 Tests) sowie die drei Angular-
Komponententests (18 Tests) sind grün; Prettier und der fokussierte ESLint-Lauf
ebenfalls. Der Produktionsbau besteht mit drei bereits vorhandenen NG8113-
Warnungen außerhalb des Scopes. Die globale Typprüfung ist aktuell wegen zehn
fachfremder Testtypfehler in Beleg-, Einkaufsquellen- und Verkäuferdialogtests
nicht grün.

## 2026-09-21 – Juna – Artikelnamen in Einkaufspositionen linksbündig ausgerichtet

**Auftrag:** Der Artikelnamen-Button in Einkaufspositionen sollte seinen Text
auch in der tatsächlich gerenderten Buttonfläche links statt zentriert zeigen,
ohne die Zentrierung anderer Shared-Buttons zu verändern.

**Änderung:** `ButtonComponent` besitzt nun den Signal-Input `contentAlign` mit
dem Standardwert `center`. Nur der Artikelnamen-Button setzt `contentAlign="start"`
und erhält damit `justify-start text-left`; alle übrigen Aufrufer behalten die
bisherige Zentrierung. Die Shared- und Featuretests prüfen den inneren nativen
Button sowie die Angular-Test-Metadaten für den neuen Input.

**Prüfung:** Die beiden fokussierten Angular-Tests waren vor der Umsetzung rot
(2 Fehler) und bestanden danach mit 33 Tests. Prettier und ESLint für die
betroffenen Dateien sowie der Produktionsbau wurden anschließend ausgeführt.

## 2026-09-21 – Juna – Bezugsquellen-Parent-Integration gerendert geprüft

**Auftrag:** Den Bezugsquellenfluss nicht nur über Quelltext und einen direkten
Methodenaufruf absichern, sondern als gerenderte Parent-Interaktion testen.

**Änderung:** Ein schmaler Test rendert die tatsächliche Einkaufserfassungs-
Vorlage mit gezielten Form- und Dialog-Stubs. Er klickt „Bezugsquelle erstellen“
prüft den gerenderten Dialog und löst dessen `created`-Ereignis aus. Dadurch ist
belegt, dass die Template-Bindung die Quelle auswählt, das Formular als geändert
markiert und den Dialog wieder schließt. Die für diesen Ablauf verwendeten
Quelltext-Assertions und der direkte Übergabetest entfallen.

**Prüfung:** Der neue DOM-Test war während des Stubaufbaus zunächst rot. Nach
der vollständigen Input-/Output-Abbildung bestanden 48 fokussierte
Angular-Tests sowie ESLint und Prettier. Der Fixabschnitt ist im Task-Bericht
ergänzt.

## 2026-09-21 – Juna – Bezugsquelle im eigenen Dialog angelegt

**Auftrag:** Die eingebettete Schnellerfassung einer Bezugsquelle aus dem
Einkaufsformular in einen eigenen, zugänglichen Dialog überführen.

**Änderung:** Der neue Dialog verwendet die gemeinsame Dialoghülle, ein
Pflichtfeld für den Namen sowie die zentralen Buttons. Er behält Eingabe und
Fehlermeldung bei einem Speicherfehler und gibt eine erfolgreich gespeicherte
Bezugsquelle an das Einkaufsformular zurück. Dieses wählt sie unmittelbar aus,
markiert den Einkauf als geändert und schließt den Dialog. Ungespeicherte
Dialogeingaben werden beim Verlassen berücksichtigt.

**Prüfung:** Die neuen Dialog- und Parent-Vertragstests waren zuerst rot, weil
die Komponente und der neue Parent-Vertrag fehlten. Danach bestanden 48
fokussierte Angular-Tests einschließlich AXE, Prettier, ESLint und
Produktionsbau. Der Prüfbericht liegt unter
`.superpowers/sdd/2026-09-21-ui-regression-cleanup/task-5-report.md`.

## 2026-09-21 – Juna – Telefonfehlerreferenz bedingt gesetzt

**Auftrag:** Die ARIA-Referenz des Telefonfelds nur dann setzen, wenn das
passende Fehlerziel tatsächlich gerendert wird.

**Änderung:** Das Telefon-Control erzeugt seine Eingabeattribute bei jeder
Änderungsprüfung neu. Leer und gültig bleiben ohne `aria-describedby`; nur ein
berührter ungültiger Wert verweist auf `seller-phone-error` und zeigt die
zugehörige Fehlermeldung.

**Prüfung:** Der neue Normalzustandstest war zunächst rot, weil die Referenz
immer vorhanden war. Nach der Korrektur bestanden die 15 fokussierten Tests
einschließlich AXE, ESLint und Produktionsbau. Der Fixbericht ergänzt
`.superpowers/sdd/2026-09-21-ui-regression-cleanup/task-4-report.md`.

## 2026-09-21 – Juna – Verkäuferdialog gegen Prüfhinweise abgesichert

**Auftrag:** Zwei wichtige Review-Funde am Verkäuferdialog beheben: eine
fehlende Telefonnummer-Fehlermeldung und das Schließen während des Speicherns.

**Änderung:** Ein berührtes ungültiges Telefonfeld zeigt wieder die passende
Meldung mit der ID `seller-phone-error`, auf die das Eingabefeld verweist. Das
Schließen über Escape oder die Dialog-Kopfaktion wird während eines laufenden
Speicherns lokal abgefangen; die gemeinsame Dialogkomponente bleibt unverändert.

**Prüfung:** Beide neuen DOM- und Verhaltenstests waren zuerst rot und
bestanden nach der Korrektur mit insgesamt 15 fokussierten Tests einschließlich
AXE. ESLint für die betroffenen TS-Dateien und der Produktionsbau waren
erfolgreich. Der Fixbericht ergänzt den bestehenden Taskbericht unter
`.superpowers/sdd/2026-09-21-ui-regression-cleanup/task-4-report.md`.

## 2026-09-21 – Juna – Verkäuferdialog vereinheitlicht

**Auftrag:** Den Verkäuferdialog über die gemeinsame breite Dialoghülle
abbilden und die Verfügbarkeit von „Speichern“ eindeutig an die Formularwerte
koppeln.

**Änderung:** Der Dialog verwendet nun `ModalShellComponent` in Größe `xl`
sowie die gemeinsamen Textfelder und Aktionen. Straße und Adresszusatz nehmen
über die komplette Dialogbreite ein; die Länderauswahl heißt sichtbar und für
Hilfstechnologien „Land/Region“. Ein Name nur aus Leerzeichen ist ungültig.
„Speichern“ bleibt bis zu einem gültigen Formular, einem getrimmten Namen und
einem nicht laufenden Speichervorgang deaktiviert. Die bisherigen redundanten
Hinweise entfallen; der konkrete E-Mail-Fehler erscheint weiterhin nur für
berührte, ungültige Eingaben.

**Prüfung:** Der neue DOM- und Zustandsvertrag war zunächst rot (fehlende
gemeinsame Dialoghülle und Speicheraktion). Der fokussierte Angular-Test mit
AXE bestand anschließend mit 13 Tests; ESLint für die betroffenen TS-Dateien
und der Produktionsbau waren erfolgreich. Der Prüfbericht liegt unter
`.superpowers/sdd/2026-09-21-ui-regression-cleanup/task-4-report.md`.

## 2026-09-21 – Juna – Belegkarte auf Auswahlfläche reduziert

**Auftrag:** Die Belegkarte auf eine vollbreite Ablagefläche und zugängliche
Icon-Aktionen reduzieren, ohne Upload, Vorschau oder Entfernen zu verändern.

**Änderung:** Belegart, verstecktes Dateifeld und Ablagefläche liegen jetzt
untereinander im Karteninhalt. Die Ablagefläche öffnet weiterhin den nativen
Dateidialog und akzeptiert Dateien per Drag-and-drop. Gespeicherte und
vorgemerkte Belege verwenden klare Vorschau- beziehungsweise Papierkorb-Icons
mit zugänglichen Namen; der Wiederholungsversuch bei Uploadfehlern bleibt als
Textaktion bestehen. Das technische Dateifeld hat einen zugänglichen Namen und
ist nicht mehr mit der Tastatur erreichbar, weil die sichtbare Ablagefläche
seinen vollständigen Bedienweg übernimmt.

**Prüfung:** Der gerenderte DOM-Vertrag schlug zunächst wegen des alten
Zusatzknopfs rot aus. Die AXE-Prüfung fand anschließend das unbeschriftete
Dateifeld und bestand nach der Korrektur. Der fokussierte Angular-Test bestand
mit 16 Tests, die betroffenen Dateien wurden gelintet und der Produktionsbau
war erfolgreich. Der Prüfbericht liegt unter
`.superpowers/sdd/2026-09-21-ui-regression-cleanup/task-3-report.md`.

## 2026-09-21 – Juna – Kartenrahmen beim ersten Rendern stabilisiert

**Auftrag:** Den synchronen Klassenvertrag der gemeinsamen Card-Komponente beim
ersten Rendern vollständig machen.

**Änderung:** Die Varianten `surface` und `kpi` setzen ihren transparenten
Rahmen jetzt synchron; `subtle` setzt den dezenten Rahmen synchron. Die lokale
`transition-colors`-Klasse der Card wurde entfernt, damit der Rahmen nicht
zwischen Browserfarbe und Themefarbe überblendet.

**Prüfung:** Der neue Kartentest schlug zunächst rot aus und bestand nach der
Korrektur. Karten- und Einkaufserfassungstests bestanden mit 49 Tests. Der
Prüfbericht liegt unter `.superpowers/sdd/2026-09-21-ui-regression-cleanup/task-2-report.md`.

## 2026-09-21 – Juna – Beta-Formular und Ergebnisdialoge korrigiert

**Auftrag:** Den Beta-Antrag an den produktiven Duplikatcode anpassen, den
Sendezustand zuverlässig verstecken und die Ergebnisdialoge vollständig
zweisprachig sowie lesbar halten.

**Änderung:** Der Ladebereich respektiert den nativen `hidden`-Zustand. Der
Erfolgs- und Duplikatdialog trennt Fließtext und E-Mail-Adresse sichtbar. Die
Landingpage erkennt sowohl `application_existing` als auch den bisherigen
Kompatibilitätswert `application_exists` und zeigt dafür denselben neutralen
Dialog ohne internen Bewerbungsstatus.

**Prüfung:** Neue Landing-Regressionen wurden zunächst rot ausgeführt und
bestanden nach der Korrektur vollständig (22 Tests). Formatierung und
Diff-Prüfung waren ebenfalls erfolgreich.

## 2026-09-21 – Juna – Folgekorrekturen nach manueller UI-Abnahme geplant

**Auftrag:** Die nach dem Einkaufsumbau gefundenen Darstellungs- und
Bedienprobleme sammeln, Artikel und Bestand fachlich neu einordnen und die
Umsetzung in kontrollierbare Folge-Pull-Requests teilen.

**Änderung:** Die neuen Punkte wurden in drei eigenständig prüfbare Pakete
geteilt. Der erste Entwurf umfasst akute Regressionen im Beta-Antrag, bei
Einkaufsbelegen und Zusatzkosten, im Verkäufer- und Bezugsquellenablauf, in
Einkaufsliste und Chronik sowie beim Drucken. Die spätere Zusammenführung von
Artikel und Bestand samt neuer Navigation bleibt ein zweiter Pull-Request.
Adresssuche und frei gestaltbare Dokumentvorlagen bleiben wegen externer
Dienste, Datenschutz und eigenständiger Datenmodelle ein dritter Pull-Request.

Die Spezifikation hält außerdem fest, dass ein bereits vorhandener Beta-Antrag
öffentlich neutral beantwortet wird, dass „Angekommen“ und „Abgeschlossen“
verschiedene fachliche Zustände bleiben und dass browserseitige Druck-Kopf- und
Fußzeilen nicht durch die Anwendung erzwungen deaktiviert werden können.
Nach der Freigabe wurde daraus ein testgetriebener Implementierungsplan mit
einzeln prüf- und committierbaren Arbeitspaketen erstellt.

**Prüfung:** Bestehende Komponenten, Tests, Navigations- und
Gestaltungsverträge wurden gelesen. Produktcode wurde in diesem Planungsschritt
nicht verändert.

## 2026-09-21 – Juna – Einkaufsablauf und zugehörige Oberflächen vereinheitlicht

**Auftrag:** Die Einkaufserfassung wieder auf Verkäufer, Quelle, Artikel und
nachvollziehbare Kosten reduzieren und die 25 abgestimmten Detailkorrekturen in
Einkäufen, Artikelstamm, Verkäuferverwaltung, Beta-Einstieg und globalem
Kopfbereich umsetzen.

**Änderung:** Die Einkaufserfassung beginnt wieder mit dem gespeicherten
Verkäufer und bietet dort direkt die Neuanlage an. Plattform-Benutzername,
Verkäuferart, Anschrift, Angebotslink, Plattform-Bestellnummer, doppelte
Bezeichnung und sichtbare „optional“-Hinweise wurden entfernt. Kaufdatum und
Belege liegen in der rechten Detailspalte. Artikel lassen sich über die gesamte
Auswahlzeile wählen; leere Preise und die Kostenübersicht reagieren unmittelbar
und zeigen Nullwerte verständlich an. Sonstige Kosten erscheinen nur, wenn sie
vorhanden sind.

Die Einkaufsübersicht unterscheidet leere Bestände von erfolglosen Filtern,
zeigt die vereinbarte Spaltenfolge und aktualisiert Status sowie Gesamtbetrag
ohne Neuladen. Entwürfe bieten noch keine Druckaktion; der technische
Prüfbeleg wurde aus dem Einkauf entfernt. Die Artikeltabelle bleibt nach dem
Abschluss fachlich gleich, Belege können in jeder Phase ergänzt und fehlerhafte
Dateien wieder entfernt werden. Die Chronik beschreibt ausschließlich konkrete,
lesbare Einzeländerungen ohne interne Datenobjekte oder Kennungen.

Artikelübersicht und Verkäuferliste wurden auf die gewünschten Spalten und
vollständig anklickbare Zeilen umgestellt. Globale Checkboxen verwenden den
gelben Markenakzent; Logo, Kopfzeilenhöhen und Kopfleisten-Aktionen sind
vereinheitlicht. Der Beta-Einstieg zeigt bei einer vorhandenen Bewerbung keine
internen Statusdetails mehr, verwendet einen sichtbaren Ladebalken und
korrigierte Einladungstexte sowie Passwortübersetzungen.

Der abschließende Code-Review ergänzte belastbare Fehlerpfade: Ein bestätigter
Abschluss bleibt auch bei einem danach scheiternden Neuladen sichtbar, und die
letzte bestätigte Einkaufsliste wird dabei nicht geleert. Belegdateien werden
wiederholbar und ohne verwaiste Storage-Dateien entfernt. Der Artikelauswähler
verwendet pro Zeile genau ein zugängliches Steuerelement. Abgeschlossene
Einkäufe zeigen keine Verkaufswerte mehr in ihrer Artikeltabelle; Beschreibung,
Quelle und Verkäufer erscheinen in der Chronik jeweils einmal und mit
verständlichen Namen. Eine reine Archivansicht führt nicht mehr in einen leeren
Filterzustand.

Die Discord-Verknüpfung bleibt bewusst ein eigener Folge-Pull-Request. Sie
benötigt eine Discord-App mit OAuth-Freigabe, serverseitig geschützte
Zugangsdaten, die Zuordnung des Discord-Kontos zum angenommenen Beta-Nutzer und
eine zuverlässige Vergabe beziehungsweise Wiederholung der Rolle
„Beta-Tester“. Ohne diese Infrastruktur wäre ein einfacher Einladungslink weder
personalisiert noch ausreichend geschützt.

**Prüfung:** Die gezielten Node-, DOM-, Angular-, Landing-, Edge-Function- und
Datenbanktests sowie Lint, Typprüfung und Produktionsbau wurden ausgeführt. Eine
lokale Browserprüfung bestätigte den Einkaufsablauf vom Entwurf bis zum Abschluss,
die unmittelbare Kostenaktualisierung, die Artikelzeilenauswahl, Tabellen und
Verkäuferaktionen sowie Hell- und Dunkelmodus an Desktop- und Mobilbreite. Der
abschließende Gesamtcheck ist im zugehörigen Zweig dokumentiert.

## 2026-09-21 – Juna – Updateplan für Einkaufsablauf und Admin-Oberfläche abgestimmt

**Auftrag:** Fünfundzwanzig Rückmeldungen zu Einkaufserfassung,
Einkaufsübersicht, Einkaufsdetail, Artikelstamm, Verkäuferverwaltung,
Beta-Einstieg und globalem Header vollständig aufnehmen und vor der Umsetzung
fachlich klären.

**Änderung:** Die bestehenden Oberflächen und Zustandswege wurden mit den
Rückmeldungen abgeglichen. Die freigegebene Designspezifikation legt unter
anderem die einheitliche artikelbasierte Einkaufserfassung, sofortige
Kostenaktualisierung, stabile Einkaufstabellen, verständliche Chronik,
korrigierbare Belege, datenschutzfreundliche Beta-Duplikatantwort und den
vereinheitlichten Kopfbereich fest. Der technische Prüfbeleg verschwindet aus
dem Einkauf, bleibt aber zentral unter „Daten & Protokolle“ erhalten.

Als letzter Punkt ist eine geschützte Discord-Verknüpfung für freigeschaltete
Beta-Nutzer vorgesehen. Nach einer ausdrücklichen Discord-Autorisierung soll ein
Bot den Nutzer zum Server hinzufügen und automatisch die Rolle „Beta-Tester“
vergeben. Erst nach Abschluss der übrigen Arbeiten wird entschieden, ob diese
größere Integration noch in denselben Pull Request passt oder einen eigenen
Folge-Pull-Request erhält.

Der ausführbare Implementierungsplan teilt die Umsetzung in neun prüfbare
Arbeitspakete. Jedes Paket beginnt mit einem gezielt fehlschlagenden Test und
endet mit einer eigenen Prüfung und einem Conventional Commit. Die
Discord-Anbindung bleibt bis zur abschließenden Umfangsbewertung ausdrücklich
außerhalb der Produktivänderungen.

**Prüfung:** Reine Planungsrunde ohne Produktivcode. Alle sechs fachlichen
Abschnitte wurden einzeln bestätigt und die Spezifikation ordnet jeden der 25
gemeldeten Punkte ausdrücklich einer Lösung zu. Der Branch basiert auf dem
aktuellen `origin/master` einschließlich des zuletzt ergänzten
Beta-Ablehnungsablaufs.

## 2026-09-20 – Juna – Ablehnungen und erneute Beta-Bewerbungen vervollständigt

**Auftrag:** Abgelehnte Beta-Bewerbungen per E-Mail mitteilen, eine erneute
Bewerbung mit derselben E-Mail-Adresse eindeutig abweisen und dem Betreiber das
kontrollierte Löschen abgelehnter Einträge ermöglichen.

**Änderung:** Beim Ablehnen wird jetzt eine freundliche E-Mail in durchgängiger
Du-Ansprache versendet. Ein fehlgeschlagener Versand bleibt im Admin sichtbar
und kann dort erneut angestoßen werden. Die Bewerberliste bietet für abgelehnte,
noch nicht mit einem Nutzer verknüpfte Einträge eine geschützte Löschaktion mit
Bestätigungsdialog; erst danach ist die E-Mail-Adresse wieder für eine neue
Bewerbung frei.

Die Landingpage unterscheidet eine bereits abgelehnte E-Mail-Adresse von einer
erfolgreichen Bewerbung und zeigt dafür ein eigenes Dialogfenster, ohne die
Formulardaten zu verwerfen. Die Du-Ansprache für deutschsprachige Kunden-E-Mails
und Oberflächentexte ist zusätzlich als Projektregel dokumentiert. Die
Statusbadges kennzeichnen offene Bewerbungen orange, angenommene grün und
abgelehnte rot.

**Prüfung:** Der Datenbanktest deckt Berechtigungen, den Schutz offener und
verknüpfter Bewerbungen sowie Löschen und erneutes Bewerben ab. Edge-, Landing-
und Angular-Tests prüfen Ablehnung, Versandfehler, Wiederholungsversand, Löschung
und das eigene Hinweisfenster. Eine lokale Browserprüfung bestätigte Dialog,
Fokus, Inhalt und den Erhalt der Formulardaten. Der abschließende Gesamtcheck ist
im zugehörigen Zweig dokumentiert.

## 2026-09-20 – Juna – Landing-Kopfzeile reduziert und Beta-Mailversand aktiviert

**Auftrag:** Die Kopfzeile der Landingpage auf Logo, Design- und Sprachumschalter
sowie den App-Link reduzieren und den fehlgeschlagenen Versand der
Beta-Eingangsbestätigung in Produktion reparieren.

**Änderung:** Die Landingpage zeigt oben keine Bereichsnavigation und keinen
„Reselling OS“-Badge mehr. Der App-Link ist unabhängig von einem Merk-Cookie
immer sichtbar; die dadurch überflüssige Caddy-Vorlagenverarbeitung und
Cookie-Cachevariation wurden entfernt.

Auf dem Produktionsserver wurden die bereits vorhandenen SMTP-Werte an die
Beta-Funktionen durchgereicht und der aktuelle Stand von `beta-application`,
`beta-invite` sowie den gemeinsamen Mailbausteinen eingespielt. Die betroffene
Bewerbung wurde vom veralteten Status „ausstehend“ auf „fehlgeschlagen“ gesetzt,
damit der vorgesehene Wiederholungsversand im Betreiberbereich verfügbar ist.
Die Ausrollanleitung schützt künftig die Supabase-Systemordner `main` und `hello`,
wenn Repository-Funktionen synchronisiert werden.

**Prüfung:** Der Funktionsdienst ist nach der Korrektur gesund, enthält alle neun
benötigten `BETA_*`-Variablen und beantwortet eine ungültige Testanfrage wie
erwartet mit HTTP 400, ohne einen Datensatz anzulegen. Die gezielten Landingtests
prüfen die reduzierte Kopfzeile und die weiterhin sichere Skriptauslieferung.

## 2026-09-20 – Juna – Beta-Einstieg und CSP-Auslieferung repariert

**Auftrag:** Den wirkungslosen Beta-Button auf der Landingpage reparieren, den
Hero-Text allgemeiner formulieren, das Formular ans Seitenende verschieben und
alle KI-Beiträge künftig einheitlich unter dem Namen Juna führen.

**Änderung:** Der Hero verwendet den Einstieg „Dein Reselling. Klar organisiert.“
und führt mit „Kostenlos für die Beta anmelden“ per normalem Seitensprung zum
einzigen Bewerbungsformular am Seitenende. Die Formularlogik liegt nicht mehr als
eingebettetes Skript mit änderungsabhängigem CSP-Hash vor, sondern in der lokalen
Datei `landing/landing.js`; die CSP erlaubt weiterhin weder fremde Skripte noch
`unsafe-inline`.

Das Release-Abbild enthält nun auch das passende Caddyfile. Das Deployskript
prüft und aktiviert diese Konfiguration vor der Landingpage und stellt bei einem
Fehler den vorherigen Stand wieder her. Ein öffentlicher Nachtest prüft nach jedem
Produktionsdeployment Seite, Skript und CSP gemeinsam. `AGENTS.md` legt für neue
Branches, Changelog-Einträge und sonstige KI-Namensnennungen ausschließlich Juna
fest; die Git-Autorschaft bleibt beim Nutzer.

**Prüfung:** Die gezielten Landing-, CSP-, Deployment- und Workflow-Prüfungen
wurden im Rot-Grün-Verfahren ergänzt. `npm run verify` war vollständig grün:
2.653 Anwendungs- und DOM-Tests, 81 erfolgreiche Workflow-Tests (5 plattformbedingt
übersprungen), 10 Edge-Function-Tests und 15 Landingpage-Tests sowie Lint,
Typprüfung und Produktionsbau. Die manuelle Browserprüfung bestätigte den
Seitensprung bis zum Formular ohne Konsolenfehler oder -warnungen.

## 2026-09-20 – Codex (OpenAI) – Einkaufserfassung auf Verkäufer und Artikel reduziert

**Auftrag:** Die überladene Einkaufserfassung vereinfachen, die Kostenübersicht
an den bekannten Bestellaufbau angleichen und das Logo wieder mit dem Dashboard
verknüpfen.

**Änderung:** Verkäufer, Quelle und Kaufdatum stehen wieder am Anfang. Der
Verkäufer ist verpflichtend, wird aus den Stammdaten gewählt oder dort neu
angelegt und liefert den unveränderlichen Einkaufssnapshot im Hintergrund. Eine
Quelle kann direkt aus der Auswahl heraus erstellt werden. Beschreibung und
Referenznummer bleiben als schlanke Einkaufsdetails; Bezeichnung,
Plattform-Benutzername, Angebotslink, Plattform-Bestellnummer und die doppelte
Verkäuferanschrift sind entfernt. Die Datenbankmigration löscht die drei nicht
mehr verwendeten Einkaufsspalten, ohne die Bestellnummer von Verkäufen zu
berühren.

Die Kostenübersicht zeigt immer bestellte Artikel, Artikelanzahl, Anpassungen und
Gesamtbetrag – auch jeweils mit null Euro. Zusatzkosten stehen dazwischen. Die
Paketpreisverteilung und das Anlegen besonderer Paketpositionen sind aus der
Erfassung entfernt; normale selbst angelegte Platzhalterartikel bleiben möglich.
Sichtbare „optional“-Zusätze wurden anwendungsweit entfernt, Pflichtfelder tragen
den gelben Stern. Das Flipbase-Logo führt wieder zum Dashboard.

**Prüfung:** Nach dem Abgleich mit dem aktuellen `origin/master` waren der
Datenbank-Reset und alle 1.945 Datenbanktests erfolgreich. Der vollständige
Verifikationslauf bestand Formatierung, Lint, Typprüfung, 82 Workflow-Prüfungen
(davon fünf plattformbedingt übersprungen), 10 Edge-Tests, das Suite-Audit mit
2.357 Testdefinitionen, 2.638 Anwendungs-, 15 Landing-Tests und den
Produktionsbau. Zusätzlich waren alle neun verpflichtenden Chromium-Abläufe
erfolgreich. Dabei gefundene veraltete Erwartungen an offene Preise und ein
fälschlich als geändert markierter geladener Einkauf wurden korrigiert und erneut
geprüft.

## 2026-09-20 – Codex (OpenAI) – Beta-Produktionsgrenzen und Gesamtweg abgesichert

**Auftrag:** Die fertige Beta-Anmeldung vor dem Pull Request unabhängig prüfen,
Produktionsblocker beheben und den vollständigen Weg bis zum gestarteten Zugang
nachweisen.

**Änderung:** Die selbstgehostete Auth-Konfiguration sperrt öffentliche Signups
jetzt auch im Produktions-Override und erlaubt den genauen Rücksprung zur
Passwortvergabe. `beta-application`, `beta-invite` und `_shared` werden laut
Ausrollanleitung gemeinsam veröffentlicht; die App-Zieladresse ist eine eigene
Funktionsvariable. Lokale Browserkonten entstehen über die lokale Admin-Grenze,
damit Tests die geschlossene Registrierung nicht umgehen.

Ein fehlgeschlagener Einladungsversand bleibt im Annahmedialog sichtbar und lässt
sich dort direkt wiederholen. Bewerbung und Nutzerübersicht unterscheiden aktive,
abgelaufene und noch ausstehende Beta-Zugänge; bei aktiven Zugängen stehen die
verbleibenden Tage dabei. Eine fehlgeschlagene automatische Aktivierung kann bei
einem späteren Sitzungsereignis erneut laufen. Der Dankesdialog sperrt während der
Anzeige den Seitenhintergrund tatsächlich und verwendet die eindeutige Aktion
„Schließen“.

**Prüfung:** `npm run verify` erfolgreich mit Format, ESLint, Typprüfung, 82
Workflow-Prüfungen, 10 eingebundenen Deno-Tests, Suite-Audit, 1.441 Node-, 239
DOM-, 973 Angular- und 15 Landing-Tests sowie Produktionsbau. Der isolierte
Datenbank-Neuaufbau und alle 19 Betreiber-Datenbanktests bestanden. Zwei echte
Chromium-Abläufe bestätigten, dass freie Registrierung scheitert, Betreiber weiter
einladen können und Freigabe, Mail-Link, Passwortvergabe, Verknüpfung sowie der
Start einer exakt 60 Tage langen Beta gemeinsam funktionieren. Weiterhin nur die
drei bekannten NG8113-Bauhinweise in Dashboard, Einkäufen und Verkäufern.

## 2026-09-20 – Codex (OpenAI) – Inseratserstellung in den Übersichtsablauf eingeordnet

**Auftrag:** Die Inseratserstellung wie beim Einkauf nur aus der Übersicht öffnen
und die missverständliche Bezeichnung der festen Textvarianten klären.

**Änderung:** „Inserate“ ist ein einzelner Navigationspunkt ohne eigenes Untermenü
für Übersicht und Erstellen. Die technische Editorroute bleibt für die Aktion
„Inserat erstellen“ erhalten. Der Editor bietet einen beschrifteten Rückweg zur
Inseratsübersicht. Die bisherige Auswahl „Textstil“ heißt jetzt „Textvorlage“, die
neutrale Variante ist verständlich benannt und ein Hinweis erklärt, dass feste
Formulierungen mit Artikeldaten ohne KI verwendet werden.

**Prüfung:** Die gezielten Navigations- und Angular-Komponententests wurden zunächst
mit den alten Abweichungen rot und nach der Korrektur mit 14 beziehungsweise 12
Tests grün ausgeführt. Kein Push und kein Merge.

## 2026-09-20 – Codex (OpenAI) – Alten Inseratsentwurfsspeicher entfernt

**Auftrag:** Den zweiten Schritt des Listing Studio umsetzen: den ungenutzten alten
Entwurfsspeicher und den überholten Mehrplattform-Generator nach einer
Produktionsprüfung sicher entfernen.

**Änderung:** Die Produktion enthielt keine Zeile in `public.listing_drafts`; auch
alle zusammengefassten Prüfungen auf ungültige oder verwaiste Daten und Konflikte
mit aktuellen Inseraten ergaben null. Es wurden keine Inhalte einzelner Datensätze
gelesen. Die neue Release-Migration sperrt die Tabelle während der erneuten
Leerprüfung exklusiv und bricht vor jeder Änderung mit SQLSTATE `55000` ab, falls
nach dieser Prüfung doch wieder ein alter Entwurf entstanden ist. Das deklarative
Schema, die Archivierungsregistrierung und die generierten Typen enthalten die alte
Tabelle nicht mehr. Im Frontend bleibt nur der tatsächlich verwendete
Kleinanzeigen-Textgenerator als kleiner Dienst im Inserate-Feature;
unbenutzte eBay-, Vinted-, Webshop-, HTML-, SEO- und Direktveröffentlichungswege
sind entfernt.

**Prüfung:** Der Migrationsschutz wurde in einer Wegwerf-Datenbank in drei Fällen
geprüft: Ein vorhandener und ein parallel geschriebener Datensatz stoppten die
Migration und blieben erhalten; eine leere Tabelle wurde entfernt. Der
Datenbank-Reset, 62 gezielte Inserate-, 100 Archivierungs- und alle 1.937
Datenbankprüfungen bestanden. `npm run verify` war mit 1.428 Node-, 239 DOM-, 946
Angular- und 13 Landing-Tests sowie Format, ESLint, Typprüfung,
Workflow-Prüfungen, Suite-Audit und Produktionsbau grün. Alle sieben
PR-Chromium-Abläufe bestanden. Der Bau meldet weiterhin die drei bekannten
NG8113-Hinweise außerhalb des Inserate-Bereichs; der unveränderte
Steuerjournal-Ablauf meldet weiterhin den bestehenden NG0956-Laufzeithinweis.
Kein Push und kein Merge.

## 2026-09-20 – Codex (OpenAI) – Verpflichtende Workspace-Ersteinrichtung ergänzt

**Auftrag:** Nach der eingeladenen Beta-Registrierung beim ersten App-Aufruf nur
die tatsächlich benötigte Initialangabe abfragen: den Namen des bereits
angelegten Workspace. Keine Steuerart, Zielwerte, Firmen-, Rechnungs- oder
Zahlungsdaten vorwegnehmen.

**Änderung:** Workspaces besitzen nun einen ausdrücklichen Abschlusszeitpunkt
für die Ersteinrichtung. Die Migration markiert alle bereits vorhandenen
Workspaces als abgeschlossen; ein durch die Registrierung erzeugter
Beta-Workspace bleibt offen. Manuell zusätzlich erstellte Workspaces sind
sofort abgeschlossen. Die bestehende Beta-Laufzeit startet weiterhin bei der
erfolgreichen Passwortvergabe und wird von der neuen Seite nicht verschoben.

Ein unvollständiger Workspace wird vor Dashboard und Shop auf eine
eigenständige, zugängliche Ein-Feld-Seite geleitet. Dort wird ausschließlich
ein getrimmter Name mit 2 bis 100 Zeichen gespeichert. Der vorhandene
Workspace wird serverbestätigt aktualisiert und nicht doppelt angelegt.
Lade- und Speicherfehler bleiben sichtbar und wiederholbar; Abmelden verwendet
die bestehende Sitzungsfunktion. Vorhandene Flipbase-Farben, Logo und
Button-Komponenten wurden wiederverwendet. Nach erfolgreichem Abschluss führt
der Ablauf ins Dashboard und lässt sich nicht erneut öffnen.

**Prüfung:** `npm run verify` erfolgreich mit Format, ESLint, Typprüfung,
Workflow- und Suite-Audit, 1.448 Node-, 240 DOM-, 960 Angular- und 15
Landing-Tests sowie Produktionsbau. Die fokussierten 24 Workspace-Service-,
6 Guard- und 7 Seiten-/AXE-Tests bestanden. Der isolierte Datenbanktest bestand
mit 19 Prüfungen nach einem sauberen Neuaufbau; der gemeinsame Admin-UI-Check
meldete bei 95 Dateien keine Abweichung. Weiterhin nur die drei bekannten
NG8113-Hinweise in Dashboard, Einkäufen und Verkäufern. Kein Push, kein PR und
kein Merge.

## 2026-09-20 – Codex (OpenAI) – Beta-Anmeldeweg und Betreiberfreigabe umgesetzt

**Auftrag:** Die Beta-Anmeldung auf der Landingpage verlässlich abschließen, die
Bewerbung im Betreiberbereich mit einer 60-Tage-Vorgabe annehmen und den
eingeladenen Nutzer bis zur Registrierung und gestarteten Beta nachvollziehbar
mit der Bewerbung verbinden. Vorhandene Dialoge, Tabellen und Status-Badges
weiterverwenden und die spätere Abrechnung vorbereiten, aber noch nicht bauen.

**Änderung:** Beide Beta-Formulare zeigen nach erfolgreicher Speicherung einen
zugänglichen Dankesdialog. Der Bewerber erhält sofort eine gestaltete
Eingangsbestätigung ohne Registrierungslink; ein Versandfehler wird im Dialog
sichtbar, ohne die gespeicherte Bewerbung zu verlieren. Im Betreiberbereich
öffnet „Annehmen“ nun einen vorhandenen Dialogbaustein mit Name, E-Mail und
änderbaren, auf 60 Tage voreingestellten Laufzeit. Einladungs- und
Bestätigungsmails lassen sich nach Fehlern erneut senden, und die Liste zeigt
offen, abgelehnt, Einladung fehlgeschlagen, wartet auf Registrierung oder Beta
gestartet mit den vorhandenen Badges.

Die Einladung trägt die Bewerbungs-ID in das Auth-Konto. Der bestehende
Registrierungstrigger verbindet dadurch Bewerbung, Nutzer, Profil, Workspace
und eine getrennte Workspace-Lizenz. Deren Laufzeit startet idempotent erst
nach erfolgreicher Passwortvergabe, nicht beim Öffnen des Einladungslinks. Eine
neue Betreiberseite „Nutzer“ zeigt Registrierung, Workspace und Beta-Zeitraum.
Öffentliche Registrierungen sind für die Beta geschlossen; die bisherige
Registrierungsadresse führt zum Login. Das Zugangsmodell trennt die Beta schon
von einem späteren Abonnement, ohne Stripe-, Rechnungs- oder Zahlungslogik
vorwegzunehmen.

**Prüfung:** `npm run verify` erfolgreich mit Format, ESLint, Typprüfung,
Workflow- und Suite-Audit, 1.441 Node-, 240 DOM-, 947 Angular- und 15
Landing-Tests sowie Produktionsbau. Die 10 Deno-Tests für E-Mail und Einladung,
der saubere lokale Datenbank-Neuaufbau und alle 19 fokussierten
Betreiber-Datenbanktests bestanden. Der gemeinsame Admin-UI-Check meldete bei
94 Dateien keine Abweichung. Weiterhin nur die drei bekannten NG8113-Hinweise
in Dashboard, Einkäufen und Verkäufern. Kein Push, kein PR und kein Merge.

## 2026-09-20 – Codex (OpenAI) – Kontrollreview-Funde im Listing Studio behoben

**Auftrag:** Die bestätigten Blocker aus dem Kontrollreview selbst beheben und den
Branch erneut vollständig prüfen.

**Änderung:** Der Editor verhindert doppelte offene Inserate, erklärt unzulässige
Artikelzustände und verlinkt das bestehende Inserat. Manuelle Texte werden nur nach
Bestätigung ersetzt; Textvorlagenoptionen, Kopieren, vollständige Validierung,
Beschriftungen und Bildwarnungen sind ergänzt. Die mobile Übersicht blendet die
Desktop-Tabelle aus und bietet alle Statusaktionen auf den Karten. Die
Erweiterungsprüfung endet bei ausbleibender Antwort. Generator und Editor verwenden
jetzt eine typisierte Artikelzuordnung und begrenzen Kleinanzeigen-Titel zentral.

Die Datenbankfunktionen sperren Einkauf, Advisory Lock, Artikel und Inserat in einer
einheitlichen Reihenfolge. Die praktisch reproduzierten Deadlocks zwischen
Verkaufstrigger und manuellem Beenden sowie zwischen Einkaufsfinalisierung und
Online-Setzen treten damit nicht mehr auf. Übersicht, Editor, Erweiterung und der
vollständige mobile Inserats-Lebenszyklus sind durch neue Tests abgesichert; die
verbindliche PR-Browsersuite enthält nun sieben Kernfälle. Der Abschlussbericht
liegt unter `docs/audit/2026-09-20-listing-studio-control-fixes.md`.

**Prüfung:** `npm run verify` erfolgreich mit 1.437 Node-, 240 DOM-, 936 Angular-
und 13 Landing-Tests sowie Format, ESLint, Typprüfung und Produktionsbau. Alle 1.939
Datenbankprüfungen und sieben PR-Chromium-Abläufe bestanden; die beiden fokussierten
Listing-Studio-Browserabläufe waren ebenfalls grün. Die kontrollierten
Paralleltests reproduzierten vor der Korrektur beide PostgreSQL-Deadlocks und liefen
danach ohne Sperrkreis. Weiterhin nur die drei bekannten NG8113-Bauhinweise
außerhalb des Inserate-Bereichs. Kein Push und kein Merge.

## 2026-09-20 – Codex (OpenAI) – Kontrollreview des gespeicherten Listing Studio

**Auftrag:** Den mit Terra umgesetzten Branch vor einem Pull Request unabhängig
gegen Spezifikation, Umsetzungsplan und Projektregeln prüfen.

**Befund:** Datenmodell, RLS, Workspace-Zuordnung, Migrationen und die grundlegende
Statuskopplung sind tragfähig. Der Branch ist trotzdem noch nicht bereit für einen
Pull Request. Im Erstellen-Dialog können Artikel mit bereits offenem Inserat erneut
ausgewählt werden; dadurch lässt sich der bestätigungspflichtige Ablauf zum erneuten
Einstellen umgehen. Der Editor überschreibt manuell bearbeitete Texte ohne Nachfrage,
zeigt mehrere vorhandene Vorlagenoptionen nicht an, warnt bei fehlenden Bildern nicht
und behandelt ein unverändertes neues Formular bereits als ungespeichert. Titel und
Beschreibung haben keine programmatisch zugeordneten Beschriftungen. Die mobile
Übersicht zeigt zusätzlich zur Kartenansicht weiterhin die Desktop-Tabelle; die Karten
selbst enthalten keine Aktionen. Eine fehlende Browser-Erweiterung lässt den
Prüfknopf dauerhaft im Ladezustand. Die unterschiedliche Sperrreihenfolge zwischen
Inseratsaktionen und Verkaufstrigger kann bei parallelen Aktionen außerdem einen
Datenbank-Deadlock erzeugen.

Die im Plan vorgesehenen Übersichts-, Editor-, AXE- und Browser-Abnahmen wurden nur
zu einem kleinen Teil umgesetzt: Es gibt keinen Übersichts-Komponententest, zwei
Editorfälle statt der geplanten Ablaufsmatrix, keinen `e2e/listing-studio.spec.ts`
und keinen Abschlussbericht unter `docs/audit/`. Der bestehende Abschlussvermerk war
damit zu weitgehend.

**Prüfung:** Vollständiger Branch-Diff gegen den unveränderten Stand von
`origin/master` (`a845cf4d`), Spezifikation, Umsetzungsplan, SQL-Sperrreihenfolge,
Frontendzustände und vorhandene Tests geprüft. Die bestehende PR-Browsersuite bestand
mit 6/6 Tests; sie enthält keinen Inserate-Fall. Die fokussierte Datenbanksuite bestand
mit 61/61 Tests; sie enthält keinen konkurrierenden Verkauf-vs.-Beenden-Fall. Keine
Produktkorrektur, kein Push und kein Merge.

## 2026-09-20 – Codex (OpenAI) – Gespeicherte Kleinanzeigen-Inserate umgesetzt

**Auftrag:** Den bestätigten ersten Schritt des Listing Studio umsetzen: gespeicherte
Kleinanzeigen-Inserate mit Übersicht, Editor, Statusablauf und Browser-Erweiterung.

**Änderung:** Inserate werden je Workspace mit vorbereiteten, online gestellten und
beendeten Zuständen gespeichert. Datenbankfunktionen schützen Mitgliedschaft,
archivierte Workspaces, nicht verkaufsfähigen Bestand, wieder geöffnete
Paketeinkäufe und parallele Vorbereitungen. Die neue Übersicht und der gemeinsame
Editor verwenden diese Funktionen, erzeugen Kleinanzeigen-Texte aus dem Bestand
und übergeben nur frisch signierte Bilder an die Erweiterung. Die Navigation führt
jetzt zu „Inserate“ mit Übersicht und Erstellen; der frühere Generator-Bildschirm
wurde entfernt.

**Prüfung:** Lokaler Datenbank-Reset, 61 fokussierte Inseratstests, 1.939
Datenbanktests, zwei parallele psql-Aufrufe, gezielte Angular- und DOM-Tests,
Typprüfung, Produktionsbau sowie die Shared-UI-Prüfung liefen erfolgreich. Die
abschließende vollständige Prüfung bestand mit 1.436 Node-, 238 DOM-, 922
Angular- und 13 Landing-Tests, Formatierung, ESLint, Typprüfung und
Produktionsbau. Der Bau meldet weiterhin die drei bekannten NG8113-Hinweise zu
ungenutzten LucideDynamicIcon-Importen außerhalb dieses Bereichs. Kein
Push/Merge.

## 2026-09-20 – Codex (OpenAI) – Listing-Studio-Entwurf auf aktuellen Stand gebracht

**Auftrag:** Nach Abschluss der Einkaufsarbeiten klären, ob die Inserate-Seite
bereits fertig ist, und die Weiterarbeit am gespeicherten Listing Studio
vorbereiten.

**Änderung:** Der alte Entwurf vom 17.09.2026 wurde gegen `master` bei
`a845cf4d` geprüft. Die bestehende Kleinanzeigen-Übertragung bleibt Grundlage;
gespeicherte Inserate, Übersicht und Statusablauf fehlen weiterhin. Eine neue
Spezifikation übernimmt die bestätigten Fachentscheidungen, verwendet die
aktuelle Schemareihenfolge mit `230_listings.sql` und entfernt alle inzwischen
veralteten Demo-Annahmen. Die alte Tabelle `listing_drafts` bleibt in Schritt 1
als Sicherheitsnetz bestehen und wird erst nach belegter Datenprüfung in einem
zweiten PR migriert oder entfernt.

Darauf aufbauend beschreibt ein neuer Umsetzungsplan PR 1 in neun
testgetriebenen Aufgaben: Fachmodelle, Datenbank und Rechte, transaktionale
Statusfunktionen, workspace-sicherer Service, Erweiterungsbrücke, Übersicht,
Editor, Routen/Navigation sowie Browser- und Abschlussprüfung. Der Plan nennt
für jede Aufgabe konkrete Dateien, Schnittstellen, RED-/GREEN-Befehle und
Commits.

**Prüfung:** Aktuelle Routen, Navigation, Listing-Service, deklaratives Schema,
Schema-Registrierung, Demo-Entfernung und der reine Dokumentationszweig
`feat/listing-studio-listings` wurden gelesen. Die Spezifikation wurde auf
Platzhalter, widersprüchliche Statusregeln und den abgegrenzten Zwei-PR-Umfang
geprüft. Noch keine Produktänderung und keine Anwendungstests.
Der Umsetzungsplan wurde zusätzlich gegen jede Spezifikationsrubrik, die
Typnamen zwischen den Aufgaben, verbotene Platzhalter und fünf besonders
riskante Fehlerklassen geprüft. Dabei wurde die Sperre für Paketartikel aus
wieder geöffneten Einkäufen ausdrücklich in die neue Security-Definer-Funktion
aufgenommen, weil der ältere Trigger den Datenbankbesitzer bewusst ausnimmt.

## 2026-09-20 – Codex (OpenAI) – Einkaufsübersicht und offene Preise abgesichert

**Auftrag:** Die vereinbarten Schutzregeln für Einkaufslisten und die
fachliche Erweiterung für offene Positionspreise umsetzen.

**Änderung:** Die Einkaufsübersicht verwendet die gemeinsamen
Tabellen-Grenzen, zeigt Verkäuferdaten vor dem optionalen Titel und macht einen
Vinted-Einkauf ohne gespeicherten Verkäufer nach dem erneuten Öffnen über
Plattform-Benutzernamen und Bestellnummer eindeutig. Normale Einkaufspositionen
können nun einen offenen Preis im Entwurf behalten und erneut gespeichert
werden. Ein expliziter Preis von 0,00 € bleibt ein bezahlter Preis. Offene
Preise werden verständlich angezeigt und sperren Abschluss, Ankunft,
Wareneingang sowie jede Übernahme in Bestand und Bestandslose. Der allgemeine
Status `open` ergänzt den erhaltenen Altwert `unpriced_mystery`; Schema,
generierte Migration, Datenbankfunktionen und Supabase-Typen wurden zusammen
aktualisiert.

**Prüfung:** Gezielte Service-, Komponenten-, pgTAP- und Chromium-Regressionen
für offenen Preis, 0,00 €, Speichern, erneutes Öffnen sowie die Sperren liefen
grün. `npm run verify` bestand mit Formatierung, Lint, Typprüfung,
Architektur- und Suite-Audit sowie 1.421 Node-, 235 DOM-, 927 Angular- und 13
Landing-Tests. `npm run test:db` bestand mit 52 Dateien und 1.878 Tests,
`npm run test:e2e:pr` mit sechs Chromium-Tests und die vollständige
Einkaufs-Regression mit zwei Chromium-Tests. Der Produktionsbau meldet weiter
die drei bekannten NG8113-Hinweise zu ungenutzten `LucideDynamicIcon`-Importen.
Kein Push/Merge.

## 2026-09-19 – Codex (OpenAI) – Restarbeiten der Demo-Entfernung behoben

**Auftrag:** Die drei bestätigten Lücken aus der kritischen Nachprüfung beheben.

**Änderung:** Retouren, Preisradar und Versand übernehmen keine Geschäftsdaten
mehr aus globalen Browser-Caches. Retouren und Preisradar leeren ihren Zustand
bei Abmeldung oder Workspace-Wechsel und verwerfen verspätete Antworten des
vorherigen Workspaces. Neue Preisbeobachtungen enthalten ohne angebundene
Marktdatenquelle keine erfundenen Vergleichspreise, Wettbewerber, Verläufe oder
Alarme; gespeicherte Altwerte werden in diesem Zustand weder angezeigt noch für
Preisanpassungen verwendet.

Die Beispielkonten und die fest eingebaute Absenderadresse im Versand sind
entfernt. Absenderdaten werden nun je Workspace in `carrier_configs` gespeichert
und in den Versand-Einstellungen gepflegt. Ohne vollständige Adresse bleibt der
Etikettendruck mit einem verständlichen Hinweis gesperrt. Beim manuellen Versand
wird außerdem keine Ersatz-Sendungsnummer mehr erfunden. Deklaratives Schema,
Migration und generierte Supabase-Typen wurden gemeinsam aktualisiert.

Der unabhängige Abschlussreview fand weitere Wechsel- und Fehlerpfade. Laufende
Schreibantworten dürfen nun keine Daten in einen inzwischen ausgewählten anderen
Workspace übernehmen; offene Versanddialoge und ausgewählte Aufträge werden beim
Wechsel geleert. Alte Marktwerte bleiben über einen dauerhaften Vertrauensstatus
auch nach einer späteren Quellenanbindung gesperrt. Absender-Pflichtfelder weisen
Leerzeichen sowie ungültige E-Mail-Adressen verständlich aus. Ladefehler der
Versandkonfiguration enden in einem sichtbaren Fehlerzustand mit erneutem Versuch.
Der Kontrollreview ergänzte die Absicherung laufender Versandaktionen beim Wechsel
und die tatsächliche, idempotente Löschung der vier früheren Browser-Cache-Schlüssel.
Ein abschließender Release-Review zeigte, dass diese Bereinigung noch vom Öffnen
eines betroffenen Bereichs abhing. Sie läuft deshalb nun direkt nach der alten
Speichermigration und vor dem Angular-Start; dadurch können migrierte Altwerte
nicht erneut als globale Geschäftsdaten liegen bleiben.

**Prüfung:** Die Regressionstests wurden vor der Umsetzung rot und danach grün
ausgeführt. Die Gesamtprüfung bestand mit 1.419 Node-, 235 DOM-, 920 Angular- und
13 Landing-Tests sowie Formatprüfung, ESLint, Typprüfung und Produktionsbau.
Schema-/Migrationsprüfungen, lokaler Datenbank-Reset und 1.857 Datenbanktests
bestanden ebenfalls. Der Bau meldet weiterhin drei bekannte NG8113-Hinweise zu
ungenutzten `LucideDynamicIcon`-Importen. Drei unabhängige Branch-Reviews lieferten
zusammen acht wichtige Befunde; sie wurden behoben. Kein Push/Merge.

## 2026-09-19 – Codex (OpenAI) – Kritische Nachprüfung der Demo-Entfernung

**Auftrag:** Prüfen, ob der zuletzt integrierte Stand vollständig und sauber ist.

**Ergebnis:** Drei verbliebene Lücken bestätigt: fehlende Workspace-Isolation in
Retouren und Preisradar, weiterhin erfundene Marktwerte beim Anlegen von
Preisbeobachtungen und fest eingebaute Absenderdaten in der Versandansicht.
Die frühere Aussage „Demo-Code vollständig entfernt“ war zu weitgehend.
Die Stellen bestanden bereits vor PR #131. Befunde, Umfang und Abnahmekriterien
stehen in [der Nachprüfung](audit/2026-09-19-demo-removal-follow-up.md).

**Prüfung:** 28 vorhandene Node-Tests bestanden. Fünf temporäre DOM-Reproduktionen
bestätigten das Fehlverhalten; die Testdatei wurde danach entfernt. Kein erneuter
Gesamt-Testlauf oder Bau. Nur Dokumentation geändert, keine Fehlerbehebung,
kein Push/Merge.

## 2026-09-19 – Codex GPT-5.6 Terra (OpenAI) – Demo-Code vollständig entfernt

**Auftrag:** Den letzten Abschnitt des Demo-Code-Umbaus abschließen: Anmeldung,
Shell, Umgebungen, Übersetzungen, Ausgaben und Fixkosten bereinigen und den
Ersatz-Datenspeicher löschen.

**Änderung:** Der Zugang zum Demo-Modus, die Demo-Anmeldung, Hinweise in der
Shell und die Umgebungseinstellung sind entfernt. Ausgaben, Kategorien,
wiederkehrende Ausgaben und Belege verwenden nur noch Supabase. Der rund 2.550
Zeilen große Ersatz-Datenspeicher sowie ausschließlich davon abhängige
Kategorien und Kommentarmodelle sind gelöscht. Lokale Client-IDs tragen keinen
Demo-Begriff mehr.

Eine erweiterte Inhaltssuche fand zusätzlich fest eingebaute Versand-, Radar-
und Retourendaten sowie eine erfundene Workspace-ID im Aktivitätsprotokoll.
Diese Rückfälle sind entfernt. Leere Datenbankantworten räumen nun veraltete
lokale Retouren und Radarartikel auf. Tests setzen ihre Beispieldaten selbst,
statt dafür öffentliche Demo-Ladefunktionen in den App-Diensten zu benötigen.

**Prüfung:** Die betroffenen Tests wurden vor den Änderungen gezielt rot und
danach grün ausgeführt. `npm run verify` bestand vollständig: Formatierung,
ESLint, Typprüfung, Workflow- und Suite-Audit, 1.401 Node-, 232 DOM-, 918
Angular- und 13 Landing-Tests sowie Produktionsbau. Der Bau meldet weiterhin
drei bekannte NG8113-Hinweise zu ungenutzten `LucideDynamicIcon`-Importen. Kein
Push/Merge.

## 2026-09-19 – Codex GPT-5.6 Terra (OpenAI) – Demo-Code: Workspace, Einstellungen und Vinted Bot

**Auftrag:** Den vierten Abschnitt des vereinbarten Umbaus umsetzen: den
Demo-Modus aus Workspace, Einstellungen, Dashboard-Einstellungen und dem
Vinted-Bot entfernen.

**Änderung:** Workspaces, Mitglieder, Webhooks sowie Tabellen- und
Dashboard-Einstellungen verwenden nur noch den angemeldeten Nutzer und den
aktuellen Workspace. Der Vinted-Bot lädt Kategorien, Filter und Favoriten ohne
Demo-Sonderfall; zugehörige Hinweise und Tests sind entfernt.

**Prüfung:** 44 fokussierte Node-Tests und 45 Angular-Tests bestanden. Zusätzlich
bestanden Typprüfung, ESLint, projektweite Prettier-Prüfung und Produktionsbau.
Der Bau meldet weiterhin drei bekannte, paketfremde NG8113-Hinweise zu
ungenutzten `LucideDynamicIcon`-Importen. Kein Push/Merge.

## 2026-09-19 – Codex GPT-5.6 Terra (OpenAI) – Demo-Code: Verkauf, Finanzen und Prüfung

**Auftrag:** Den dritten Abschnitt des vereinbarten Umbaus umsetzen: den
Demo-Modus aus Verkauf, Finanzen, Prüfprotokoll und zugehörigen Oberflächen
entfernen.

**Änderung:** Verkauf, Retouren, Rechnungen, Bankabgleich, Fulfillment,
Preisrecherche, Geschäftsereignisse und Prüfexporte verwenden ausschließlich
Supabase. Die Buchhaltung bietet keine erfundenen Kontoauszüge mehr. Daten und
Prüfung richtet den Zugriff nur noch nach der geladenen Workspace-Rolle aus;
Demo-Hinweise und lokale Prüfkommentare sind entfernt.

**Prüfung:** 85 fokussierte Node-Tests, 14 fokussierte DOM-Tests, 15 fokussierte
Angular-Tests und zusätzlich 33 Tests für Buchhaltungsaktionen und Daten &
Prüfung bestanden. Typprüfung, ESLint, projektweite Prettier-Prüfung und
Produktionsbau bestanden ebenfalls. Der Bau meldet weiterhin drei bekannte,
paketfremde NG8113-Hinweise zu ungenutzten `LucideDynamicIcon`-Importen. Kein
Push/Merge.

## 2026-09-19 – Codex GPT-5.6 Terra (OpenAI) – Demo-Code: Bestand, Katalog und Medien

**Auftrag:** Den zweiten Abschnitt des vereinbarten Umbaus umsetzen: den
Demo-Modus aus Bestand, Katalog, Medien, Lagerzugängen, Kategorien, Marken und
den Inventaransichten entfernen.

**Änderung:** Alle genannten Dienste laden und verändern Daten ausschließlich
über Supabase. Die Ansichtseinstellungen sind nur noch nach angemeldetem Nutzer
und Workspace getrennt. Ein Test für ausschließlich lokal erzeugte Demo-IDs
entfällt; die übrigen Tests prüfen bestätigte Datenbankantworten.

**Prüfung:** 139 fokussierte Node-Tests, 31 fokussierte DOM-Tests und 6
Angular-Tests bestanden. Zusätzlich bestanden Typprüfung, ESLint,
projektweite Prettier-Prüfung und Produktionsbau. Der Bau meldet weiterhin drei
bekannte, paketfremde NG8113-Hinweise zu ungenutzten `LucideDynamicIcon`-Importen.
Kein Push/Merge.

## 2026-09-19 – Codex GPT-5.6 Terra (OpenAI) – Demo-Code: Einkaufsbereich

**Auftrag:** Den ersten Abschnitt des vereinbarten Umbaus umsetzen: den
Demo-Modus aus Einkauf, Stammdaten für Quellen und Lieferanten,
Einkaufsbelegen, Kostenverteilung und der Paket-Erfassung entfernen.

**Änderung:** Die genannten Dienste verwenden nur noch bestätigte
Supabase-Antworten. Die Einkaufsdetailseite, Belegkarte und Paket-Erfassung
enthalten keine Demo-Sperren mehr. Sechs Tests, die ausschließlich den
Browser-Demo-Speicher abdeckten, sind entfernt. Neue DOM-Tests belegen, dass
Quellen und Lieferanten ohne Demo-Speicher direkt über die Datenbank angelegt
werden.

**Prüfung:** 146 fokussierte Node-Tests, 37 fokussierte DOM-Tests und 9
Angular-Tests bestanden. Zusätzlich bestanden Typprüfung, ESLint,
projektweite Prettier-Prüfung und Produktionsbau. Der Bau meldet weiterhin drei
bekannte, paketfremde NG8113-Hinweise zu ungenutzten `LucideDynamicIcon`-Importen.
Kein Push/Merge.

## 2026-09-19 – Codex (OpenAI) – Prüfung und Nachbesserung der vier Terra-Pakete

**Auftrag:** Die mit Terra umgesetzten Pakete 1–4 (PRs #126–#129) auf Qualität,
verbliebene Fehler und Eignung für die weitere Arbeit prüfen und die bestätigten
Fehler anschließend beheben.

**Ergebnis:** Vier Befunde wurden reproduziert und behoben: Nach schnellem
A→B→A startet wieder eine frische Ausgabenabfrage; die Seitennavigation sortiert
zusätzlich eindeutig nach ID; Belegstatus-Abfragen werden in kurze Pakete geteilt
und vollständig paginiert; die Komponentensuite verwendet eine feste Testzeit.
Die IN-Abfrage für Belege war eine ältere Schwäche, die bei der zugesagten
Unterstützung großer Listen unberücksichtigt blieb. Kein vollständiger Neuaufbau
war nötig; Terra bleibt für begrenzte Aufgaben brauchbar, sensible Änderungen
brauchen unabhängige Prüfung.

**Prüfung:** Vor der Korrektur schlugen die neuen Regressionen für A→B→A,
eindeutige Sortierung, 1.001 Ausgaben-IDs und mehr als 1.000 Belegzeilen gezielt
fehl. Vier vorhandene Seitentests wurden mit Oktober-Uhrzeit rot ausgeführt.
Zusätzlich wurden eine doppelte ID über SQL-Seitengrenzen und HTTP 414 lokal
nachgewiesen. Nach der Korrektur bestanden 32 fokussierte Service-DOM-, 44 Node-,
26 Angular- und 157 Datenbanktests. `npm run verify` bestand vollständig mit
1.449 Node-, 305 DOM- und 926 Angular-Anwendungstests sowie Produktionsbau; es
blieben nur drei bekannte NG8113-Hinweise. Kein Push/Merge.

**Dokumentation:** `docs/audit/2026-09-19-terra-implementation-review.md`.

## 2026-09-19 – ChatGPT GPT-5.6 Terra (OpenAI) – Ausgabenzeitraum und nächste Fälligkeit

**Auftrag:** Den vierten Reparaturabschnitt aus der Bestandsaufnahme umsetzen:
Ausgaben nach einem eindeutig benannten Monat anzeigen, Summen und Tabelle auf
denselben Filter beziehen sowie die nächste Fälligkeit von der 30-Tage-Vorschau
entkoppeln.

**Änderung:** Die Ausgabenseite startet nun im aktuellen Monat. Vor- und
Zurückschalten sowie „Alle“ stehen in der gemeinsamen Tabellenleiste zur
Verfügung; „Ansicht zurücksetzen“ stellt wieder den aktuellen Monat her.
Tabelle und drei Summenkarten verwenden dieselbe Menge aus Zeitraum, Suche,
Kategorie und Status. Der sichtbare Hinweis benennt dafür ausdrücklich das
Rechnungs- beziehungsweise Ausgabedatum. Gelöschte Ausgaben bleiben auch bei
einem unerwarteten Client-Datensatz ausgeschlossen.

Die wiederkehrende Tabelle berechnet ihre nächste Fälligkeit direkt aus der
Regel. Dadurch zeigt eine Jahresregel im Dezember auch im September einen
Folgetermin, obwohl sie nicht zur 30-Tage-Vorschau gehört. Der Gesamtbetrag
bleibt unabhängig von der Menge unverändert. Ein Dashboard-Regressionstest
belegt zusätzlich: Eine August-Rechnung zählt erst nach der September-Zahlung
zum Cashflow; offene und gelöschte Ausgaben verändern ihn nicht und die
Verkaufsmarge bleibt getrennt.

**Prüfung:** Die neuen Tests wurden zuerst gegen den alten Stand ausgeführt und
schlugen erwartungsgemäß für Monatsfilter und Jahresfälligkeit fehl. Danach
bestanden die fokussierten Angular-Tests (16) und die zugehörigen Node-Tests
(36) sowie Prettier und ESLint. `npm run verify` bestand anschließend mit
2.676 Anwendungstests, Typprüfung, Workflow- und Test-Audit sowie
Produktionsbau. Der Bau meldet weiterhin drei bekannte, paketfremde
NG8113-Hinweise zu ungenutzten `LucideDynamicIcon`-Importen.

## 2026-09-19 – ChatGPT GPT-5.6 Terra (OpenAI) – Archivierung und vollständiger Ausgabenexport

**Auftrag:** Den dritten Reparaturabschnitt aus der Bestandsaufnahme umsetzen:
Archivierte Workspaces vollständig gegen Änderungen schützen, eine verständliche
Löschentscheidung für reine Ausgaben-Workspaces liefern und das Prüfarchiv um
Ausgaben, Belege und die tatsächlichen Originaldateien ergänzen.

**Änderung:** Archivierte Workspaces sperren nun auch Ausgabenkategorien,
Wiederholungsregeln, Ausgaben, Einkaufsbelege und Ausgabenbelege. Das gilt für
Metadaten und für die drei zugehörigen Storage-Buckets. Ein Workspace mit
Ausgaben, Wiederholungsregeln oder Belegen meldet beim Löschen gezielt den
bekannten Aufbewahrungsfehler; leere Standard- oder eigene Kategorien allein
verhindern die Löschung nicht.

Das vollständige Archiv enthält zusätzlich Kategorien, Wiederholungsregeln,
Ausgaben sowie beide Belegmetadaten. Verfügbare Originalbelege liegen mit ihrem
stabilen Storage-Pfad unter `documents/` im ZIP. `document-downloads.json`
protokolliert jede einbezogene oder fehlende Datei. Bei fehlenden Originaldateien
zeigt die Oberfläche eine Warnung mit der tatsächlichen Anzahl, statt den Export
uneingeschränkt als Erfolg auszugeben.

Ausgaben, Statuswechsel, Betrag-/Datumsänderungen, Entfernen/Wiederherstellen,
Wiederholungsregeln und Ausgabenbelege erzeugen jetzt nachvollziehbare
Prüfprotokollereignisse. Der Filter und die Bezeichnungen auf „Daten &
Protokolle“ kennen den Bereich „Ausgaben“.

**Qualität:** Der Node-Test-Auditor prüft Browser-Globals jetzt als echte
TypeScript-Bezeichner. Namen in Testdaten wie `document-downloads.json` werden
dadurch nicht mehr fälschlich als Browserzugriff gewertet; reale globale
Browserzugriffe bleiben gesperrt.

**Datenbank:** Die Migrationen
`20260919145632_expense_archive_retention.sql` und
`20260919151500_audit_snapshot_lint.sql` wurden aus dem lokalen Diff erzeugt
und anschließend geprüft. Der Generator zeigte daneben ältere,
paketfremde Abweichungen bei Sniper-Funktionen, Katalogrechten und
Einkaufspaket-Rechten. Diese Änderungen gehören nicht zu diesem Reparaturpaket
und wurden bewusst nicht in die Migrationen aufgenommen; ihr deklarativer
Schema-Abgleich bleibt ein eigener Aufräumpunkt.

**Prüfung:** `supabase db reset --local`, die vollständige Datenbanktestsuite
(1.857 Tests in 51 Dateien), `supabase db lint --fail-on error`, die
Typengenerierung mit identischem Ergebnis, die Workflow-Suite (72 erfolgreich,
5 bestehende Skips) und `npm run verify` mit 2.668 Anwendungstests sowie
Produktionsbau wurden lokal erfolgreich ausgeführt. Der Datenbank-Advisor hat
keine Fehler mehr; seine drei verbleibenden Hinweise betreffen die bestehenden
Funktionen `is_valid_gtin` und `save_number_series` außerhalb dieses Pakets.

## 2026-09-19 – ChatGPT GPT-5.6 Terra (OpenAI) – Ausgaben pro Workspace sicher laden

**Auftrag:** Den zweiten Reparaturabschnitt aus der Bestandsaufnahme umsetzen:
Ausgaben, Kategorien, Wiederholungsregeln und Belegstatus nach Workspace-Wechseln
sicher halten, die täglichen Wiederholungen zuverlässig prüfen und große
Ausgabenlisten vollständig laden.

**Änderung:** Alle vier Ausgaben-Dienste verwerfen Antworten, die nach einem
Workspace-Wechsel eintreffen, und leeren ihren sichtbaren Zustand sofort beim
Wechsel oder Abmelden. Neue Ladeversuche bleiben nach einem Fehler möglich;
gleichzeitige Ausgaben-Ladevorgänge werden nur für denselben Workspace und
Kalendertag geteilt. Wiederholungsausgaben werden deshalb beim ersten Aufruf
eines neuen Tages erneut abgeglichen. Die Ausgabenabfrage lädt Seiten mit je
1.000 Datensätzen, sodass mehr als 1.000 Einträge vollständig in der Tabelle
ankommen. Belegabfragen und Löschungen sind zusätzlich an den aktiven Workspace
gebunden.

Die Ausgabenseite lädt nach jedem Workspace-Wechsel Kategorien, Ausgaben und
Belegstatus erneut. Erfassungs-, Wiederholungs-, Kategorien- und Belegdialoge
sperren den Workspace für ihre Lebensdauer; laufende Speicheraktionen können
dadurch nicht in einen anderen Workspace umgelenkt werden.

**Prüfung:** Regressionstests decken verspätete Workspace-Antworten,
Tageswechsel, Retry nach Fehlern, parallele Ladevorgänge, 1.001 Ausgaben,
Belegstatus und Dialogsperren ab. Die fokussierten DOM- und Angular-Tests sowie
die strikte Typprüfung, die vollständige Testsuite, Workflow-Prüfung, Prettier,
ESLint und der Produktionsbau wurden lokal erfolgreich ausgeführt.

## 2026-09-19 – ChatGPT GPT-5.6 Terra (OpenAI) – Wiederholungsausgaben zuverlässig anlegen

**Auftrag:** Den ersten Reparaturabschnitt aus der Bestandsaufnahme umsetzen:
die fehlende Schema-Registrierung für Ausgaben beheben, Wiederholungsausgaben
über PostgREST sicher erneut ausführen können und doppelte Regeln nach einem
Teilfehler im Dialog verhindern.

**Änderung:** Die deklarative Ausgabendatei ist jetzt registriert. Die
Schema-Reihenfolge lädt außerdem die Betreiberfunktion vor ihren abhängigen
Bot-Policies; ein neuer Workflow-Test schützt beide Regeln. Der
Eindeutigkeitsindex für erzeugte Wiederholungsausgaben ist nicht mehr partiell,
sodass der von PostgREST verwendete Konfliktschlüssel gültig ist. Mehrere
manuelle Ausgaben ohne Wiederholungsbezug bleiben weiterhin möglich.

Nach einem Fehler beim Erzeugen fälliger Ausgaben behält der Dialog die bereits
gespeicherte Regel. Ein erneuter Klick aktualisiert diese Regel, statt eine
zweite anzulegen. Der Hinweis erklärt dabei ausdrücklich, dass nur das
nachgelagerte Erzeugen der Fälligkeiten fehlgeschlagen ist.

**Datenbank:** Migration
`20260919131400_repair_expense_recurrence_conflict.sql` ersetzt den partiellen
Index `expenses_recurring_occurrence_uidx` durch einen vollständigen
Eindeutigkeitsindex. Die aus der lokalen Datenbank generierten Supabase-Typen
sind aktualisiert.

**Prüfung:** `supabase db reset`, die vollständige Datenbanktestsuite (1.835
Tests), der neue PostgREST-Browsertest, der Angular-Komponententest, Lint,
Prettier, der Schema-Registrierungstest, die Workflow-Prüfung, der
Produktionsbau und die vollständige Anwendungstestsuite (2.657 Tests) wurden
lokal ausgeführt.

## 2026-09-19 – ChatGPT GPT-5.6 Sol (OpenAI) – Ausgaben-Erfassung vereinfacht

**Auftrag:** Die Ausgabenseite soll ohne Tabellenflackern laden, dieselben
Icon-Aktionen wie die übrigen Tabellen verwenden und Betriebsausgaben mit
Händler, Menge und Beleg einfacher erfassen. Die Mehrwertsteuer soll den
normalen Eingabefluss nicht dominieren.

**Änderung:** Ausgaben und wiederkehrende Ausgaben speichern jetzt optional
Händler/Anbieter sowie eine positive Stückzahl mit Standardwert 1. Der
Gesamtbetrag bleibt der tatsächlich bezahlte Gesamtbetrag; ein Stückpreis wird
nur abgeleitet. Neue manuelle und wiederkehrende Ausgaben starten in der UI mit
19 % enthaltener MwSt.; 7 %, 0 % und „nicht ausgewiesen / unbekannt“ bleiben
änderbar hinter eingeklappten Steuerdetails. Bestehende Datensätze mit
unbekannter MwSt. werden beim Bearbeiten nicht auf 19 % umgestellt.

Belege können bereits beim Erfassen per Datei oder Drag-and-Drop vorgemerkt und
nach erfolgreicher Speicherung hochgeladen werden. Ein fehlgeschlagener
optionaler Upload verwirft die gespeicherte Ausgabe nicht. Die Tabelle kennt
den Belegstatus über eine schlanke Metadatenabfrage und zeigt abhängig davon
„Beleg hinzufügen“ oder „Beleg ansehen“ als Icon-Aktion. Die Belegansicht bietet
Ansehen, Drucken und Download.

Die Ausgabentabelle zeigt standardmäßig Datum, Bezeichnung, Anbieter, Kategorie,
Menge, Gesamtbetrag, Status, Beleg und Aktionen. Steuer, Fälligkeit/Zahlungsdatum
und Wiederholung bleiben über den Spaltenwechsler verfügbar. Bearbeiten,
Löschen und „als bezahlt markieren“ verwenden die gemeinsame Icon-Button-
Komponente; Löschen nutzt den gemeinsamen Bestätigungsdialog.

Das kurze Tabellenflackern wurde auf zwei konkurrierende Initial-Ladepfade
zurückgeführt. Die Seite initialisiert nun Kategorien und den bereits
deduplizierenden `ExpenseService.ensureCurrentWorkspaceLoaded()`-Pfad einmal,
lädt danach die Belegübersicht und hält die Tabelle bis dahin im Ladezustand.

**Datenbank:** `expenses` und `expense_recurring_rules` wurden additiv um
`vendor_name` und `quantity` ergänzt. Die Migration
`20260919080000_expense_vendor_quantity.sql` setzt Menge 1 für bestehende
Datensätze und erzwingt positive Ganzzahlen.

**Prüfung:** Regressionstests wurden vor den jeweiligen Implementierungsschritten
für Datenvertrag, Stückpreis/Steuerberechnung, Formulare, Belegstatus,
Tabellenspalten, Anbieter-Suche, Bestätigungsdialog und Initialisierung ergänzt.
Eine lokale Testausführung ist in dieser Sitzung nicht möglich; die
ausführbaren Format-, Lint-, Typ-, Angular-, Datenbank- und Browserprüfungen
müssen im PR-CI-Lauf erfolgen.

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
