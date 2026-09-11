# Bildoptimierer – Nachbesserungen nach der ersten Nutzung

**Datum:** 2026-09-11
**Status:** fachlich freigegeben, noch nicht implementiert
**Branch:** `feat/image-optimizer-polish`, abgezweigt von `origin/master` (5a11621)

## Ziel

Nach dem Umbau der Arbeitsfläche (Pakete 1–3) sind beim ersten echten Arbeiten
sieben Dinge aufgefallen. Einer davon ist ein echter Fehler: Zieht man ein Bild
innerhalb der Seite, wird es ein zweites Mal hinzugefügt.

1. Der Trenner sitzt nicht mittig zwischen den Boxen.
2. Das GPS-Abzeichen an den Bildkacheln wird nicht gebraucht.
3. Umsortieren soll per Ziehen gehen, wie bei Kleinanzeigen.
4. Ziehen eines Bildes innerhalb der Seite fügt es doppelt hinzu.
5. Die Steuerleiste liegt über dem Bild, der Ausschnitt läuft dahinter.
6. Der Export öffnet einen Ordner-Dialog; gewünscht ist ein normaler Download.
7. Beim Hineinziehen von Dateien ändert sich kaum etwas Sichtbares.

## Ausgangslage

| Befund                          | Ursache                                                                                                                                                                                                                                       |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Trenner näher an der linken Box | Griff-Spalte nur `0.75rem`, rechte Box zusätzlich mit `lg:ml-4`. Abstand Strich→links ≈ 6 px, Strich→rechts ≈ 22 px.                                                                                                                          |
| Bild wird doppelt hinzugefügt   | Chrome bietet ein gezogenes `<img>` aus der Seite als Datei an (`dataTransfer.types` enthält `Files`). `FileDropDirective.carriesFiles()` hält es für einen Datei-Drop, zeigt „Bilder hier ablegen“ und gibt beim Loslassen die Datei weiter. |
| Leiste verdeckt das Bild        | Leiste und Panel liegen `absolute` über der Bildfläche.                                                                                                                                                                                       |
| Ordner-Dialog beim Export       | Seit Paket 2 schreibt der Export über `showDirectoryPicker` in einen Ordner. Ein Browser kann keinen Ordner herunterladen; ohne Dialog bleibt nur Einzeldatei oder ZIP.                                                                       |
| Ablagefläche ändert kaum etwas  | `.linear-surface` setzt `background-color` in normalem CSS (`src/styles.css`). Das schlägt die Tailwind-Klasse `bg-indigo-500/10`, der Farbton erscheint nie. Übrig bleiben Randfarbe und Text.                                               |
| Kein Angular CDK im Projekt     | `@angular/cdk@22` ist verfügbar, Peer-Abhängigkeiten `@angular/core ^22` passen.                                                                                                                                                              |

## Entscheidungen des Nutzers

- **Export:** Ergibt der Export genau eine Datei, wird das JPEG direkt heruntergeladen; sonst ein ZIP mit Plattform-Ordnern wie vor Paket 2. Kein Dialog.
- **Umsortieren:** Ziehen ist der Hauptweg. Die Pfeile bleiben klein im Werkzeug-Menü der Kachel, das bei Hover und Tastaturfokus erscheint. Grund: Ohne Weg ohne Ziehen verstieße die Seite gegen WCAG 2.2 AA (2.5.7 Dragging Movements), das Projekt verlangt AA.
- **Bibliothek fürs Ziehen:** Angular CDK `drag-drop`, als neue Abhängigkeit.
- **GPS:** Abzeichen an den Bildkacheln entfällt. Der Punkt am Knopf „Metadaten“ bleibt.

## Teil 1: Trenner mittig

- `split-pane.component.ts`: Spaltenaufteilung `${ratio}% 1.5rem 1fr` statt `0.75rem`. Der Griff sitzt weiterhin mittig in seiner Spalte.
- `image-optimizer.component.html`: `lg:ml-4` an der rechten `<aside>` entfällt.

Damit liegen links und rechts des Strichs je `0.75rem`. Bestehende Tests des Trenners bleiben unverändert gültig; die Rechenlogik ist nicht betroffen.

## Teil 2: GPS-Abzeichen an den Kacheln entfernen

- `image-list.component.html`: der `@if (image.metadata.gps)`-Block samt Kommentar entfällt.
- `image-list.component.angular.spec.ts`: der Test, der das Abzeichen festhält, entfällt.
- `BadgeComponent` wird aus den `imports` von `ImageListComponent` entfernt, sofern sonst nicht benutzt.
- Unverändert: der Warnpunkt am Knopf „Metadaten“ im Cropper (`hasLocation`).

## Teil 3: Umsortieren per Ziehen

### Abhängigkeit

`npm install @angular/cdk@^22.0.0`. Importiert wird nur `DragDropModule` bzw. die einzelnen Direktiven, und nur in `ImageListComponent` – das landet im nachgeladenen Chunk des Bildoptimierers, nicht im Erststart.

### Datenfluss

Neue reine Funktion in `services/image-collection.ts`:

```ts
/** Verschiebt ein Bild an eine neue Position. Position 0 ist das Hauptbild. */
export function moveImageTo(
  list: readonly OptimizerImage[],
  fromIndex: number,
  toIndex: number,
): readonly OptimizerImage[];
```

Ungültige Indizes (außerhalb der Liste) und `fromIndex === toIndex` liefern die Liste unverändert zurück. Die bestehende `moveImage` (Pfeile) bleibt.

`ImageListComponent` bekommt einen Ausgang:

```ts
readonly reordered = output<{ readonly fromIndex: number; readonly toIndex: number }>();
```

`ImageOptimizerComponent` bekommt `reorderImage(fromIndex, toIndex)`, das während eines Exports (`isBusy()`) nichts tut und sonst `moveImageTo` anwendet.

### Oberfläche

- Rasterbehälter: `cdkDropList`, `cdkDropListOrientation="mixed"` (Raster), `[cdkDropListDisabled]="disabled()"`, `(cdkDropListDropped)` → `reordered`.
- Jede Kachel (`<article>`): `cdkDrag`, `cdkDragPreviewContainer="parent"` – die Vorschau bleibt im Bauteil, damit dessen Stile greifen.
- Platzhalter per `<ng-template cdkDragPlaceholder>`: gestrichelte Kachel (Rand `border-fb-text-muted`, Ton `bg-fb-primary-subtle`), damit sichtbar ist, wo das Bild landet.
- Ein Klick auf die Kachel wählt weiterhin das Bild aus; das CDK beginnt ein Ziehen erst nach einer kleinen Bewegungsschwelle.
- Die Pfeil- und Entfernen-Knöpfe bleiben im Werkzeug-Menü der Kachel.

### Stile

Die Übergänge für Platzhalter und Nachrücken hängen an den Klassen des CDK (`.cdk-drag-animating`, `.cdk-drop-list-dragging .cdk-drag`). Diese Klassen setzt die Bibliothek, sie lassen sich nicht als Tailwind-Klassen im Template ausdrücken – das ist der dokumentierte Ausnahmefall für eine eigene Stildatei: `image-list.component.scss`, nur mit diesen Regeln. Unter `prefers-reduced-motion: reduce` entfallen die Übergänge.

## Teil 4: Fehler „Bild wird doppelt hinzugefügt“

Zwei unabhängige Sicherungen:

1. **Keine nativen Bild-Drags aus der Seite:** `draggable="false"` an den Vorschaubildern in `image-list.component.html` und `platform-preview.component.html`.
2. **Die Ablage-Erkennung erkennt Ziehen, das in der Seite beginnt, an einer Kennung am Ziehvorgang selbst:** `FileDropDirective` hängt bei `document:dragstart` per `dataTransfer.setData` einen eigenen Typ an (`application/x-flipbase-internal`). Solche Ziehvorgänge lösen keine Überlagerung und keine Weitergabe aus, bekommen aber weiterhin `preventDefault()`, damit der Browser nicht zum Bild navigiert. Eine Marke an der Direktive (ein Zustand, der erst bei `dragend` zurückgesetzt wird) wurde verworfen: Wird das Quellelement während des Ziehens entfernt, erreicht `dragend` das Dokument nie, die Marke bliebe stehen, und jede spätere echte Datei würde vom Browser selbst geöffnet.

Die bestehende Abwehr gegen das Verlassen der Seite bei echten Datei-Drops bleibt unverändert.

## Teil 5: Steuerleiste unter das Bild

`crop-editor.component.html` wird zweigeteilt:

- **Karte:** `flex h-[62vh] min-h-96 flex-col overflow-hidden rounded-2xl bg-[#090b12] shadow-inner` – Gesamthöhe unverändert.
- **Bildfläche:** `relative flex min-h-0 flex-1 items-center justify-center p-3`, enthält nur `<image-cropper>`.
- **Leistenbereich:** `relative` im normalen Fluss unter der Bildfläche, mit Abstand `px-3 pb-3`. Darin zuerst die Leiste, danach das Panel.
- **Panel:** `absolute inset-x-3 bottom-full mb-2` relativ zum Leistenbereich – es sitzt unmittelbar über der Leiste und damit über der Bildfläche, egal ob die Leiste ein- oder zweizeilig ist. `max-h-[45vh] overflow-y-auto`.

Die DOM-Reihenfolge Leiste → Panel bleibt, Tab führt von „Farbe“ direkt ins Panel. Die Fokusführung (Öffnen → erster Regler, Schließen/Escape → „Farbe“) und ihre Tests bleiben unverändert. Die bisherige `flex-col-reverse`-Hülle entfällt.

## Teil 6: Export ohne Dialog

In `exportImages()`, nachdem alle Dateien erzeugt sind:

- **Genau eine Datei** (`entries.length === 1`): `download(entries[0].data, entries[0].file)` – z. B. `macbook-air-01.jpg`. Meldung: „Bild wurde heruntergeladen.“
- **Mehrere Dateien:** `zipExport.pack(entries)` und `download(archiv, archiveName(name))`. Meldung: „Bilder wurden exportiert.“

Ein Bild für zwei Plattformen sind zwei Dateien und damit ein ZIP.

**Zurückgebaut, weil nicht mehr erreichbar:**

- `services/directory-export.service.ts` und `directory-export.dom.spec.ts`
- `services/free-folder-name.ts` und `free-folder-name.spec.ts`
- `canWriteDirectory()`, `DirectoryExportService` und die Ordner-Tests in `image-optimizer.component.angular.spec.ts`
- die Schreibphase der Fortschrittsanzeige: `exportProgress` braucht kein `phase`-Feld mehr, der Text lautet „Datei x von y wird erstellt“.

**Unverändert aus Paket 2:** Aufnahmedatum als EXIF, `effectiveBaseName` (Zeitstempel ohne Namen), `exportFileName` ohne `-main`, Fortschritt beim Erstellen. Namensgleichheit ist beim Download kein Problem; der Browser hängt selbst „(1)“ an.

`ExportEntry` aus dem entfernten Dienst wird durch das vorhandene `ZipEntry` aus `zip-export.service.ts` ersetzt.

## Teil 7: Deutlichere Ablagefläche

`drop-zone.component.html`, leerer Zustand:

- `linear-surface` entfällt an der Ablagefläche; Hintergrund, Rand und Schatten werden direkt gesetzt, damit der Ablagezustand nicht mehr überschrieben wird.
- **Ruhe:** `bg-fb-surface`, gestrichelter Rand `border-fb-border`, Upload-Symbol (Lucide `ImagePlus`) in gedämpfter Farbe über dem Text.
- **Beim Hineinziehen:** kräftiger gestrichelter Rand in der Textfarbe `border-fb-text-primary`, leichter Logo-Gelb-Ton `bg-fb-primary-subtle`, Schatten, Symbol in der Textfarbe, größerer Text „Jetzt loslassen“, leichte Vergrößerung `scale-[1.01]` mit Übergang; unter `motion-reduce` ohne Vergrößerung. Kein Indigo: Die Design-Richtlinie verbietet dekorative Indigo-Flächen, und Gelb als Rand wäre mit etwa 1,6:1 zu kontrastschwach (WCAG 1.4.11).
- Text bleibt `text-fb-text-primary` bzw. `text-fb-text-muted` – Kontrast gegen den getönten Grund in beiden Designs mindestens 4,5:1, im Browser nachzumessen.

Die Ganzseiten-Überlagerung, die erscheint, wenn schon Bilder geladen sind, bekommt dasselbe Symbol und denselben Stil.

## Prüfung

| Bereich                | Wie geprüft                                                                                                                                                                                     |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `moveImageTo`          | Node-Tests: nach vorn, nach hinten, auf Position 0, gleiche Position, ungültige Indizes                                                                                                         |
| Umsortieren im Bauteil | Angular-Test: `cdkDropListDropped` löst `reordered` mit den Indizes aus; gesperrt bei `disabled`                                                                                                |
| `reorderImage`         | Angular-Test: verschiebt; tut während `isBusy()` nichts                                                                                                                                         |
| Doppelt-Fehler         | Angular-Test der Direktive: `dragstart` in der Seite, danach `dragenter`/`drop` mit `Files` → keine Überlagerung, kein `filesDropped`; nach `dragend` funktioniert ein echter Datei-Drop wieder |
| Export                 | Angular-Test: eine Datei → `download` mit `.jpg`, kein ZIP; mehrere → ZIP mit `.zip`                                                                                                            |
| GPS                    | Angular-Test: keine `app-badge` mehr in der Kachel                                                                                                                                              |
| Gesamt                 | `npm run verify`                                                                                                                                                                                |

**Von Hand im Browser** (hinter der Anmeldung, daher beim Nutzer): Trenner mittig; Leiste unter dem Bild, Ausschnitt vollständig greifbar; Panel über der Leiste bei schmalem Trenner; Ziehen mit Maus und Finger; Bild in der Seite ziehen fügt nichts hinzu; Ablagefläche beim Hineinziehen deutlich; Einzeldatei landet als JPEG im Download-Ordner.

## Bewusst nicht enthalten

- Drehen schließt das Farb-Panel.
- Tastenkürzel zum Umsortieren – die Pfeile decken Tastatur und WCAG 2.5.7 ab.
