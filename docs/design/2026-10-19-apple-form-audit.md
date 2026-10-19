# Apple-Formulare: erneuter Quellen- und Umsetzungsabgleich

**Klarstellung nach Nutzerfeedback:** Dieser Bericht dokumentiert den damaligen Stand. Die Bewertung „Eigenschaften vor SEO“ war eine eigene Layoutinterpretation, keine verbindliche Apple-Vorgabe. Sie ist zurückgenommen: Designanpassungen erhalten die bestehende Anordnung; Eigenschaften stehen auf Desktop weiterhin rechts. Varianten und Suchmaschineneintrag bleiben erhalten. Die folgenden Messwerte bleiben als Historie bestehen.

**Folgeauftrag:** Die hier dokumentierten Befunde wurden anschließend mit Nutzerfreigabe als [gemeinsame Formulargrundlagen](../superpowers/plans/2026-10-19-apple-form-foundation.md) umgesetzt. Die folgenden Ist-Werte beschreiben den Zustand vor dieser Umsetzung. Neue gemessene Werte stehen in [apple-form-implementation-measurements.json](apple-form-implementation-measurements.json); verbindlich ist die [aktuelle Flipbase-Richtlinie](admin-ui-guidelines.md).

Stand: 19.10.2026. Auftrag: Vor weiteren Seitenumbauten die bisherige Recherche, Formularmuster, Felder, Abstände, Schrift, Buttons und Aktionen erneut gegen Apple prüfen. **Recherche und Bestandsprüfung; keine Anwendungsänderung.**

## Ergebnis

Der aktuelle Stand ist eine Apple-orientierte Webgestaltung mit funktional geprüften Abläufen. Eine durchgängige visuelle Formularabnahme ist damit noch nicht belegt. Gemeinsame Formularrollen fehlen teilweise; einzelne Komponenten und globale Regeln legen dieselben Eigenschaften mehrfach fest. Diese Ursachen müssen vor der nächsten Seitenmigration gemeinsam korrigiert werden.

Apple beschreibt unterschiedliche Formularmuster und plattformspezifische Controls. Es gibt keinen einzelnen Apple-Webformularstandard, aus dem alle CSS-Abstände, Radien und Positionsregeln unverändert übernommen werden können. Besonders UIKit, AppKit, SwiftUI und die jeweiligen Formularstile müssen auseinandergehalten werden.

## Quellen und Gültigkeit

Am 19.10.2026 direkt von developer.apple.com gelesen: 17 HIG-Seiten, sechs SwiftUI-API-Seiten sowie UIKit und AppKit. Die offiziellen Markdown-/Dokumentationsdaten sind lokal unter .superpowers/dev-live/apple-form-audit-20261019 zwischengespeichert. Der Webleser konnte die von Apple angebotenen Markdown-Antworten nicht verarbeiten; der direkte Abruf war erfolgreich.

| Grundlage                                                                                                                                                                                                                                                                                                                                                                        | Aussage und Verwendung                                                                                                                                                               |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [Apple Design Resources](https://developer.apple.com/design/resources/)                                                                                                                                                                                                                                                                                                          | Listet aktuell macOS 27 und iOS/iPadOS 27 mit getrennten Kits. Die macOS-Verknüpfung verweist auf die Community-Datei1651309434229735362.                                            |
| [AppKit](https://developer.apple.com/documentation/appkit), [UIKit](https://developer.apple.com/documentation/uikit)                                                                                                                                                                                                                                                             | AppKit beschreibt macOS-Oberflächen; UIKit beschreibt iOS/iPadOS/tvOS und weitere unterstützte Laufzeiten. Mac Catalyst macht UIKit nicht zu einem universellen Desktop-Webstandard. |
| [Form](https://developer.apple.com/documentation/swiftui/form), [FormStyle](https://developer.apple.com/documentation/swiftui/formstyle)                                                                                                                                                                                                                                         | Native Formulare passen ihr Aussehen an Plattform und Stil an.                                                                                                                       |
| [ColumnsFormStyle](https://developer.apple.com/documentation/swiftui/columnsformstyle), [GroupedFormStyle](https://developer.apple.com/documentation/swiftui/groupedformstyle), [LabeledContent](https://developer.apple.com/documentation/swiftui/labeledcontent)                                                                                                               | Zwei unterschiedliche Anordnungen sind ausdrücklich vorgesehen. Die Label-/Control-Beziehung soll über einen gemeinsamen Container bestehen.                                         |
| [Text fields](https://developer.apple.com/design/human-interface-guidelines/text-fields), [Text views](https://developer.apple.com/design/human-interface-guidelines/text-views), [Labels](https://developer.apple.com/design/human-interface-guidelines/labels)                                                                                                                 | Feldzweck, lesbare Beschriftung, zusammengehörige Abstände und passende Eingabelänge.                                                                                                |
| [Layout](https://developer.apple.com/design/human-interface-guidelines/layout), [Typography](https://developer.apple.com/design/human-interface-guidelines/typography), [Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility)                                                                                                             | Hierarchie, Lesbarkeit, plattformspezifische Größen und anpassbare Anordnung.                                                                                                        |
| [Buttons](https://developer.apple.com/design/human-interface-guidelines/buttons), [Alerts](https://developer.apple.com/design/human-interface-guidelines/alerts), [Sheets](https://developer.apple.com/design/human-interface-guidelines/sheets), [Modality](https://developer.apple.com/design/human-interface-guidelines/modality)                                             | Rollen, Rückmeldung, Bestätigungs-/Abbruchaktionen und begrenzte modale Aufgaben.                                                                                                    |
| [Pop-up buttons](https://developer.apple.com/design/human-interface-guidelines/pop-up-buttons), [Combo boxes](https://developer.apple.com/design/human-interface-guidelines/combo-boxes), [Menus](https://developer.apple.com/design/human-interface-guidelines/menus)                                                                                                           | Einzelauswahl, editierbare Auswahl, Mehrfachauswahl und Aktionsmenüs getrennt behandeln.                                                                                             |
| [Toolbars](https://developer.apple.com/design/human-interface-guidelines/toolbars), [Materials](https://developer.apple.com/design/human-interface-guidelines/materials), [Designing for macOS](https://developer.apple.com/design/human-interface-guidelines/designing-for-macos), [Entering data](https://developer.apple.com/design/human-interface-guidelines/entering-data) | Bedienelemente nach Aufgabe gruppieren, Informationsaufwand begrenzen und Materialwirkung passend zum Kontext einsetzen.                                                             |

Die vom Nutzer bereitgestellte Figma-Datei mBbHXoMOjwhqC1y6eYLk1b ist eine zugängliche Kit-Kopie. Identität ihrer Version mit der aktuellen offiziellen Veröffentlichung ist in diesem Schritt nicht nachgewiesen. Der erneute Figma-Aufruf meldet ein ausgeschöpftes Starter-Zugriffslimit. **Keine frische Kit-Messung und keine native Gerätemessung behaupten.** Die bisherigen K-Werte bleiben als frühere Kit-Auswertung gekennzeichnet; neue Zahlen daraus werden nicht erfunden.

Quellenklassen bleiben: A = dokumentierte Apple-Aussage, K = konkretes Kit-Beispiel, M = Messung auf einem nativen Apple-Gerät, F = Flipbase-Webentscheidung. Die folgenden Browsermessungen beschreiben den Ist-Stand von Flipbase unter Windows, keine M-Werte.

## Was die Quellen für Formulare tatsächlich festlegen

### Aufbau und Ausrichtung

SwiftUI unterscheidet unter anderem:

- **Columns:** Beschriftungen stehen in einer am Ende ausgerichteten Spalte, Werte in einer am Anfang ausgerichteten Nachbarspalte.
- **Grouped:** Beschriftungen stehen am Anfang, Controls am Ende einer Zeile; zusammengehörige Zeilen bilden sichtbare Gruppen.

Diese Varianten sind keine gegensätzlichen Versionen desselben Standards. Sie dienen unterschiedlichen Aufgaben. Der aktuelle Produkteditor mit Beschriftungen oberhalb seiner Felder ist eine Webeditor-Anordnung. Er ist nicht allein durch abgerundete Karten ein nativer grouped-Form-Nachbau.

Die HIG zu Textfeldern empfiehlt geordnete, möglichst vertikale Feldfolgen, konsistente Breiten und eine klare Zuordnung von Label und Eingabe. Kurze zusammengehörige Werte können nebeneinander stehen; lange Beschreibungstexte erhalten eine größere Texteingabe. Die Lesereihenfolge muss auch bei schmaler Ansicht und Tastaturbedienung sinnvoll bleiben.

### Abstände

Apple fordert nachvollziehbare Gruppen, Ausrichtung und genügend Abstand zwischen Controls. Die aktuelle Layout-HIG legt **kein universelles 8px-Webraster** und keine allgemeine Formular-Kartenpolsterung von20 oder24px fest. Plattformtabellen zu tvOS oder visionOS sind keine Desktop-Formularmaße.

Der früher gelesene 8px-Innenabstand einer Kit-Texteingabe ist ein horizontaler Beispielwert. Er belegt keinen 8px-Abstand zwischen allen Labels, Feldern, Abschnitten und Buttons. Labelabstand, Feldabstand, Gruppenabstand und Kartenpolsterung benötigen getrennte Webrollen.

### Schrift

Die aktuelle englische HIG nennt als Standardtextgröße13pt für macOS und17pt für iOS/iPadOS. Das ist keine Anweisung, alle Webfelder auf allen Geräten mit13 CSS-Pixeln darzustellen. Native Punkte, CSS-Pixel und gerenderte Schriftmetriken werden getrennt erfasst.

Die [offizielle japanische Typografietabelle](https://developer.apple.com/jp/design/human-interface-guidelines/typography) enthält zusätzlich die macOS-Rollen Body13/16, Title3 15/20, Title2 17/22 und Large Title26/32, jeweils mit eigenen normalen und hervorgehobenen Gewichten. Diese Größen bestimmen nicht automatisch das Gewicht aller Feldlabels. Die aktuelle englische Fassung stellt diese vollständige macOS-Tabelle nicht gleichermaßen dar; die Herkunft der ergänzenden Tabelle bleibt sichtbar.

macOS unterstützt laut Typography-HIG kein Dynamic Type. Webzoom, reine Textvergrößerung und native iPad-Dynamic-Type-Prüfung sind daher unterschiedliche Nachweise.

### Buttons und Aktionen

Die Buttons-HIG verlangt erkennbare Rollen und einen sichtbaren gedrückten Zustand bei eigenen Buttons. Primär, Abbruch, sekundär und destruktiv dürfen nicht durch zufällige Färbung entstehen. Eine Hauptaktion wird hervorgehoben; die Markenfarbe bleibt #fcc601.

Für Alerts beschreibt Apple die Standardaktion am Ende einer horizontalen Zeile und Abbrechen davor. Für iOS/iPadOS-Sheets beschreibt die aktuelle HIG dagegen Abbrechen oben am Anfang und Fertig oben am Ende. Daraus folgt **keine allgemeine Regel, alle Webdialoge nach iPad-Art umzubauen**. Seitenaktionsleiste, Formulardialog und Warnung brauchen je ein festes Muster.

Die Accessibility-HIG nennt plattformspezifische Größen (macOS Standard28×28pt, iOS/iPadOS44×44pt) und getrennte Mindestwerte. Die Buttons-HIG formuliert zusätzlich eine allgemeine44×44pt-Trefferfläche. Diese kontextabhängigen Angaben begründen keine pauschale sichtbare Controlhöhe. Flipbases kompakte28px-Maus- und mindestens44px-Touchrollen bleiben ausdrücklich F.

### Auswahl und Fehler

Ein Pop-up-Button wählt einen Eintrag einer flachen Liste. Eine Combo Box verbindet Freitext und Vorschläge; das native Combo-Box-Muster gehört zu macOS. Kategoriebaum, Mehrfachauswahl und eine Aktion zum Anlegen eines neuen Datensatzes brauchen ergänzende, klar benannte Webmuster.

Hinweise, Pflichtangaben und Fehler werden nah am betroffenen Feld gezeigt. Inhalte sollen möglichst vorbefüllt werden. Zusätzlicher Text ist nur nötig, wenn er beim Ausfüllen oder bei einer Entscheidung hilft.

## Abgleich mit dem gerenderten Ist-Stand

Gemessen auf den vorhandenen Routen /catalog/:id und /inventory/:id mit Bearbeitungsmodal, identischen simulierten Daten,1440px Maus und834px Touch, jeweils Hell/Dunkel. Eingabemodus tatsächlich über pointer:coarse geprüft. Vier finale Messläufe erfolgreich. Keine echten Artikel geschrieben. Rohwerte und Quellenbelege: [apple-form-audit-measurements.json](apple-form-audit-measurements.json).

| Bereich                  | Tatsächlicher Befund                                                                                                        | Einordnung / nächste Korrektur                                                                                             |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Feldhöhe Desktop         | Name28px, Marke30px, Zustandsauswahl28px                                                                                    | Gleichrangige Text-/Suchfelder haben unbeabsichtigt verschiedene Außenhöhen. Einheitliche Größenrolle samt Padding.        |
| Touch                    | Felder und Speichern44px; Schrift bleibt13px                                                                                | Die Trefferfläche stimmt mit unserem bisherigen Webziel überein. Lesetextgröße benötigt eine gesonderte Touchentscheidung. |
| Beschriftungen           | Name600, Marke/Farbe500, sichtbares Modal-Titellabel510; jeweils13px/20px                                                   | Gleiche Rolle, verschiedene Gewichte. Ein gemeinsamer Feldrahmen muss die Beschriftung verantworten.                       |
| Innenabstand             | Normales Textfeld links12px; Select10px; früherer K-Feldbeleg8px                                                            | Rollenunterschiede sind nicht vollständig dokumentiert. Keine Behauptung eines durchgehend identischen Kit-Abstands.       |
| Label–Feld               | Name6px; Field-Komponente und andere Picker besitzen eigene Abstandsregeln                                                  | Kein Fehler allein wegen6px, aber kein zentraler Vertrag. Einen benannten Abstand verwenden.                               |
| Button gedrückt          | Bei „Variante hinzufügen“ sind Farbe, Hintergrund, Schatten, Deckkraft und Transform identisch zu Hover; beide Farbschemata | Sichtbare Press-Rückmeldung fehlt im geprüften Standardbutton. Gemeinsamen Zustand ergänzen.                               |
| Label-Zuordnung im Modal | Titelfeld besitzt zwei gleichlautende zugeordnete Labels, eines sichtbar und eines sr-only                                  | Label-Verantwortung vereinheitlichen; Doppelansage verhindern.                                                             |
| Reihenfolge834px         | SEO-Vorschau vor Eigenschaften wie Marke und Zustand                                                                        | Wichtige Artikeldaten vor optionale Suchmaschinenangaben; DOM-/Tastaturfolge gemeinsam korrigieren.                        |
| CSS-Verantwortung        | Klassen im Template, Größenberechnung im TS, globale form-/linear-input-Regeln und Tokens überlagern sich                   | Pro Eigenschaft eine maßgebliche Regel; globale Altüberschreibungen schrittweise auflösen.                                 |
| Schriftrollen            | Seite26/32 semibold, Abschnitt15/20 semibold, Dialog17/22 semibold                                                          | Bisherige F-Hierarchie ist erkennbar; die Gewichtswahl ist nicht pauschal ein nativer Apple-Originalwert.                  |
| Fenster und Auswahl      | Sheet-Radius16, Feld7, Select/Button6; Hell/Dunkel und Fokus vorhanden                                                      | Bereits definierte Rollen erhalten; sie ersetzen den fehlenden Formularvertrag nicht.                                      |

Die Bestandsprüfung bestätigt damit konkrete Unterschiede. Sie behauptet nicht, dass alle bisherigen Abstände falsch oder alle nativen Apple-Formulare identisch wären. Bestehende Funktions-/AXE-Prüfungen ersetzen die gestalterische Rollenabnahme nicht.

## Vorgabe für die nächste Umsetzung

### Gemeinsam festlegen

1. **Formularmuster:** Dateneingabe mit Labels oberhalb, Einstellungen mit gruppierten Zeilen und begrenzter Dialog als ausdrücklich benannte Containerrollen. Keine zufällige Rollenwahl pro Seite. Ein kompakter Columns-Dialog kommt nur mit passender geprüfter Referenz hinzu.
2. **Feldrahmen:** Ein wiederverwendbarer Baustein verantwortet Label, Pflichtkennzeichnung, Labelabstand, Hilfetext und Fehler. Text-, Zahlen-, Marken-, Kategorie- und Mehrfachauswahl behalten ihre fachlich unterschiedlichen Eingaben und nutzen denselben Feldrahmen. Bestehende ID-/CVA-Verbindungen erhalten.
3. **Schrift und Größen:** Normale/hervorgehobene Schriftrollen zentral benennen. Mausgröße und Touchgröße getrennt von der Schriftgröße führen.28px Maus und44px Touch sind bereits getroffene Webentscheidungen; Markenfeld30px ist kein zusätzlicher Standard.
4. **Abstände:** Eigene Rollen für Label–Feld, Feld–Feld, gekoppelte Kurzfelder, Abschnitt und Aktionsgruppe. Vorhandene6/12/16/20/24px-Werte vollständig zuordnen, keine neue pauschale Zahl als Apple-Vorgabe ausgeben.
5. **Aktionen:** Hauptaktion der Seite am Ende ihrer bestehenden Kopfaktionsleiste; Dialogaktionen in einer gemeinsamen, erreichbaren Abschlussgruppe; Abbruch vor Bestätigung. Das ist ein einheitliches Webmuster. iPadOS-Toolbarpositionen nicht stillschweigend damit vermischen.
6. **Zustände:** Normal, Hover, gedrückt, Fokus, gefüllt, ungültig, deaktiviert, schreibgeschützt, ladend und geöffnete Auswahl werden pro Rolle dokumentiert. Echte benötigte Sonderrollen bleiben ausdrücklich erkennbar.

**Offene gestalterische Zahlenentscheidungen:** Touch-Lesetextgröße und vollständige vertikale Abstandsleiter sind noch nicht als neue Zielwerte festgelegt. Der gemeinsame Feldlabel-Stil ist ebenfalls noch nicht endgültig gewählt. Eine weitere Umsetzung darf diese Punkte nicht durch neue lokale Klassen stillschweigend entscheiden.

### Reihenfolge gegen erneute Nacharbeit

- Zuerst gemeinsame Schrift-, Feld-, Abstands- und Aktionsrollen vervollständigen und ihre CSS-Verantwortung klären.
- Dann die vorhandenen gemeinsamen Komponenten in einem zusammenhängenden Schritt korrigieren; Press-Zustand und Labelzuordnung dabei mitbehandeln.
- Am tatsächlichen Artikeleditor, einem bestehenden Einstellungsformular und einem bestehenden Bearbeitungsdialog gleichzeitig prüfen. Keine neue Demo.
- Erst nach diesem gemeinsamen Sichtabgleich weitere Fachseiten angleichen. Die vollständige Abdeckung von Formularmustern steht vor dem nächsten seitenweisen Rollout.

## Abnahmekriterien

Jeder Zahlenwert besitzt Rolle, Plattform, Größe, Eingabemodus, Farbschema, Zustand, Einheit und Quelle. Native Gerätedaten ohne Messung bleiben leer. Ein CSS-Wert wird nicht allein durch Ähnlichkeit zu einem Apple-Originalwert.

Gleiche Rollen ergeben gleiche Schrift, Außenhöhe, Padding und Labelzuordnung. Ausnahmen wie Toolbar, Tabellenaktion oder ausdrücklich freigegebene Dashboard-Aktionen sind benannt. Fehler-/Lade-/Fokus-/Press-Zustände und lange deutsche Texte werden berücksichtigt.

Maus und Touch auch bei gleicher Fensterbreite prüfen, Hell/Dunkel jeweils mit eigener Systemfarbwahl. Eingaben, Selects, Kategoriebaum und Dialog gemeinsam testen. Vor der Messung endliche Übergänge abwarten. Vollständige Browservergrößerung und reine Textvergrößerung getrennt behandeln. Reale Safari-/iPad-/Mac-Prüfung bleibt als eigener Nachweis offen.

Der nächste Umsetzungsschritt benötigt gezielte bestehende Funktionsprüfungen und visuelle Geometrie-/Zustandsnachweise. Dieser reine Recherche-/Dokumentationsschritt verändert keine Anwendung, kein Backend und keine Veröffentlichung.
