# Bildoptimierer: professioneller Flipbase-Editor

**Datum:** 2026-08-24  
**Status:** freigegeben

## Ziel

Der Bildoptimierer bekommt einen ruhigen, verständlichen Workflow nach dem
Vorbild professioneller Bildeditoren, ohne deren Funktionsumfang zu kopieren.
`ngx-image-cropper` bleibt als technische Zuschneide-Engine; Flipbase besitzt
Oberfläche, Zustand, Vorschau und Export.

## Entscheidungen

- Der Cropper wird nicht ersetzt und nicht geforkt.
- Eine eigene Flipbase-Komponente kapselt seine API, sodass ein späterer
  Austausch möglich bleibt.
- Vorschau und Export verwenden dieselbe Zuschnitt- und Skalierungslogik.
- Bilder werden ausschließlich verkleinert. Ein kleiner Ausschnitt wird nie
  künstlich auf die nominelle Plattformgröße hochgerechnet.
- Jede Plattform behält ihren eigenen Ausschnitt.
- Der aktive Ausschnitt wird über ein großes Editorfenster, Verschieben,
  Zoomregler, Drehen, Zentrieren und Zurücksetzen bearbeitet.
- Die Bilderleiste bleibt rechts, wird auf 240–280 px verbreitert und zeigt
  vollständige, innenliegende Karten ohne überstehende Bedienelemente.
- Plattformvorschauen erhalten ein einheitliches Kartenraster. Die
  Bildöffnung zeigt weiterhin das echte Seitenverhältnis der Plattform.

## Editoraufbau

Oben stehen die Plattformen als deutlich getrennte Arbeitsziele. Darunter
liegt ein großes dunkles Editorfenster. Die Werkzeugleiste sitzt unmittelbar
unter dem Bild und enthält Drehen, Zoom, Zentrieren und Zurücksetzen. Eine
sekundäre Aktion übernimmt den aktiven Zuschnitt auf andere Plattformen.

Die rechte Bilderleiste zeigt je Bild eine breite Vorschau, Bildnummer und den
Status „Hauptbild“. Sortieren und Löschen stehen in einer normalen Fußzeile;
nichts liegt außerhalb der Karte. Auf schmalen Bildschirmen wird daraus eine
waagerechte Liste unter dem Editor.

Unterhalb des Arbeitsbereichs stehen gleich große Plattformkarten. Für die
eigentliche Bildöffnung wird ein vom gemeinsamen Renderpfad erzeugtes Blob
verwendet. Dadurch kann keine separate CSS-Koordinatenrechnung von Export und
Vorschau abweichen.

## Bildqualität

Aus Quellrechteck und maximaler Zielgröße wird ein Skalierungsfaktor
`min(1, zielBreite/quellBreite, zielHoehe/quellHoehe)` gebildet. Die
Ausgabemaße werden auf ganze Pixel gerundet und behalten das Plattformformat.
Die Oberfläche zeigt die tatsächlichen Ausgabemaße und eine knappe
Qualitätseinschätzung; Meldungen über eine geplante Vergrößerung entfallen.

## Bewusst nicht enthalten

- Filter, Text, Sticker, Retusche und Annotationen
- Undo/Redo-Verlauf
- ein eigenes veröffentlichtes npm-Paket
- ein eigener Gesten- und Geometrie-Kern

Die Komponenten werden dennoch so getrennt, dass eine spätere Auslagerung
oder ein Wechsel auf Cropper.js den Seiten-Workflow nicht neu schreiben muss.
