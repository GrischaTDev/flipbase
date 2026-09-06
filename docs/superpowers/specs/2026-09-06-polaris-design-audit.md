# Flipbase: Design-Bestandsaufnahme und Zielbild

Stand: 6. September 2026. Auftrag: vorhandene UI-Arbeit prüfen, Shopify recherchieren und eine Korrektur planen. Keine Freigabe zur Umsetzung vorausgesetzt.

## Ergebnis

Die vorhandenen Angular-Bausteine sind eine brauchbare Grundlage. Ein vollständiges gemeinsames Tabellen- und Interaktionssystem fehlt aber noch. Die letzten Änderungen haben vor allem einzelne Seiten und globale CSS-Regeln angeglichen. Das führt weiterhin zu unterschiedlichen Toolbars, uneinheitlichen Zuständen und schwer vorhersehbaren Größen.

Präzisierung des Nutzers: Das sichtbare Shopify-Admin-Design soll möglichst 1:1 getroffen werden, einschließlich Radien und Zuständen; Flipbase-Logo und helles Logo-Gelb bleiben erhalten. Eigene Angular-/Tailwind-Komponenten sollen diese Referenz nachbilden. Keine Installation des alten React-Polaris und keine ungeprüfte Übernahme von Shopify-Code oder Assets. Die Nutzungsgrundlage einer identischen Darstellung bleibt separat zu klären. Verbindliche Arbeitsgrundlage: [Designrichtlinien](../../design/admin-ui-guidelines.md).

## Belastbarkeit der Untersuchung

- Maßgeblicher UI-Stand: nach `git fetch origin` der Commit `04def2e` auf `origin/master`. Enthält die PRs #29, #31, #33, #34, #35 und #36 zur UI-Standardisierung, Tabellenlogik, Sortierung, Sidebar und Markenfarbe.
- Der Hauptarbeitsordner steht auf Claudes `feat/deal-monitor-collection-and-ui`. Dieser enthält einen älteren UI-Stand und zusätzliche Vinted-/Administrationsarbeit. Er wurde ausschließlich gelesen. Keine Änderung, kein Wechsel und kein Merge dieses Branches.
- Eigene Dokumentations-Arbeitskopie: `.worktrees/polaris-design-audit`, Branch `codex/polaris-design-audit`.
- Lokal wurde genau dieser Master-Stand auf Port 4317 im Demo-Modus gestartet. Visuell betrachtet: Einkäufe, Verkäufe, Inventar; DOM-Prüfung zusätzlich für Steuer & DATEV. Gemessener Browserbereich: 1280 × 720. Keine echten Geschäftsdaten geändert.
- Beim ersten Audit verlangte der Browser noch Anmeldung. Inzwischen wurde der angemeldete Admin ausführlich geprüft: [Live-Referenz](../../design/shopify-admin-live-reference.md). Die dort ausdrücklich protokollierten Werte sind tatsächliche Admin-Messungen; die früheren vorläufigen Vorschläge unten werden dadurch ersetzt, soweit eine passende Komponentenrolle gemessen wurde.
- Offizielle öffentliche Shopify-Dokumentation und die Lizenzen der tatsächlich installierten Pakete wurden gelesen. Frühere Changelog-Aussagen gelten nur als Historie, nicht als erneuter Prüfbeleg.
- Keine vollständige AXE-, WCAG-, Mobilgeräte- oder Produktionsprüfung in dieser Analyse. Der Entwicklungsbau gelang nach Erzeugung der regulären, ignorierten Versionsdatei; keine Anwendungscodeänderung und keine vollständige Testsuite.

## Was Shopify tatsächlich dokumentiert

Die Oberfläche von `shopify.dev/docs` selbst ist keine Vorlage für das Händler-Dashboard. Maßgeblich sind die darin dokumentierten Admin-Gestaltungsregeln und die Polaris-Muster.

| Quelle                                                                                           | Relevante Aussage                                                                                                                                               | Folgerung für Flipbase                                                                                               |
| ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| [Visual design](https://shopify.dev/docs/apps/design/visual-design)                              | Neutrale, gut lesbare Texte; mindestens 13 px für normale Inhalte und Interaktionen, 12 px für kleine Erläuterungen; Status nicht allein durch Farbe vermitteln | Schriftrollen statt nachträglicher pauschaler Größenkorrekturen; Badges mit lesbarer Beschriftung                    |
| [Layout](https://shopify.dev/docs/apps/design/layout)                                            | 4-px-Abstandsraster, volle Breite bei datenreichen Listen, konsistente Dichte; zurückhaltende Tabellenaktionen                                                  | Gemeinsamer Tabellencontainer mit integrierter Werkzeugleiste und passenden Detailansichten                          |
| [Index table](https://shopify.dev/docs/api/app-home/latest/patterns/compositions/index-table)    | Zusammenspiel aus Suche, Filtern, Sortierung, Mehrfachauswahl und Aktionen; Seitennavigation für große Datenmengen                                              | Ein Spalten-Popover allein ist noch kein vollständiges Index-Table-Muster                                            |
| [Resource index](https://shopify.dev/docs/api/app-home/latest/patterns/templates/resource-index) | Wiederkehrender Seitenaufbau zum Verwalten vieler ähnlicher Datensätze                                                                                          | Einheitliche Anordnung von Titel, Hauptaktion, Ansichten und Ergebnissen                                             |
| [Table](https://shopify.dev/docs/api/app-home/latest/web-components/layout-and-structure/table)  | Tabellen-/Listenwechsel auf kleinen Bildschirmen, Zahlen- und Währungsausrichtung, Ladezustand und Pagination                                                   | Mobile Darstellung braucht bewusste Priorisierung; breite Tabellen nicht einfach unkontrolliert verkleinern          |
| [Web Components](https://shopify.dev/docs/api/app-home/latest/web-components)                    | Aktuelles Polaris für Shopify-App-Oberflächen ist frameworkübergreifend über Web Components nutzbar                                                             | Angular ist technisch kein Ausschlussgrund; Einsatz außerhalb Shopify und Lizenz sind trotzdem gesondert zu bewerten |
| [Polaris React Archiv](https://github.com/Shopify/polaris-react-archive)                         | React-Implementierung deprecated und ungewartet; Repository seit 11. August 2026 archiviert                                                                     | Kein React-Wrapper als neue Grundlage für Flipbase                                                                   |

Die Quellen beschreiben Shopify-Apps und öffentliche Muster. Sie belegen weder, dass jede interne Admin-Seite exakt dieselben öffentlichen Komponenten nutzt, noch sämtliche Details des verlinkten Inventars. Exakte Hover-, Auswahl-, Spalten- und Animationsabläufe benötigen den noch ausstehenden Live-Abgleich.

## Pakete und Lizenzen

Installiert sind `@shopify/polaris-tokens` 9.4.2 und `@shopify/polaris-icons` 9.3.1 als Entwicklungsabhängigkeiten. Die Suche in `src`, `scripts` und `public` ergab keine Einbindung dieser Pakete. Es sind keine fertigen Angular-Tabellenkomponenten installiert. Sichtbare Icons stammen aus `@lucide/angular`.

Die lokalen `LICENSE.md` beider Shopify-Pakete enthalten eine zusätzliche Nutzungsbeschränkung für Anwendungen mit Shopify-Integration und Anforderungen an die visuelle Eigenständigkeit externer Anwendungen. Das ist keine uneingeschränkte MIT-Freigabe. Bestätigt wird diese Einschränkung durch die [offizielle Repository-Lizenz](https://raw.githubusercontent.com/Shopify/polaris-react-archive/main/LICENSE.md). Alte Suchtreffer zum separaten Legacy-Token-Repository mit MIT-Angabe dürfen nicht auf Version 9.4.2 übertragen werden.

Konsequenz für den technischen Plan: ungenutzte Shopify-Pakete entfernen; keine Shopify-SVGs oder Stylesheets kopieren. Lucide weiterverwenden und dessen [ISC-Lizenzhinweise](https://lucide.dev/license) beibehalten. Die Nutzungsbedingungen neuer Web Components sind damit nicht automatisch bewertet. Eine nahezu identische Darstellung durch Original-Polaris wäre eine eigene Entscheidung mit passender Nutzungsgrundlage. Ein Austausch der Icons allein löst diese Frage nicht.

## Ist-Zustand nach Bereichen

| Bereich                                     | Vorhanden                                                                                   | Korrektur bzw. Ausbau                                                                                                                                                                    |
| ------------------------------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Einkäufe                                    | Dynamische Spalten, Sortierköpfe, Suche, Typfilter, gemeinsame Buttons/Badges               | Suchleiste bleibt bei null Treffern erreichbar; echte Leer-, Lade- und Fehlerzustände trennen; bessere Spaltenbreiten und kompaktere Zeilen                                              |
| Inventar                                    | Spaltenmenü, Auswahl, Bestandspositionen, aufklappbare Herkunft, Archivumschaltung          | Filterkarte und Tabellenkopf zusammenführen; zweiter Titel und lange Erklärung entfallen zugunsten klarer Gruppen; Details gezielt aufklappen; Auswahl pro fachlich zulässigem Datensatz |
| Verkäufe                                    | Spaltenmenü, Sortierköpfe, Plattformfilter, Kennzahlen, mobile Karten                       | Einheitliche Toolbar; Aktionen bündeln; Formatierung und Dichte vereinheitlichen; Kostenwarnungen fachlich erhalten                                                                      |
| Artikelstamm                                | Gemeinsame Präferenzen und Menü, dynamische Tabelle                                         | In denselben Rahmen migrieren; Lade-/Leeransicht und mobile Darstellung abgleichen                                                                                                       |
| Bankabgleich                                | Gemeinsame Spalten-/Sortierlogik                                                            | Toolbar und Tabellenzustände vereinheitlichen; Zuordnungsvorgänge unverändert erhalten                                                                                                   |
| Steuer & DATEV                              | Eigene Tabelle, Zeitraumfilter, Exportaktionen                                              | Eigenes `tax_journal`-Tabellenprofil, gleiche Spalten-/Sortier-/Leerlogik, passende mobile Strategie; Anzeige und Exportumfang klar trennen                                              |
| Betreiber/Administration                    | Beta-Bewerbungen sind auf Master bereits modernisiert                                       | Nicht als komplett fehlend behandeln; gleiche Toolbar und Zustände einsetzen. Claudes Kategorien und neue Unternavigation erst nach seinem Merge integrieren                             |
| Dashboard                                   | Kennzahlen, Diagramm, Verkaufsjournal                                                       | Gemeinsame visuelle Regeln; kompakte Übersichtstabelle benötigt nicht automatisch alle Bearbeitungsfunktionen                                                                            |
| Analytics, Versand, Daten-/Prüfprotokoll    | Weitere native Tabellen vorhanden                                                           | In die Migration aufnehmen; Bericht-, Druck- und interaktive Tabellen bewusst unterscheiden                                                                                              |
| Formulare, Detailseiten, Modals, Navigation | Shared-Bausteine vorhanden, daneben direkte Buttons/Felder und individuelle Modalstrukturen | Bestehende Bausteine konsolidieren und verbindlich anwenden; einheitliche Fokus-, Fehler-, Lade- und Bewegungszustände                                                                   |
| Anmeldung und öffentlicher Shop             | Eigene Bereiche und eigene Gestaltung                                                       | Spätere visuelle Harmonisierung von Schrift, Feldern und Buttons; keine Händler-Tabellenstruktur für Kunden erzwingen                                                                    |

## Konkrete Befunde

### Hohe Priorität: Filter verschwinden bei null Treffern

`src/app/features/purchases/purchases.component.html:71` hängt den gesamten Tabellencontainer einschließlich Suche und Tabs an `purchaseRows().length > 0`.

Reproduziert: Demo → Einkäufe → Suche `zzznichtvorhanden`. Tabelle, Suchfeld und Filter verschwinden. Statt „Keine Treffer“ erscheint die Aufforderung, den ersten Einkauf anzulegen. Nutzer können die Suche dort nicht mehr korrigieren. Derselbe Aufbau betrifft leere Kategorien.

Korrektur: Toolbar dauerhaft rendern. Nur der Ergebnisbereich wechselt zwischen Laden, Daten, keinen Treffern, noch keinen Datensätzen und Fehler. „Filter zurücksetzen“ muss bei null Treffern bedienbar bleiben.

### Hohe Priorität: Sortier-Untermenü hat unvollständige Tastaturführung

`shared/components/table-column-menu/` zeichnet zwei `listbox`-Gruppen in einem `dialog`. Der Trigger kündigt jedoch `aria-haspopup="listbox"` an. Beim Öffnen bleibt der Fokus auf dem Trigger; Pfeil nach unten bewegt ihn nicht in die Auswahl. Die Methoden zum Öffnen und Auswählen übernehmen keine vollständige Fokusführung. Das wurde im Browser nachvollzogen.

Korrektur: ein konsistentes Muster festlegen, vorzugsweise Dialog mit zwei beschrifteten Radio-Gruppen für Feld und Richtung. Öffnen fokussiert die aktive Wahl; Pfeiltasten bedienen die Gruppen; Escape schließt zunächst das Untermenü und stellt den zugehörigen Fokus wieder her. Click-outside darf einen bewusst angeklickten anderen Button nicht durch Fokus-Rückgabe stören.

### Hohe Priorität: Steuerjournal hat eine falsche Spaltenüberschrift

`features/accounting/accounting.component.html:645` nennt eine Spalte „Plattform“, rendert darunter aber `tax_mode` als „§ 25a“, „KU § 19“ oder „Regel“. Im Demo-DOM bestätigt. Überschrift zu „Besteuerungsart“ korrigieren; eine tatsächliche Plattform wäre eine getrennte Spalte. Diese Korrektur braucht keine Änderung an Steuerberechnungen.

### Mittlere Priorität: Gestaltung entsteht aus überlagerten Regeln

`src/styles.css` enthält Basisfarben, Dunkelmodus, `.fb-admin`-Überschreibungen und ältere `linear-*`-Klassen. HTML enthält zusätzlich eigene Radien, Schatten und Schriftgrößen. Beispiel: `ButtonComponent` definiert `slim` mit 32 px, die globale `.fb-admin .linear-btn-*`-Regel fordert aber mindestens 36 px. Kleine Texte werden teilweise über Attributselektoren nachträglich auf 12 px angehoben, interaktive 12-px-Texte bleiben an anderen Stellen bestehen.

Im Browser hat der Inventarkopf trotz CSS-Zielhöhe von 44 px tatsächlich 53 px: ein 32-px-Sortierbutton plus vertikale Zellabstände vergrößert ihn. Die erste Bestandszeile ist 107 px hoch. Die ersten Daten beginnen bei 1280 × 720 erst weit unten, weil Kennzahlen, separate Filterkarte und Tabellenüberschrift übereinander stehen. Das sind Messungen von Flipbase, keine Shopify-Maße.

Korrektur: Größen aus einer klaren Verantwortung ableiten, Hauptinhalt und Details trennen, tatsächliche berechnete Maße prüfen. Globale Theme-Variablen bleiben sinnvoll; Komponentenlayout gehört nach Projektregel in Tailwind-Templates.

### Mittlere Priorität: gemeinsames Menü, aber kein gemeinsamer Tabellenrahmen

Die sechs registrierten Tabellen verwenden dieselbe Präferenzlogik, bauen Suche, Tabs, Filter, Reset, Ergebniszustände und mobile Ansichten jedoch separat. Im Inventar sind Filter weiterhin in einer getrennten Karte, obwohl frühere Protokolle eine gemeinsame Toolbar beschreiben.

Korrektur: wiederverwendbare kleine Bausteine für Rahmen, Toolbar, Ergebniszustand und Pagination. Fachliche Zeilendarstellung bleibt im Feature. Keine riesige Tabelle mit Fallunterscheidungen für jedes Feature.

### Mittlere Priorität: zwei Präferenzsysteme und falsche Richtungstexte

`core/services/table-preferences.service.ts` verwaltet eine ältere benutzerbezogene Spaltensichtbarkeit mit Auth-Metadaten und eine neuere lokale Tabelle aus Reihenfolge, Sichtbarkeit und Sortierung. Neue Cache-/Speicherschlüssel enthalten Workspace und Tabelle, aber keine Nutzerkennung. Der ältere Picker ist noch in Einkaufsdetails im Einsatz. Nicht als Datenleck bewertet; es geht um inkonsistente persönliche Einstellungen und Verhalten bei Konto-/Arbeitsbereichwechsel.

Das Sortiermenü zeigt selbst beim Verkaufsdatum „A–Z“ und „Z–A“. Korrektur: „Älteste zuerst / Neueste zuerst“, „Kleinste zuerst / Größte zuerst“ und bei Text „A–Z / Z–A“. Bestehende Einstellungen mit definierter Vorrangregel migrieren, nicht stillschweigend löschen.

### Mittlere Priorität: Animation ist vorhanden, aber nicht als System definiert

Aktuell: Fade-in 150 ms, Modal 180 ms, Popover 160 ms; reduzierte Bewegung wird global berücksichtigt. Die untersuchten Popover messen 288 bzw. 240 px Breite und 12 px Radius und benutzen `shadow-xl`. Der Einblendursprung ist durch die globale Klasse fest oben rechts, obwohl das Template auch eine untere Position vorsieht. Durch `@if` werden Menüs unmittelbar entfernt; ein geplanter Ausblendzustand fehlt.

Korrektur: gemeinsame Dauer- und Kurvenvariablen, Position und Animationsursprung zusammen berechnen, Ein- und Ausblenden sowie Fokus getrennt behandeln. Positionierungsverhalten bei Scrollcontainern, Zoom und kurzer Fensterhöhe testen. Keine Behauptung, 160 ms seien der exakte Wert des aktuellen Shopify-Admins.

### Prüfqualität

Vorhandene Tests sichern wertvolles Verhalten, manche prüfen aber Klassen oder das Vorkommen von Rollen und „A–Z“ statt vollständiger Bedienabläufe. Ein grüner Test beweist damit weder Shopify-Nähe noch vollständige Barrierefreiheit. Ergänzungen müssen Nutzeraktionen prüfen: Suche ohne Ergebnis, Pfeiltasten, Escape, Fokus, abgeschnittene Overlays, echte Spaltenreihenfolge und Zahlen-/Datumssortierung.

## Zielbild für die Umsetzung

### Gemeinsamer Aufbau

```text
Seitentitel + Anzahl                         Hauptaktion | weitere Aktionen
Optionale kompakte Kennzahlen
┌─────────────────────────────────────────────────────────────────────────┐
│ Ansichten / Status                    Suche | Filter | Spalten/Sortieren │
│ Aktive Filterchips und „Zurücksetzen“ — nur wenn nötig                    │
├─────────────────────────────────────────────────────────────────────────┤
│ Optional: Auswahlzahl + zulässige Sammelaktionen                          │
│ Kopfzeile                                                               │
│ Datenzeilen / verständlicher Ergebniszustand                             │
│ Optional: Anzahl + Seitennavigation                                      │
└─────────────────────────────────────────────────────────────────────────┘
```

Titel ist der klare Navigationslink der Zeile. Checkbox, Aufklappen und Aktionen haben getrennte Klickziele; ein Klick auf sie darf nicht zusätzlich navigieren. Zeilenaktionen sind dezent, auf Tastaturfokus und Touch jederzeit erreichbar. Mehrfachauswahl nur dort anbieten, wo fachlich erlaubte Sammelaktionen vorhanden sind.

### Gestaltungswerte als Flipbase-Vorschlag

Diese Werte sind vorläufige Startwerte, keine gemessene Shopify-Spezifikation. Nach der Nutzerpräzisierung haben tatsächliche Admin-Messungen Vorrang; Radien und Motion dürfen nicht anhand dieser Vorschläge als fertig umgesetzt gelten:

- Inter lokal beibehalten, auch für Zahlen; Zahlen mit gleich breiten Ziffern. Regulär 13–14 px, Erläuterungen mindestens 12 px, Seitentitel 20–24 px.
- Abstandsraster 4 px. Buttons 32 px kompakt / 36 px Standard; mobile Touchflächen 44 px. Tabellenkopf 40–44 px; einfache Zeilen ungefähr 44–48 px, zweizeilige 56–64 px. Zeilen mit mehr Inhalt dürfen wachsen, wichtige Informationen werden nicht abgeschnitten.
- Heller neutraler Hintergrund, weiße Flächen, feine Trennlinien; begrenzte Radien und Schatten. Dunkelmodus mit denselben Rollen statt Einzelkorrekturen.
- Aktuelles Logo-Gelb `#fcc601` als Flipbase-Marke erhalten; dunkle Schrift auf gelben Flächen. Fokus bekommt eine eigene kontrastreiche Farbe, nicht automatisch Gelb. Warn- und Finanzfarben bleiben fachlich getrennt.
- Normalzustand, Hover, Aktiv, Fokus, Deaktiviert, Laden, Fehler und Erfolg pro Baustein festlegen.
- Bewegungsstartwerte: 120 ms für kleine Zustandswechsel, 160 ms für Popover, 180 ms für Dialoge. Nur kurze Deckkraft-/Bewegungsübergänge; bei reduzierter Bewegung keine Verschiebung/Skalierung.
- Mobil priorisierte Karten für Artikel-/Einkaufslisten. Für vergleichende Finanzdaten eine ausdrücklich beschriftete, horizontal scrollbare Tabelle, statt Spalten ohne Ersatz zu verstecken. Keine horizontale Seitenscrollleiste.

### Architektur

Vorhandene `ButtonComponent`, `BadgeComponent`, `CardComponent`, `PageHeaderComponent`, `TextFieldComponent`, `ModalShellComponent`, `TableColumnMenuComponent` und `TableSortHeaderComponent` weiterentwickeln. Neue Shared-Bausteine erhalten Daten ausschließlich über Inputs und geben Bedienaktionen über Outputs zurück. Datenabruf, Berechnung und Fachaktionen bleiben in Feature-Services.

Präferenztypen gehören zentral, konkrete Spaltenkonfigurationen langfristig ins jeweilige Feature. Neue gemeinsame Bausteine: Tabellenrahmen, Tabellen-Toolbar, Ergebniszustand und Pagination. Overlay-Verhalten wird für Spaltenmenü, Selects und weitere Popover vereinheitlicht, ohne funktionierende Modal-Fokuslogik zu ersetzen.

### Umfang und Abgrenzung

**Aktuelle Nutzerkorrektur:** Steuer & DATEV beschränkt sich vorerst auf die Tabelle samt Spaltenbedienung und Tabellenfehlern. Kein Umbau der gesamten Finanzseite, Kennzahlen, Exportabläufe oder Steuerberaterdialoge. Frühere breitere Vorschläge dazu sind zurückgestellt.

Zuerst Verwaltung und tabellarische Arbeitsabläufe, danach alle übrigen Verwaltungsseiten einschließlich Formulare, Detailansichten, Dialoge, Navigation und Benachrichtigungen. Anmeldung und öffentlicher Shop erhalten eine anschließende, rollenbezogene Harmonisierung. Backend, Steuerlogik, Preise und Bestandsregeln sind keine Designänderungen. Keine generische Inline-Bearbeitung von gebuchten Verkäufen oder Steuerdaten einführen.

## Ergänzte Nutzerentscheidungen: Erfassung und Einkaufsprozess

Umfangreiche Verkaufs-, Artikel- und Einkaufserfassung erfolgt auf zentrierten Seiten mit begrenzter Breite, breiter Hauptspalte und ergänzenden Cards in einer schmaleren Seitenspalte. Kleine Dialoge bleiben für kurze Nebenaufgaben und Bestätigungen. Exakte Breite und Spaltenaufteilung werden am passenden Shopify-Detailvorbild bei gleichem Viewport abgenommen. Der erste vollständige Referenzablauf ist Verkaufsübersicht plus Verkaufsanlage. Die bereits vorhandene Einkaufsseite wird angepasst, keine zweite Erfassung parallel gebaut.

Der dauerhafte Hinweis „Gebuchte Verkäufe bleiben unverändert erhalten …“ entfällt aus der Verkaufsübersicht; Buchungsregeln bleiben bestehen. Für Einkäufe folgt nach dem grundlegenden Designumbau eine eigene fachliche Phase: Lieferant/Verkäufer und Gesamtbetrag zuerst, Artikel sofort oder später ergänzen. Gesamtpreis und Einzelkostenzuordnung bleiben getrennt. Ob die Typ-Spalte entfällt und wie Verteilung, Abschluss und Verkauf bei offenen Kosten funktionieren, wird vor Datenmodelländerungen geklärt. Siehe [Gesamtplan](../plans/2026-09-06-polaris-design-consolidation.md) und [Einkaufs-Folgeplan](../plans/2026-09-06-purchase-workflow-redesign.md).

## Noch ausstehender Referenzabgleich

Inventar, weitere Tabellen, Auswahl, Suche ohne Treffer, Spalten-/Sortier-/Filtermenüs, Arbeitskarten, Detailseiten, Formulare und Dialoge wurden inzwischen lesend geprüft. Die [Live-Referenz](../../design/shopify-admin-live-reference.md) dokumentiert besuchte Seiten, Geometrie, Farben, Schatten und CSS-Übergänge. Offen bleiben der vollständige Hover-/Pressed-/Fokusabgleich, Mobile, Zoom, Reduced Motion und in diesem Testshop nicht verfügbare Datenzustände. Keine Bestandsänderungen, Exporte oder gespeicherten Ansichten auslösen; ausschließlich Gestaltung und Bedienablauf dokumentieren.

Der folgende Plan kann auf Basis der belegten Fehler und öffentlichen Dokumentation besprochen werden. Eine pixelgenaue Shopify-Abnahme ist mit dem derzeitigen Zugang nicht möglich.
