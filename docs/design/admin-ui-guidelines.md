# Verbindliche Gestaltungsrichtlinie für Flipbase

Stand: 19.10.2026. Diese Fassung ersetzt widersprüchliche ältere Gestaltungsregeln. Sie gilt für die Verwaltungsoberfläche und ihre gemeinsamen Bausteine. [Historische Entscheidungen](admin-ui-guidelines-history.md) bleiben nachvollziehbar, sind aber keine konkurrierende Stilvorgabe.

## Grundlage und Rangfolge

1. Ausdrückliche aktuelle Nutzerentscheidungen.
2. Diese Richtlinie und der [Apple-Rollenvertrag](apple-ui-reference.md).
3. Gemeinsame Komponenten und zentrale Flipbase-Variablen.
4. Historische Dokumentation nur zur Erklärung früherer Entscheidungen.

Die Richtung ist Apple-orientiert. AppKit/macOS, UIKit/iPadOS und SwiftUI-Formularstile sind unterschiedliche Referenzen. Es gibt keinen nachgewiesenen allgemeinen Apple-Web-UI-Kit-Standard. Herkunft immer kennzeichnen: **A** dokumentierte Apple-Aussage, **K** konkretes Kit-Beispiel, **M** native Gerätemessung, **F** Flipbase-Webentscheidung. Siehe [Quellen und Formularaudit](2026-10-19-apple-form-audit.md). Keine geschätzten Webmaße als Apple-Original ausgeben.

## Bestehende Anordnung erhalten

Designarbeiten ändern die Darstellung gemeinsamer Bausteine: Schrift, Farben, Konturen, Radien, Abstände und Zustände. Bestehende Spaltenzuordnung, Reihenfolge der Abschnitte und Funktionen bleiben erhalten. Eine Umordnung benötigt einen gesonderten Auftrag; eine allgemeine Apple-Empfehlung zur Gruppierung ist dafür keine Freigabe.

Im Produkteditor bleiben Eigenschaften auf Desktop in der rechten Spalte. Grunddaten, Bilder, Varianten und Suchmaschineneintrag bleiben in der Hauptspalte. Auf schmalen Ansichten gilt die vorhandene gestapelte Aufteilung. Vorher-/Nachhervergleiche zeigen alle betroffenen Abschnitte; Ausschnitte müssen ausdrücklich als Ausschnitte erkennbar sein.

**Freigegebene Ausnahme Finanzen:** Ausgaben, Steuer/DATEV einschließlich Bankabgleich und Auswertung dürfen nach dem ausdrücklichen Nutzerauftrag vom 19.10.2026 auch in ihrer Anordnung grundlegend überarbeitet werden. Diese Freigabe hebt die Layoutgrenze für andere Bereiche nicht auf.

## Gemeinsame Bausteine sind verbindlich

- Aktionen: `app-button`; Navigation als Link über dessen `link`/`href`, wenn sie wie ein Button dargestellt wird.
- Text und längere Beschreibung: `app-text-field`; Zahl/Betrag: `app-number-input`; Suche: `app-custom-search-input`.
- Einfache Auswahl: `app-custom-select`; Kategoriebaum: `app-category-picker`; Marke: `app-brand-picker`; Vorschläge/Mehrfachwerte: `app-attribute-picker`.
- Beschriftung, Pflichtangabe, Hinweis und Fehler: `app-form-field`. Die Feldkomponenten verwenden ihn intern. Bei extern zusammengesetzten Feldern denselben Rahmen nutzen, ohne ein zweites Label zu erzeugen.
- Dialog: `app-modal-shell`, Bestätigungen: `app-confirm-dialog`; Tabellen mit gemeinsamen Tabellen-/Sortier-/Aktionsbausteinen entsprechend ihrer bestehenden Rolle; Inhaltsabschnitte: `app-card variant="section"`.

Normale Buttonicons werden über den vorhandenen `icon`-Eingang gesetzt. Kein SVG gemeinsam mit Text in den normalen Inhaltsbereich projizieren. Größere oder mehrteilige Inhalte benötigen eine ausdrücklich passende Rolle. Touch-Lösch-/Zusatzflächen erhalten im Feld den vollständig belegten Innenabstand; sie dürfen keinen Eingabetext überlagern.

Vor jeder neuen UI zunächst den vorhandenen Baustein und seine unterstützten Varianten prüfen. Fehlende wiederverwendbare Rolle dort ergänzen. Keine parallel gestalteten Standardbuttons, Inputs, Selects oder Modalrahmen pro Fachseite anlegen. Shared Components laden selbst keine neuen Fachdaten; bestehende historische Datenanbindungen werden durch Gestaltungsarbeit nicht erweitert.

**Erlaubte native Elemente:** Interna dieser Shared Components, technische versteckte Datei-Inputs, semantische Links im Fließtext, native Details/Summary und fachliche Spezialflächen wie Bildzuschnitt, Diagramm oder Drag-and-drop. Ein klickbarer Menüeintrag oder eine Bildfläche wird nicht allein wegen des HTML-Tags zu einem neuen Formularbutton. Ausnahmen müssen ihrer Funktion entsprechen; normale Aktionen nicht als Ausnahme tarnen. Bereits vorhandene Spezialflächen erhalten bei ihrer jeweiligen Migration einen eigenen überprüften gemeinsamen Baustein.

## Stilzuständigkeit: eine Quelle je Eigenschaft

- Farben, Fokus, Zustände und gemeinsame Controlmaße liegen in `src/styles/flipbase-theme.css`; die vorhandenen zentralen Controlregeln in `src/styles.css` wenden diese an.
- Layout und rollenbezogene Details stehen als Tailwind-Klassen im Template des zuständigen Shared Component.
- Fachseiten dürfen Platzierung, Breite, Raster und Abstände **um** einen Baustein steuern. Sie dürfen keine inneren Inputs/Buttons per Nachfahrenselektor, `::ng-deep`, Inline-Stil oder `!important` umgestalten.
- Keine allgemeinen `form input`-/`form label`-Regeln ergänzen. Keine zweite Stilregel über eine widersprüchliche alte Regel legen: Ursache entfernen oder in eine ausdrücklich benannte Rolle überführen.
- Eigene CSS-/SCSS-Dateien nur für technisch nötige Ausnahmen wie Popoverpositionierung, Scrollbars, Druck, komplexe Animationen oder vorhandene zentrale Rollen. Keine neue lokale Kopie der Formularoptik.
- Hell/Dunkel verwenden dieselben Rollen mit unterschiedlichen Farbwerten. Die gewählte App-Einstellung gilt auch dann, wenn das Betriebssystem das andere Farbschema nutzt.

## Aktuelle Formularmaße

Die folgenden Zahlen sind **F**, bewusst festgelegte Webmaße und keine universellen Apple-Originalmaße.

| Rolle                          | Maus/Desktop             | Touch                              |
| ------------------------------ | ------------------------ | ---------------------------------- |
| Standardfeld                   | mindestens 28px          | mindestens 44px                    |
| Eingabetext, Select-Auslöser   | 13px / 16px Zeile        | 16px / 20px Zeile                  |
| Feldlabel                      | 13px / 20px, Gewicht 500 | gleich                             |
| Label zum Feld                 | 6px                      | gleich                             |
| Felder einer Gruppe            | 16px                     | gleich                             |
| Abschnitte                     | 20px                     | gleich                             |
| Regulärer Innenabstand im Feld | 12px horizontal          | gleich; Icon-/Löschraum zusätzlich |
| Feldradius                     | 7px                      | gleich                             |
| Inhaltsbutton                  | 6px Radius, regulär 28px | Trefferfläche mindestens 44px      |
| Aktionsgruppe                  | 8px Abstand              | bei Bedarf umbrechen               |

Mehrzeilige Felder und Mehrfachwerte dürfen mit dem Inhalt wachsen. Größere ausdrücklich unterstützte Rollen für Anmeldung, Suche oder besondere Aktionen bleiben möglich. Tablets bekommen ihre Touchgrößen über den Eingabemodus, nicht durch versehentlich globale Desktopvergrößerung.

## Formulare und Aktionen

**Dateneditor:** dauerhafte Labels oberhalb der Felder, kurze zusammengehörige Angaben bei genügend Platz nebeneinander, lange Texte über die verfügbare Breite. Die bestehende Anordnung bleibt erhalten; innerhalb dieser Struktur gilt eine verständliche Feldfolge. DOM-, Lese- und Tastaturreihenfolge bleiben auch bei eingeklappter Spaltenansicht sinnvoll. Kein CSS-`order` als Ersatz für eine falsche DOM-Reihenfolge.

**Einstellungen:** inhaltlich zusammengehörige Gruppen; Bezeichnung und Steuerung dürfen als beschriftete Zeile nebeneinander stehen und bei wenig Platz umbrechen. Kein pauschaler Nachbau von SwiftUI Columns oder Grouped für alle Aufgaben.

**Formulardialog:** eine zusammenhängende Fensterfläche mit verständlichem Titel, wenig Erklärung, passender Inhaltsbreite und internem Scrollbereich. Eine Hauptaktion; sekundäre Aktion davor, Hauptaktion am Ende der Aktionsgruppe. Ein reiner Info-/Kontodialog benötigt keinen zusätzlichen leeren Fußbereich. Escape, Fokusfalle und Rückfokus bleiben erhalten.

Beschriftungen erscheinen genau einmal und sind mit der tatsächlichen Eingabe verknüpft. Placeholder ersetzt kein Label. Pflichtangabe nicht allein über Farbe vermitteln. Nur nötige Hilfetexte zeigen. Fehler stehen am Feld und werden über `aria-describedby` zugeordnet. Vorhandene Werte, Speicherabläufe, Such-/Baum-/Mehrfachauswahlsemantik und Tastaturbedienung bleiben erhalten.

Eine Listbox enthält Auswahloptionen. Ergänzende Aktionen wie „Verkäufer erstellen“ stehen semantisch außerhalb der Liste, innerhalb desselben Popovers. Dessen Positionierung, Tastatursteuerung und Rückfokus bleiben erhalten. Fensterregeln dürfen die gemeinsame Labelrolle nicht überschreiben.

## Farben und Zustände

Das Logo-Gelb **#fcc601** bleibt der primäre Markenakzent. Keine ungefragte Ersetzung durch Orange/Goldbraun. Warnungen verwenden Markengelb mit neutralem gut lesbarem Text; kein Braun/Orange als alter Warnakzent. Normale Kennzahlen wie offene Ausgaben und Haltedauer sind neutral. Auswahlflächen sind neutral grau hervorgehoben; Menüs haben feine Kontur und ruhigen Schatten. Normale Inhaltsbuttons sind keine Kapseln. Ein einzelner blauer Fokus ersetzt schwarz-gelbe Doppelrahmen; Fehler besitzen zusätzlich eine sichtbare Meldung. Eigene Buttons unterscheiden Normal, Hover, Gedrückt, Fokus, deaktiviert und Laden. Gedrückt darf keinen Layoutsprung verursachen.

## Bewusst erhaltene Sonderrollen

Die ausdrücklich freigegebene Übersicht behält ihre 20px-Kartenradien und kapselartigen Schnellaktionen als opt-in-Varianten. Diagramm: Gelb #fcc601, Grau #9ca3af, Petrol #006b73; dunkler Gewinnton #288b78, Grau #a8b0bb. Kennzahlen, letzte drei Verkäufe mit eigener Datumsspalte, kompakte Plattformlogos und ausgewogene untere Karten bleiben bestehen. Gedämpfte Kleidungsplatzhalter erhalten.

Papier-/Belegansichten behalten ihre Druckgestaltung. Der Nutzerauftrag vom 19.10.2026 erweitert den Umfang auf die vollständigen Oberflächen von Ausgaben, Steuer/DATEV einschließlich Bankabgleich und Auswertung samt ihren Dialogen. Die frühere Begrenzung auf Steuertabellen ist damit aufgehoben. Für diese drei Finanzbereiche ist auch die grundlegende Neuordnung ausdrücklich freigegeben: Filter, Summen, Navigation und Aktionen werden gemeinsam überarbeitet. Berechnungen und Speicher-/Exportabläufe bleiben erhalten. Diese Ausnahme gilt nicht für den Artikelbereich.

## Verbindliche Prüfung

Vor Abschluss die geänderten Shared Components **und ihre tatsächlichen Verbraucher** prüfen: berechnete Stile statt nur Klassennamen, Hell/Dunkel, Maus/Touch, schmaler Bildschirm, Tastatur, Fehler, deaktiviert, Laden und gedrückter Zustand. AXE/WCAG AA sowie die vorhandene Formular-/Speicheranbindung erhalten. Gegen ruhende Vorschau testen; danach Angular-Bau einschließlich Vorlagenprüfung.

`node scripts/check-admin-shared-ui.mjs` verhindert alte native Standardaktionen, normale native Formularfelder und lokale Shared-Control-Überschreibungen im erfassten Adminbereich, auch in Angular-Kontrollblöcken. Zulässige Tabellenausnahmen stehen mit Zweck in dessen Liste. Diese statische Prüfung ersetzt keinen visuellen Browsernachweis. Neue oder verschobene Tests müssen in der bestehenden Testauswahl ankommen. [Prüfumfang](../testing/affected-test-selection.md).

**Abnahmegrenze:** Dieser Vertrag beschreibt verbindliche Regeln, keine Behauptung einer bereits vollständigen visuellen Abnahme aller Fachseiten. Native Safari-/iPad-Prüfung und die vollständige CI-/Produktionsmatrix bleiben gesonderte Freigabeschritte.

## Messnachweis der gemeinsamen Grundlagen

[Gerenderte Werte nach der Umsetzung](apple-form-implementation-measurements.json) dokumentieren die Feld-, Label- und gedrückten Buttonzustände für1440px Maus/834px Touch, jeweils Hell/Dunkel. Der vorherige Zustand bleibt im Formularaudit erhalten. Gemessen unter Windows/Chromium; keine native Gerätemessung.

## Tabellen und Kennzahlen: Nutzerentscheidung vom 23.10.2026

Einkäufe schalten die Rentabilität mit einem einzelnen beschrifteten Ein-/Aus-Button. Der dauerhafte erklärende Hilfstext entfällt; Ladefehler und Wiederholen bleiben sichtbar, wenn erforderlich.

Artikelzeilen öffnen über freie Flächen dasselbe Detailziel wie der Artikellink. Eingebettete Bedienelemente behalten ihre eigene Aktion. Artikel und Verkäufe bündeln die Zeilenaktionen in `app-table-action-menu`: ein Drei-Punkte-Button, kompakte beschriftete Einträge, Schließen außerhalb und mit Escape sowie Rückfokus. Desktop und mobile Darstellung verwenden dieselben Aktionen.

Verkaufstitel werden mit Auslassungspunkten gekürzt. Verkaufsnummer und Plattform haben eigene Spalten und werden beim Ausblenden nicht in die Artikelzelle verschoben. Bekannte Plattformen erscheinen als Logo mit zugänglichem Namen; eigene Plattformen ohne Logo als Text. Gewinn und Verkäufe übernehmen die Kennzahlendarstellung der Übersicht über `app-summary-metric` und dieselbe gemeinsame Kartenvariante. Dies sind Flipbase-Webentscheidungen, keine neuen Apple-Originalmaße.

Ergänzung vom 23.10.2026: Die Warenwirtschaft heißt und folgt auf Desktop und Mobil **Einkäufe → Verkäufe → Bestand**. Bestand verwendet das Paket-Icon. Der Seitenkopf des Bestands nutzt dieselbe Standardvariante wie Einkäufe und Verkäufe; die größere und fettere Inhaltsvariante entfällt dort. Artikel bleiben die verwalteten Objekte, daher bleiben fachliche Aktionen wie „Artikel erstellen“ bestehen.

Verkaufserfassung: Neue Verkäufe starten ohne ausgewählte Plattform; vor dem Speichern ist eine Auswahl erforderlich. Erst die Auswahl zeigt den passenden Versandbereich. Vinted zeigt einen kurzen Hinweis zur Abwicklung über Vinted, ohne Eingaben zu Versand und Plattformgebühr. Direktverkauf, Shop und „Andere“ bieten bei eigenem Versand ausschließlich erhaltenes Käuferporto und tatsächliche Versandkosten; bei Abholung entfallen diese Felder. Euro-Einheiten stehen im Betragsfeld, nicht zusätzlich im sichtbaren Label. Bereits gespeicherte Beträge bleiben beim Bearbeiten sichtbar; importierte eBay-Bestellungen behalten ihre ausdrückliche Kostenbestätigung.
