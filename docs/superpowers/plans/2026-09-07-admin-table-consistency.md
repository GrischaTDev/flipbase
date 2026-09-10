# Umsetzungsplan: Referenztreue Tabellenbedienung und Statusbadges

> **Für die Umsetzung:** `superpowers:executing-plans` verwenden und die Pakete einzeln abarbeiten. Dieser Auftrag erstellt den Plan; er beauftragt noch keine Implementierung, Veröffentlichung oder Änderung der Nummernkreise.

**Ziel:** Tabellenbedienung und Statusanzeigen anhand der aktuellen Shopify-Einkaufsliste vereinheitlichen; die ausdrücklich beanstandeten Einkaufsspalten entfernen.

**Architektur:** Bestehende Angular-Bausteine `TableColumnMenuComponent` und `BadgeComponent` weiterentwickeln. Eine gemeinsame Toolbar kapselt Darstellung, Fokus und Ansichts-/Suchinteraktion; Daten, Filterlogik und Persistenz bleiben in den Features und dem vorhandenen Präferenzservice. Einkauf dient als erste visuell abgenommene Referenz, anschließend folgen die übrigen Verbraucher.

**Technik:** Angular 22, Signals, OnPush, externe HTML-Templates, Tailwind, vorhandenes Lucide, Vitest und Playwright. Keine neue UI-Bibliothek erforderlich.

**Spezifikation:** Nutzerauftrag vom 07.09.2026 mit neun Screenshots; [Gestaltungsrichtlinien](../../design/admin-ui-guidelines.md), [Einkaufsabnahme](../../design/purchase-reference-acceptance.md) und die unten protokollierte heutige Live-Prüfung. Diese neueren Nutzerentscheidungen ersetzen ältere Planstellen, die einen sichtbaren Rücksetztext verlangen.

## Verbindlicher Umfang

- „Alle“ und Suche ohne dauerhafte klassische Eingabebox. Dezenter grauer Hover-/Aktivzustand, eindeutiger Tastaturfokus, gemeinsame aktive Suchfläche wie in den Screenshots.
- Spalten-/Sortiermenü mit kompakter Sortierzeile, Griffen und Sichtbarkeitsicons. Nicht nur die Außenkontur ändern.
- Rücksetzung als statisches Icon mit zwei gegenläufigen Pfeilen, rechts neben den Anzeigeoptionen. Kein dauerhafter Text, kein Lade-Spinner. „Ansicht zurücksetzen“ bleibt Tooltip und zugänglicher Name.
- Rücksetzicon ausschließlich bei abweichender Tabellenkonfiguration: Spaltensichtbarkeit, Reihenfolge oder Sortierung. Suche, Verkäufer und Status allein aktivieren es nicht. Diese Abgrenzung behandelt Sortierung als Teil der Anzeigeoptionen.
- Rücksetzen stellt Standardspalten und Standardsortierung wieder her; Suchtext und fachliche Filter bleiben erhalten. Filter haben eigene Entfernen-/Löschenaktionen.
- `cost_status` und `actions` aus der Einkaufstabelle und deren Spaltenauswahl entfernen. Fachliche Kosteninformationen und Korrekturen bleiben in Details und Kostenabläufen.
- Einkauf bleibt über Zeilenklick und echten Nummernlink erreichbar. Interaktive Zellen dürfen keine zusätzliche Zeilennavigation auslösen.
- Gemeinsamer Statusbadge-Standard in den Verwaltungsbereichen. Gleiche Bedeutung erhält gleiche Darstellung; keinen zweiten konkurrierenden Badge-Baustein einführen.
- Wiederkehrende sichtbare Grundelemente werden ausschließlich über Shared-Komponenten zusammengesetzt. Das gilt insbesondere für Buttons, Badges, Text-/Zahl-/Datumsfelder, Selects, Checkboxen, Suche, Karten, Dialograhmen, Seitenköpfe und Tabellenbedienung. Feature-Komponenten liefern Fachwerte, Labels, Validierung und Ereignisse; sie definieren keine eigene Geometrie oder Farbvariante derselben Komponentenrolle.
- Eine rohe native Eingabe ist nur innerhalb der verantwortlichen Shared-Komponente oder bei einem dokumentierten Sonderfall zulässig, den der vorhandene Komponentenvertrag fachlich oder technisch nicht abbilden kann. Der Sonderfall erhält eine konkrete Begründung und wird nicht durch kopierte Tailwind-Klassen kaschiert.
- Wiederkehrende Kombinationen werden als Shared-Komposition angelegt, sobald sie in mindestens zwei Features dieselbe Bedienrolle erfüllen. Eine nur fachlich passende einmalige Teilmaske bleibt im Feature und setzt sich aus Shared-Grundelementen zusammen.
- Logo-Gelb `#fcc601`, Inter und Lucide erhalten. Normale deutsche Schreibweise, keine dekorativen Versalien. Steuer/DATEV ausschließlich Tabellen und zugehörige Bedienung.
- Generierte Typen und gespeicherte Geschäftsdaten werden für diesen UI-Umbau nicht verändert. Keine Übernahme von Shopify-Transfer-, Versandziel- oder Bestellschreiblogik.

## Belegter Iststand

Geprüft auf `master`, Commit `96c262b`:

| Stelle                                                                         | Tatsächlicher Befund                                                                                                                           | Konsequenz                                                                                                   |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `src/app/features/purchases/purchases.component.html`                          | Native Selects für Status/Verkäufer, `linear-input` an der Suche; Status als fetter Text                                                       | Gemeinsame Toolbar und Badge verwenden                                                                       |
| `src/app/shared/components/table-column-menu/table-column-menu.component.html` | Rücksetztext dauerhaft vorhanden, bei unveränderter Ansicht deaktiviert; vor dem Spaltenknopf                                                  | Bedingt sichtbares Icon rechts; eigener Tooltip                                                              |
| `src/app/features/purchases/purchases.component.ts`                            | `viewModified` umfasst auch Suchtext/Status/Verkäufer; `resetView()` löscht alles                                                              | Tabellenänderung und fachliche Filter entkoppeln                                                             |
| `src/app/core/config/table-defaults.config.ts`                                 | Kostenstatus sichtbar, Aktionen sichtbar/gesperrt, Titel „Einkauf / Referenz“                                                                  | Typunion, Definitionen und Template gemeinsam korrigieren                                                    |
| `src/app/core/services/table-preferences.service.ts`                           | Abgleich gespeicherter Spalten mit Defaults vorhanden; dauerhafte Altbereinigung speziell für `type`                                           | Schemaabweichungen für entfernte Spalten gezielt absichern                                                   |
| `src/app/shared/components/badge/badge.component.ts`                           | Gemeinsamer Baustein existiert; sm 20 px/8 px Radius, `font-semibold`, runder Punkt; feste Farbklassen                                         | Semantische Tokens und Statusmarkierungen zentralisieren                                                     |
| `src/app/shared/components/`                                                   | Bausteine für Button, Badge, Karte, Checkbox, Suche, Select, Datum, Text-/Zahlenfeld, Modalrahmen, Seitenkopf und Tabellensteuerung existieren | Vor Neuanlage Vertrag prüfen und vorhandenen Baustein erweitern                                              |
| Feature-Templates                                                              | Zahlreiche direkte Eingaben und lokal zusammengesetzte farbige Statusflächen trotz vorhandener Shared-Bausteine                                | Verwaltung vollständig inventarisieren, klassifizieren und planmäßig migrieren; Storefront getrennt bewerten |
| `src/app/features/settings/models/numbering.models.ts`                         | Standard `B 2026 01` bzw. `V 2026 01`, konfigurierbares Präfix                                                                                 | Kein bestehendes obligatorisches `#`                                                                         |
| `src/app/features/purchases/utils/purchase-presentation.ts`                    | Referenz ist `record_number`, ersatzweise Titel; Mengenübersicht enthält Bestand/Verkäufe                                                      | Nummernformat und Wareneingangsmenge nicht aus Darstellungsnamen bzw. aktuellem Bestand ableiten             |
| `src/app/core/models/flipbase.models.ts` und `purchase.service.ts`             | `PurchaseLine.ordered_quantity` und `received_quantity`; Liste lädt `purchase_lines` bereits                                                   | Vorschau für bekannte Mengen kann vorhandene Daten nutzen; keine Einzelabfrage pro Zeile erforderlich        |
| `package.json`, `package-lock.json`/Changelog                                  | Keine Shopify-Abhängigkeit in `package.json`; Entfernung ungenutzter Pakete dokumentiert                                                       | Kein Paketwechsel als Voraussetzung; tatsächliche Admin-Darstellung direkt prüfen                            |

## Live-Referenz vom 07.09.2026

Angemeldeter In-App-Browser, Shopify-Route `/store/…/purchase_orders`, heller Modus, Viewport 1477 × 817 CSS-Pixel, `devicePixelRatio = 1`. Browserzoom nicht separat ausgelesen. Geöffnet: Ansichtsmenü „Alle“, Anzeigeoptionen, Lieferungsvorschau und Such-/Filtermodus. Keine Geschäftsdaten oder gespeicherten Ansichten geändert.

Der Browser zeigt ausgelieferten DOM, offene Shadow Roots und berechnetes CSS. Das ist kein Zugriff auf Shopifys vollständigen ursprünglichen Komponentenquellcode. Das Statusbadge wird hier durch `s-internal-badge` gerendert; daraus folgt keine öffentliche installierbare API.

| Referenzelement                      | Heute gemessen / beobachtet                                                                                                                                                      |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Toolbar                              | Höhe 44 px, Padding 8 px                                                                                                                                                         |
| „Alle“-Button, Ruhezustand           | Höhe 24 px, Radius 8 px, Padding `0 2px 0 8px`, transparenter Hintergrund, keine Border/kein Schatten                                                                            |
| Suchfeld, Ruhezustand                | Höhe 28 px, transparenter Hintergrund, keine eigene Border, Padding `4px 28px 4px 4px`                                                                                           |
| Aktiver Suchbereich                  | Gemeinsamer Container einschließlich „Alle“, Höhe 28 px, Radius 8 px, weiß, Outline 2 px `rgb(0, 91, 211)`; Suchinhalt links 8 px Padding                                        |
| Ansichtsmenü                         | „Alle“, „Entwurf“, „Bestellt“, „Archived“; aktive Auswahl markiert. Fremden englischen Text nicht übernehmen                                                                     |
| Anzeigeoptionen                      | Kompakte Sortierzeile, anschließend Spalten mit Griffen und Auge; Sortiertrigger 24 px hoch, 8 px Radius, 13 px Schrift, Gewicht 450                                             |
| „Bestellt“-Badge, offene Shadow Root | 20 px hoch, Radius 8 px, Padding `2px 8px 2px 4px`, Gap 2 px; Schrift 12 px/16 px, Gewicht 550; Text `rgb(97, 97, 97)`, Hintergrund `rgba(0, 0, 0, 0.06)`; Iconfläche 16 × 16 px |
| Erhalten                             | `0 von 2` öffnet Lieferungsvorschau mit Status, Artikel und dessen Menge; keine Inline-Erfassung in der beobachteten Vorschau                                                    |
| Rücksetzung                          | Im ruhenden Screenshot unsichtbar, im DOM als deaktivierter Button vorhanden. Nutzer-Screenshot belegt sichtbares Icon und Tooltip im geänderten Zustand                         |

**Grenzen:** Hoverfarbe nicht frisch numerisch gemessen; der Nutzer-Screenshot und die explizite Beschreibung belegen den grauen Zustand. Rücksetzverhalten nach einer tatsächlichen Konfigurationsänderung wurde nicht durch Änderung der fremden Ansicht getestet. Vollständige Menügeometrie, Fokus-/Touchmatrix, weitere Badgetöne, Dark Mode und Reduced Motion sind vor Implementierungsabnahme gezielt zu prüfen. Ältere pauschale „Toolbarbutton 28 px“-Werte ersetzen nicht den hier tatsächlich 24 px hohen Ansichtsbutton.

## Produktentscheidungen

| Thema                    | Empfehlung                                                                                                                                              | Alternative / Auswirkung                                                                                                                                                                                            |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Einkauf oder Bestellung? | **Entschieden am 07.09.2026:** Spaltenüberschrift „Einkauf“; Navigation und übrige Fachsprache bleiben bei „Einkäufe“                                   | Keine Umbenennung zu „Bestellung“                                                                                                                                                                                   |
| Erhalten-Vorschau?       | Ja für bekannte Positionsmengen, zunächst lesend, mit Link zur bestehenden Erfassung. Unbekannter Inhalt zeigt „Inhalt offen“                           | Ohne Vorschau bleibt die Tabelle einfacher; Wareneingang und Artikel sind nur in den Details. Nicht allein wegen optischer Ähnlichkeit ein Transfersystem ergänzen                                                  |
| `#` vor der Nummer?      | Bestandteil des konfigurierten Präfixes, z. B. `#B` statt `B`; Vorschau zeigt die vollständige Nummer. Keine zusätzliche automatische Raute im Template | Eine reine Anzeige-Raute erzeugt Unterschiede zwischen gespeicherter Nummer, Kopieren und Export. Ein obligatorisches `#` wäre eine neue Produktregel. Bestehende Nummern unter beiden Varianten unverändert lassen |

Die Entscheidungen zu „Erhalten“ und `#` stehen noch aus. Pakete 1–4 können anhand der festen Anforderungen ausgearbeitet werden. Paket 3 setzt die bestätigte Fachbezeichnung „Einkauf“ um; Pakete 5–6 folgen erst nach der jeweiligen Entscheidung.

## Paket 0: Shared-Komponenten als verbindliche UI-Grenze

**Dateien:** Bestehende Verträge unter `src/app/shared/components/`; neu `scripts/check-admin-shared-ui.mjs` und `scripts/check-admin-shared-ui.test.mjs`; `package.json`; betroffene Feature-Templates. Die Bestandsmatrix wird direkt in diesem Plan unter „Shared-Komponenten-Katalog“ fortgeschrieben, keine zusätzliche lose Auditdatei anlegen.

### Shared-Komponenten-Katalog

| Bedienrolle                       | Verbindlicher Baustein                                                                                         | Feature darf liefern                                      | Feature darf nicht duplizieren                                     |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------ |
| Aktionen und Iconaktionen         | `shared/components/button`                                                                                     | Text, Icon, Disabled/Loading, Ereignis oder Routerziel    | Höhe, Padding, Radius, Schatten, Farbzustände                      |
| Status und kompakte Kennzeichnung | `shared/components/badge`                                                                                      | semantischen Tone/Status, Text, definiertes Symbol        | lokale farbige Pills, Statuspunkt, Schriftgewicht, Radius          |
| Text-, Such- und Zahleingabe      | `text-field`, `custom-search-input`, `number-input`                                                            | Form-Control, Label, Hilfe, Fehler, Präfix/Suffix         | `linear-input`, eigener Feldrahmen, Fokusfarbe, Fehlerlayout       |
| Auswahleingabe                    | `custom-select`                                                                                                | Optionen, Wert, Label, Suche laut Vertrag                 | native Selectbox im Feature, eigenes Listbox-/Popover-Verhalten    |
| Datum und Checkbox                | `date-picker`, `custom-checkbox`                                                                               | Wert, Grenzen, Label, Validierung                         | eigene Datumsauswahl bzw. Checkboxgeometrie                        |
| Inhaltsfläche                     | `card`                                                                                                         | Inhalt und belegte Variante                               | eigener wiederkehrender Radius, Rand oder Schatten                 |
| Dialog                            | `modal-shell`; `confirm-dialog` für Bestätigungen                                                              | Titel, Inhalt, Aktionen, erlaubte Größe                   | Overlay, Fokusfalle, Escape, Dialogradius                          |
| Seitenrahmen                      | `page-header`, `entry-page-layout`, `two-column-layout`                                                        | Titel, Untertitel, Aktionen, Fachkarten                   | eigene wiederkehrende Außenbreite und Abstände                     |
| Tabelle                           | `table-toolbar`, `table-column-menu`, `table-sort-header`; Tabellencontainer als festzulegender Shared-Vertrag | Spalten, Ansichten, Filterdaten, Sortierung, Zeileninhalt | Toolbargeometrie, Anzeigeoptionen, Sortierinteraktion, Rücksetzung |
| Kostenanzeige                     | `cost-state`                                                                                                   | bekannten oder offenen Kostenwert                         | eigene Null-/Offen-/Währungsdarstellung                            |
| Chronik und Toast                 | `record-history`, `toast`                                                                                      | Ereignisse bzw. Meldung                                   | eigene wiederkehrende Chronik- oder Toast-Hülle                    |

- [ ] Alle Admin-Templates mit `rg` inventarisieren: direkte Eingabeelemente, `linear-input`/`linear-btn-*`, lokal gebaute Status-Pills, Dialoghüllen, Karten sowie Such-/Tabellenleisten. Pro Fundstelle Bedienrolle, vorhandene Shared-Entsprechung, echte Vertragslücke oder begründeter Sonderfall festhalten.
- [ ] Storefront (`features/store`) und besondere Medieneingaben getrennt markieren. Der Admin-Designvertrag darf nicht blind auf kundenseitige Shopgestaltung oder versteckte native Datei-/Radioeingaben angewendet werden; Wiederholungen werden auch dort innerhalb ihres eigenen Kontexts gemeinsam gelöst.
- [ ] Vor Paket 1 die benötigten Verträge ergänzen statt Parallelkomponenten anzulegen. Insbesondere entscheiden, ob `custom-search-input` in `table-toolbar` eingebettet oder durch einen einheitlichen Suchfeld-Grundbaustein erweitert wird; keine zweite unabhängige Suchinput-Implementierung.
- [ ] `custom-select`, `text-field`, `number-input`, `date-picker`, `custom-checkbox`, `button`, `badge`, `card` und `modal-shell` jeweils auf zugänglichen Namen, Form-Control-Anbindung, Fehlerzustand, Disabled, Hell/Dunkel und Größenvarianten prüfen. Fehlende wiederkehrende Anforderungen am Shared-Vertrag ergänzen.
- [ ] Feature-spezifische Kompositionen aus diesen Grundelementen bauen. Fachzustand, Datenzugriff und komplexe Domänenabläufe bleiben im Feature; visuelles Grundverhalten bleibt Shared.
- [ ] Architekturprüfung `check-admin-shared-ui.mjs` ergänzen. Sie durchsucht Admin-Feature-HTML und meldet neue direkte `<select>` sowie neue lokal gebaute Status-Pills oder duplizierte globale `linear-*`-Kontrollen. Notwendige native Inputs erhalten eine kleine pfad- und begründungsgebundene Allowlist; keine pauschalen Verzeichnisausnahmen.
- [ ] Architekturtest beweist einen verbotenen und einen erlaubten Fixture-Fall. Script in `test:workflow` oder `test:audit` einhängen, damit neue Abweichungen im PR auffallen.
- [ ] Bestehende Fundstellen nicht mit einer riesigen globalen Ausnahme dauerhaft legitimieren. Die Prüfung bekommt einen gezählten Ausgangsbestand je Regel, der mit jeder Migration sinkt und bei neuen Treffern fehlschlägt. Abschlussziel für die betroffenen Admin-Komponenten ist null unbegründete Treffer.
- [ ] Bei jeder Migration Verhaltenstests auf den Shared-Baustein konzentrieren. Featuretests prüfen Bindung und Fachverhalten, nicht erneut sämtliche Hover-/Fokusklassen derselben Grundkomponente.

**Abnahme:** Für jede wiederkehrende Bedienrolle existiert genau ein benannter Shared-Vertrag. Der Einkauf enthält keine lokale Kopie von Toolbar, Badge, Button, Select, Such- oder Feldgeometrie. Die automatische Prüfung verhindert mindestens neue native Admin-Selects und lokale Status-Pills; der dokumentierte Altbestand ist gesunken.

## Paket 1: Gemeinsame Toolbar mit referenztreuen Zuständen

**Dateien:** Neu `src/app/shared/components/table-toolbar/table-toolbar.component.ts`, `.html`, `.angular.spec.ts`. Ändern `src/app/features/purchases/purchases.component.ts`, `.html` und `.angular.spec.ts`; Farben bei Bedarf in `src/styles.css` ergänzen. Keine Datenabfragen im Shared-Baustein. Paket 0 entscheidet vorher verbindlich, wie der bestehende `custom-search-input`-Vertrag verwendet oder erweitert wird.

**Geplanter Komponentenvertrag:**

```ts
export interface TableViewOption {
  readonly id: string;
  readonly label: string;
}

readonly views = input.required<readonly TableViewOption[]>();
readonly activeView = model.required<string>();
readonly query = model('');
readonly searchLabel = input.required<string>();
```

Die vorhandenen `statusOptions` werden im Einkauf auf `id`/`label` abgebildet. Slots `[table-filters]` und `[table-actions]` nehmen Verkäuferfilter bzw. Anzeigeoptionen auf. Bestehende fachliche Statuswerte bleiben erhalten; Shopifys drei sichtbare Ansichten begrenzen nicht Flipbases Statusmodell.

- [ ] Komponententest anlegen: „Alle“ öffnet ein Menü mit markierter Auswahl; Auswahl emittiert den neuen Wert; Escape schließt und gibt Fokus zurück. Suchtextänderung verändert keine Ansichtsauswahl.
- [ ] Vorlage mit echtem Button für Ansichten und zugänglich beschriftetem Suchinput erstellen. Beide liegen in derselben ruhenden Fläche und aktiven Fokusgruppe; keine `linear-input`-Klasse, die den dauerhaften Rahmen zurückbringt.
- [ ] Ansichtsmenü als Auswahl mit passender Menü-/Radio-Semantik umsetzen: Pfeiltasten, Home/End, Enter/Space, Escape, Klick außerhalb. Keine ausschließlich mausbedienbare Eigenbau-Selectbox.
- [ ] Verkäufer in den Such-/Filterbereich integrieren: bei Aktivierung erscheint die Filterauswahl, Verkäufer wird über stabile ID ausgewählt und als entfernbarer Filter angezeigt. Gleichnamige Verkäufer unterscheidbar halten. Keine zweite dauerhafte native Selectbox rechts.
- [ ] Toolbar bei leerer Liste, null Treffern und aktivem Filter erhalten. „Suche und Filter löschen“ bleibt eine separate fachliche Aktion.
- [ ] Einkauf integrieren und Desktopzustände Ruhe, Fokus, Menü offen und gefiltert bei gleicher Fenstergröße gegen Referenz vergleichen. Mobile Touchbedienung und schmale Menüplatzierung prüfen.

**Prüfung:** `npm run test:angular -- src/app/shared/components/table-toolbar/table-toolbar.component.angular.spec.ts src/app/features/purchases/purchases.component.angular.spec.ts`. Anschließend `npm run build`, da Klassenprüfungen keine Templatefehler beweisen.

## Paket 2: Anzeigeoptionen und bedingtes Rücksetzicon

**Dateien:** `src/app/shared/components/table-column-menu/table-column-menu.component.ts`, `.html`, `.scss`, `.angular.spec.ts`; `src/app/core/models/table-preferences.models.ts`; Einkaufskomponente; `e2e/table-sorting.spec.ts`.

**Vertrag:** `columns`, `currentSort`, `viewModified`, `viewResetRequested` können erhalten bleiben. Der Aufrufer liefert ausschließlich die Abweichung der Tabellenkonfiguration:

```ts
readonly viewModified = computed(() =>
  tableStateDiffersFromDefaults(this.tablePrefs(), this.purchasesTableConfig),
);

resetView(): void {
  this.resetTablePreferences();
}
```

- [ ] Tests vor Änderung präzisieren: Standardzustand hat keinen sichtbaren oder fokussierbaren Rücksetzbutton; Suche/Status/Verkäufer allein erzeugen ihn nicht; Sichtbarkeit, Reihenfolge und Sortierung jeweils schon.
- [ ] Icon rechts neben Anzeigeoptionen mit `@if (viewModified())` rendern; zwei gegenläufige Pfeile aus der tatsächlich installierten Lucide-API auswählen. Tooltip und `aria-label="Ansicht zurücksetzen"`, SVG dekorativ, keine Rotation.
- [ ] Rücksetzung erhält fachliche Filter und persistiert Standardspalten/-sortierung. Nach Rücksetzung verschwindet der Button; Fokus geht auf Anzeigeoptionen statt auf das entfernte Element.
- [ ] Menü anhand Referenz angleichen: Griff links, Beschriftung, Auge rechts, kompakte Sortierzeile oben. Die zusätzliche sichtbare „Standard“-Aktion nicht als zweite konkurrierende Rücksetzung behalten.
- [ ] Geschlossene Anzeigeoptionen ohne dauerhaften kräftigen Rahmen/Schatten; Hover, offen und Focus-visible getrennt. Popover bleibt an Fensterrändern erreichbar und wird nicht vom Tabellen-Scrollcontainer abgeschnitten.
- [ ] E2E-Test auf Icon-Sichtbarkeit, zugänglichen Namen und tatsächliche Rücksetzwirkung umstellen. Nicht nur den alten Text gegen einen neuen Selektor austauschen.

**Prüffälle:** Neu laden nach Spaltenänderung; Änderungen manuell rückgängig machen; Arbeitsbereich wechseln; alle optionalen Spalten ausblenden; Sortierung zurückstellen; Escape aus Untermenü. Keine nutzerübergreifende Vermischung.

## Paket 3: Einkaufsspalten bereinigen und Navigation absichern

**Dateien:** `src/app/core/config/table-defaults.config.ts`, `src/app/core/services/table-preferences.service.ts`, `table-preferences.service.angular.spec.ts`; `src/app/features/purchases/purchases.component.ts`, `.html`, `.angular.spec.ts`; `e2e/purchase-entry.spec.ts`.

- [ ] `cost_status` und `actions` aus `PurchasesColumnId`, `PURCHASES_TABLE_CONFIG` und beiden Template-Switches entfernen. Nur danach ungenutzte Imports entfernen.
- [ ] „Einkauf / Referenz“ in Spaltendefinition und Tabellenkopf auf „Einkauf“ verkürzen. Externe Verkäuferreferenz bleibt Suchkriterium und Detailinformation.
- [ ] Präferenztest mit alter Konfiguration einschließlich `type`, `cost_status`, `actions` schreiben: entfernte IDs erscheinen auch nach Reload nicht; zulässige persönliche Reihenfolge/Sichtbarkeit bleibt erhalten; wiederholtes Laden ist stabil.
- [ ] Vorhandenen Schemaabgleich gezielt erweitern, sodass obsolete Einkaufs-IDs dauerhaft bereinigt werden. Nicht pauschal sämtliche persönlichen Ansichten löschen.
- [ ] Nummernlink bleibt echter Routerlink für Tab/Enter, Kontextmenü und Öffnen in neuem Tab. Zeilenklick ignoriert Links, Buttons, Eingaben und Textauswahl; keine pauschale `role="button"` auf Tabellenzeilen.
- [ ] Testen: Kostenstatus/Aktionen fehlen im Kopf, in Zellen und Spaltenmenü; Zeilenklick öffnet genau einen Einkauf; Kostenhinweise in Details bleiben erreichbar.

**Abnahme:** Bestehende Details, Kostenverteilung, Export und Bestandsberechnung verhalten sich unverändert. Noch keine zusätzliche Erhalten-Spalte ohne Entscheidung zu Paket 5.

## Paket 4: Gemeinsamer Badge-Standard und Übertragung

**Dateien:** `src/app/shared/components/badge/badge.component.ts`, `.html`, `.scss`; neu bzw. erweitern `badge.component.angular.spec.ts`; `src/styles.css`; Einkaufs-Präsentationsmodelle und `utils/purchase-presentation.ts` samt `.spec.ts`.

**Aufrufer:** Einkaufsliste/-details, Verkaufsliste, Inventarliste/-details und `components/stock-position-list`, Katalog, Accounting-Tabelle, `platform-admin/pages/beta-applications`. Vor Änderungen zusätzlich `rg -n 'app-badge|rounded-full|badge' src/app/features -g '*.html'` auf handgebaute Statusanzeigen auswerten. Dekorative Zähler/Tags sind nicht automatisch Statusanzeigen.

- [ ] Gemeinsame Badge-Geometrie anhand heutiger Messung festlegen. `sm` erhält 20 px Höhe, 8 px Radius, 12/16 px Typografie, Gewicht 550. Mit Statussymbol gelten 4 px links, 8 px rechts und 2 px Gap; Varianten ohne Symbol separat messen.
- [ ] Bestehende `tone`-API erhalten; Farben als semantische Theme-Tokens definieren. Weitere Statusfarben und Symbole live messen, bevor sie als Shopify-original bezeichnet werden. Dunkle Varianten mit Kontrastprüfung festlegen.
- [ ] Quadratische/umrandete Statusmarkierung als explizite Variante ergänzen; bestehenden runden `dot` nicht global bedeutungsändernd umdeuten. Keine Pulse-Animation für statische Einkaufsstatus.
- [ ] Fachliches Mapping zentral in der Einkaufspräsentation: `Bestellt` neutral/quadratisch, andere Zustände anhand geprüfter Bedeutung und Referenz. Kein mehrfach kopierter ternärer Farbbaum in Listen und Details.
- [ ] Einkauf verwendet `app-badge` statt des aktuell bloßen fetten Statustextes. Übrige Statusverbraucher auf denselben Vertrag übertragen; spezielle Großschreibung, Monospace und lokale Farbklassen auf Statusbadges entfernen.
- [ ] Bestehendes `icon()!` in der Badge-Vorlage beim Bearbeiten durch `@if (icon(); as badgeIcon)` absichern. Keine neue Non-null Assertion.
- [ ] Variantenvergleich erstellen und Hell/Dunkel visuell sowie auf Textkontrast prüfen. Test deckt Tone/Symbol/Text und identisches Mapping in Liste/Detail ab, nicht nur Klassenstrings.

**Übertragung der Toolbar:** Nach Abnahme von Einkauf dieselbe Toolbar in Verkauf, Inventar, Katalog, Accounting-Tabelle und Beta-Bewerbungstabelle integrieren, soweit dort dieselbe Tabellenbedienung vorhanden ist. Exakte Zielpaare sind `sales/sales.component`, `inventory/inventory.component`, `catalog/catalog.component`, `accounting/accounting.component`, `platform-admin/pages/beta-applications/beta-applications.component` unter `src/app/features/`. Je Feature vorhandene Suche, Filter, Auswahl und Aktionen erhalten; fachliche Optionslisten kommen vom Aufrufer. Keine fremden Spalten wegen der Einkaufsvorgabe entfernen. Verbraucher ohne Toolbar benötigen keinen künstlichen Ansichtsumschalter. Nach der Übertragung bleiben Form, Hover, Fokus und Abstände ausschließlich im Shared-Template; die Features besitzen keine kopierten Toolbar-Klassen.

## Paket 5, nach Entscheidung: Erhalten-Vorschau

**Dateien:** Einkaufs-Präsentationsmodelle, `utils/purchase-presentation.ts` und Tests; Einkaufstemplate/-tests; Tabellenkonfiguration. Neu `src/app/features/purchases/components/purchase-receipt-preview/purchase-receipt-preview.component.ts`, `.html`, `.angular.spec.ts`.

**Datenregel:** Erhalten ist die bestätigte Eingangsmenge, nicht der aktuelle verfügbare Bestand und nicht die Zahl ausgefüllter Artikelbeschreibungen. Verkauf verringert diese Eingangsmenge nicht. Bestehende Lade-/Fehlerzustände bleiben erkennbar.

```ts
export type PurchaseReceiptSummary =
  | { readonly kind: 'known'; readonly received: number; readonly ordered: number }
  | { readonly kind: 'unknown-content' }
  | { readonly kind: 'unavailable' };
```

- [ ] Reine Ableitung aus vollständig vorliegenden `purchase_lines`: Summen der `received_quantity` und `ordered_quantity`. Bei unbekanntem, noch nicht abgeschlossenem Inhalt niemals erfasste Teilmenge als Gesamtumfang ausgeben.
- [ ] Beispiele absichern: zwei Stück/kein Eingang → `0 von 2`; Teilzugang → `1 von 2`; kompletter Zugang mit späterem Verkauf → weiter `2 von 2`; Mystery-Inhalt offen → „Inhalt offen“; historische Zeile ohne belastbare Mengen → „Nicht verfügbar“ statt `0 von 0`.
- [ ] Mengenbutton öffnet kleines nichtmodales Popover mit Positionsbezeichnung, bestätigter/erwarteter Menge und Link zur bestehenden Detail-/Erfassungsseite. Kein neues Inline-Buchungsformular und keine erfundene Transfernummer.
- [ ] Vorschau erhält vorhandene Daten als Inputs, startet keine Abfrage pro Tabellenzeile und verhindert übergreifenden Zeilenklick. Fokus, Escape, Touch, lange Artikelnamen und viele Positionen prüfen.
- [ ] Fachliche Grenzen historischer Eingänge oder Korrekturen gegen bestehende Serviceverträge klären. Falls Mengen nicht belastbar vorliegen, bleibt die Vorschau für diesen Fall als nicht verfügbar gekennzeichnet; keine Datenbankwerte aus Bestandszahlen rekonstruieren.

## Paket 6, nach Entscheidung: Nummerndarstellung

**Dateien bei gewähltem konfigurierbarem Präfix:** `src/app/features/settings/models/numbering.models.ts` und `.spec.ts`, `pages/numbering-settings/numbering-settings.component.html` und `.angular.spec.ts`. Referenzdarstellung in Einkauf/Verkauf unverändert aus der gespeicherten Nummer lesen.

- [ ] Einstellungen erklären: Präfix kann `#` enthalten, z. B. `#B`. Vorschau zeigt exakt `#B 2026 01`, wenn Präfix `#B`, Trenner Leerzeichen, Jahr aktiv und Mindeststellen 2 sind.
- [ ] Keine zusätzliche Raute bei der Ausgabe, keine Doppelung bei bereits konfiguriertem `#`, keine Änderungen historischer Nummern. Suche mit vollständiger gespeicherter Nummer testen.
- [ ] Wird ein neues Standardpräfix gewünscht, dessen serverseitige Quelle gesondert prüfen und planen; nur den lokalen Vorschau-Default zu ändern wäre inkonsistent. Kein Nummernkreis wird im Rahmen dieses Planungsauftrags umgestellt.

## Abschluss und Prüfreihenfolge

- [ ] Nach jedem Paket gezielte Tests und bei Templateänderungen Build. Geänderte Dateien mit dem vorhandenen Prettier formatieren und gezielt linten.
- [ ] Architekturprüfung für gemeinsame Admin-Grundelemente ausführen und den Ausgangsbestand unbegründeter lokaler Nachbauten nach jeder Migration aktualisieren. Neue Treffer sind ein Fehler.
- [ ] `npm run test:e2e -- e2e/table-sorting.spec.ts e2e/purchase-entry.spec.ts e2e/layout-overlays.spec.ts` mit der dokumentierten lokalen Testumgebung ausführen; neue Badge-/Toolbar-Fälle in `e2e/admin-table-consistency.spec.ts` ergänzen.
- [ ] Visuelle Gegenüberstellung bei 1477 × 817: Ruhe, Hover, Fokus, geöffnete Ansicht, Anzeigeoptionen, geänderte Konfiguration, Rücksetzung, Statusvarianten; danach 390 px, 200 % Zoom, Hell/Dunkel, Reduced Motion und Tastatur/Touch.
- [ ] AXE WCAG A/AA plus manuelle Prüfung von Fokus, Kontrast, Icon-Tooltip, Escape und Zeilennavigation. Screenshot mit Fokus auf unsichtbar gewordenem Rücksetzknopf ist kein bestandener Zustand.
- [ ] Änderungen verschiedener Features zusammen mit `npm run verify` prüfen, wenn die breite Integration abgeschlossen ist. Keine SQL-Prüfung erforderlich, solange dieser Auftrag bei Frontend und Dokumentation bleibt.
- [ ] Alte Dokumentation mit sichtbarem Rücksetztext als überholt markieren; Plancheckboxen und Changelog auf tatsächlichen Abschluss bringen. Grüne Tests ersetzen nicht den visuellen Nachweis.

**Abschlusskriterium:** Die festgelegten Tabellenzustände entsprechen der gemessenen Referenz, die vereinbarten Einkaufsspalten sind entfernt, persönliche Ansichten bleiben stabil und Statusanzeigen nutzen den gemeinsamen Vertrag. Wiederkehrende Admin-Grundelemente besitzen jeweils genau eine Shared-Komponente; betroffene Features setzen sie nur zusammen und die Architekturprüfung verhindert neue lokale Duplikate. Nicht freigegebene Optionen sind ausdrücklich ausgenommen. Keine pauschale Aussage „überall 1:1“, solange Zustände oder Verbraucher ungeprüft sind.
