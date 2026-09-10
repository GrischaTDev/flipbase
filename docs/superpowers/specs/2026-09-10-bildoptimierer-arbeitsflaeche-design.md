# Bildoptimierer – Arbeitsfläche, Zuschnitt, Metadaten, Export

**Datum:** 2026-09-10
**Status:** fachlich freigegeben, noch nicht implementiert
**Branch:** `feat/image-optimizer-workspace`, abgezweigt von `origin/master` (b202795)

## Ziel

Der Bildoptimierer funktioniert fachlich, kostet im Alltag aber zu viel Weg:
Die Bilderliste klebt als schmale Spalte am rechten Rand, die Steuerelemente
und die Metadaten schieben die Seite in die Länge, der Vinted-Ausschnitt muss
bei jedem Handyfoto von Hand aufgezogen werden, und das ZIP muss nach jedem
Export erst entpackt werden.

Sieben Änderungen, alle innerhalb von `src/app/features/image-optimizer/` plus
eine neue geteilte Komponente:

1. Zweispaltige Arbeitsfläche mit verschiebbarem Trenner, Bilder rechts als Raster
2. Bildsteuerelemente als Leiste auf der Vorschau statt als Karte darunter
3. Erster Zuschnitt je Plattform immer maximal aus dem Vollbild
4. Metadaten im Modal statt als Block; Datumsangaben bleiben beim Export erhalten
5. Export als echte Ordner statt als ZIP
6. Durchgehende Nummerierung ohne `-main`
7. Exportvorschau und Plattformreiter zusammengelegt

## Ausgangslage

| Befund                                                                                                                                                                                                 | Bedeutung                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `image-optimizer.component.html` legt eine feste Aufteilung `minmax(0,1fr) 16rem` an. Die Bilderliste ist unter `lg` waagerecht scrollend, darüber eine senkrechte Spalte.                             | Der Raster-Umbau betrifft nur diese eine Gitterdefinition und `image-list`.                                    |
| Im Projekt gibt es keine Komponente für verschiebbare Trenner. `two-column-layout` kennt nur drei feste Verhältnisse.                                                                                  | Der Trenner wird neu gebaut und gehört nach `shared/`, nicht ins Feature.                                      |
| `ngx-image-cropper` bringt außer den Ziehgriffen am Rahmen **keine** eigene Bedienoberfläche mit. Zoom, Drehen und Zentrieren sind bereits eigene Knöpfe der Anwendung, die über `[transform]` wirken. | Eine Leiste auf dem Bild ist frei baubar; die Bibliothek steht dem nicht im Weg und muss nicht ersetzt werden. |
| `setCrop()` in `services/crops.ts` füllt jede noch leere Plattform per `deriveRect()` **aus dem Zuschnitt der aktiven Plattform**.                                                                     | Ursache des zu kleinen Vinted-Rahmens, siehe Rechnung unten.                                                   |
| Der Export rendert über eine Zeichenfläche (`image-renderer.ts`) und verliert dabei zwangsläufig alle Metadaten.                                                                                       | Selektives Erhalten heißt: hinterher wieder hineinschreiben, nicht „weniger löschen".                          |
| Übersteigt eine Datei `maxFileSizeMB`, kodiert `browser-image-compression` sie ein zweites Mal neu.                                                                                                    | Ein EXIF-Block muss **nach** diesem Schritt gesetzt werden, sonst wirft die Komprimierung ihn weg.             |
| `exportFileName()` hängt beim ersten Bild `-main` an die Nummer.                                                                                                                                       | Unterbricht die durchgehende Zahlenkette am Ende des Namens.                                                   |
| Die Route wird verzögert geladen (eigener Chunk).                                                                                                                                                      | Neue eigene Dateien belasten den Erststart nicht.                                                              |

### Warum der Vinted-Ausschnitt zu klein ist

Ein Handyfoto im Hochformat ist 3:4, also 0,75 breit zu hoch.

- eBay ist zuerst aktiv (1:1). Größtes Quadrat im Foto: **volle Breite**, 75 % der Höhe.
- Vinted (2:3 ≈ 0,667) wird aus diesem Quadrat abgeleitet: 0,667 × Quadratseite = **66,7 % der Fotobreite**.
- Direkt aus dem Vollbild wäre das größte 2:3-Rechteck: volle Höhe, **88,9 % der Breite**.

Es fehlen also gut 22 Prozentpunkte Breite, und zwar an beiden Rändern gleich –
genau das beschriebene „auf beiden Seiten größer ziehen".

## Entscheidungen des Nutzers

- **Ordner-Zugriff statt ZIP**, mit ZIP als stillem Rückfall dort, wo der Browser es nicht kann.
- **Leiste auf dem Bild mit Aufklapp-Panel** für die Farbregler.
- **Nur Datumsangaben** bleiben in der Exportdatei erhalten, sonst nichts.
- **Erster Zuschnitt immer maximal aus dem Vollbild.**
- **Grundname vorne, Nummer hinten** (`macbook-01.jpg`), führende Null bleibt.

### Aufgehobene Entscheidung aus Paket 2

`2026-08-28-bildeditor-paket-2-design.md` hält fest: „Metadaten werden nur
gelesen und angezeigt, **nie geschrieben**." Begründung damals: eBay,
Kleinanzeigen und Vinted rechnen hochgeladene Bilder neu durch und verwerfen
eingebettete Angaben, ein geschriebenes Urheberfeld wäre also wirkungslos.

Diese Begründung gilt weiterhin – für die **hochgeladene** Fassung. Sie greift
aber nicht für die Datei auf der eigenen Festplatte, und genau darum geht es
hier: Der Nutzer will seine Exportdateien im eigenen Archiv nach Aufnahmedatum
sortieren können. Die Entscheidung wird deshalb eingeschränkt aufgehoben:
geschrieben wird **ausschließlich** Aufnahme- und Erstelldatum, nie Urheber,
Gerät, Ort oder Software.

## Teil 1: Arbeitsfläche mit Trenner

### Neue geteilte Komponente `shared/components/split-pane/`

```ts
export class SplitPaneComponent {
  /** Anteil der linken Spalte in Prozent. Zweiweg-Bindung. */
  readonly ratio = model<number>(50);
  /** Schlüssel, unter dem die Position im Browser gemerkt wird. Leer = nicht merken. */
  readonly storageKey = input<string>('');
  readonly minRatio = input<number>(25);
  readonly maxRatio = input<number>(75);
  readonly leftLabel = input.required<string>();
  readonly rightLabel = input.required<string>();
}
```

Aufbau: `grid-template-columns: <ratio>% 0.75rem 1fr`. Zwei `ng-content`-Fächer
(`[left]`, `[right]`), dazwischen der Griff.

**Bedienung.** Ziehen mit Maus und Finger über Pointer Events. Der Griff ist
`role="separator"` mit `tabindex="0"`, `aria-orientation="vertical"`,
`aria-valuenow/min/max` und `aria-label`. Tastatur: Pfeil links/rechts ±2 %,
mit Umschalttaste ±10 %, `Pos1` auf `minRatio`, `Ende` auf `maxRatio`,
Doppelklick zurück auf 50 %. Das ist das vorgeschriebene Muster für
verschiebbare Trenner; ohne Tastaturbedienung fällt es durch AXE.

**Umbruch.** Unter `lg` (1024 px) wird das Gitter einspaltig, der Griff
verschwindet aus dem Baum (`@if`), nicht nur optisch. Die gemerkte Position
bleibt davon unberührt.

**Speicherung.** `ratio` landet unter `storageKey` im `localStorage`. Fehlende
oder unsinnige Werte fallen auf 50 zurück. Kein Absturz, wenn `localStorage`
nicht verfügbar ist (privates Fenster).

**Reine Funktionen** in `split-pane-ratio.ts`, damit ohne DOM prüfbar:

```ts
export function clampRatio(value: number, min: number, max: number): number;
export function ratioFromPointer(
  pointerX: number,
  bounds: DOMRect,
  min: number,
  max: number,
): number;
export function ratioFromKey(
  key: string,
  current: number,
  shift: boolean,
  min: number,
  max: number,
): number | null;
export function readStoredRatio(raw: string | null, min: number, max: number): number | null;
```

### Bilder rechts als Raster

`image-list.component.html` wechselt von der Spalte auf `grid` mit
`grid-template-columns: repeat(auto-fill, minmax(9rem, 1fr))`.

Die Spaltenzahl richtet sich damit nach der **tatsächlichen Breite der rechten
Spalte**, nicht nach der Fensterbreite. Das ist der entscheidende Punkt:
Medienabfragen kennen die Trennerposition nicht und lägen beim Ziehen falsch.
`auto-fill` mit `minmax` braucht dafür keine Container-Abfragen und keine
Messung in TypeScript.

Jede Kachel:

- Bild in `aspect-[4/3]`, `object-contain` auf dunklem Grund
- unten links die Nummer, bei Bild 1 zusätzlich „HAUPTBILD"
- oben links „AKTIV" beim ausgewählten Bild
- GPS-Abzeichen, wenn `metadata.gps` gesetzt ist
- Werkzeugleiste (vor, zurück, entfernen, durchgesehen) als Überlagerung oben
  rechts, sichtbar bei `:hover`, `:focus-within` und dauerhaft beim aktiven Bild

Die Werkzeuge dürfen **nicht** allein bei `:hover` erscheinen – ohne
`:focus-within` wären sie mit der Tastatur unerreichbar. Die Beschriftungen
(`aria-label`) bleiben unverändert erhalten.

Der Kopf über dem Raster („x von y durchgesehen", „Alle entfernen") bleibt.

## Teil 2: Steuerelemente auf der Vorschau

`adjustment-controls` verliert seinen Platz als eigene Karte und zieht in die
Vorschaukarte. Die bestehende Leiste unter dem Cropper wird zur festen Leiste
am unteren Rand des Bildbereichs.

**Kein durchsichtiges Overlay.** Die Leiste bekommt einen deckenden dunklen
Grund. Auf einem hellen Produktfoto – und weiße Hintergründe sind hier die
Regel – wäre bei Transparenz kein Kontrastverhältnis zusicherbar, und WCAG AA
verlangt 4,5:1 für Text und 3:1 für Bedienelemente.

| Element                   | Verhalten                                                            |
| ------------------------- | -------------------------------------------------------------------- |
| Drehen                    | wie bisher, `rotateRequested`                                        |
| Zoom − / Prozent / Zoom + | ersetzt den Schieberegler; Schritt 5 %, Grenzen aus `clampZoom`      |
| Zentrieren                | wie bisher                                                           |
| Zurücksetzen              | wie bisher                                                           |
| **Farbe**                 | schaltet das Panel um, `aria-expanded`                               |
| **Metadaten**             | öffnet das Modal; trägt einen Punkt, wenn `metadata.gps` gesetzt ist |

**Das Panel** schwebt über dem unteren Teil des Bildes, nicht darunter – die
Karte wird dadurch nicht höher. Inhalt unverändert: die sechs Regler aus
`adjustment-controls` (Helligkeit, Kontrast, Sättigung, Graustufen, Wärme,
Schärfe) in zwei Spalten, „Auf alle Bilder übernehmen", „Zurücksetzen". Schließt
bei erneutem Klick, bei `Escape` und beim Bildwechsel. Der Fokus springt beim
Öffnen auf den ersten Regler und beim Schließen zurück auf den Knopf.

`adjustment-controls.component.ts` bleibt inhaltlich unverändert; nur die
Vorlage wird auf die Panel-Darstellung umgestellt und der eigene Kartenrahmen
entfällt.

## Teil 3: Zuschnitt immer maximal

### Regel

1. Sobald `naturalSize` eines Bildes bekannt ist, bekommt **jede gewählte
   Plattform** ihren größtmöglichen mittigen Ausschnitt im eigenen Format:
   `deriveRect(fullImageRect(image), platform.exportRatio)`.
2. Wird eine Plattform **später** dazugewählt, hängt es davon ab, ob der Nutzer
   den aktiven Rahmen selbst verändert hat:
   - **unverändert** (noch das Maximum) → die neue Plattform bekommt ebenfalls
     ihr Maximum aus dem Vollbild
   - **verändert** → die neue Plattform erbt wie bisher per `deriveRect()` aus
     dem aktiven Zuschnitt

Damit bleibt der tragende Grundsatz erhalten: In keinem Export taucht Inhalt
auf, den der Nutzer nicht gesehen hat. Beim Maximum hat er noch nichts
eingeschränkt, also ist das ganze Foto der ehrliche Ausgangspunkt.

### Umsetzung

Kein zusätzliches Feld am Datenmodell. Ob der Nutzer gezogen hat, ist aus den
vorhandenen Daten ablesbar – neue reine Funktionen in `services/crops.ts`:

```ts
/** Der größtmögliche mittige Ausschnitt im Format der Plattform. */
export function maximumCrop(size: Size, ratio: number): Rect;

/** Für jede gewählte Plattform das Maximum. Für ein frisch geladenes Bild. */
export function seedCrops(size: Size, selected: readonly PlatformProfile[]): Crops;

/** Ob dieser Zuschnitt (noch) dem Maximum entspricht – Toleranz 1 px. */
export function isMaximum(rect: Rect, size: Size, ratio: number): boolean;
```

`setCrop()` bekommt die Bildgröße als weiteren Parameter und entscheidet beim
Auffüllen leerer Plattformen anhand von `isMaximum()`, ob es aus dem Vollbild
oder aus dem übergebenen Rahmen ableitet.

**Aufrufstellen:**

- `measureNaturalSize()` setzt nach dem Messen `crops = seedCrops(size, selected)`.
- `rotate()` verwirft die Zuschnitte bereits; es setzt sie mit der neuen Größe neu.
- `togglePlatform()` reicht die Bildgröße durch.

**Wichtig:** Der Cropper meldet unmittelbar nach dem Laden einen ersten
`imageCropped`-Wert aus seiner eigenen Vorbelegung. Weil zu diesem Zeitpunkt
bereits ein gesetzter Zuschnitt vorliegt, greift der vorhandene Weg über
`cropperInput()` und stellt das Maximum her, bevor der Nutzer etwas sieht. Es
braucht keinen Eingriff in die Bibliothek.

Die Marke `reviewed` bleibt wie sie ist – sie hing nie an den Zuschnitten.

## Teil 4: Metadaten

### Anzeige im Modal

`metadata-panel` wird zu `metadata-modal` und steckt in `app-modal-shell`
(`size: 'lg'`). Der Inhalt bleibt vollständig: Standortwarnung, komplette
Feldliste, KI-Herkunftsnachweis, Statusfälle `pending`/`unsupported`/`failed`.
Geöffnet wird über den Knopf in der Bildleiste, geschlossen über `Escape`,
Kreuz und Rückklick.

Der Knopf trägt einen kleinen Warnpunkt, wenn `metadata.gps` gesetzt ist –
sonst müsste der Nutzer das Modal öffnen, um von seinem eigenen Aufnahmeort zu
erfahren.

### Datum erhalten

**Datenmodell.** `ImageMetadata` bekommt ein Feld mit dem _rohen_ Datum, nicht
dem formatierten Text aus `fields`:

```ts
/** Aufnahmedatum aus EXIF, roh. Null, wenn keines in der Datei steht. */
readonly capturedAt: Date | null;
```

`MetadataReaderService` füllt es aus `DateTimeOriginal`, ersatzweise
`CreateDate`, ersatzweise `DateCreated`. Ungültige Datumswerte werden zu `null`.

**Neuer Dienst `services/exif-writer.ts`**, ohne neue Abhängigkeit:

```ts
/** Baut ein minimales EXIF-APP1-Segment mit den Datumsfeldern. */
export function buildDateExif(captured: Date): Uint8Array;

/** Setzt ein APP1-Segment direkt hinter den JPEG-Start. Vorhandene APP1-Segmente werden ersetzt. */
export function withExif(jpeg: Uint8Array, app1: Uint8Array): Uint8Array;
```

Geschrieben werden genau drei Tags: `DateTime` (IFD0, 0x0132),
`DateTimeOriginal` (Exif-IFD, 0x9003) und `DateTimeDigitized` (Exif-IFD,
0x9004), alle im EXIF-Format `YYYY:MM:DD HH:MM:SS`. Kein Hersteller, kein
Modell, keine Software, kein GPS, kein XMP.

Ein eigener kleiner Schreiber statt einer Bibliothek: Für drei feste Tags mit
festem Aufbau sind das rund 150 Zeilen reine Byte-Arithmetik, vollständig ohne
DOM prüfbar. `piexifjs` und Verwandte brächten einen vollständigen Leser und
Schreiber für alles mit, wovon wir nichts brauchen – und würden den Chunk des
Bildoptimierers unnötig vergrößern. Dasselbe Vorgehen wie bei
`webp-metadata.ts` und `c2pa-detection.ts`.

**Einbau in `ImageExportService.create()`** als _letzter_ Schritt:

```
rendern → (falls zu groß) komprimieren → EXIF setzen → Blob zurückgeben
```

Die Reihenfolge ist zwingend. Setzt man das Segment vor der Komprimierung,
kodiert `browser-image-compression` die Datei neu und wirft es weg. Ein Test
sichert genau das ab.

Ohne `capturedAt` bleibt die Datei wie bisher ohne EXIF – es wird nie ein Datum
erfunden.

**Texte.** Der Satz „Die Exportdateien enthalten weder EXIF- noch XMP- oder
Herkunftsdaten" wird falsch und muss umgeschrieben werden: Erhalten bleibt das
Aufnahmedatum, entfernt werden Standort, Gerät, Urheber, Software und
Herkunftsnachweis.

## Teil 5: Export als Ordner

### Ablauf

Der Knopf heißt weiter „Exportieren". Nach dem Klick:

1. `showDirectoryPicker({ mode: 'readwrite' })` – der Nutzer wählt ein Ziel.
2. Darin wird `<grundname>` angelegt, ohne Grundnamen `flipbase-bilder`.
3. Darin je Plattform ein Ordner mit `folderName(platform)`.
4. Darin die Bilder, benannt nach Teil 6.
5. Existiert `<grundname>` im gewählten Ziel bereits **und enthält er Dateien**,
   fragt `ConfirmDialogService` einmal nach („Der Ordner _macbook-air_ enthält
   schon Dateien. Gleichnamige werden überschrieben."). Bei Abbruch wird nichts
   geschrieben. Ohne Rückfrage überschreiben wäre der Fall, in dem der
   Bildoptimierer fremde Dateien zerstören könnte – der einzige im ganzen
   Werkzeug.

```
<gewählter Ordner>/macbook-air/eBay/macbook-air-01.jpg
                              /eBay/macbook-air-02.jpg
                              /Kleinanzeigen/macbook-air-01.jpg
                              /Vinted/macbook-air-01.jpg
```

### Rückfall

`showDirectoryPicker` gibt es in Chrome und Edge, nicht in Firefox und Safari
und nicht auf Android. Fehlt die Funktion, wird ohne Rückfrage und ohne
Fehlermeldung das ZIP erzeugt wie bisher – der Nutzer merkt den Unterschied nur
am Ergebnis. `zip-export.service.ts` bleibt deshalb vollständig erhalten und
wird zum zweiten Weg, nicht zu totem Code.

Bricht der Nutzer den Ordner-Dialog ab (`AbortError`), passiert nichts: kein
Fehler, keine Meldung, kein ZIP.

### Neuer Dienst `services/directory-export.service.ts`

```ts
export interface ExportEntry {
  readonly folder: string;
  readonly file: string;
  readonly data: Blob;
}

/** Ob dieser Browser direkt in einen Ordner schreiben kann. */
export function canWriteDirectory(): boolean;

export class DirectoryExportService {
  /** Fragt nach einem Ziel und schreibt. Meldet Fortschritt je geschriebener Datei. */
  async write(
    entries: readonly ExportEntry[],
    rootName: string,
    onProgress: (done: number, total: number) => void,
  ): Promise<'written' | 'cancelled'>;
}
```

Die Auswahl zwischen Ordner und ZIP trifft die Smart Component
`image-optimizer.component.ts`, nicht einer der beiden Dienste – so bleibt jeder
Dienst auf eine Aufgabe beschränkt und einzeln prüfbar.

### Fortschritt

`ExportStatus` bekommt einen weiteren Fall:

```ts
{
  kind: 'progress';
  done: number;
  total: number;
}
```

Die Exportleiste zeigt „Bild 3 von 12" mit `aria-live="polite"`. Bisher gibt es
während des Exports keinerlei Rückmeldung; bei zwölf Bildern über drei
Plattformen sind das 36 Renderdurchgänge.

## Teil 6: Benennung

```ts
export function exportFileName(index: number, baseName: string): string {
  const number = String(index + 1).padStart(2, '0');
  return baseName ? `${baseName}-${number}.jpg` : `${number}.jpg`;
}
```

Das `-main` beim ersten Bild entfällt ersatzlos.

**Warum Grundname vorne und Nummer hinten.** Der Windows-Explorer vergleicht
Namen von links nach rechts, wobei Ziffernfolgen als Zahl verglichen werden
(`bild-2` vor `bild-10`). Bei gleichem Grundnamen entscheidet also die Nummer,
und zwar richtig. Umgekehrt (`01-macbook.jpg`) würden sich mehrere Artikel im
selben Ordner ineinander mischen – erst alle Einsen, dann alle Zweien.

**Warum die führende Null bleibt.** Die Upload-Dialoge der Plattformen und
manche anderen Programme sortieren rein alphabetisch. Dort rettet `01` vor `10`
die Reihenfolge. Zwei Stellen genügen; eBay lässt höchstens 24 Bilder zu.

`archiveName()` bleibt für den ZIP-Rückfall. Neu dazu kommt
`exportFolderName(baseName)` für den oberen Ordner.

Dass Bild 1 das Hauptbild ist, sagt weiterhin das Abzeichen in der Oberfläche.

## Teil 7: Exportvorschau in den Plattformreitern

Heute stehen `platform-tabs` (nur Text) und `preview-grid` (drei große Karten
mit derselben Aussage) an zwei verschiedenen Stellen. Beides wird zu einer
Kachelreihe **unter dem Cropper**:

- je Plattform eine Kachel mit der tatsächlichen Ausgabe, gerendert über
  denselben `renderImage()`-Weg wie bisher
- darunter Name, Verhältnis und das Ausgabemaß in Pixeln
- roter Rand und Hinweistext, wenn `checkOutput()` die Ausgabe als zu klein meldet
- Klick wählt die bearbeitete Plattform, `aria-current` wie bei den heutigen Reitern

Damit entfällt die separate rote Warnleiste über dem Bild: Die Warnung steht an
der Kachel, die sie betrifft. `preview-grid` als eigene Komponente wird
aufgelöst; `platform-preview` bleibt und wird auf die kleinere Darstellung
umgestellt.

**Große Ansicht.** Ein Lupensymbol auf der Kachel öffnet die Ausgabe in
Originalgröße im Modal. Schärfe und Farbe lassen sich in einer Kachel von
wenigen Zentimetern nicht beurteilen – im heutigen Zustand ist das der Grund,
warum die Vorschaukarten so groß sein müssen.

## Aufbau danach

```
shared/components/split-pane/          neu
features/image-optimizer/
  components/
    crop-editor/                       Leiste + Panel + Lupe
    adjustment-controls/               nur noch Panel-Inhalt
    image-list/                        Raster statt Spalte
    metadata-modal/                    ehemals metadata-panel
    platform-preview/                  kleinere Kachel, klickbar
    preview-grid/                      entfällt
    platform-tabs/                     entfällt, geht in platform-preview auf
    export-bar/                        Fortschrittsfall
  services/
    crops.ts                           maximumCrop, seedCrops, isMaximum
    exif-writer.ts                     neu
    directory-export.service.ts        neu
    zip-export.service.ts              bleibt als Rückfall
    file-name.ts                       ohne -main, plus exportFolderName
```

## Prüfung

| Bereich                                   | Wie geprüft                                                                                                            |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `split-pane-ratio.ts`                     | Node-Tests: Grenzen, Tastenzuordnung, gespeicherte Werte, Unsinn im Speicher                                           |
| Trenner-Bedienung                         | Angular-Test: Pfeiltasten ändern `ratio`, `aria-valuenow` folgt                                                        |
| `maximumCrop` / `seedCrops` / `isMaximum` | Node-Tests mit den echten Zahlen: 3:4-Foto → Vinted 88,9 % Breite, nicht 66,7 %                                        |
| `setCrop`                                 | Node-Tests: unberührt → aus Vollbild; gezogen → aus aktivem Rahmen                                                     |
| `exif-writer`                             | Node-Tests: Segment liegt hinter `FFD8`, Tags an der richtigen Stelle, Bilddaten unverändert, vorhandenes APP1 ersetzt |
| Reihenfolge beim Export                   | Test, dass EXIF nach der Komprimierung gesetzt wird                                                                    |
| `exportFileName`                          | Node-Tests: `01`, `02`, kein `-main`, ohne Grundnamen                                                                  |
| `directory-export`                        | DOM-Test mit nachgebautem `showDirectoryPicker`; Abbruch, fehlende Funktion, Fortschrittsmeldungen                     |
| Raster                                    | Angular-Test: Werkzeuge sind bei `:focus-within` erreichbar                                                            |
| Barrierefreiheit                          | AXE über die Seite, mit offenem Panel und offenem Modal                                                                |
| Bündelgröße                               | `npm run build`, Chunk des Bildoptimierers vor/nach vergleichen                                                        |
| Gesamt                                    | `npm run verify`                                                                                                       |

## Bewusst nicht enthalten

- **Umsortieren per Ziehen.** Im Raster wäre es die natürliche Geste, ist aber
  eigenständige Arbeit mit eigener Tastaturersatzbedienung. Die Pfeilknöpfe
  bleiben und funktionieren. Eigener Vorgang, wenn der Rest steht.
- **Ordnerwahl merken.** `FileSystemDirectoryHandle` ließe sich in IndexedDB
  ablegen und beim nächsten Mal wiederverwenden. Das ändert aber, wohin
  Dateien geschrieben werden, ohne dass der Nutzer es nochmal sieht – das
  gehört gesondert entschieden.
- **Weitere Metadatenfelder.** Blende, ISO und Brennweite wurden erwogen und
  verworfen: mehr Angriffsfläche für Rückschlüsse, kein erkennbarer Nutzen.
