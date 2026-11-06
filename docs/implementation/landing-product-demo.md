# Originalansichten in der Landingpage-Demo

Die Demo zeigt Ausschnitte der tatsächlich gerenderten Angular-Seiten mit
synthetischen Beispieldaten. Sie besitzt eine eigene Navigation für die
Landingpage; innerhalb der Seitenbilder werden keine Formulare nachgebaut.
Beide Vorschaugrößen behalten ihren eigenen ausgewählten Menüpunkt. Die Bilder
zeigen die deutschsprachige Produktoberfläche, ihre Alternativtexte sind Deutsch
und Englisch.

52 WebP-Aufnahmen decken 13 Ansichten jeweils auf Desktop (1280 Pixel) und Handy
(390 Pixel), hell und dunkel ab. Die Produktseiten einschließlich Tabellen,
Filterleisten, Kennzahlen, Diagrammen und Bildoptimierer kommen aus demselben
Anwendungsbau. Die Übersicht enthält fünf Verkäufe und einen Workspace ohne Shop.
Für die Aufnahmen werden nur Shell-Kopfzeile, Seitennavigation und globale
Benachrichtigungen ausgeblendet; die Landingpage stellt ihren bedienbaren Rahmen
separat dar. Die Seiteninhalte werden nicht umgestaltet.

Die Datei `landing/images/product-demo/manifest.json` dokumentiert automatisch
Routen, Quellkomponenten, Bildmaße, Integritätswerte und die aus dem Original
abgelesenen Dashboardwerte und Farben. Bildmaße beziehen sich auf die erzeugte
Bilddatei; ein gerundetes Browser-Rechteck kann um einen Pixel davon abweichen.

## Aufnahmen aktualisieren

Zuerst den aktuellen Anwendungsstand mit den gesperrten Abhängigkeiten und Node 22
bauen, anschließend im Repository ausführen:

```powershell
npm run build
node scripts/landing-demo-capture.mjs
```

Der Generator startet einen eigenen HTTP-Server auf einer freien lokalen Adresse,
öffnet eigene Chromium-Kontexte und nutzt die vorhandenen Marktplatz-Fixtures.
Zusätzliche synthetische Antworten befüllen Einkäufe, Verkäufe, Ausgaben, Feed und
Labelreferenzen. Sämtliche übrigen externen Anfragen werden abgewiesen. Eine echte
Anmeldung, Datenbank, Anbieterabfrage oder Dateiübertragung ist nicht erforderlich.

Einzelne Ansichten können gezielt aktualisiert werden, zum Beispiel:

```powershell
node scripts/landing-demo-capture.mjs purchases photos
```

Das aktualisiert auch die zugehörigen Manifest-Einträge. Wenn sich die Bildhöhe
ändert, die `width`-/`height`-Angaben der entsprechenden Desktopbilder in
`landing/index.html` anpassen. Die mobilen Quellen wechseln über `picture`;
Farbschema und Sprache bleiben an die bestehenden Schalter gekoppelt.

Nach einer Änderung der Produktansichten die betroffenen Aufnahmen erneut
aufnehmen und visuell vergleichen. Der Landingpage-Vertrag prüft alle Bilddateien,
Desktop-/Handy- und Hell-/Dunkelvarianten, Manifest-Verweise und Dashboardzahlen.
Die Browserprüfung bestätigt Navigation, Bildwahl, unabhängige Auswahl,
Tastaturbedienung, Touchgrößen, fehlende automatische Bewegung und AXE.
