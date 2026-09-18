# Einheitliches Data-Table-System – Entwurf

Stand: 18. September 2026

## Ausgangslage

Flipbase besitzt bereits gemeinsame Tabellenbausteine wie `TableToolbarComponent`,
`TableColumnMenuComponent`, `TableSortHeaderComponent` und zentrale
Tabellenpräferenzen. Die Hauptlisten verwenden diese Bausteine aber nicht
durchgehend gleich:

- Einkäufe nutzen bereits die gemeinsame Toolbar-Struktur.
- Verkäufe, Inventar, Artikelstamm, Buchhaltung und Beta-Bewerbungen besitzen
  jeweils eigene Varianten derselben Tabellenleiste.
- Ausgaben und Verkäufer bauen Filter und Tabellenhülle weitgehend lokal nach.
- Artikelstamm und Bestand zeigen zusätzlich eine zweite Navigation im
  Seiteninhalt, obwohl beide Ansichten fachlich unter der Sidebar-Navigation
  zusammengehören.
- Toolbar-Suche und Toolbar-Selects sind im Ruhezustand teilweise transparent
  und dadurch auf derselben Oberfläche kaum als bedienbare Felder erkennbar.

Das Ergebnis ist funktional ähnlich, visuell und technisch aber nicht
vorhersehbar. Neue Listen können weiterhin eine weitere Variante einführen.

## Ziel

Alle administrativen Tabellen und verwaltbaren Listen verwenden denselben
Shared-Rahmen. Eine neue Seite entscheidet nur noch über Daten, Spalten,
fachliche Filter, Aktionen und Zellinhalte. Position, Dichte und Verhalten von
Suche, Filtern, Spaltenmenü, Ladezustand, Fehlerzustand und Leerzustand werden
zentral vorgegeben.

Der Nutzer soll auf jeder Liste dieselbe Bedienlogik vorfinden:

`Ansicht/Status -> Suche -> fachliche Filter -> Spalten/Sortierung`

Die Suchfläche nimmt den freien Platz ein. Spalten-/Sortiersteuerung steht,
sofern vorhanden, immer rechts.

## Nicht-Ziele

- Keine neue Tabellenbibliothek.
- Keine generische Datenquelle oder serverseitige Abfrageabstraktion.
- Keine Änderung fachlicher Filterlogik nur für die Vereinheitlichung.
- Keine künstlichen Filter für kleine Detailtabellen, Druckansichten oder
  Vorschauen.
- Keine gleichzeitige Neugestaltung von Storefront-Tabellen.

## Komponentenarchitektur

### `DataTableComponent`

Neu unter:

`src/app/shared/components/data-table/`

Die Komponente ist der verbindliche Rahmen für administrative Tabellen und
Listen. Sie besitzt:

- gemeinsame Surface-Geometrie,
- die Toolbar,
- den Suchplatz,
- feste Filterpositionen,
- optional das Spalten-/Sortiermenü,
- horizontalen Tabellenüberlauf,
- gemeinsame Lade-, Fehler- und Leerzustände,
- einen optionalen mobilen Inhaltsbereich,
- einheitliche ARIA-Beschriftung.

Die Fachkomponente behält die Verantwortung für:

- Daten laden und filtern,
- Zeilen und Zellen,
- fachliche Badges und Aktionen,
- konkrete Filteroptionen,
- Tabellenpräferenzen,
- Sortiervergleich und fachliche Sortierwerte.

Damit bleibt die Shared-Komponente klein und kennt keine Geschäftsmodelle.

### Öffentliche Eingänge

Die konkrete Signatur wird während der Implementierung streng typisiert. Der
Vertrag umfasst mindestens:

- `ariaLabel`
- Suchwert, Placeholder und ARIA-Label
- optional deaktivierte Suche
- optional Spalten, Sortieroptionen, aktuelle Sortierung und
  `viewModified`
- Ladezustand
- Fehlermeldung
- `hasRows`
- Texte für Leer- und Ladezustand
- minimale Tabellenbreite beziehungsweise responsiver Modus

Ausgänge umfassen mindestens:

- Suchwert geändert
- Spaltensichtbarkeit geändert
- Spaltenreihenfolge geändert
- Sortierung geändert
- Ansicht zurücksetzen

### Projektionen

Die Komponente erhält feste Projektionsbereiche für:

- Ansicht-/Statussteuerung links vor der Suche,
- einen oder mehrere fachliche Filter nach der Suche,
- Tabelleninhalt,
- optional mobile Listendarstellung,
- optionale Aktion im Leerzustand.

Fachkomponenten dürfen die Reihenfolge dieser Bereiche nicht selbst bestimmen.

### Bestehende Tabellenbausteine

`TableColumnMenuComponent` und `TableSortHeaderComponent` bleiben bestehen.
`DataTableComponent` verwendet das Spaltenmenü intern. Feature-Templates
setzen es danach nicht mehr direkt ein.

`TableToolbarComponent` wird entweder vollständig von
`DataTableComponent` gekapselt oder nach erfolgreicher Migration entfernt,
falls kein sinnvoller eigenständiger Verbraucher übrig bleibt. Es darf keinen
zweiten konkurrierenden Toolbar-Vertrag geben.

## Such- und Filterdarstellung

`CustomSearchInputComponent` und `CustomSelectComponent` bleiben die
sichtbaren Shared-Eingaben.

Die Toolbar-Varianten erhalten bereits im Ruhezustand eine leicht abgesetzte
neutrale Fläche und einen sehr dezenten Rahmen. Sie bleiben deutlich ruhiger
als normale Formularfelder, dürfen aber nicht erst beim Hover als Interaktion
erkennbar werden.

Zustände:

- Ruhe: leichte neutrale Fläche, dezenter Rand
- Hover: etwas deutlicherer neutraler Hintergrund/Rand
- Fokus/offen: bestehender Markenfokus
- deaktiviert: bestehende reduzierte Deckkraft

Keine neue Akzentfarbe.

## Tabellenpräferenzen

Das vorhandene `TablePreferencesService` bleibt die Quelle für
Spaltensichtbarkeit, Reihenfolge und Sortierung.

Für Ausgaben wird eine eigene Tabellenkonfiguration ergänzt. Die vorhandenen
Konfigurationen für Verkäufe, Inventar, Artikel, Einkäufe, Buchhaltung und
Beta-Bewerbungen werden weiterverwendet.

Listen ohne konfigurierbare Spalten, beispielsweise Verkäufer, verwenden
denselben `DataTableComponent`, aber ohne Spaltenmenü.

## Migration bestehender Listen

Die Migration erfolgt systematisch über den aktuellen Admin-Bestand.

Mindestens betroffen sind:

- Einkäufe
- Verkäufe
- Artikelübersicht
- Bestand
- Ausgaben
- wiederkehrende Ausgaben
- Verkäufer
- Buchhaltung / Banktransaktionen
- Beta-Bewerbungen
- zentrale Vinted-Markenfilter
- weitere bei der statischen Prüfung gefundene verwaltbare Admin-Listen

Auch bereits optisch ähnliche Seiten werden migriert, damit nicht mehrere
Implementierungen derselben Oberfläche bestehen bleiben.

### Kleine und fachlich statische Tabellen

CSV-Vorschauen, Druckansichten, reine Detailaufstellungen und ähnliche kleine
Tabellen verwenden keine künstliche Toolbar. Sie dürfen denselben
`DataTableComponent` ohne Such-/Filterleiste verwenden oder eine ausdrücklich
dokumentierte Ausnahme bekommen, wenn die Semantik einer echten Tabelle dort
nicht zum Shared-Rahmen passt.

Storefront-Tabellen sind nicht Teil dieses Admin-Umbaus.

## Artikel-Navigation

Die zusätzliche `SectionNavigationComponent` oberhalb von Artikelübersicht
und Bestand entfällt.

In der Sidebar wird `Artikelübersicht` zum aufklappbaren Navigationspunkt mit:

- Alle Artikel -> `/catalog`
- Bestand -> `/inventory`

`Bildoptimierer` bleibt ein eigener Eintrag in der Gruppe Artikel.

Damit gibt es nur noch eine Navigationshierarchie und keine zweite Linkleiste im
Inhalt.

## Responsives Verhalten

Die Shared-Komponente definiert den Rahmen:

- Desktop: Tabelle mit horizontalem Überlauf nur wenn fachlich nötig.
- Mobile: Feature kann eine priorisierte mobile Listendarstellung projizieren.
- Toolbar darf umbrechen, ihre logische Reihenfolge bleibt erhalten.
- Suchfeld bleibt der flexible Bereich.
- Spalten-/Sortiermenü bleibt am Ende der Toolbar.
- Touch-Ziele folgen den bestehenden Admin-Richtlinien.

Bestehende mobile Spezialdarstellungen von Artikelstamm und Verkäufen werden
nicht entfernt, sondern in den gemeinsamen Rahmen aufgenommen.

## Barrierefreiheit

- Toolbar und Tabelle erhalten eindeutige ARIA-Beschriftungen.
- Suchfelder und Filter behalten explizite Labels.
- Sortierköpfe behalten `aria-sort`.
- Leer-, Lade- und Fehlerzustände verwenden passende Live-/Statusrollen.
- Tastaturbedienung des Spaltenmenüs bleibt erhalten.
- Keine Information nur über Farbe.

## Architektur-Sicherung

`scripts/check-admin-shared-ui.mjs` wird erweitert.

Die Prüfung soll neue Parallelvarianten verhindern:

1. Verwaltungslisten dürfen kein eigenes Tabellen-Toolbar-Muster einführen.
2. `TableColumnMenuComponent` darf in Feature-Templates nicht mehr direkt
   verwendet werden.
3. Native sichtbare Suchfelder in verwaltbaren Tabellenleisten sind verboten.
4. Admin-Tabellen außerhalb des Shared-Rahmens werden beanstandet, außer sie
   stehen auf einer kleinen, pfadgenau begründeten Ausnahmeliste.
5. Ausnahmen dürfen keine pauschalen Feature-Verzeichnisse freigeben.

Die Prüfung ist damit Teil des Vertrags für zukünftige Features.

## Tests

### Shared-Komponente

Angular-Tests prüfen mindestens:

- feste Toolbar-Reihenfolge,
- Suche vorhanden/optional,
- Filterprojektion,
- Spaltenmenü optional und immer am Ende,
- Suchwert-Ausgabe,
- Ladezustand,
- Fehlerzustand,
- Leerzustand,
- Tabelleninhalt,
- mobile Projektion,
- AXE ohne Befund.

### Architekturtest

Der bestehende Shared-UI-Test erhält rote Fälle für:

- lokales Tabellenmenü,
- lokales Toolbar-Suchfeld,
- verwaltbare Tabelle ohne Shared-Rahmen.

### Featuretests

Bestehende Tests werden auf den neuen Rahmen angepasst. Fachlogiktests sollen
unverändert bleiben, soweit keine DOM-Struktur Teil ihres Vertrags sein muss.

Mindestens die betroffenen Tabellen erhalten einen gezielten Angular-Test, der
ihre Filter an den vorgesehenen Shared-Slots nachweist.

### Build und Abschluss

Vor PR:

- betroffene Vitest-Tests
- Shared-UI-Architekturprüfung
- ESLint
- Prettier
- Typecheck
- Angular-Build
- relevante Browser-Smokes für Tabellen in Light/Dark und Desktop/Mobile

## Akzeptanzkriterien

1. Eine neue administrative Datenliste kann ohne eigene Toolbar-Geometrie
   erstellt werden.
2. Suche, fachliche Filter und Spaltenmenü stehen in allen migrierten Listen an
   derselben logischen Position.
3. Toolbar-Felder sind bereits im Ruhezustand als Interaktionen erkennbar.
4. Ausgaben besitzen denselben Tabellenstandard einschließlich
   Spalten-/Sortiersteuerung.
5. Artikelübersicht und Bestand besitzen keine zweite Seitennavigation mehr.
6. Die Sidebar zeigt Alle Artikel und Bestand unter Artikelübersicht.
7. Die statische Architekturprüfung verhindert neue lokale Tabellenvarianten.
8. Keine fachliche Filter-, Kosten-, Verkaufs-, Einkaufs- oder Bestandslogik
   ändert sich durch den Umbau.
