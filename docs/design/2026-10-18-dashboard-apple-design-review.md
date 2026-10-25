# Dashboard: Apple-Designrichtlinien und Bewertung des Bildentwurfs

Stand: 18. Oktober 2026. Recherche und Gestaltungsvorschlag von Juna.

## Auftrag und bisherige Entscheidung

Der Nutzer findet Farben und Gestaltung des Diagramms im ersten Bildentwurf
angenehm und ruhiger. Er fragt, ob auch Karten und Buttons tatsächlich die
Apple-Gestaltung widerspiegeln, und bittet um genauere Recherche.

Die positive Rückmeldung betrifft das Diagramm. Sie ist keine Freigabe für eine
Produktumsetzung oder den Austausch der bisherigen Verwaltungsrichtlinie.
Die bestehende Shopify-Referenz bleibt davon unberührt.

## Ergebnis

Der erste Entwurf verwendet klare Hierarchie und reduzierte Inhalte, arbeitet
die aktuelle Apple-Gestaltung der Bedienelemente aber noch nicht ausreichend aus.
Gleichmäßig umrandete weiße Karten, breite rechteckige Aktionskacheln und eine
flache Seitenleiste ergeben allein keine besonders erkennbare macOS-Anmutung.
Das ist eine gestalterische Bewertung des Bildes, keine gemessene Abweichung
von einer Apple-Komponente.

Als Bezug für die Desktopübersicht ist macOS sinnvoll. Hinweise für iPhone,
Apple Watch oder visionOS dürfen nicht pauschal auf die Weboberfläche übertragen
werden. Auch eine Webnachbildung von Unschärfe ist kein vollständiger Ersatz für
das dynamische native Liquid-Glass-Material.

## Was die offiziellen Quellen konkret sagen

- **Materialien:** Liquid Glass bildet eine eigene Ebene für Navigation und
  Bedienelemente. Apple rät ausdrücklich davon ab, es als Material der
  Inhaltsebene einzusetzen, und empfiehlt einen sparsamen Einsatz. Größere
  textreiche Elemente brauchen eine ausreichend deckende Materialwirkung.
  [Apple HIG: Materials](https://developer.apple.com/design/human-interface-guidelines/materials)
- **Buttonformen auf dem Mac:** Kleine bis mittlere Steuerelemente behalten
  abgerundete Rechtecke. Große und besonders große Buttons verwenden
  Kapselformen. Daher wäre „alle Apple-Buttons müssen pillenförmig sein“ falsch.
  Apple beschreibt außerdem aufeinander abgestimmte innere und äußere Radien.
  [Apple WWDC25: Get to know the new design system, ab 3:49](https://developer.apple.com/videos/play/wwdc2025/356/?time=229)
- **Gewichtung der Aktionen:** Hervorgehobene Stile sollen die wahrscheinlichen
  Hauptaktionen kenntlich machen; nicht jede Aktion soll gleich laut erscheinen.
  Gleiche Größen innerhalb einer Auswahl erleichtern den Vergleich. Eigene
  Buttons brauchen einen erkennbaren gedrückten Zustand.
  [Apple HIG: Buttons](https://developer.apple.com/design/human-interface-guidelines/buttons)
- **Mac-Bedienelemente und Werkzeugleisten:** Glas kann die Werkzeugleiste über
  den Inhalt heben. Zusammengehörige Aktionen werden gruppiert. Unterschiedliche
  Farbstärken können Wichtigkeit zeigen, ohne andere Aktionen zu überdecken.
  [Apple WWDC25: Build an AppKit app with the new design](https://developer.apple.com/videos/play/wwdc2025/310/)
- **Gruppierung:** Hierarchie soll durch Anordnung und sinnvolle Gruppen
  erkennbar sein. Zusätzliche Hintergründe und Rahmen an Werkzeugleisten können
  dadurch überflüssig werden. Verschachtelte Formen sollen geometrisch
  zusammenpassen.
  [Apple WWDC25: Get to know the new design system](https://developer.apple.com/videos/play/wwdc2025/356/)
- **Diagramme:** Die Daten sollen stärker hervortreten als Achsen und
  Beschriftungen. Die Darstellung muss auch ohne rein visuelle Wahrnehmung
  zugänglich sein. Eine bestimmte Gelb-Grau-Petrol-Palette wird damit nicht von
  Apple vorgeschrieben.
  [Apple HIG: Charts](https://developer.apple.com/design/human-interface-guidelines/charts)
- **Zugänglichkeit der Materialien:** Transparenz und Kontrast müssen auf
  entsprechende Systemeinstellungen reagieren; reduzierte Transparenz bedeutet
  deckende Hintergründe. Ein Bild belegt diese Verhaltensweisen nicht.
  [Apple: Testing system accessibility features in your app](https://developer.apple.com/documentation/accessibility/testing-system-accessibility-features-in-your-app)

## Konkrete Bewertung und Vorschlag für Flipbase

| Bereich               | Befund am ersten Entwurf                                                                                          | Vorschlag von Juna                                                                                                                                                                                            |
| --------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Kennzahlenkarten      | Alle vier weißen Rahmen betonen die Behälter stark; die zusätzlichen Icon-Kreise erzeugen weitere kleine Flächen. | Eine zusammengehörige Kennzahlengruppe mit vier klar getrennten Bereichen oder vier weich abgesetzte Karten erproben. Zahlen und Labels tragen die Hierarchie; dekorative Icon-Kreise reduzieren.             |
| Schnellaktionen       | Die sehr breiten Rechtecke mit Pfeilen wirken wie Navigationskacheln.                                             | Drei kompakte, gleich hohe Buttons ohne zusätzlichen äußeren Kartenrahmen. Große Buttons stärker abrunden; eine bewusste Hauptaktion gelb hervorheben. Welche Aktion Vorrang hat, ist noch nicht entschieden. |
| Filter                | Die Form ist funktional, aber die gemeinsame Werkzeugleiste ist wenig erkennbar.                                  | Zeitraum und Plattform zu einer ruhigen Steuergruppe zusammenfassen. Dezente Materialwirkung nur hier prüfen; auf der neutralen Dashboardfläche kann sie kaum sichtbar sein.                                  |
| Seitenleiste          | Flache Vollfläche mit harter Abgrenzung; wenig räumliche Trennung zum Inhalt.                                     | Eine leicht abgesetzte Materialfläche und klaren Auswahlzustand erproben. Keine dekorative Hintergrundgrafik allein für einen Glaseffekt hinzufügen.                                                          |
| Schriften und Symbole | Titel, KPI-Symbole und starke Beschriftungen konkurrieren teilweise um Aufmerksamkeit.                            | Abstufung der Gewichte verfeinern und die Symbolsprache vereinheitlichen. Konkrete Schriftgrößen oder Apple-Radien sind in dieser Recherche nicht vermessen.                                                  |
| Diagramm              | Ruhige Palette, gut sichtbare Balken und dezente Hilfslinien entsprechen der gewünschten Richtung.                | Gelb, Grau und Petrol als Flipbase-Vorschlag beibehalten; Werte zusätzlich durch Beschriftung und zugängliche Datendarstellung erklären.                                                                      |
| Interaktion           | Das statische Bild zeigt keine tatsächlichen Fokus-, Hover-, Druck- oder Übergangszustände.                       | In einer späteren Umsetzung konsistente Rückmeldungen, Tastaturbedienung und zurückhaltende Übergänge ausarbeiten.                                                                                            |

Die Kennzahlengruppe und die kompakteren Schnellaktionen sind abgeleitete
Gestaltungsvorschläge, keine von Apple vorgeschriebenen Dashboard-Bausteine.
Es wurden keine Apple-Originalmaße oder universellen Kartenradien ermittelt.

## Empfohlene Richtung für einen weiteren Entwurf

Die Chartpalette erhalten. Inhalte ruhig und weitgehend deckend darstellen.
Rahmen und verschachtelte Kacheln reduzieren. Die drei Schnellaktionen als
zusammengehörige Buttons gestalten. Navigation und Filter stärker vom Inhalt
absetzen; transparente Materialien gezielt und mit lesbarer deckender
Alternative verwenden. Der Desktop bleibt ausreichend kompakt; Touchflächen
werden bei Bedarf unabhängig von der sichtbaren Buttonfläche vergrößert.

Diese Richtung ist eine Apple-inspirierte Gestaltung für Flipbase im Browser,
keine Behauptung einer identischen nativen macOS-Oberfläche.

## Prüfumfang und Grenzen

Offizielle Apple-HIG und Herstellertranskripte gelesen und mit dem bereits im
Chat gezeigten generierten Bild verglichen. Keine native Referenzoberfläche
vermessen, keine neue Bildvariante erzeugt, keine Produktdateien geändert.
Fokus, Touchbedienung, Kontrastwerte und dynamische Materialien sind durch diesen
Bildvergleich nicht getestet. Keine Anwendungstests erforderlich.
