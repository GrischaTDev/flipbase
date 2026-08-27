# Bildoptimierer Paket 1 – Design

**Datum:** 2026-08-27
**Status:** fachlich freigegeben, noch nicht implementiert
**Branch:** `feature/bildeditor-anpassungen`

## Ziel

Der Bildoptimierer wird im täglichen Verkaufsablauf brauchbar: Bilder lassen sich
ziehen statt nur auswählen, Plattformen mit einem Klick an- und abschalten, der
Bearbeitungsfortschritt ist sichtbar, Exportdateien tragen einen erkennbaren
Namen. Ein bestätigter Darstellungsfehler in der Vinted-Vorschau wird behoben.
Gleichzeitig wird der Ordner nach Smart-/Dumb-Trennung zerlegt und vollständig
englisch benannt.

Metadaten sowie Farbe, Belichtung und Filter sind **nicht** Teil dieses Pakets.
Sie folgen als Paket 2 mit eigenem Design.

## Ausgangslage

Alle folgenden Aussagen wurden am Quellcode überprüft, nicht vermutet.

| Befund                                                                                                                                                                                                                                         | Beleg                                                                               |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Die Vinted-Vorschau schneidet ab. Der Rahmen ist auf 224 px Breite und 256 px Höhe begrenzt; 2:3 bräuchte bei 224 px Breite 336 px Höhe. Das Kästchen wird gestaucht, `object-cover` schneidet oben und unten weg.                             | `plattform-vorschau.component.html` Zeile 22                                        |
| eBay (1:1 → 224 × 224) und Kleinanzeigen (4:3 → 224 × 168) bleiben unter der Grenze. Deshalb tritt der Fehler nur bei Vinted auf.                                                                                                              | dieselben Zeilen                                                                    |
| Es gibt keinen Drag-and-Drop-Handler, obwohl die leere Ablagefläche „Produktbilder hier ablegen“ verspricht.                                                                                                                                   | `image-optimizer.component.html` Zeile 219                                          |
| Die Ablagefläche existiert nur im leeren Zustand. Nachträglich Bilder hinzufügen geht ausschließlich über den Knopf oben rechts.                                                                                                               | `image-optimizer.component.html`, `@else`-Zweig                                     |
| Nicht-Bilder werden beim Hinzufügen still verworfen.                                                                                                                                                                                           | `image-optimizer.component.ts` Zeile 249                                            |
| Eine Plattform lässt sich erst abwählen, wenn sie Arbeitsziel ist **und** eine zweite ausgewählt ist. `waehleArbeitsziel()` kann nur hinzufügen, nie entfernen.                                                                                | `image-optimizer.component.html` Zeile 76, `image-optimizer.component.ts` Zeile 229 |
| Ein Fortschrittsmarker anhand vorhandener Zuschnitte wäre wertlos: `setzeZuschnitt()` füllt bei einer Geste alle ausgewählten Plattformen mit ab, und `imageCropped` feuert bereits beim Laden eines Bildes, nicht erst bei einer Nutzergeste. | `zuschnitte.ts` Zeile 26, `zuschnitt-editor.component.html` Zeile 30                |
| Exportdateien heißen immer `01-main.jpg`, `02.jpg` …, das Archiv immer `flipbase-bilder.zip`. Mehrere Artikel hintereinander ergeben gleichnamige Downloads.                                                                                   | `bild-export.service.ts` Zeile 6, `image-optimizer.component.ts` `exportiere()`     |
| Für Rückfragen existiert bereits ein `ConfirmDialogService` mit `gefahr`-Schalter. Ein eigener Dialog ist überflüssig.                                                                                                                         | `shared/components/confirm-dialog/confirm-dialog.service.ts`                        |
| Der Toast-Dienst kennt keine Aktionsschaltflächen. Eine „Rückgängig“-Meldung würde einen gemeinsamen Baustein umbauen.                                                                                                                         | `shared/components/toast/toast.service.ts`                                          |
| Nach außen hängt das Feature nur an der Lazy-Route und am Menüpunkt. Eine Umbenennung innerhalb des Ordners bleibt folgenlos.                                                                                                                  | `app.routes.ts`, `layout/sidebar/sidebar.component.ts`                              |

## Abgrenzung zur parallelen Arbeit

ChatGPT/Codex baut gleichzeitig die Warenwirtschaft im Worktree
`.worktrees/codex-inventory-sales` auf Branch `codex/inventory-sales`. Dieses
Paket fasst **ausschließlich** Dateien unter `src/app/features/image-optimizer/`
an. `app.routes.ts`, `layout/sidebar/` und alles unter `shared/` bleiben
unberührt – genau diese Dateien ändert Codex ebenfalls.

## Schritt 0: Umbenennung auf Englisch

Die Umbenennung ist der **erste, eigenständige Commit** und enthält keine
einzige Verhaltensänderung. Nur so beweisen grüne Tests und ein sauberer Build,
dass nichts kaputtgegangen ist. Erst danach kommen die Funktionen obendrauf.

Deutsch bleiben: Code-Kommentare, Oberflächentexte und Dokumentation.
Englisch werden: Datei- und Ordnernamen, Klassen, Typen, Methoden, Felder,
Konstanten und lokale Variablen.

### Dateien und Ordner

| Vorher                              | Nachher                            |
| ----------------------------------- | ---------------------------------- |
| `components/bild-liste/`            | `components/image-list/`           |
| `components/fotoguide/`             | `components/photo-guide/`          |
| `components/plattform-vorschau/`    | `components/platform-preview/`     |
| `components/zuschnitt-editor/`      | `components/crop-editor/`          |
| `models/plattform-profile.ts`       | `models/platform-profile.ts`       |
| `services/async-warteschlange.ts`   | `services/async-queue.ts`          |
| `services/async-zustand.ts`         | `services/async-state.ts`          |
| `services/bild-export.service.ts`   | `services/image-export.service.ts` |
| `services/bild-renderer.ts`         | `services/image-renderer.ts`       |
| `services/fotoguide-zustand.ts`     | `services/photo-guide-state.ts`    |
| `services/plattform-validierung.ts` | `services/platform-validation.ts`  |
| `services/zuschnitt.ts`             | `services/crop.ts`                 |
| `services/zuschnitte.ts`            | `services/crops.ts`                |

`image-optimizer.component.*`, `editor-transform.ts` und `zip-export.service.ts`
behalten ihren Namen. Jede `*.spec.ts` wandert mit der Datei, die sie prüft.

### Typen und öffentliche Funktionen

| Vorher                          | Nachher                   |
| ------------------------------- | ------------------------- |
| `Rechteck`                      | `Rect`                    |
| `Groesse`                       | `Size`                    |
| `PlattformProfil`               | `PlatformProfile`         |
| `ProfilId`                      | `PlatformId`              |
| `OptimiererBild`                | `OptimizerImage`          |
| `Zuschnitte`                    | `Crops`                   |
| `SchluesselWarteschlange`       | `KeyedQueue`              |
| `FotoguideZustand`              | `PhotoGuideState`         |
| `ZipEintrag`                    | `ZipEntry`                |
| `leiteAb`                       | `deriveRect`              |
| `pruefeMindestgroesse`          | `meetsMinimumSize`        |
| `profil`                        | `platformById`            |
| `planeAusgabe`                  | `planOutput`              |
| `rendereBild`                   | `renderImage`             |
| `setzeZuschnitt`                | `setCrop`                 |
| `uebernimmAufAlle`              | `applyCropToAll`          |
| `dateiName`                     | `fileName`                |
| `ordnerName`                    | `folderName`              |
| `pruefeAusgabe`                 | `checkOutput`             |
| `findeAufloesungsproblem`       | `findResolutionIssue`     |
| `erstelleExportSnapshot`        | `createExportSnapshot`    |
| `ersetzeWennAktuell`            | `replaceIfCurrent`        |
| `istHeic`                       | `isHeic`                  |
| `HEIC_HINWEIS` / `LESE_HINWEIS` | `HEIC_HINT` / `READ_HINT` |

Feldnamen folgen demselben Muster: `breite`/`hoehe` → `width`/`height`,
`exportVerhaeltnis` → `exportRatio`, `kachelVerhaeltnis` → `tileRatio`,
`maxDateigroesseMB` → `maxFileSizeMB`, `schneidet` → `crops`,
`herkunft` → `source`, `gemessenAm` → `measuredAt`. Komponentenfelder analog:
`bilder` → `images`, `gewaehlteIds` → `selectedPlatformIds`,
`aktivesBildId` → `activeImageId`, `aktivePlattformId` → `workingPlatformId`,
`laeuft` → `isBusy`, `nimmDateien` → `addFiles`, `entferne` → `removeImage`,
`drehe` → `rotate`, `exportiere` → `exportImages`.

Die Werte der `PlatformId` (`'ebay'`, `'kleinanzeigen'`, `'vinted'`) bleiben
unverändert – es sind Eigennamen, keine Bezeichner.

## Architektur

Eine Smart-Komponente hält den Zustand und orchestriert. Alle übrigen sind Dumb
Components: Sie erhalten Daten über `input()`, melden Ereignisse über `output()`
und kennen weder Dienste noch Anwendungszustand. Damit ist jede einzeln testbar,
ohne den Editor aufzubauen.

### Smart

`image-optimizer.component.ts` behält Zustand, Orchestrierung und die
Export-Abfolge. Zielgröße nach dem Umbau: rund 250 Zeilen statt heute 616.

### Dumb – neu

| Komponente                      | Eingaben                                            | Ausgaben                         |
| ------------------------------- | --------------------------------------------------- | -------------------------------- |
| `components/optimizer-header/`  | `baseName`, `isBusy`                                | `baseNameChanged`, `filesPicked` |
| `components/platform-selector/` | `platforms`, `selectedIds`, `isBusy`                | `toggled`, `helpRequested`       |
| `components/platform-tabs/`     | `platforms` (nur ausgewählte), `activeId`, `isBusy` | `selected`                       |
| `components/drop-zone/`         | `isDragActive`, `hasImages`, `isBusy`               | `filesPicked`                    |
| `components/preview-grid/`      | `platforms`, `imageUrl`, `crops`                    | –                                |
| `components/export-bar/`        | `status`, `isBusy`, `canExport`                     | `exportRequested`                |

`export-bar` erhält den Zustand als ein einziges, bereits ausgewertetes Objekt
(Art und Text), nicht als vier einzelne Fehlerquellen. Die Entscheidung, welcher
Hinweis gilt, bleibt damit in der Smart-Komponente.

### Dumb – bestehend

`image-list/` bekommt einen Kopfbereich mit Fortschrittszähler und dem Knopf
„Alle entfernen“. `crop-editor/`, `platform-preview/` und `photo-guide/`
behalten ihre Aufgabe; `platform-preview` wird nur im Layout korrigiert.

### Direktiven und Dienste – neu

| Datei                                | Zweck                                                         |
| ------------------------------------ | ------------------------------------------------------------- |
| `directives/file-drop.directive.ts`  | Ablegen per Drag-and-Drop und Einfügen aus der Zwischenablage |
| `services/file-name.ts`              | Namensentschärfung und Dateinamensbildung, reine Funktionen   |
| `services/image-rotation.service.ts` | Canvas-Drehung, heute rund 80 Zeilen in der Komponente        |
| `services/image-collection.ts`       | Verwaltung der Bilderliste als reine Funktionen               |

`image-collection.ts` enthält Hinzufügen, Entfernen, Verschieben, Zuschnitt
merken und Fortschritt setzen – jeweils als reine Funktion über ein
`readonly OptimizerImage[]`. Die Komponente ruft sie und legt das Ergebnis ins
Signal. So ist die gesamte Listenlogik ohne Oberfläche prüfbar.

Die Freigabe von Object-URLs bleibt bewusst in der Komponente. `URL.revokeObjectURL`
ist ein Seiteneffekt und hat in reinen Funktionen nichts zu suchen; die
Funktionen melden stattdessen zurück, welche URLs freizugeben sind.

## Fachliche Änderungen

### 1. Plattformauswahl

Auswahl und Arbeitsziel werden räumlich und logisch getrennt.

**Auswahl** (`platform-selector`, oben): eine Schalterreihe, ein Schalter je
Plattform. Ein Klick wählt aus, der nächste wählt ab. Kein X, kein Sonderfall,
keine Mindestanzahl. `selectedPlatformIds` startet als **leere Liste**.

**Arbeitsziel** (`platform-tabs`, direkt über dem Editor): eine Reiterleiste,
die ausschließlich die ausgewählten Plattformen zeigt.

Regeln:

- Die erste ausgewählte Plattform wird automatisch Arbeitsziel.
- Wird das aktuelle Arbeitsziel abgewählt, rückt die erste verbliebene nach.
  Ist keine mehr übrig, wird `workingPlatformId` auf `null` gesetzt.
- Wird eine Plattform **hinzugewählt**, erbt sie den Zuschnitt vom bisherigen
  Arbeitsziel. Dieses Verhalten besteht bereits und bleibt erhalten – es
  verhindert, dass für ein bearbeitetes Bild unbemerkt das Vollbild exportiert
  wird. Gibt es kein Arbeitsziel (erste Auswahl), entfällt das Erben.
- Ohne Auswahl erscheint anstelle des Editors der Hinweis: „Wähle oben
  mindestens eine Plattform, für die du Bilder vorbereiten willst.“ Die
  Bilderliste bleibt sichtbar, hochgeladene Bilder gehen nie verloren.
- Der Export-Knopf bleibt bei leerer Auswahl gesperrt. Diese Sperre besteht
  bereits.

### 2. Vinted-Vorschau

Der Vorschaurahmen gibt **kein** Seitenverhältnis mehr selbst vor. Das
gerenderte Vorschaubild stammt aus derselben Funktion wie der Export und trägt
das korrekte Verhältnis bereits in sich.

Konkret:

- Die Karte behält eine **feste Bühne** mit unveränderlicher Höhe. Sie dient nur
  als Fläche zum Zentrieren und hat kein eigenes Seitenverhältnis.
- Das Vorschaubild liegt darin mit `max-height: 100%`, `max-width: 100%` und
  automatischer Gegenseite. Es verkleinert sich also proportional, bis es in die
  Bühne passt, und wird nie beschnitten. `object-cover` entfällt ersatzlos.
- Solange gerendert wird oder die Vorschau fehlschlägt, füllt der jeweilige
  Hinweis die Bühne in voller Größe aus. Die Karte darf nicht in sich
  zusammenfallen, sonst springt das Raster bei jeder Änderung.
- Die feste Bühnenhöhe hält außerdem alle Karten im Raster gleich hoch,
  unabhängig davon, ob eine Plattform hochkant oder quer ausgibt.

Damit können Rahmen und Inhalt konstruktionsbedingt nicht mehr auseinanderlaufen.

**Bekannte Einschränkung:** Die Profile führen `tileRatio` und `exportRatio`
getrennt. Bei allen drei Plattformen sind sie derzeit identisch, deshalb ist der
Verzicht auf den Rahmen unbedenklich. Sollten sie je auseinandergehen, bräuchte
es eine echte Nachbildung der Plattformkachel – das wäre ein eigenes Vorhaben
und ist hier ausdrücklich nicht enthalten. Ein Test sichert die Annahme ab.

### 3. Drag-and-Drop und Zwischenablage

`file-drop.directive.ts` liegt auf der gesamten Arbeitsfläche und meldet
abgelegte Dateien. Während Dateien über dem Fenster schweben, erscheint eine
deutliche Fläche mit „Bilder hier ablegen“ – unabhängig davon, ob bereits Bilder
geladen sind.

- Verschachtelte `dragleave`-Ereignisse werden über einen Zähler ausgeglichen,
  sonst flackert die Fläche beim Überfahren von Kindelementen.
- `dragover` muss `preventDefault()` aufrufen, sonst öffnet der Browser die
  Datei in einem neuen Tab.
- Zusätzlich nimmt die Direktive Bilder aus der Zwischenablage entgegen
  (Strg+V). Ereignisse werden über das `host`-Objekt gebunden, nicht über
  `@HostListener`.
- Die Direktive wird während eines laufenden Exports (`isBusy`) deaktiviert.

Nicht-Bilder werden weiterhin aussortiert, aber nicht mehr stillschweigend: Bei
mindestens einer aussortierten Datei erscheint eine Meldung „N Dateien
übersprungen, weil es keine Bilder sind.“ Werden ausschließlich Nicht-Bilder
abgelegt, ist die Meldung eine Warnung statt eines Hinweises.

### 4. Alle Bilder entfernen

Ein Knopf im Kopf der Bilderliste, sichtbar sobald mindestens ein Bild geladen
ist. Er ruft den vorhandenen `ConfirmDialogService` mit `gefahr: true`, sodass
der bestätigende Knopf rot ist und der Startfokus auf „Abbrechen“ liegt.

Nach Bestätigung: alle Object-URLs freigeben, Liste leeren, `activeImageId` auf
`null`, Erfolgsmeldung. Die Plattformauswahl, das Arbeitsziel und der Grundname
bleiben erhalten – der nächste Artikel wird meist genauso exportiert.

Während eines laufenden Exports ist der Knopf gesperrt.

### 5. Grundname für die Exportdateien

Ein Textfeld im Kopfbereich, Beschriftung „Dateiname“, mit Platzhalter
`z. B. nike-air-max-42`.

- **Leer:** unverändertes heutiges Verhalten – `01-main.jpg`, `02.jpg`, Archiv
  `flipbase-bilder.zip`.
- **Gefüllt:** `nike-air-max-42-01-main.jpg`, `nike-air-max-42-02.jpg`, Archiv
  `nike-air-max-42.zip`.

Die Nummerierung folgt weiterhin der Reihenfolge in der Bilderliste, das erste
Bild behält den Zusatz `-main`. Die Ordner je Plattform bleiben unverändert.

Entschärfung in `file-name.ts`, als reine Funktion mit Tests:

- Umlaute und `ß` werden umgeschrieben (`ä`→`ae`, `ö`→`oe`, `ü`→`ue`, `ß`→`ss`),
  übrige diakritische Zeichen über Unicode-Normalisierung entfernt.
- Alles außer `a–z`, `0–9`, `-` und `_` wird zu `-`; Groß- wird zu Kleinschrift.
- Mehrfache `-` werden zusammengefasst, führende und schließende entfernt.
- Länge auf 60 Zeichen begrenzt.
- Bleibt danach eine leere Zeichenkette übrig (etwa bei reiner Emoji-Eingabe),
  gilt sie als „nicht gesetzt“ und es greift das heutige Verhalten. Es entsteht
  nie ein Dateiname, der mit `-` beginnt oder nur aus Bindestrichen besteht.

Grund für die Strenge: `\ / : * ? " < > |` sind in Windows-Dateinamen verboten.
Ein Archiv mit solchen Einträgen lässt sich nicht entpacken.

### 6. Fortschritt

`OptimizerImage` erhält das Feld `readonly reviewed: boolean`.

- Es wird auf `true` gesetzt, sobald das Bild im Editor angezeigt wurde – also
  bei `activeImageId`, einschließlich des Bildes, das nach dem ersten Upload
  automatisch geöffnet wird.
- Ein Klick auf das Abzeichen in der Bilderliste schaltet es von Hand um, in
  beide Richtungen.
- Es bleibt beim Drehen, Verschieben und beim Wechsel der Plattform erhalten.
  Nur „Alle entfernen“ und das Entfernen eines einzelnen Bildes lassen es
  verschwinden – mit dem Bild.
- Über der Liste steht ein Zähler „5 von 8 durchgesehen“.

Bewusst **nicht** an die Zuschnitte gekoppelt: Der Cropper meldet den ersten
Zuschnitt selbsttätig beim Laden, und `setCrop` füllt alle ausgewählten
Plattformen mit ab. Ein daran hängender Marker hätte jedes angeklickte Bild
sofort als fertig gezeigt und wäre beim Drehen zurückgesprungen, weil die
Drehung die Zuschnitte verwirft.

## Fehlerbehandlung

- Erfolgsmeldungen erst nach abgeschlossener Aktion. Diese Regel gilt im Projekt
  bereits und wird nicht aufgeweicht.
- Der Export bleibt unverändert: Ein zu kleiner Ausschnitt bricht mit einer
  Meldung ab, die Bild und Plattform benennt. Es wird nie hochskaliert.
- Fehlgeschlagene Aktionen bleiben als roter Toast stehen.
- Bereits geladene Bilder gehen bei keiner der neuen Funktionen verloren, außer
  beim ausdrücklich bestätigten „Alle entfernen“.

## Barrierefreiheit

- Die Auswahlschalter sind `<button>` mit `aria-pressed`, die Reiterleiste
  erhält `role="tablist"` mit `aria-selected`.
- Die Ablagefläche ist eine reine Ergänzung; der Knopf zum Auswählen von Dateien
  bleibt vollständig per Tastatur bedienbar.
- Der Fortschrittszähler wird als `aria-live="polite"` gemeldet.
- Der Rückfragedialog nutzt die vorhandene `ModalDialogDirective` über den
  `ConfirmDialogService` und ist damit bereits gegen Fokusfallen abgesichert.

## Prüfung

Gezielte Tests je fachlichem Punkt, keine Vollprüfung zwischendurch:

| Prüfung                              | Gegenstand                                                                                           |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `file-name.spec.ts`                  | Umlaute, verbotene Zeichen, Längenbegrenzung, leeres Ergebnis, Nummerierung mit und ohne Grundnamen  |
| `platform-selection.spec.ts`         | An- und Abwählen, alles abwählen, Nachrücken des Arbeitsziels, Erben des Zuschnitts beim Hinzuwählen |
| `image-collection.spec.ts`           | Hinzufügen, Entfernen, Verschieben, Fortschritt setzen und umschalten                                |
| `platform-preview.component.spec.ts` | Für jedes Profil: Vorschauverhältnis gleich Exportverhältnis                                         |
| `file-drop.directive.spec.ts`        | Zähler für verschachtelte `dragleave`, Aussortieren von Nicht-Bildern, Sperre während des Exports    |

Am Ende **einmal**: Typprüfung, vollständige Testsuite und Produktions-Build.

Die Vinted-Vorschau wird zusätzlich im laufenden Browser nachgemessen. Bei einem
Layout-Fehler ist ein bestandener Test kein Beweis – geprüft wird die
tatsächliche Größe des Vorschaubildes gegen das erwartete Verhältnis, für alle
drei Plattformen.

## Abnahmekriterien

1. Der Umbenennungs-Commit enthält keine Verhaltensänderung; Tests und Build
   sind danach grün.
2. Beim Öffnen des Bildoptimierers ist **keine** Plattform ausgewählt und an der
   Stelle des Editors steht der Hinweis, eine auszuwählen.
3. Jede Plattform lässt sich mit **einem** Klick auswählen und mit einem
   weiteren wieder abwählen – auch die zuletzt verbliebene.
4. Bei mehreren ausgewählten Plattformen wechselt die Reiterleiste über dem
   Editor das Arbeitsziel, ohne die Auswahl zu verändern.
5. Bilder lassen sich auf die gesamte Arbeitsfläche ziehen, sowohl im leeren
   Zustand als auch bei bereits geladenen Bildern; Strg+V fügt ein Bild aus der
   Zwischenablage ein.
6. Werden Nicht-Bilder mit abgelegt, nennt eine Meldung ihre Anzahl.
7. „Alle entfernen“ fragt zurück und leert danach die Liste, während
   Plattformauswahl und Grundname stehen bleiben.
8. Ein eingetragener Grundname erscheint in jedem Dateinamen und im Archivnamen;
   ein leeres Feld erzeugt exakt die heutigen Namen.
9. Ein Name mit Umlauten, Leerzeichen und Sonderzeichen ergibt ein Archiv, das
   sich unter Windows entpacken lässt.
10. Die Vinted-Vorschau zeigt im Browser gemessen dasselbe Verhältnis wie die
    Exportdatei; nichts wird abgeschnitten.
11. Ein angesehenes Bild ist in der Liste markiert, der Zähler stimmt, und die
    Markierung übersteht Drehen und Verschieben.
12. Die Markierung lässt sich per Klick von Hand setzen und wieder entfernen.
13. `app.routes.ts`, `layout/sidebar/` und alles unter `shared/` sind
    unverändert. Bausteine aus `shared/` werden ausschließlich **genutzt**
    (`ConfirmDialogService`, `ToastService`, `ModalDialogDirective`), nicht
    geändert – `git diff --name-only` darf außerhalb von
    `src/app/features/image-optimizer/` und der Dokumentation nichts anzeigen.

## Nicht Bestandteil dieses Pakets

- Metadaten anzeigen, bearbeiten oder gezielt schreiben (Paket 2). Der heutige
  Export entfernt bereits sämtliche Metadaten, weil die Canvas-Ausgabe sie
  technisch bedingt verwirft – das ist kein offener Mangel, sondern unsichtbar.
- Farbe, Belichtung und Filter (Paket 2).
- Schärfen. Über `ctx.filter` nicht erreichbar, braucht ein eigenes
  Rechenverfahren.
- Eine „Rückgängig“-Schaltfläche in Toast-Meldungen. Sie würde den gemeinsamen
  Toast-Baustein umbauen, an dem parallel gearbeitet wird.
- Namen je einzelnem Bild. Ein Grundname je Satz wurde ausdrücklich gewählt.
- Die projektweite Umbenennung auf englische Bezeichner. Sie ist beschlossen,
  aber zurückgestellt, bis die Warenwirtschaft zusammengeführt ist. Vermerkt in
  `docs/AI-CHANGELOG.md`.
