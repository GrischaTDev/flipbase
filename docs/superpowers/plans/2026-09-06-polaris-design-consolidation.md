# Flipbase Design Consolidation Implementation Plan

> **Für die spätere Ausführung:** `superpowers:executing-plans` verwenden und die Pakete einzeln umsetzen. Diese Sitzung liefert ausschließlich Recherche und Planung.

**Ziel:** Das sichtbare Shopify-Admin-Design möglichst 1:1 mit eigenen Angular-Komponenten treffen, bei erhaltenem Flipbase-Logo und hellem Logo-Gelb. Verlässliche Tabellenzustände und einheitliche Bedienung gehören dazu.

**Erweiterter Auftrag:** Umfangreiche Verkaufs-, Artikel- und Einkaufserfassung auf zentrierten Seiten mit nebeneinander angeordneten Cards gestalten. Dauerhafte interne Erklärbalken entfernen. Die fachliche Neugestaltung von Einkäufen mit Gesamtbetrag und späterer Artikelerfassung erfolgt erst nach dieser Designphase im [separaten Folgeplan](2026-09-06-purchase-workflow-redesign.md).

## Vereinbarte Umsetzung in zwei Phasen

**Phase A – Gestaltung und Arbeitsfluss:** Pakete 0–3 schaffen die Grundlage. Danach Paket 4 für den Tabellenrahmen und Paket 5 zunächst ausschließlich für die Verkaufsübersicht; unmittelbar anschließend Paket 5a für die Verkaufs-Erfassungsseite. Diese Kombination ist der erste vollständige Referenzablauf. Nach visueller Abnahme folgen Artikel und die bereits existierende Einkaufs-Erfassungsseite aus Paket 5a, die übrigen Tabellen aus Paket 5, Paket 6 und Paket 7. Bei jeder Übertragung nur die noch benötigten Referenzzustände nachmessen; keine erneute Vollrecherche als Voraussetzung.

**Phase B – Einkaufsprozess:** Erst danach Lieferant, Gesamtbetrag, später ergänzte Artikel und nachvollziehbare Kostenverteilung gemeinsam modellieren. Ein technischer Einkaufstyp wird nicht während Phase A aus Datenmodell oder Erfassungslogik entfernt. Die sichtbare Spalte „Typ“ ist ein Kandidat für die spätere Ablösung, keine bereits beschlossene neue Statuslogik.

**Bereits vorhandener Stand:** `purchases/new` und `PurchaseEntryFormComponent` existieren; hier wird keine zweite Einkaufs-Erfassungsseite gebaut. Verkauf und Inventarartikel werden aktuell über `sale-create-modal` beziehungsweise `item-create-modal` erfasst. Diese Komponenten enthalten mehr als Darstellung und müssen mit ihren bestehenden Fachfunktionen migriert werden.

**Architektur:** Kleine, wiederverwendbare Angular-Bausteine für Darstellung und Interaktion; Feature-Komponenten liefern fachliche Zeilen und Aktionen. Theme-Werte zentral, Layout mit Tailwind im HTML. Bestehende Funktionen und Typen wiederverwenden.

**Techstack:** Bestehendes Angular 22, Tailwind CSS 4, Lucide, Supabase. Kein Frameworkwechsel und kein Major-Update als Teil der Gestaltung.

**Spezifikation:** [Bestandsaufnahme und Zielbild](../specs/2026-09-06-polaris-design-audit.md). Dort stehen Belege, offene Referenzprüfung, Lizenzentscheidung, Gestaltungswerte und vollständiger Bereichsumfang. Ergänzend verbindlich: [angemeldete Live-Referenz](../../design/shopify-admin-live-reference.md) mit geprüften Seiten, Radien, Dichte, Schatten, Bewegung und konkreten Planänderungen. Bereits belegte Werte nicht erneut schätzen; ausstehende Zustandsprüfungen gezielt ergänzen.

## Umsetzungsstand vom 6. September 2026

Die gestalterische Phase A ist auf `codex/polaris-design-audit` umgesetzt: gemeinsame Maße und Bewegung, Tabellenkorrekturen, verständliche Sortierrichtungen, Verkauf-/Artikel-/Einkaufs-Erfassungsseiten, Rücksprungkontext, Verlassensschutz, mobile Prüfung und AXE-Abnahme. Die bestehenden `linear-table`-Verbraucher sowie die übrigen Berichtstabellen verwenden den gemeinsamen visuellen Standard. Die nicht verwendeten Shopify-Pakete sind entfernt.

Der fachliche Einkaufsprozess aus Phase B bleibt bewusst offen. Insbesondere Einkaufstyp, Lieferant als erstes Feld, Gesamtbetrag ohne fertige Positionen und die spätere Kostenverteilung werden erst nach den im Folgeplan aufgeführten Entscheidungen verändert.

## Verbindliche Grenzen

- [Designrichtlinien](../../design/admin-ui-guidelines.md) vor Änderungen lesen. Sie enthalten Farbnachweis, Quellenübertragung und Messvertrag. Exakte Radien und Motion erst nach Admin-Messung festlegen.
- Steuer & DATEV vorerst ausschließlich Tabelle; Gesamtlayout, Kennzahlen, Exportabläufe und Steuerberaterdialoge zurückstellen.

- Auf aktualisiertem Master in eigenem Branch arbeiten; Claudes Branch wird nicht übernommen oder verändert. Neue Administrationsdateien erst nach seinem Merge integrieren.
- Deutsche UI und Kommentare, englische Bezeichner. Separate HTML-Dateien, OnPush, Signals und native Angular-Kontrollsyntax.
- Tailwind direkt in Templates; keine weiteren komponentenbezogenen SCSS-Dateien ohne konkrete Notwendigkeit. Globale Theme-/Motion-Variablen sind weiterhin zulässig.
- Keine Datenabfragen in Shared-Komponenten. Keine Veränderungen an gebuchten Daten durch den Designumbau.
- Vor Installation neuer Abhängigkeiten aktuelle stabile Version und offizielle Angular-Kompatibilität prüfen. Der bevorzugte Weg benötigt zunächst keine neue UI-Bibliothek.
- Dokumentation je Sitzung in `docs/AI-CHANGELOG.md`; gezielte Prüfungen vor Push; Veröffentlichung über grünen PR mit Merge-Commit.

## Reihenfolge und überprüfbare Ergebnisse

### Paket 0: Referenz und Basis verbindlich festlegen

Dateien: vorhandene Spezifikation aktualisieren; neue `docs/design/admin-ui-guidelines.md` für den dauerhaften Komponentenstandard.

- [x] Angemeldeten Admin lesend über die protokollierten Seiten und Komponentenfamilien untersuchen; Geometrie, Schatten und CSS-Übergänge in `docs/design/shopify-admin-live-reference.md` festhalten.
- [ ] Verbleibende Zustände aus dem Live-Protokoll ergänzen: vollständiger Hover-/Pressed-/Fokusvergleich, Mobile/Zoom, Reduced Motion und Exit-Verhalten. Nicht geprüfte Zustände nicht durch Annahmen ersetzen.
- [ ] Die empfohlenen Flipbase-Gestaltungswerte in einem Referenzblatt festhalten: Schrift, Abstände, Flächen, Marke, Statusfarben, Fokus, Dichte, Bewegung.
- [ ] Desktop-/Mobilzustände für Inventar als Referenz definieren; Datenwarnungen und Detailinformationen ausdrücklich zuordnen.
- [ ] Erstes sichtbares Zwischenziel liefern: Verkaufsübersicht plus zentrierte Verkaufs-Erfassungsseite. Inventar dient zusätzlich als Referenz für bildhaltige Tabellen; Einkäufe für kompakte Textzeilen. Vor dem flächigen Rollout Standardansicht, geöffnetes Spaltenmenü, Auswahl und leere Suche zeigen.

Abnahme: Es ist klar, welche Maße gemessen, welche aus der Dokumentation abgeleitet und welche eigene Flipbase-Entscheidungen sind. Flipbase-Marke und dokumentierte Ausnahmen bleiben erhalten; die Lizenzfrage wird nicht durch ein Icon-Update verdeckt.

### Paket 1: Nachgewiesene Bedienfehler korrigieren

Ändern: `src/app/features/purchases/purchases.component.html`, `src/app/features/purchases/purchases.component.angular.spec.ts`, `src/app/features/accounting/accounting.component.html` und `e2e/purchase-entry.spec.ts`.

- [ ] Einkaufstoolbar aus der Datenlängen-Bedingung lösen. Datenzustände innerhalb des Ergebnisbereichs rendern.
- [ ] Den dauerhaften Balken „Gebuchte Verkäufe bleiben unverändert erhalten …“ aus `src/app/features/sales/sales.component.html` entfernen. Regeln für gebuchte Verkäufe und Retouren bleiben technisch bestehen. Notwendige Entscheidungshilfen direkt bei der betreffenden Aktion zeigen; keine internen Implementierungshinweise als Ersatzbanner hinzufügen.
- [ ] Bei null Suchtreffern „Keine passenden Einkäufe“ und „Filter zurücksetzen“ anzeigen; bei tatsächlich leerem Datenbestand Erfassung anbieten; Lade-/Fehlerstatus getrennt anzeigen.
- [ ] „Plattform“ im Steuerjournal zu „Besteuerungsart“ korrigieren, passend zum bereits gerenderten `tax_mode`.
- [ ] Folgenden Nutzerablauf als Regression ergänzen und zuerst gegen den bisherigen Stand scheitern lassen:

```ts
await startDemoMode(page);
await page.getByRole('link', { name: 'Einkäufe', exact: true }).click();
await page.getByRole('searchbox', { name: 'Einkäufe durchsuchen' }).fill('zzznichtvorhanden');
await expect(page.getByRole('searchbox', { name: 'Einkäufe durchsuchen' })).toBeVisible();
await expect(page.getByText('Keine passenden Einkäufe', { exact: true })).toBeVisible();
await page.getByRole('button', { name: 'Filter zurücksetzen', exact: true }).click();
await expect(page.locator('[data-purchase-table-row]').first()).toBeVisible();
```

Abnahme: Nulltreffer und leere Kategorien sind ohne Navigation oder Neuladen korrigierbar; bestehende Datensätze bleiben unverändert. Gezielte Angular-/Browserprüfung und Build.

### Paket 2: Visuelle Grundlagen und Basiskomponenten konsolidieren

Ändern: `src/styles.css`, `package.json`, `package-lock.json`; vorhandene Dateien unter `src/app/shared/components/{button,badge,card,page-header,text-field,modal-shell,two-column-layout}/`; betroffene Komponenten-Tests und `e2e/typography.spec.ts`, `e2e/admin-accent.spec.ts`.

- [ ] Aktuelle semantische Farben erhalten und Rollen für Fokus, Auswahl und Hover explizit trennen. Keine pauschale Umfärbung alter `indigo-*`-Klassen als Dauerlösung.
- [ ] Button-Größen ausschließlich am Baustein festlegen; Konflikt 32/36 px auflösen. Styling aus TypeScript-Klassenstrings schrittweise in explizite Template-Klassen und Bindings überführen.
- [ ] Schriftgrößen, Radien, Schatten und Feldhöhen aus der Referenz anwenden; überflüssige leere SCSS-Dateien bei den tatsächlich migrierten Komponenten entfernen.
- [ ] Grundbausteine um konsistente Zustände für Laden, Fehler, Deaktiviert und Fokus ergänzen; vorhandene ControlValueAccessor-Anbindung erhalten.
- [ ] Ungenutzte Shopify-Pakete nach erneutem Importsuchlauf entfernen und Lockdatei regulär aktualisieren. Lucide-Lizenzhinweise erhalten.
- [ ] Alte globale Layout-Overrides nur entfernen, wenn alle betroffenen Verbraucher in diesem Paket oder einem nachfolgenden Paket ersetzt sind; keine ungezielte Komplettlöschung.

Abnahme: Referenzgrößen sind im Browser messbar; Marke und Kontrast funktionieren hell/dunkel; keine Änderung am Verhalten von Formularen. Tests prüfen gemessene Größen und Bedienzustände statt nur Klassennamen.

### Paket 3: Tabellenmenü, Fokus und persönliche Einstellungen

Ändern: `src/app/shared/components/table-column-menu/`, `src/app/shared/components/table-sort-header/`, `src/app/shared/components/table-column-picker/`, `src/app/core/models/table-preferences.models.ts`, `src/app/core/models/table-preferences.ts`, `src/app/core/services/table-preferences.service.ts`, zugehörige Tests, `e2e/table-sorting.spec.ts`, `e2e/layout-overlays.spec.ts`.

- [ ] Sortieroptionen um eine explizite Feldart erweitern:

```ts
export type SortValueKind = 'text' | 'number' | 'date';
export interface SortFieldOption<TSortField extends string = string> {
  readonly value: TSortField;
  readonly label: string;
  readonly kind: SortValueKind;
}
```

- [ ] Alle vorhandenen Konfigurationen aktualisieren. `date`: Älteste/Neueste zuerst; `number`: Kleinste/Größte zuerst; `text`: A–Z/Z–A.
- [ ] Dialog mit zwei benannten Radio-Gruppen verwenden. Trigger kündigt Dialog an; Öffnen fokussiert aktive Auswahl; Pfeiltasten, Tab, Escape, Auswahl und Fokus-Rückgabe vollständig umsetzen.
- [ ] Gemeinsames Overlay-Verhalten in `src/app/shared/directives/anchored-popover.directive.ts` und zugehörigem Test kapseln: Anker, Fensterbegrenzung, Scrollcontainer, Resize, Schließgrund und Fokusstrategie. Native Popover-/Positionierungsmöglichkeiten zuerst auf Zielbrowsern prüfen; keinen weiteren ungeprüften Positionierer installieren.
- [ ] Positionierung und Animationsursprung koppeln; kurze Fensterhöhen und 200 % Zoom berücksichtigen. Ein-/Ausblenden so gestalten, dass keine unsichtbaren fokussierbaren Menüs zurückbleiben.
- [ ] Ein Präferenzmodell definieren: Nutzer oder Demo-Kontext + Workspace + Tabelle. Neue lokale v2-Präferenz gewinnt; sonst gültige v1-Reihenfolge/Sortierung übernehmen und ältere Spaltensichtbarkeit als Fallback verwenden; sonst Feature-Standard. Quellen bis zum erfolgreichen Schreiben erhalten. Keine neue Cloud-Synchronisierung als Nebenaufgabe.
- [ ] Gespeicherte Werte validieren: bekannte IDs, gültige Richtung, echte Booleans, eindeutige Reihenfolge und sichtbare Pflichtspalten. Konto-/Workspacewechsel und Speicherausfall gezielt testen.
- [ ] `locked` weiter als „nicht ausblendbar“ behandeln. Feste Positionierung von Auswahl/Aktionen als getrennte Eigenschaft festlegen, falls gewünscht; kein stiller Bedeutungswechsel.

Abnahme: Bedienung nur mit Tastatur möglich, Datumssortierung verständlich, Overlay bleibt in jedem geprüften Fenster sichtbar, bestehende persönliche Spalten werden nachvollziehbar übernommen.

### Paket 4: Gemeinsamer Tabellenrahmen mit Inventar als Referenz

Neu unter `src/app/shared/components/`: `data-table-frame/`, `table-toolbar/`, `table-state/`, `table-pagination/`, jeweils `.component.ts` und `.component.html`; gezielte `.angular.spec.ts` für interaktives Verhalten. Neue gemeinsame reine Typen in `src/app/shared/models/table-ui.models.ts`.

Ändern: `src/app/features/inventory/inventory.component.ts/.html`, `components/stock-position-list/` einschließlich Tests, `e2e/inventory-archive-columns.spec.ts`, `e2e/admin-layout.spec.ts`.

Verantwortung: Rahmen bietet Slots für Toolbar, Auswahlaktionen, native Tabelle und Footer. Toolbar liefert Such-/Filter-/Reset-Events. Zeilen, Kosten, Herkunft, Archivaktionen und zulässige Auswahl bleiben im Inventar-Feature. Native `table`-/`th`-/`td`-Struktur und Spaltenbeziehungen bleiben erhalten.

- [ ] Neue reine UI-Typen als gemeinsame Grenze festlegen:

```ts
export type TableResultState = 'loading' | 'ready' | 'empty' | 'no-results' | 'error';
export interface TablePageState {
  readonly pageIndex: number;
  readonly pageSize: number;
  readonly total: number | null;
  readonly hasNextPage: boolean;
}
```

- [ ] Filterkarte, Archivumschaltung und Spaltenmenü in den gemeinsamen Container setzen. Zustand und Kategorie als zusätzliche Filterreihe nur bei Bedarf; aktive Filter als entfernbares Chip-Element anzeigen.
- [ ] Doppelte Inventarüberschrift und Erklärung reduzieren. Kennzahlen kompakter ordnen, damit Daten früher sichtbar werden.
- [ ] Spaltenbreiten und Typografie so abstimmen, dass Standardwerte in einer oder zwei Zeilen lesbar sind. Herkunfts- und Kostenaufschlüsselung bleibt ausdrücklich aufklappbar.
- [ ] Auswahlkopf mit Zustand „teilweise ausgewählt“ und eindeutiger Angabe „sichtbare Artikel“; Sammelaktionen bleiben auf fachlich zulässige Zeilen beschränkt. Aufklappen, Auswahl, Navigation und Statusänderung stören sich nicht gegenseitig.
- [ ] Auf kleinen Bildschirmen dieselben priorisierten Informationen und Aktionen über Karten anbieten. Keine Informationen durch rein visuelles `hidden` unwiederbringlich entfernen.

Abnahme: Inventar ist die vollständig geprüfte Referenz für weitere Seiten, einschließlich null Treffern, 1/50/500 Testzeilen, langen Artikelnamen, offenen Kosten, Auswahl, Herkunft und beiden Themes. Visuellen Zwischenstand vor großflächiger Übertragung zeigen.

### Paket 5: Einkäufe, Verkäufe, Artikelstamm und Administration übertragen

Ändern: jeweilige `.component.ts/.html` und Tests in `features/purchases/`, `features/sales/`, `features/catalog/`, `features/platform-admin/pages/beta-applications/`; Einkaufsdetails `pages/purchase-detail/` und `components/purchase-detail-table/`.

- [ ] Rahmen und Toolbar aus Paket 4 einsetzen, lokale Duplikate entfernen. Feature-spezifische Filter und Zeilen beibehalten.
- [ ] Kopf und Zellen weiter aus derselben geordneten Spaltenliste erzeugen. Sortierung, Pflichtspalten, Reset und gespeicherte Einstellungen routeübergreifend prüfen.
- [ ] Zeilenaktionen zu klaren Haupt-/Nebenaktionen ordnen, seltene Aktionen in ein beschriftetes Menü legen. Retouren und Prüfbelege bleiben verfügbar; keine Buchungsbearbeitung ergänzen.
- [ ] Älteren Picker in Einkaufsdetails an dieselbe Präferenz-/Overlaybasis anbinden. Kleine Detailtabellen bekommen keine unnötige komplexe Suchleiste.
- [ ] Nach Claudes Merge Kategorien und Administrations-Unternavigation in die Designregeln aufnehmen. Seine Auffrischungslogik und Statusaussagen erhalten; keine neue Backendarbeit.
- [ ] Pagination nur bei fachlich sinnvoller Datenmenge aktivieren. Bereits vollständig geladene Listen dürfen lokal paginiert werden. Bei serverseitig begrenzten Mengen müssen Suche, Sortierung, Anzahl und Seitennavigation gemeinsam im Feature-Service umgesetzt werden; niemals nur die geladene Seite als Gesamtergebnis darstellen.

Abnahme: identischer Bedienablauf bei Suche, Sortierung, Spalten und Reset; passende mobile Darstellung je Feature; keine Änderung an fachlichen Aktionen. Bestehende Navigation-, Einkaufs- und Verkaufsabläufe gezielt prüfen.

### Paket 5a: Zentrierte Erfassungsseiten statt großer Modals

**Vorhandene Dateien:**

- `src/app/features/sales/components/sale-create-modal/sale-create-modal.component.ts/.html` und `.angular.spec.ts`: Formular, Ziele, Mengen, Verkaufspreise, Versand und Zusatzkosten als Ausgangspunkt.
- `src/app/features/sales/sales.component.ts/.html`, `sales-deep-link.angular.spec.ts`: Einstieg und vorhandene Direktlinks.
- `src/app/features/inventory/components/item-create-modal/item-create-modal.component.ts/.html`, `item-create-modal-actions.dom.spec.ts`: Artikelanlage, Mehrfachanlage, Medien, Scanner und Zuschnitt als Ausgangspunkt.
- `src/app/features/purchases/pages/purchase-create/purchase-create.component.ts/.html`, `components/purchase-entry-form/`, `guards/purchase-entry.guard.ts`: vorhandene Einkaufsseite und Schutz ungespeicherter Eingaben.
- `src/app/app.routes.ts`, `e2e/inventory-sale.spec.ts`, `e2e/purchase-entry.spec.ts`, `e2e/purchase-item-navigation.spec.ts`: Navigation und Ablaufprüfungen.

**Neue Dateien:**

- `src/app/shared/components/entry-page-layout/entry-page-layout.component.ts/.html`: reine Darstellung mit Slots für Header, Hauptinhalt, Seiteninhalt und Speicheraktionen; keine Formulare, Datenabfragen oder Buchungslogik.
- `src/app/features/sales/pages/sale-create/sale-create.component.ts/.html` und `.angular.spec.ts`: geroutete Verkaufsanlage, vorhandene Serviceverträge weiterverwenden.
- `src/app/features/inventory/pages/item-create/item-create.component.ts/.html` und `.angular.spec.ts`: geroutete Artikelanlage mit vorhandenen fachlichen Funktionen.
- `src/app/shared/guards/unsaved-entry.guard.ts` und `.angular.spec.ts`: wiederverwendbarer Verlassensschutz, sofern der bestehende Einkaufs-Guard ohne Einkaufsabhängigkeiten extrahiert werden kann. Bestehenden Guard dann auf diese gemeinsame Grundlage migrieren, keine konkurrierenden Schutzdialoge.
- `e2e/entry-pages.spec.ts`: Navigation, Abbrechen, Fehler und erfolgreiche Rückkehr.

**Gemeinsame Schnittstelle für den Verlassensschutz:**

```ts
export interface UnsavedEntryPage {
  hasUnsavedChanges(): boolean;
  isSaving(): boolean;
}
```

Die Methoden melden lokalen Formularzustand, keine neue serverseitige Entwurfsfunktion. Der Guard verhindert versehentliches Verlassen bei Änderungen oder laufendem Speichern; nach erfolgreichem Speichern wird der Zustand vor der Rücknavigation bereinigt. Browser-Neuladen über `beforeunload` im `host`-Objekt absichern.

**Schritt 1 – Breite und Aufteilung konkret abnehmen:**

- [ ] Shopify-Produkt-/Einkaufsdetail bei derselben Desktopbreite wie Flipbase messen: maximale Inhaltsbreite, Haupt-/Seitenspalte, Zwischenraum, Header und Speicherleiste. Die gemessenen 680 px im schmaleren Browser sind keine allgemeine maximale Formularbreite.
- [ ] `entry-page-layout` mit zentriertem begrenztem Inhalt und zwei Slots bauen. Große Spalte für Arbeitsdaten, schmale Spalte für Zusammenfassung und Ergänzungen. Auf kleinen Ansichten in sinnvoller Eingabereihenfolge stapeln.
- [ ] Bestätigte Arbeitskarten mit 12 px Radius und 16 px Innenabstand verwenden. Maße für maximale Breite, Spalten und Umbruch im Live-Protokoll mit Viewport ergänzen, bevor sie als Referenz freigegeben werden.
- [ ] Scrollen auf Seitenebene ermöglichen; keine große feste Dialoghöhe mit mehreren gegeneinander scrollenden Formularbereichen. Speicheraktionen erreichbar halten, ohne Inhalte oder mobilen Fokus zu verdecken.

**Schritt 2 – Verkauf als erster vollständiger Ablauf:**

- [ ] Route `sales/new` vor möglichen `sales/:id`-Routen ergänzen. Neuanlage aus Verkaufsübersicht und Inventar auf dieselbe Seite führen; Bestandsposition und Menge aus bestehendem Vorbelegungsvertrag übernehmen. Ungültige oder inzwischen unverkäufliche Ziele erklären und Auswahl ermöglichen.
- [ ] Hauptspalte: Verkaufspositionen mit Mengen/Preisen, Versand und bestehende Zusatzkosten. Seiteninhalt: vorhandene Zusammenfassung und ergänzende Verkaufsangaben. Keine neuen Pflichtdaten allein aufgrund des Shopify-Vorbilds einführen.
- [ ] Bestehende Berechnung und Serviceaufrufe übertragen; `saleTarget`, `preselectedItemId`, `legacyReconciliation` und den bisherigen `sale`-Modus einzeln gegen ihre Aufrufer prüfen. Legacy-Abgleich und bestehende Detail-/Korrekturaktionen nicht versehentlich als neue Buchungsbearbeitung freigeben.
- [ ] Speichern während laufender Anfrage sperren; Serverfehler erhalten Eingaben und zeigen eine konkrete Meldung. Erfolgreiche Anlage führt zur passenden Liste beziehungsweise ihrem ursprünglichen Kontext zurück, mit Rückmeldung und aktualisierten Daten.
- [ ] Listenfilter und Rücksprungkontext bei Navigation erhalten. Es entsteht in Phase A keine neue serverseitige Entwurfsspeicherung.

**Schritt 3 – Artikel und vorhandene Einkaufsseite übertragen:**

- [ ] `inventory/new` vor `inventory/:id` einfügen. Artikelidentität, Medien und vorhandene Bestands-/Einkaufsangaben sinnvoll gruppieren. Vorbelegungen aus Einkauf oder Katalog erhalten.
- [ ] Barcode-/Fotoscan, Bildzuschnitt, Medienfehler und Mehrfachanlage einschließlich Teilerfolg erhalten. Diese kleinen Unteraufgaben dürfen weiterhin Dialoge verwenden; der gesamte Erfassungsablauf bleibt auf der Seite.
- [ ] Bestehende Einkaufsseite auf denselben Seitenrahmen umstellen. Aktuelle Felder, Typauswahl, Validierung, Beleg- und Kostenfunktionen unverändert übernehmen. Lieferant und Paketkosten erst in Phase B fachlich neu ordnen.
- [ ] Alte Modal-Einstiege nach Migration sämtlicher Aufrufer entfernen. Vorher Projekt nach Selektoren und Importen durchsuchen; keine ungenutzte zweite Formularimplementierung behalten.

**Konkrete Prüffälle:**

- Verkaufsanlage aus Inventar übernimmt die gewählte verkäufliche Position; Anlage aus Verkaufsübersicht erlaubt freie Auswahl im zulässigen Bestand.
- Direktaufruf/Reload der neuen Route funktioniert. Abbrechen ohne Änderungen navigiert zurück; ungespeicherte Änderungen werden nicht still verworfen.
- Zwei Klicks auf Speichern erzeugen während derselben laufenden Anfrage keine zwei Buchungen. Fehler lässt Formularinhalt stehen; Erfolg aktualisiert Liste/Bestand wie bisher.
- Artikel-Mehrfachanlage mit Teilerfolg zeigt die bereits angelegten Artikel und die fehlgeschlagenen Positionen; Wiederholung legt erfolgreiche Positionen nicht erneut an.
- Bestehende Einkaufsabläufe behalten bei identischen Eingaben dieselben Kosten und Bestandswirkungen. Beide Themes, 390/768/1440 px, 200 % Zoom, Tastatur und AXE prüfen.

Gezielte Befehle, jeweils nach Migration auf die tatsächlich vorhandenen Tests begrenzen:

```text
npm run test:angular -- src/app/features/sales/pages/sale-create/sale-create.component.angular.spec.ts src/app/features/sales/sales-deep-link.angular.spec.ts
npm run test:angular -- src/app/features/inventory/pages/item-create/item-create.component.angular.spec.ts src/app/features/purchases/pages/purchase-create/purchase-create.component.angular.spec.ts
npm run test:e2e -- e2e/entry-pages.spec.ts e2e/inventory-sale.spec.ts e2e/purchase-entry.spec.ts e2e/purchase-item-navigation.spec.ts
npm run build
```

**Abnahme:** Verkäufe, Artikel und Einkäufe haben zentrierte Erfassungsseiten; ihre fachlichen Ergebnisse entsprechen dem bisherigen Ablauf. Kurze Dialoge bleiben nur für passende Nebenaufgaben. Der Nutzer sieht zuerst den vollständigen Verkaufsablauf, bevor das Muster breit ausgerollt wird.

### Paket 6: Finanz- und Berichtstabellen, begrenzter Umfang

Ändern: Tabellenabschnitte von `features/accounting/accounting.component.ts/.html` und deren Tests, bei Bedarf neue `features/accounting/components/tax-journal-table/tax-journal-table.component.ts/.html` und `features/accounting/models/tax-journal-table.config.ts`. Weitere Tabelle-Verbraucher: `features/analytics/analytics.component.html`, `features/dashboard/dashboard.component.html`, `features/fulfillment/fulfillment.component.html`, `features/settings/pages/data-and-audit/data-and-audit.component.html`.

- [ ] Im Bankabgleich ausschließlich Tabellenrahmen und gemeinsame Spaltenbedienung übertragen; bestehende Zuordnungsabläufe erhalten.
- [ ] Steuerjournal nachrangig als kleine Darstellungskomponente integrieren, soweit dies die Tabellenmigration vereinfacht. Bestehender Zeitraumfilter bleibt an seinem Platz und liefert weiterhin dieselben Datensätze.
- [ ] Eigenes `tax_journal`-Profil für Datum, Artikel, Besteuerungsart, Verkaufspreis, Einkaufspreis, Bruttomarge, Umsatzsteuer und Rechnung anlegen. Datums-/Zahlensortierung auf zugrunde liegenden Werten; gleiche Spalten-/Leerlogik wie andere Tabellen.
- [ ] Null, unbekannt und negativ unterscheidbar darstellen. Ausgeblendete Spalten verändern keine Exportdatei oder Berechnung.
- [ ] Berichtstabellen visuell angleichen; barrierefreie Diagramm-Alternativtabellen und Druckdarstellung erhalten. Keine unnötigen Bearbeitungsfunktionen ergänzen.

**Ausdrücklich zurückgestellt:** Neugestaltung der Accounting-Seite, Kennzahlen, Zeitraum-/Exportleiste, Steuerberaterdialog, Steuerberechnungen und Exportfunktionen.

Abnahme: Tabellenverhalten und Spaltenüberschriften stimmen; gleiche Eingabedaten ergeben dieselben Summen und Exporte. Gezielte Tabellen-/Browsertests, betroffene bestehende Accounting-Prüfungen und Build. Die spätere Fertigstellung der gesamten Seite ist kein Abschlusskriterium dieses UI-Pakets.

### Paket 7: Restliche Oberfläche und Abschlussprüfung

Ändern: `layout/shell/`, `layout/header/`, `layout/sidebar/`, `layout/bottom-nav/`; bestehende Select-, Date-Picker-, Dialog-, Toast- und Formularverbraucher in Features. Weitere Phase: `features/auth/` und vorhandene öffentliche Shop-Ansichten für gemeinsame Grundbausteine.

- [ ] Alle Verwaltungsseiten anhand der Bereichsmatrix abarbeiten, mit ausdrücklich zurückgestellter Finanzseite außerhalb ihrer Tabellen: Header, Aktionen, Karten, Formulare, Details, Menüs, Dialoge und Feedback. Verbleibende direkte Sonderstyles durch die gemeinsamen Bausteine ersetzen.
- [ ] Nur jetzt ungenutzte globale `linear-*`-Sonderregeln, Komponenten-SCSS und alte Picker-/Präferenzpfade entfernen. Grundfarben, Druckausnahmen und Shopabgrenzung bewusst erhalten bzw. migrieren.
- [ ] Motion-Regeln auf Popover, Tooltip, Dialog, Toast und Sidebar anwenden; `prefers-reduced-motion` prüfen. Keine dekorativen Dauereffekte ergänzen.
- [ ] Anmeldung und Shop nutzen passende gemeinsame Schrift-/Feld-/Buttonregeln, erhalten aber ihre eigenen Seitenstrukturen.
- [ ] Komponentenstandard dokumentieren, sodass neue Tabellen denselben Rahmen verwenden und nicht wieder Toolbar-/Fokuslogik kopieren.

## Prüf- und Abnahmematrix für die Umsetzung

| Prüfung                                                      | Erwartung                                                                                                               |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| 390 × 844, 768 × 1024, 1280 × 720, 1440 × 900 und 200 % Zoom | Keine abgeschnittenen Aktionen/Overlays, kein unerklärtes horizontales Seitenscrollen                                   |
| Hell/Dunkel, normale/reduzierte Bewegung                     | Lesbare Farben, konsistente Maße, kein bewegter Effekt bei reduzierter Bewegung                                         |
| Tastatur                                                     | Sichtbarer Fokus, sinnvolle Reihenfolge, Menüs mit Pfeiltasten, Escape und Rückgabe, erreichbare Zeilenaktionen         |
| AXE plus manuelle WCAG-AA-Prüfung                            | Keine AXE-Verstöße; zusätzlich Kontrast, Fokus, Touch und Verständlichkeit manuell prüfen                               |
| Datenzustände                                                | Leer, null Treffer, Laden, Fehler, 1/50/500 Zeilen, lange Texte, unbekannte/negative Beträge                            |
| Präferenzen                                                  | Ausblenden, Reihenfolge, Sortierung, Reload, Reset, Konto- und Workspacewechsel, alte/ungültige gespeicherte Werte      |
| Fachliche Regression                                         | Einkauf, Bestand, Verkauf, Retouren, Kosten, Bankzuordnung und Exporte behalten ihre Bedeutung                          |
| Visuelle Prüfung                                             | Definierte Referenzzustände vergleichen; zufällige Screenshotabweichungen nicht ungeprüft als neuen Standard übernehmen |

Pro Paket: betroffene Dateien formatieren/linten, passende Tests und bei Angular-/Templateänderungen Build. `npm run verify` einmal für die abschließende umfangreiche Integration; verbindliche vollständige Prüfung im PR. Keine Pushes oder Produktionsänderungen während dieser Planungsphase.

## Abschlusskriterium

Alle Bereiche der Spezifikation besitzen ein bewusst gewähltes Muster, die bekannten Bedienfehler sind behoben, die gemeinsamen Komponenten sind verbindlich dokumentiert und neue Tabellen benötigen keine eigene Such-/Spalten-/Overlaygrundlogik. Der Live-Abgleich mit Shopify bleibt als eigener Nachweis kenntlich; er darf nicht durch grüne Funktionstests ersetzt werden.
