# Bildoptimierer Paket 2 – Design

**Datum:** 2026-08-28
**Status:** fachlich freigegeben, noch nicht implementiert
**Branch:** `feature/bildeditor-paket-2`, abgezweigt von `feature/bildeditor-anpassungen`

## Ziel

Der Bildoptimierer bekommt zwei Dinge, die in Paket 1 bewusst zurückgestellt wurden:

1. Er **zeigt**, welche Metadaten in einem Foto stecken – vor allem GPS-Koordinaten – und dass sie beim Export verschwinden.
2. Er erlaubt **Farb- und Belichtungskorrekturen** je Bild, sichtbar in derselben Vorschau, die auch den Export zeigt.

## Voraussetzung

Dieses Paket setzt auf `feature/bildeditor-anpassungen` auf. Der dortige Stand wird vorausgesetzt: englische Bezeichner, Smart-/Dumb-Trennung, `renderImage()` als einzige Canvas-Ausgabe für Vorschau und Export, `OptimizerImage` in `models/optimizer-image.ts`, reine Funktionen in `services/`.

## Ausgangslage

| Befund                                                                                                                                                | Bedeutung für dieses Paket                                                                                  |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Der Export läuft über eine Canvas-Zeichenfläche und schreibt die Datei neu. Dabei gehen **alle** Metadaten verloren – EXIF, XMP, IPTC und C2PA.       | Das Entfernen ist bereits Realität. Neu ist allein, es sichtbar zu machen.                                  |
| `renderImage()` in `services/image-renderer.ts` ist die einzige Stelle, an der Pixel ausgegeben werden, und wird von Vorschau **und** Export benutzt. | Ein dort gesetzter Filter wirkt zwangsläufig in beiden. Vorschau und Export können nicht auseinanderlaufen. |
| Unsichtbare Wasserzeichen (etwa SynthID) liegen in den Bildpunkten, nicht in den Metadaten. Sie überstehen Neukodieren, Zuschneiden und Skalieren.    | Sie werden **nicht** entfernt, und das Werkzeug behauptet das auch nirgends.                                |
| `exifr` deckt EXIF, XMP, IPTC und GPS ab, aber kein C2PA. Die offizielle C2PA-Bibliothek ist WASM-basiert und mehrere hundert Kilobyte groß.          | Bibliothek für den Hauptteil, ein kleines eigenes Stück für die C2PA-Feststellung.                          |
| Die Route `image-optimizer` wird verzögert geladen (eigener Chunk).                                                                                   | Eine neue Abhängigkeit belastet nur diesen Chunk, nicht den Erststart.                                      |

## Entscheidungen des Nutzers

- **Metadaten werden nur gelesen und angezeigt, nie geschrieben.** Begründung: eBay, Kleinanzeigen und Vinted rechnen hochgeladene Bilder neu durch und verwerfen dabei jede eingebettete Angabe. Ein Urheberfeld wäre nur auf der eigenen Festplatte wirksam.
- **Anpassungen gelten je Bild**, mit einem Knopf, der sie auf alle übrigen überträgt – dasselbe Muster wie „Auf andere Plattformen übernehmen" beim Zuschnitt.
- **Für das Auslesen wird eine erprobte Bibliothek verwendet** (`exifr`) statt eines eigenen Parsers.

## Teil 1: Metadaten anzeigen

### Datenmodell

```ts
export type MetadataStatus = 'pending' | 'read' | 'unsupported' | 'failed';

export interface AiProvenance {
  /** Ein C2PA-Herkunftsnachweis liegt vor. Nur festgestellt, nicht geprüft. */
  readonly contentCredential: boolean;
  /** XMP `digitalSourceType`, falls gesetzt – etwa `trainedAlgorithmicMedia`. */
  readonly declaredSource: string | null;
}

export interface ImageMetadata {
  readonly status: MetadataStatus;
  readonly gps: { readonly latitude: number; readonly longitude: number } | null;
  readonly cameraMake: string | null;
  readonly cameraModel: string | null;
  /** ISO 8601, oder null. */
  readonly capturedAt: string | null;
  readonly software: string | null;
  readonly ai: AiProvenance;
}
```

Die vier Zustände sind fachlich verschieden und dürfen nicht zusammenfallen:

- `pending` – noch nicht ausgewertet
- `read` – ausgewertet; sind alle Felder leer, enthält die Datei **nachweislich** nichts
- `unsupported` – kein JPEG, es wurde nicht ausgewertet
- `failed` – Auswertung fehlgeschlagen

„Nichts gefunden" und „konnte nicht nachsehen" sind für den Nutzer zwei verschiedene Aussagen. Sie werden auch verschieden formuliert.

### Auslesen

`services/metadata-reader.service.ts` kapselt `exifr` vollständig. Kein anderer Teil des Codes kennt die Bibliothek. Der Dienst liefert ausschließlich `ImageMetadata`.

- Ausgelesen werden nur die oben genannten Felder. `exifr` wird mit einer ausdrücklichen Feldliste aufgerufen, nicht mit der Voreinstellung.
- **Fehler werden nie durchgereicht.** Jeder Fehlschlag wird zu `status: 'failed'`. Ein Foto mit kaputtem Header darf den Editor nicht stören.
- Nicht-JPEG-Dateien ergeben `status: 'unsupported'`, ohne die Bibliothek überhaupt aufzurufen.
- Das Auslesen läuft nach dem Hochladen im Hintergrund, nach demselben Muster wie die vorhandene Ermittlung der Bildgröße.

Gelesen wird aus `image.file`, der unveränderten Originaldatei. Eine Drehung erzeugt zwar eine neue `dataUrl`, lässt `file` aber unberührt – die Metadaten müssen deshalb nach einer Drehung **nicht** neu gelesen werden und der Stand kann nicht veralten.

**Bündelgrenze:** Der Chunk des Bildoptimierers darf durch `exifr` um höchstens **80 kB roh** wachsen. Wird das überschritten, ist auf eine kleinere Ausgabevariante der Bibliothek zu wechseln. Die Größe wird vor und nach dem Einbau gemessen und im Änderungsprotokoll festgehalten.

### C2PA feststellen

`services/c2pa-detection.ts`, eigener Code, weil keine leichtgewichtige Bibliothek das abdeckt.

Die Funktion läuft die JPEG-Abschnitte entlang und sucht in `APP11`-Segmenten (`0xFFEB`) nach einer JUMBF-Box, deren Kennung `c2pa` lautet. Sie liefert nur einen Wahrheitswert.

Bewusst **nur Feststellung, keine Prüfung**: Ob die Signatur gültig ist und von wem sie stammt, beantwortet dieser Code nicht. Die Oberfläche formuliert entsprechend vorsichtig.

Ein bloßes Suchen nach der Zeichenfolge `c2pa` in der ganzen Datei wäre falsch – ein Dateiname oder ein Kommentar könnte sie enthalten. Deshalb der Weg über die Segmentstruktur.

### Anzeige

Eine Komponente `components/metadata-panel/` unterhalb des Editors, für das jeweils aktive Bild. Sie zeigt die gefundenen Angaben und darunter den Satz:

> **Diese Angaben werden beim Export entfernt.** Die Exportdateien enthalten weder EXIF- noch
> XMP- oder Herkunftsdaten. Erhalten bleibt nur ein Farbprofil, das der Browser fuer die richtige
> Farbdarstellung anlegt.

Das ist wahr und gilt schon heute.

**Nicht geschrieben wird** – in keiner Formulierung – dass ein Bild nach dem Export nicht mehr als KI-Bild erkennbar sei. Liegt ein Herkunftsnachweis vor, steht dort zusätzlich:

> Unsichtbare Wasserzeichen im Bild selbst bleiben erhalten. Sie lassen sich durch Zuschneiden oder Neuspeichern nicht entfernen.

Je Status eine eigene Formulierung: bei `read` ohne Funde „Keine Metadaten enthalten"; bei `unsupported` „Nur JPEG-Dateien werden ausgewertet"; bei `failed` „Die Metadaten ließen sich nicht lesen".

### GPS-Hinweis in der Bilderliste

Enthält ein Bild GPS-Koordinaten, trägt seine Kachel in der Bilderliste einen deutlichen Hinweis. Das ist der eigentliche Alltagsnutzen: Man sieht ohne Klick, welches Foto die eigene Adresse mitbringt.

Der Hinweis ist eine Aussage, kein Alarm – die Koordinaten fliegen beim Export ohnehin raus. Formulierung entsprechend sachlich, und für Screenreader mit einer sprechenden Beschriftung.

## Teil 2: Farbe und Belichtung

### Datenmodell

```ts
export interface Adjustments {
  /** 0.5 bis 1.5, Standard 1. */
  readonly brightness: number;
  /** 0.5 bis 1.5, Standard 1. */
  readonly contrast: number;
  /** 0 bis 2, Standard 1. */
  readonly saturation: number;
  /** 0 bis 1, Standard 0. */
  readonly grayscale: number;
}
```

`OptimizerImage` erhält die Felder `adjustments: Adjustments` und `metadata: ImageMetadata`.

### Reine Funktionen

`services/adjustments.ts`:

- `defaultAdjustments()` – die neutralen Werte
- `isDefault(a)` – ob nichts verändert wurde
- `toFilterString(a)` – der CSS-Filterausdruck, oder **eine leere Zeichenkette**, wenn `isDefault(a)`
- `clampAdjustments(a)` – begrenzt jeden Wert auf seinen Bereich

Die leere Zeichenkette bei Standardwerten ist Absicht: Es wird dann gar kein Filter gesetzt. Ein gesetzter Filter kostet Rechenzeit und kann die Ausgabe minimal verändern, auch wenn er rechnerisch neutral ist.

### Anwendung beim Rendern

`renderImage()` bekommt einen optionalen Filterausdruck. Die Reihenfolge im Code ist entscheidend:

1. weißen Grund zeichnen – **ohne** Filter
2. Filter setzen
3. Bild zeichnen
4. Filter zurücksetzen

Würde der weiße Grund mitgefiltert, färbte ihn `brightness(0.8)` grau ein, und jedes Bild bekäme einen grauen Rand statt eines weißen. Der Grund existiert genau deshalb, weil durchsichtige Bereiche sonst beim JPEG-Kodieren schwarz würden.

Weil Vorschau und Export dieselbe Funktion benutzen, zeigt die Vorschau danach zwangsläufig das Exportergebnis.

### Bedienung

`components/adjustment-controls/`: vier Schieberegler, ein Knopf „Zurücksetzen" und ein Knopf **„Auf alle Bilder übernehmen"**.

Die Bedienelemente stehen **bei der Exportvorschau**, nicht beim Zuschnitt-Editor. Das ist eine bewusste Aufteilung: Der Editor ist für die Geometrie zuständig, die Vorschaukarten zeigen das Ergebnis. Beim Ziehen an einem Regler aktualisieren sich die Karten und zeigen exakt, was der Export liefert.

**Der Zuschnitt-Editor bleibt ungefiltert.** Ein Filter auf dem Cropper würde auch dessen Rahmen und Abdunklung einfärben, weil die Bibliothek kein Einhängen am inneren Bild vorsieht, ohne in fremdes CSS zu greifen. Das wäre irreführender als hilfreich.

Die Regler sind mit Tastatur bedienbar, jeder mit einer sichtbaren Beschriftung und dem aktuellen Wert.

### Was nicht eingebrannt wird

Die Werte bleiben Zahlen am Bild. Sie werden **nie** in `dataUrl` hineingerechnet.

Der Grund ist derselbe wie beim Drehen, wo er teuer gelernt wurde: Wer vom letzten Ergebnis statt vom Original weiterrechnet, kodiert bei jedem Schritt erneut als JPEG und verliert sichtbar Schärfe. Außerdem bliebe eine eingebrannte Korrektur nicht rücknehmbar.

## Aufbau

| Datei                                                      | Verantwortung                                                                                                                                                                   |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `models/image-metadata.ts`                                 | **Neu.** `ImageMetadata`, `MetadataStatus`, `AiProvenance`                                                                                                                      |
| `models/image-adjustments.ts`                              | **Neu.** Der Typ `Adjustments`. Bewusst anders benannt als der Dienst darunter – zwei Dateien namens `adjustments.ts` in zwei Ordnern wären eine Stolperfalle beim Importieren. |
| `services/metadata-reader.service.ts`                      | **Neu.** Kapselt `exifr` vollständig                                                                                                                                            |
| `services/c2pa-detection.ts`                               | **Neu.** Feststellen eines Herkunftsnachweises                                                                                                                                  |
| `services/adjustments.ts`                                  | **Neu.** Reine Funktionen über `Adjustments`                                                                                                                                    |
| `components/metadata-panel/`                               | **Neu.** Anzeige für das aktive Bild                                                                                                                                            |
| `components/adjustment-controls/`                          | **Neu.** Die vier Regler                                                                                                                                                        |
| `services/image-renderer.ts`                               | Nimmt einen Filterausdruck entgegen                                                                                                                                             |
| `models/optimizer-image.ts`                                | Zwei neue Felder                                                                                                                                                                |
| `components/preview-grid/`, `components/platform-preview/` | Reichen den Filter durch                                                                                                                                                        |
| `components/image-list/`                                   | GPS-Hinweis auf der Kachel                                                                                                                                                      |
| `image-optimizer.component.*`                              | Verdrahtung, Übertragen auf alle Bilder                                                                                                                                         |

Alle neuen Komponenten sind Dumb Components mit `input()`/`output()`. Die Dienste kennt nur die Smart Component.

## Fehlerbehandlung

- Ein Fehlschlag beim Auslesen erzeugt `status: 'failed'` und sonst nichts. Keine Meldung, kein roter Toast – die Metadaten sind eine Zusatzinformation, ihr Fehlen darf die Arbeit nicht unterbrechen.
- Ungültige Reglerwerte werden begrenzt, nicht abgelehnt.
- Der Export verhält sich unverändert: zu kleine Ausschnitte brechen weiterhin mit einer Meldung ab, es wird nie hochskaliert.

## Barrierefreiheit

- Jeder Regler mit `<label for>`, sichtbarem Wert und Tastaturbedienung.
- Der GPS-Hinweis mit einer sprechenden Beschriftung, nicht nur farblich.
- Das Metadatenfeld als Liste ausgezeichnet, nicht als freier Text.
- Weiterhin AXE und WCAG AA.

## Prüfung

| Prüfung                                         | Gegenstand                                                                                                                                                                          |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `adjustments.spec.ts`                           | Standardwerte, Begrenzung, leerer Filterausdruck bei Standard, korrekter Ausdruck bei Abweichung                                                                                    |
| `c2pa-detection.spec.ts`                        | Selbst gebaute Bytefolgen: mit Nachweis, ohne, mit `c2pa` an einer Stelle außerhalb eines APP11-Segments (darf **nicht** anschlagen)                                                |
| `metadata-reader.service.spec.ts`               | Die Übersetzung von Bibliotheksergebnis nach `ImageMetadata`, alle vier Zustände, Fehler werden gefangen                                                                            |
| `image-renderer.spec.ts`                        | Der weiße Grund bleibt weiß, wenn ein abdunkelnder Filter gesetzt ist                                                                                                               |
| Ein echtes Foto mit GPS, in der Browser-Abnahme | Belegt, dass die Bibliothek richtig angebunden ist. Bewusst kein mitgeliefertes Binaerbild: Ein von Hand gebauter EXIF-Bytestrom haette viele Fehlerquellen und wenig Aussagekraft. |

Die Trennung ist beabsichtigt: Unsere eigene Übersetzungsschicht wird mit erfundenen Bibliotheksergebnissen geprüft, die Anbindung selbst mit genau einer echten Datei. Ein nachgebauter Bytestrom würde bei einem Parser wenig beweisen.

Am Ende einmal Typprüfung, vollständige Suite, Produktionsbau und eine Abnahme im Browser.

## Abnahmekriterien

1. Ein Foto mit GPS zeigt die Koordinaten im Metadatenfeld und einen Hinweis auf seiner Kachel in der Bilderliste.
2. Ein Foto ohne Metadaten zeigt „Keine Metadaten enthalten" – unterscheidbar von „ließen sich nicht lesen".
3. Eine PNG-Datei zeigt „Nur JPEG-Dateien werden ausgewertet" und erzeugt keinen Fehler.
4. Eine beschädigte Datei erzeugt `failed` und stört den Editor nicht.
5. Ein Bild mit C2PA-Nachweis wird als solches ausgewiesen, samt Hinweis auf verbleibende unsichtbare Wasserzeichen.
6. Nirgends in der Oberfläche steht, ein Bild sei nach dem Export nicht mehr als KI-Bild erkennbar.
7. Die exportierten Dateien enthalten weiterhin keine Metadaten – durch Auslesen einer Exportdatei belegt.
8. Ein Regler verändert die Exportvorschau sichtbar und sofort.
9. Die Exportdatei entspricht dem, was die Vorschau zeigt. **Nachweis:** Bei `brightness` auf 0,6 wird die mittlere Helligkeit des Vorschaubildes und der Exportdatei gemessen; beide liegen im selben Bereich und deutlich unter dem unveränderten Bild.
10. Der weiße Grund bleibt bei abdunkelndem Filter weiß. **Nachweis:** Ein Bild mit durchsichtigen Bereichen wird bei `brightness` 0,6 exportiert; die Randpixel sind weiß (255, 255, 255), nicht grau.
11. „Auf alle Bilder übernehmen" überträgt die Werte auf jedes Bild.
12. Verstellen und anschließendes Zurücksetzen ergibt eine Exportdatei, die **Byte für Byte** mit einer Datei übereinstimmt, die ohne jedes Verstellen entstanden ist. Das belegt zugleich, dass die Werte nie eingebrannt werden – wäre eine Anpassung ins Bild gerechnet worden, wäre das Ergebnis ein anderes.
13. Der Chunk des Bildoptimierers wächst durch `exifr` um höchstens 80 kB roh. Die Größe wird vor und nach dem Einbau gemessen.
14. Außerhalb von `src/app/features/image-optimizer/` ändert sich kein Quelltext, abgesehen von `package.json` und `package-lock.json` für die neue Abhängigkeit.

## Nicht Bestandteil

- **Metadaten schreiben.** Ausdrücklich abgewählt.
- **Entfernen von KI-Wasserzeichen.** Technisch nicht verlässlich möglich; die Verfahren sind gegen Neukodieren, Zuschneiden und Skalieren gebaut. Was sie beschädigt, zerstört auch das Produktfoto. Ein Werkzeug, das gezielt Herkunftsnachweise tilgt, wäre zudem darauf angelegt, KI-Bilder als echte Artikelfotos auszugeben – das Gegenteil dessen, wofür Verkaufsbilder da sind.
- **Prüfen** eines C2PA-Nachweises. Es wird nur festgestellt, dass einer vorliegt.
- **Schärfen.** Über den Filterweg nicht erreichbar, braucht ein eigenes Rechenverfahren.
- **Weißabgleich beziehungsweise Wärme.** Verlangt eine Farbmatrix statt der einfachen Filter. Als eigener Nachtrag denkbar.
- **Andere Formate als JPEG** beim Auslesen.
