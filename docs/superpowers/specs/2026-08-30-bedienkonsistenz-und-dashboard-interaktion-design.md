# Bedienkonsistenz und Dashboard-Interaktion – Design

**Datum:** 2026-08-30  
**Status:** vom Nutzer freigegeben  
**Baut auf:** `2026-08-29-inventar-integritaet-und-gemeinsame-ansicht-design.md`

## Ziel

Flipbase erhält eine vorhersehbare Navigation zwischen Einkauf und Artikeldetail, verständliche Korrekturwege für historische Verkaufszustände, ein konsistentes Cursorverhalten, ein barrierefreies gemeinsames Auswahlfeld und einen interaktiven Dashboard-Chart mit Chart.js.

Das Paket ändert keine Bestands- oder Verkaufslogik. Die vorhandenen atomaren RPCs und das unveränderliche `inventory_reconciliation_events`-Journal bleiben die fachliche Quelle. Sichtbare technische Begriffe wie `Legacy` werden entfernt, interne Datenbank- und TypeScript-Bezeichner dürfen zur Abwärtskompatibilität bestehen bleiben.

## Verbindliche Grenzen

- Framework: Angular 22, Standalone Components, Signals, `ChangeDetectionStrategy.OnPush`, strikte Typen.
- Styling: Tailwind-Klassen in Templates; nur die appweite semantische Cursorregel wird zentral in `src/styles.css` definiert.
- Chart-Bibliothek: direktes `chart.js@4.5.1`; kein `ng2-charts`, kein `chart.js/auto` und keine Registrierung unbenötigter Charttypen.
- Neue sichtbare Texte enthalten weder `Legacy` noch unverständliche technische Statusnamen.
- Chart-Tooltip und Hervorhebung sind Zusatzinformationen. Die vollständigen Werte bleiben als echte HTML-Tabelle für assistive Technik verfügbar.
- Kein Chart-Drilldown, Zoom oder Pan in diesem Paket. Ein späterer Drilldown benötigt zuerst einen datumsbasierten Filtervertrag der Verkaufsseite und eine gleichwertige Tastaturbedienung.
- Keine neue Datenbankmigration für die UX-Änderungen. Die vorhandenen RPC-Grundparameter erhalten systemseitig erzeugte, nichtleere Dokumentationstexte.
- Kein ungeprüfter `returnUrl`, kein `history.back()` und kein nur flüchtiger Router-State für die Rücknavigation.

## 1. Kontexttreue Artikelnavigation

Wenn ein Nutzer das Artikeldetail aus einem Einkauf öffnet, wird die Einkaufs-ID als `fromPurchaseId` in der URL mitgeführt. Das Artikeldetail zeigt erst nach dem Laden des Artikels einen Einkaufs-Rücksprung, und nur wenn `fromPurchaseId` exakt der tatsächlichen `purchase_id` des Artikels entspricht.

Die Rücknavigation lautet:

- gültiger Einkaufskontext: `Zurück zum Einkauf`, Ziel `/purchases/:purchaseId`;
- direkter Aufruf, Inventar-Aufruf, fehlender, ungültiger oder fremder Kontext: `Zurück zum Inventar`, Ziel `/inventory`.

Damit bleibt der Rücksprung nach einem Reload stabil, ohne eine frei steuerbare Rücksprung-URL zu akzeptieren. Während der Artikel lädt, wird kein ungeprüfter Einkaufslink angeboten.

## 2. Verständliche historische Statuskorrektur

Der sichtbare Begriff `Altdaten prüfen` wird in den betroffenen Inventaransichten zu `Verkaufsstatus klären`. Die Erklärung lautet sinngemäß:

> Dieser Artikel ist als verkauft markiert, aber es gibt noch keinen zugehörigen Verkauf.

Für `legacy_sold_unverified` gibt es weiterhin genau zwei alternative Aktionen:

1. `Artikel ist noch vorhanden`
2. `Verkauf nachtragen`

### Artikel ist noch vorhanden

Das bisherige Freitextfeld `Prüfgrund für die Bestandsrücknahme` entfällt. Nach einer klaren Bestätigung ruft die Oberfläche weiterhin ausschließlich `resolveLegacySoldItem` auf und übergibt den systemseitigen Text:

`Historische Statuskorrektur: Artikel ist noch vorhanden.`

Der RPC protokolliert weiterhin Actor, Zeitpunkt, vorherigen und neuen Status sowie den Grund im unveränderlichen Journal. Ein direkter Tabellenstatuswechsel bleibt ausgeschlossen.

### Verkauf nachtragen

Der Verkaufsdialog verlangt weiterhin die tatsächlichen Verkaufsdaten wie Datum, Plattform, Preis und die vorhandenen Pflichtangaben. Das Feld `Dokumentierter Grund für den Legacy-Nachtrag` entfällt. Der eng begrenzte historische Verkaufs-RPC erhält automatisch den Text:

`Historische Statuskorrektur: Verkauf nachgetragen.`

Sichtbare Fehlermeldungen und Zielbezeichnungen verwenden `historischer Verkauf` oder `ungeklärter Verkaufsstatus`, niemals `Legacy`. Die internen Typen `LegacySaleReconciliation`, `legacyReconciliation` und die bestehenden RPC-Namen werden in diesem Paket nicht umbenannt, da dies keinen Nutzwert schafft und unnötiges Migrationsrisiko erzeugt.

`legacy_sale_header_without_line` bleibt ein technischer Konflikt ohne Selbstbedienungs-Reparatur. Die Oberfläche zeigt weiterhin sachlich `Korrektur erforderlich`, legt aber keinen zweiten Verkauf an.

## 3. Appweite Cursorsemantik

Die Anwendung definiert das Cursorverhalten zentral und eng begrenzt:

- `pointer` für aktive `button`, `a[href]`, `summary`, aktive `select` und aktionsartige Inputtypen wie Checkbox, Radio, Button, Submit, File und Range;
- `not-allowed` für native `:disabled` sowie `[aria-disabled='true']`;
- kein pauschaler Selektor für `[tabindex]`, alle ARIA-Rollen, alle Labels oder alle Inputs;
- kein `pointer-events: none` für deaktivierte Bedienelemente;
- bestehende Spezialcursor für Textfelder, Drag-and-drop, Größenänderung und laufende Prozesse bleiben erhalten.

Lokale widersprüchliche Cursor-Klassen werden bereinigt, insbesondere in der Shared Checkbox. ARIA-deaktivierte Aktionen bleiben zusätzlich im Handler geschützt, weil ARIA allein keine Interaktion blockiert.

Die zwei funktionslosen Registrierungslinks mit `href="#"` werden nicht durch einen Pointer scheinbar funktionsfähig gemacht. Sie werden abhängig von ihrer tatsächlichen Funktion als echte Links oder als nicht interaktiver Hinweis umgesetzt.

## 4. Barrierefreies Shared Select

Das Dashboard ersetzt sein natives Plattform-`select` erst, nachdem `CustomSelectComponent` mindestens dieselbe Tastatur- und Screenreader-Bedienbarkeit bietet.

Die Komponente erhält:

- einen zugänglichen Namen über ein verpflichtendes `ariaLabel`-Input oder eine echte externe Beschriftung;
- Combobox-Semantik mit `aria-expanded`, `aria-haspopup="listbox"`, `aria-controls` und `aria-activedescendant`;
- eine Listbox mit eindeutiger ID und Optionen mit `role="option"` sowie `aria-selected`;
- einen getrennten hervorgehobenen Optionsindex, der beim Öffnen auf die gewählte Option oder die erste Option zeigt;
- Tastaturbedienung mit Pfeil hoch/runter, Home, End, Enter, Leertaste und Escape;
- Fokusführung zurück auf den Trigger nach Auswahl oder Schließen;
- korrektes deaktiviertes Verhalten ohne Öffnen oder Wertänderung;
- keine Template-Arrow-Funktionen und keine untypisierten Werte.

Im Dashboard werden die Plattformen als `SelectOption<DashboardPlatform>[]` erzeugt. `Alle Plattformen` besitzt den Wert `all`. Doppelte Plattformen werden entfernt, Labels deutsch sortiert und eine nicht mehr vorhandene Auswahl fällt auf `all` zurück.

## 5. Interaktiver Dashboard-Chart mit Chart.js

Die bestehende `RevenueChartComponent` bleibt die einzige öffentliche Chart-Komponente. Ihre Inputs und die barrierefreie Tabelle bleiben fachlich erhalten; nur die visuelle SVG-Implementierung wird durch ein Canvas mit direktem Chart.js-Lifecycle ersetzt.

### Registrierung und Lifecycle

Nur diese Chart.js-Bausteine werden lokal registriert:

- `LineController`
- `LineElement`
- `PointElement`
- `CategoryScale`
- `LinearScale`
- `Tooltip`

Die Komponente erstellt genau eine Chart-Instanz nach dem Rendern, aktualisiert sie bei neuen immutable Daten- oder Optionsreferenzen und zerstört sie über `DestroyRef`. Sie erzeugt keine globale Registrierung in `app.config.ts` und verwendet weder `chart.js/auto` noch unbenötigte Registerables.

### Darstellung und Interaktion

- Tooltip und Hover arbeiten im Indexmodus auf der X-Achse mit `intersect: false`.
- Maus und Touch zeigen für denselben Zeitraum Umsatz, Ausgaben und realisierten Gewinn.
- Ein ausreichend großer `pointHitRadius` erleichtert die Bedienung.
- Dark- und Light-Theme setzen Achsen-, Raster-, Linien-, Punkt- und Tooltipfarben ausdrücklich.
- Datenreihen unterscheiden sich zusätzlich durch Punktform und Strichmuster, nicht nur durch Farbe.
- Bei `prefers-reduced-motion: reduce` werden Animationen deaktiviert.
- Responsive Größenänderungen dürfen keine zweite Chart-Instanz oder Listener-Leaks erzeugen.
- Negative, leere und einpunktige Datenreihen bleiben darstellbar.

### Barrierefreiheit

Das Canvas erhält `role="img"`, einen kurzen zugänglichen Namen und eine Beschreibung, die auf die HTML-Datentabelle verweist. Die Tabelle bleibt außerhalb des Canvas eine echte Tabelle mit Caption und Spaltenüberschriften und enthält bei jedem Signalupdate exakt dieselben Daten und dieselbe Reihenfolge wie der Chart.

Der Canvas-Tooltip ist für assistive Technik nicht die einzige Informationsquelle. Es gibt in diesem Paket keine ausschließlich per Maus erreichbare Aktion.

## 6. Tests und Abnahme

### Artikelnavigation

- gültiger `fromPurchaseId` führt nach Laden und Reload zum tatsächlichen Einkauf;
- fehlender, falscher und nicht zum Artikel gehörender Parameter fällt auf Inventar zurück;
- Direktaufruf und Inventaraufruf bleiben unverändert;
- während des Ladens wird kein ungeprüfter Rücksprung gerendert.

### Historische Statuskorrektur

- kein sichtbares `Legacy`, `Altdaten prüfen` oder manuelles Grundfeld in den betroffenen Flows;
- beide Aktionen bleiben getrennt und rufen nur ihren vorhandenen RPC-Pfad auf;
- beide RPC-Aufrufe erhalten exakt den festgelegten systemseitigen Grund;
- Abbruch der Bestätigung verändert nichts;
- Journal- und Fehlerverhalten der bestehenden Services bleibt erhalten.

### Cursor und Shared Select

- browserbasierte Computed-Style-Prüfung für aktive und deaktivierte Buttons, Links, Selects, Checkboxen und ARIA-disabled;
- Text-, Drag-, Resize- und Busy-Cursor werden nicht überschrieben;
- Shared Select ist vollständig per Tastatur bedienbar und besteht AXE/WCAG-AA;
- Dashboardoptionen sind eindeutig, sortiert und fallen bei ungültiger Auswahl auf `all` zurück.

### Chart

- Unit-Tests prüfen Datenmapping, Optionen, leere/einpunktige/negative Daten, Themewechsel, Reduced Motion und Synchronität der HTML-Tabelle;
- Browser-E2E prüft Maus-Hover, Touch, Responsive Resize, Light/Dark und AXE;
- Produktionsbuild wird vor und nach Installation verglichen; nur benötigte Chart.js-Module dürfen im lazy geladenen Dashboard-Chunk landen;
- vollständige Abnahme: Typecheck, Lint, Unit-Tests, Formatprüfung und Produktionsbuild.

## Nicht Teil dieses Pakets

- Verkaufs-Drilldown aus dem Chart;
- Zoom, Pan, Brush oder frei konfigurierbare Dashboards;
- Umbenennung interner Datenbankzustände und RPCs;
- zusätzliche Datenbank-Constraints für die Einkaufs-Workspace-Zuordnung;
- steuerliche oder rechtliche Produktivfreigabe des Gesamtsystems.
