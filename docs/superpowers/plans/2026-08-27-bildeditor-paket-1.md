# Bildoptimierer Paket 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Der Bildoptimierer wird englisch benannt, nach Smart/Dumb zerlegt und um Drag-and-Drop, Sammelloeschen, freie Dateinamen und Fortschrittsanzeige erweitert; die Plattformauswahl wird neu gebaut und der Zuschnittfehler der Vinted-Vorschau behoben.

**Architecture:** Eine Smart-Komponente (`image-optimizer.component.ts`) haelt Signals und orchestriert. Alle uebrigen Komponenten sind Dumb Components mit `input()`/`output()` und ohne Dienstkenntnis. Zustandslogik wandert in reine Funktionen (`image-collection.ts`, `platform-selection.ts`, `file-name.ts`), die ohne Oberflaeche geprueft werden.

**Tech Stack:** Angular 22 (Signals, Standalone, `@if`/`@for`, `host`-Objekt), Tailwind CSS 4, Vitest mit jsdom, ngx-image-cropper 9, JSZip.

**Spec:** `docs/superpowers/specs/2026-08-27-bildeditor-paket-1-design.md`

## Global Constraints

- Branch ist `feature/bildeditor-anpassungen`. Es werden **ausschliesslich** Dateien unter `src/app/features/image-optimizer/` geaendert. `app.routes.ts`, `layout/sidebar/` und alles unter `shared/` werden genutzt, aber nie geaendert.
- **Alle Bezeichner englisch**: Datei-, Ordner-, Klassen-, Typ-, Methoden-, Feld- und Variablennamen. **Deutsch bleiben**: Code-Kommentare, sichtbare Oberflaechentexte, Testbeschreibungen und Commit-Beschreibungen im Fliesstext.
- Das gilt **auch innerhalb von Tests**: Hilfsfunktionen, lokale Variablen und DOM-Kennungen (`id`, `for`, `aria-labelledby`) werden englisch benannt. Nur der Text in `describe(...)` und `it(...)` bleibt deutsch. Falls ein Codebeispiel in diesem Plan dagegen verstoesst, gilt diese Vorgabe und nicht das Beispiel.
- **Commit-Nachrichten sind englisch**, Format Conventional Commits (`type(scope): imperative summary`). **Niemals** eine `Co-Authored-By`-Zeile oder eine andere KI-Signatur anhaengen.
- Jede Komponente: Standalone (kein `standalone: true` im Decorator), `changeDetection: ChangeDetectionStrategy.OnPush`, externes HTML-Template, relative Pfade.
- Kein `@HostBinding`/`@HostListener` - stattdessen das `host`-Objekt im Decorator.
- Kein `ngClass`/`ngStyle` - stattdessen `class`- und `style`-Bindings.
- Tailwind-Klassen direkt im Template. **Keine** neuen `.scss`-Dateien.
- Tests importieren `describe`/`it`/`expect` ausdruecklich aus `vitest` (`globals: false`).
- Erfolgsmeldungen erst nach abgeschlossener Aktion; Fehler bleiben als roter Toast stehen.
- Es wird **keine** neue Abhaengigkeit installiert.
- Waehrend der Umsetzung nur gezielte Tests je Task. `npm run typecheck`, die vollstaendige Suite und `npm run build` laufen **einmal** in Task 9.

---

## File Structure

| Datei                                | Verantwortung                                                                                                                                             |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `models/platform-profile.ts`         | Plattformprofile, `Rect`, `Size`, Mindestgroessenpruefung. Umbenannt aus `plattform-profile.ts`.                                                          |
| `models/optimizer-image.ts`          | **Neu.** Typ `OptimizerImage` und `fullImageRect()`. Bisher in der Komponente - dort erzeugt er einen Importzyklus, sobald reine Funktionen ihn brauchen. |
| `services/image-collection.ts`       | **Neu.** Reine Funktionen ueber `readonly OptimizerImage[]`: hinzufuegen, entfernen, verschieben, Zuschnitt merken, Fortschritt.                          |
| `services/platform-selection.ts`     | **Neu.** Reine Funktionen fuer Auswahl und Arbeitsziel.                                                                                                   |
| `services/file-name.ts`              | **Neu.** Namensentschaerfung, Datei- und Archivname.                                                                                                      |
| `services/image-rotation.service.ts` | **Neu.** Canvas-Drehung, aus der Komponente ausgelagert.                                                                                                  |
| `directives/file-drop.directive.ts`  | **Neu.** Drag-and-Drop und Einfuegen aus der Zwischenablage.                                                                                              |
| `components/optimizer-header/`       | **Neu.** Titel, Namensfeld, Knopf zum Hinzufuegen.                                                                                                        |
| `components/platform-selector/`      | **Neu.** Schalterreihe zum An- und Abwaehlen.                                                                                                             |
| `components/platform-tabs/`          | **Neu.** Arbeitsziel-Reiter ueber dem Editor.                                                                                                             |
| `components/drop-zone/`              | **Neu.** Leerzustand und Flaeche beim Darueberziehen.                                                                                                     |
| `components/preview-grid/`           | **Neu.** Raster der Plattformvorschauen.                                                                                                                  |
| `components/export-bar/`             | **Neu.** Statuszeile und Export-Knopf.                                                                                                                    |
| `components/image-list/`             | Umbenannt aus `bild-liste/`. Bekommt Kopfbereich mit Zaehler und "Alle entfernen".                                                                        |
| `components/platform-preview/`       | Umbenannt aus `plattform-vorschau/`. Layout korrigiert.                                                                                                   |
| `components/crop-editor/`            | Umbenannt aus `zuschnitt-editor/`. Nur Umbenennung.                                                                                                       |
| `components/photo-guide/`            | Umbenannt aus `fotoguide/`. Nur Umbenennung.                                                                                                              |
| `image-optimizer.component.ts`       | Smart Component. Ziel nach Task 9: rund 250 statt 616 Zeilen.                                                                                             |

---

## Task 1: Umbenennung auf Englisch

Rein mechanisch. **Keine** Verhaltensaenderung, **keine** neue Funktion, **keine** neue Datei ausser den umbenannten. Die Typpruefung ist das Sicherheitsnetz: Sie findet jede vergessene Referenz.

**Files:**

- Rename: 13 Dateien/Ordner (Tabelle in Step 1)
- Modify: alle Dateien unter `src/app/features/image-optimizer/`

**Interfaces:**

- Produces: `Rect`, `Size`, `PlatformProfile`, `PlatformId`, `Crops`, `KeyedQueue`, `PhotoGuideState`, `ZipEntry`, `RenderPlan`, `deriveRect()`, `meetsMinimumSize()`, `platformById()`, `planOutput()`, `renderImage()`, `setCrop()`, `applyCropToAll()`, `checkOutput()`, `findResolutionIssue()`, `createExportSnapshot()`, `replaceIfCurrent()`, `clampZoom()`, `scaleCropToDisplay()`, `isHeic()`, `HEIC_HINT`, `READ_HINT`, `PLATFORM_PROFILES`

- [ ] **Step 1: Dateien und Ordner umbenennen**

`git mv` statt Kopieren, damit Git die Umbenennung als solche erkennt und die Historie erhalten bleibt.

```bash
cd src/app/features/image-optimizer
git mv components/bild-liste components/image-list
git mv components/image-list/bild-liste.component.ts components/image-list/image-list.component.ts
git mv components/image-list/bild-liste.component.html components/image-list/image-list.component.html
git mv components/fotoguide components/photo-guide
git mv components/photo-guide/fotoguide.component.ts components/photo-guide/photo-guide.component.ts
git mv components/photo-guide/fotoguide.component.html components/photo-guide/photo-guide.component.html
git mv components/plattform-vorschau components/platform-preview
git mv components/platform-preview/plattform-vorschau.component.ts components/platform-preview/platform-preview.component.ts
git mv components/platform-preview/plattform-vorschau.component.html components/platform-preview/platform-preview.component.html
git mv components/platform-preview/plattform-vorschau.component.spec.ts components/platform-preview/platform-preview.component.spec.ts
git mv components/zuschnitt-editor components/crop-editor
git mv components/crop-editor/zuschnitt-editor.component.ts components/crop-editor/crop-editor.component.ts
git mv components/crop-editor/zuschnitt-editor.component.html components/crop-editor/crop-editor.component.html
git mv models/plattform-profile.ts models/platform-profile.ts
git mv services/async-warteschlange.ts services/async-queue.ts
git mv services/async-warteschlange.spec.ts services/async-queue.spec.ts
git mv services/async-zustand.ts services/async-state.ts
git mv services/async-zustand.spec.ts services/async-state.spec.ts
git mv services/bild-export.service.ts services/image-export.service.ts
git mv services/bild-export.spec.ts services/image-export.spec.ts
git mv services/bild-renderer.ts services/image-renderer.ts
git mv services/bild-renderer.spec.ts services/image-renderer.spec.ts
git mv services/fotoguide-zustand.ts services/photo-guide-state.ts
git mv services/fotoguide-zustand.spec.ts services/photo-guide-state.spec.ts
git mv services/plattform-validierung.ts services/platform-validation.ts
git mv services/plattform-validierung.spec.ts services/platform-validation.spec.ts
git mv services/zuschnitt.ts services/crop.ts
git mv services/zuschnitt.spec.ts services/crop.spec.ts
git mv services/zuschnitte.ts services/crops.ts
git mv services/zuschnitte.spec.ts services/crops.spec.ts
cd -
```

`image-optimizer.component.*`, `editor-transform.ts`, `editor-transform.spec.ts`, `zip-export.service.ts`, `zip-export.spec.ts`, `plattform-profile.spec.ts` und `image-optimizer-toast-actions.spec.ts` bleiben. `plattform-profile.spec.ts` wird zusaetzlich umbenannt:

```bash
git mv src/app/features/image-optimizer/models/plattform-profile.spec.ts src/app/features/image-optimizer/models/platform-profile.spec.ts
```

- [ ] **Step 2: Typpruefung laufen lassen, um das Ausmass zu sehen**

Run: `npm run typecheck`
Expected: FAIL mit vielen `TS2307: Cannot find module './services/zuschnitt'`-Fehlern. Das ist erwuenscht - es beweist, dass die Pruefung jede offene Referenz findet.

- [ ] **Step 3: Importpfade in allen Dateien korrigieren**

Jede `import`-Zeile auf die neuen Pfade umstellen. `templateUrl` in den vier umbenannten Komponenten ebenfalls (`'./bild-liste.component.html'` → `'./image-list.component.html'` usw.).

Run: `npm run typecheck`
Expected: Keine `TS2307` mehr. Verbleibende Fehler kommen erst durch Step 4.

- [ ] **Step 4: Typen und Felder in `models/platform-profile.ts` umbenennen**

```ts
/** Ein Rechteck in Pixeln des Originalbildes. */
export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Breite und Hoehe eines Bildes in Pixeln, ohne Position. */
export interface Size {
  readonly width: number;
  readonly height: number;
}

export type PlatformId = 'ebay' | 'kleinanzeigen' | 'vinted';

export interface PlatformProfile {
  readonly id: PlatformId;
  readonly name: string;
  /** Breite geteilt durch Hoehe. */
  readonly exportRatio: number;
  readonly exportWidth: number;
  readonly exportHeight: number;
  /** Offizielle Mindestmasse, oder null wenn die Plattform keine nennt. */
  readonly minWidth: number | null;
  readonly minHeight: number | null;
  /** Grenze der Plattform in MB, oder null wenn keine bekannt ist. */
  readonly maxFileSizeMB: number | null;
  /** Verhaeltnis der Kachel in der Trefferliste. */
  readonly tileRatio: number;
  /**
   * Ob die Trefferliste das Bild beschneidet (`cover`) oder einpasst
   * (`contain`). Nur schneidende Plattformen begrenzen die Safe-Area.
   */
  readonly crops: boolean;
  /** Wie die Vorschau aussieht: Zeile mit Bild links, oder Kachel im Raster. */
  readonly previewKind: 'zeile' | 'kachel';
  readonly source: 'offiziell' | 'gemessen';
  /** Nur bei gemessenen Werten gesetzt. */
  readonly measuredAt?: string;
}

export const PLATFORM_PROFILES: readonly PlatformProfile[] = [/* Werte unveraendert uebernehmen */];

/** Ob eine fertige Ausgabe die bekannten Mindestmasse der Plattform einhaelt. */
export function meetsMinimumSize(size: Size, platform: PlatformProfile): boolean {
  if (platform.minWidth === null || platform.minHeight === null) return true;
  return size.width >= platform.minWidth && size.height >= platform.minHeight;
}

/** Holt ein Profil. Wirft, wenn die Kennung unbekannt ist. */
export function platformById(id: PlatformId): PlatformProfile {
  const found = PLATFORM_PROFILES.find((p) => p.id === id);
  if (!found) throw new Error(`Unbekanntes Plattformprofil: ${id}`);
  return found;
}
```

**Wichtig:** Die Zeichenketten-Werte `'ebay'`, `'kleinanzeigen'`, `'vinted'`, `'zeile'`, `'kachel'`, `'offiziell'`, `'gemessen'` und alle Zahlen bleiben **unveraendert**. Es werden nur Bezeichner umbenannt, keine Daten. Die deutschen Kommentarbloecke bleiben wortgleich stehen.

- [ ] **Step 5: Dienste umbenennen**

`crop.ts`: `leiteAb` → `deriveRect`, `reichtAufloesung` → `hasEnoughResolution`, `vergroesserungsfaktor` → `upscaleFactor`; Parameter `ausschnitt` → `rect`, `verhaeltnis` → `ratio`.

`crops.ts`: `Zuschnitte` → `Crops`, `setzeZuschnitt` → `setCrop`, `uebernimmAufAlle` → `applyCropToAll`; Parameter `vorher` → `before`, `gewaehlt` → `selected`, `quelle` → `sourceId`.

`image-renderer.ts`: `planeAusgabe` → `planOutput`, `rendereBild` → `renderImage`; Feld `quelle` → `source`, `breite`/`hoehe` → `width`/`height`, `qualitaet` → `quality`.

`image-export.service.ts`: `dateiName` → `fileName`, `erzeuge` → `create`.

`zip-export.service.ts`: `ZipEintrag` → `ZipEntry` mit Feldern `folder`/`file`/`data`, `ordnerName` → `folderName`, `packe` → `pack`.

`platform-validation.ts`: `AusgabePruefung` → `OutputCheck` (Feld `istGueltig` → `isValid`), `ZuPruefendesBild` → `CheckableImage`, `Aufloesungsproblem` → `ResolutionIssue` (Felder `bildName` → `imageName`, `plattformName` → `platformName`), `pruefeAusgabe` → `checkOutput`, `findeAufloesungsproblem` → `findResolutionIssue`.

`async-queue.ts`: `SchluesselWarteschlange` → `KeyedQueue`, `einreihen` → `enqueue`, `anzahlAusstehend` → `pendingCount`, `letzteAufgabe` → `lastTask`.

`async-state.ts`: `erstelleExportSnapshot` → `createExportSnapshot`, `ersetzeWennAktuell` → `replaceIfCurrent`, `MitAusschnitten` → `WithCrops`, `IdentifiziertesBild` → `IdentifiedImage`, Felder `liste` → `list`, `ersetzteUrl` → `replacedUrl`, `uebernommen` → `applied`, `datenUrl` → `dataUrl`.

`photo-guide-state.ts`: `FotoguideZustand` → `PhotoGuideState`, `FotoguideTab` → `PhotoGuideTab`, `istOffen` → `isOpen`, `aktiverTab` → `activeTab`, `oeffnen` → `open`, `schliessen` → `close`, `waehleTab` → `selectTab`. Der Tab-Wert `'aufnehmen'` bleibt.

`editor-transform.ts`: `begrenzeZoom` → `clampZoom`, `skaliereAusschnitt` → `scaleCropToDisplay`.

Die zugehoerigen `*.spec.ts` mitziehen. **Testbeschreibungen bleiben deutsch**, nur die aufgerufenen Bezeichner aendern sich.

Run: `npm run typecheck`
Expected: Nur noch Fehler in den Komponenten (Step 6).

- [ ] **Step 6: Komponenten umbenennen**

Klassen: `BildListeComponent` → `ImageListComponent` (Selektor `app-bild-liste` → `app-image-list`), `FotoguideComponent` → `PhotoGuideComponent` (`app-fotoguide` → `app-photo-guide`), `PlattformVorschauComponent` → `PlatformPreviewComponent` (`app-plattform-vorschau` → `app-platform-preview`), `ZuschnittEditorComponent` → `CropEditorComponent` (`app-zuschnitt-editor` → `app-crop-editor`).

In `platform-preview.component.ts` zusaetzlich: `ermittleVorschauAusschnitt` → `resolvePreviewRect`, `planeVorschau` → `planPreview`, `vorschauUrl` → `previewUrl`, `ausgabeGroesse` → `outputSize`, `wirdGerendert` → `isRendering`, `vorschauFehler` → `hasPreviewError`, `ladeBild` → `loadImage`, `rendereVorschau` → `renderPreview`.

In `crop-editor.component.ts`: `datenUrl` → `dataUrl`, `verhaeltnis` → `ratio`, `deaktiviert` → `disabled`, `gespeicherterAusschnitt` → `storedCrop`, `ausschnittGeaendert` → `cropChanged`, `drehen` → `rotateRequested`, `ladenFehlgeschlagen` → `loadFailed`, `bildGeladen` → `imageLoadedEvent`, `cropperEingabe` → `cropperInput`, `zentriere` → `center`, `zuruecksetzen` → `reset`, `setzeZoom` → `setZoom`.

In `image-list.component.ts`: `bilder` → `images`, `aktivesId` → `activeId`, `deaktiviert` → `disabled`, `gewaehlt` → `selected`, `entfernt` → `removed`, `verschoben` → `moved` (Nutzlast `{ id: string; direction: -1 | 1 }`).

In `image-optimizer.component.ts`: `OptimiererBild` → `OptimizerImage`, `HEIC_HINWEIS` → `HEIC_HINT`, `LESE_HINWEIS` → `READ_HINT`, `istHeic` → `isHeic`, `vollesBild` → `fullImageRect`, `bilder` → `images`, `gewaehlteIds` → `selectedPlatformIds`, `aktivesBildId` → `activeImageId`, `aktivePlattformId` → `workingPlatformId`, `laeuft` → `isBusy`, `drehungenLaufen` → `rotationsPending`, `fehler` → `error`, `gewaehlteProfile` → `selectedPlatforms`, `aktivesBild` → `activeImage`, `aktivePlattform` → `workingPlatform`, `aktiverAusschnitt` → `activeCrop`, `aktiveAusgabePruefung` → `activeOutputCheck`, `aufloesungsproblem` → `resolutionIssue`, `schaltePlattform` → `togglePlatform`, `waehleArbeitsziel` → `selectWorkingPlatform`, `setzeAktivesBild` → `setActiveImage`, `nimmDateien` → `addFiles`, `ermittleNaturGroesse` → `measureNaturalSize`, `entferne` → `removeImage`, `merkeAusschnitt` → `saveCrop`, `uebernehmen` → `applyToAll`, `beiLadeFehler` → `onLoadFailed`, `beiBildGeladen` → `onImageLoaded`, `drehe` → `rotate`, `dreheDatei` → `rotateFile`, `ladeOriginaldatei` → `loadOriginalFile`, `verschiebe` → `moveImage`, `exportiere` → `exportImages`, `ladeBild` → `loadImage`, `ladeHerunter` → `download`, `zerstoert` → `destroyed`, `drehWarteschlange` → `rotationQueue`, `fotoguide` → `photoGuide`. Felder von `OptimizerImage`: `datei` → `file`, `datenUrl` → `dataUrl`, `ausschnitte` → `crops`, `drehung` → `rotation`, `ladefehler` → `loadError`, `naturGroesse` → `naturalSize`.

Templates der vier Komponenten und `image-optimizer.component.html` entsprechend anpassen. **Sichtbare Texte bleiben unveraendert deutsch.**

- [ ] **Step 7: Vollstaendig pruefen**

Run: `npm run typecheck`
Expected: PASS, keine Ausgabe.

Run: `npx vitest run src/app/features/image-optimizer`
Expected: PASS, alle bisherigen Tests des Ordners gruen.

Run: `npm run lint && npm run format`
Expected: keine Fehler.

- [ ] **Step 8: Pruefen, dass wirklich nichts ausserhalb geaendert wurde**

Run: `git status --short | grep -v "^R.*image-optimizer" | grep -v "image-optimizer"`
Expected: leere Ausgabe.

- [ ] **Step 9: Commit**

```bash
git add -A src/app/features/image-optimizer
git commit -F - <<'EOF'
refactor(image-optimizer): rename identifiers to English

Mechanical rename only, no behaviour change, so green tests and a clean
typecheck are sufficient proof that nothing broke. Split out from the
feature work that follows for exactly that reason.

The folder was almost entirely German-named while the project convention
is English identifiers; adding new English files alongside would have
left one folder in two languages.
EOF
```

---

## Task 2: Zustandslogik in reine Funktionen ausloesen

**Files:**

- Create: `src/app/features/image-optimizer/models/optimizer-image.ts`
- Create: `src/app/features/image-optimizer/services/image-collection.ts`
- Create: `src/app/features/image-optimizer/services/image-collection.spec.ts`
- Create: `src/app/features/image-optimizer/services/image-rotation.service.ts`
- Modify: `src/app/features/image-optimizer/image-optimizer.component.ts`
- Modify: `src/app/features/image-optimizer/components/image-list/image-list.component.ts`

**Interfaces:**

- Consumes: `Rect`, `Size`, `PlatformProfile`, `PlatformId`, `Crops`, `setCrop`, `applyCropToAll` (Task 1)
- Produces: `OptimizerImage`, `fullImageRect(image)`, `removeImage(list, id)`, `moveImage(list, id, direction)`, `saveCropIn(list, id, platformId, rect, selected)`, `applyCropToAllIn(list, id, platformId, selected)`, `markReviewed(list, id)`, `toggleReviewed(list, id)`, `reviewedCount(list)`, `ImageRotationService.rotate(file, quarters)`

- [ ] **Step 1: Modelldatei anlegen**

Der Typ muss aus der Komponente heraus, sonst entsteht ein Importzyklus: Die Komponente importiert `image-collection.ts`, das wiederum den Typ braucht.

```ts
// src/app/features/image-optimizer/models/optimizer-image.ts
import { Crops } from '../services/crops';
import { Rect, Size } from './platform-profile';

/** Ein hochgeladenes Bild mit seinen plattformspezifischen Zuschnitten. */
export interface OptimizerImage {
  readonly id: string;
  readonly file: File;
  readonly dataUrl: string;
  /** Zuschnitt je Plattform, in Originalpixeln. Leer, solange nichts gesetzt wurde. */
  readonly crops: Crops;
  /**
   * Viertelumdrehungen im Uhrzeigersinn, bereits in `dataUrl` eingebrannt.
   * `dataUrl` zeigt also immer das fertig gedrehte Bild.
   */
  readonly rotation: 0 | 1 | 2 | 3;
  /** Hinweis, falls der Cropper dieses Bild beim Lesen nicht anzeigen konnte. */
  readonly loadError: string | null;
  /** Groesse von `dataUrl` in Originalpixeln. Null, solange unbekannt. */
  readonly naturalSize: Size | null;
  /**
   * Ob der Nutzer dieses Bild bereits im Editor gesehen hat. Bewusst nicht aus
   * den Zuschnitten abgeleitet: Der Cropper meldet den ersten Zuschnitt schon
   * beim Laden, und `setCrop` fuellt alle gewaehlten Plattformen mit ab - ein
   * daran haengender Marker waere sofort nach dem Anklicken gesetzt.
   */
  readonly reviewed: boolean;
}

/** Das volle Bild als Ersatz fuer Plattformen ohne eigenen Zuschnitt. */
export function fullImageRect(image: OptimizerImage): Rect | null {
  if (!image.naturalSize) return null;
  return { x: 0, y: 0, width: image.naturalSize.width, height: image.naturalSize.height };
}
```

- [ ] **Step 2: Den fehlschlagenden Test schreiben**

```ts
// src/app/features/image-optimizer/services/image-collection.spec.ts
import { describe, it, expect } from 'vitest';
import {
  moveImage,
  removeImage,
  removeAll,
  markReviewed,
  toggleReviewed,
  reviewedCount,
} from './image-collection';
import { OptimizerImage } from '../models/optimizer-image';

function image(id: string, reviewed = false): OptimizerImage {
  return {
    id,
    file: new File([''], `${id}.jpg`, { type: 'image/jpeg' }),
    dataUrl: `blob:${id}`,
    crops: {},
    rotation: 0,
    loadError: null,
    naturalSize: { width: 2000, height: 1500 },
    reviewed,
  };
}

describe('Bilderliste verwalten', () => {
  it('entfernt ein Bild und meldet dessen URL zur Freigabe', () => {
    const result = removeImage([image('a'), image('b')], 'a');

    expect(result.list.map((i) => i.id)).toEqual(['b']);
    expect(result.revokedUrls).toEqual(['blob:a']);
  });

  it('meldet nichts zur Freigabe, wenn die Kennung unbekannt ist', () => {
    const result = removeImage([image('a')], 'gibtesnicht');

    expect(result.list.map((i) => i.id)).toEqual(['a']);
    expect(result.revokedUrls).toEqual([]);
  });

  it('verschiebt ein Bild nach vorne', () => {
    const list = moveImage([image('a'), image('b'), image('c')], 'c', -1);

    expect(list.map((i) => i.id)).toEqual(['a', 'c', 'b']);
  });

  it('laesst die Liste am Rand unveraendert', () => {
    const list = [image('a'), image('b')];

    expect(moveImage(list, 'a', -1)).toBe(list);
    expect(moveImage(list, 'b', 1)).toBe(list);
  });

  it('entfernt alle Bilder und meldet jede URL zur Freigabe', () => {
    const result = removeAll([image('a'), image('b')]);

    expect(result.list).toEqual([]);
    expect(result.revokedUrls).toEqual(['blob:a', 'blob:b']);
  });
});

describe('Fortschritt', () => {
  it('markiert ein Bild als durchgesehen', () => {
    expect(markReviewed([image('a')], 'a')[0].reviewed).toBe(true);
  });

  it('gibt dieselbe Liste zurueck, wenn sich nichts aendert', () => {
    const list = [image('a', true)];

    expect(markReviewed(list, 'a')).toBe(list);
  });

  it('schaltet die Markierung in beide Richtungen um', () => {
    const enabled = toggleReviewed([image('a')], 'a');
    expect(enabled[0].reviewed).toBe(true);
    expect(toggleReviewed(enabled, 'a')[0].reviewed).toBe(false);
  });

  it('zaehlt die durchgesehenen Bilder', () => {
    expect(reviewedCount([image('a', true), image('b'), image('c', true)])).toBe(2);
  });
});
```

- [ ] **Step 3: Test laufen lassen, Fehlschlag bestaetigen**

Run: `npx vitest run src/app/features/image-optimizer/services/image-collection.spec.ts`
Expected: FAIL mit `Failed to resolve import "./image-collection"`.

- [ ] **Step 4: Reine Funktionen umsetzen**

```ts
// src/app/features/image-optimizer/services/image-collection.ts
import { PlatformId, PlatformProfile, Rect } from '../models/platform-profile';
import { OptimizerImage } from '../models/optimizer-image';
import { applyCropToAll, setCrop } from './crops';

/**
 * Ergebnis einer Entfernung. Die Object-URLs werden bewusst nur **gemeldet**
 * und nicht hier freigegeben: `URL.revokeObjectURL` ist ein Seiteneffekt und
 * haette in einer reinen Funktion nichts zu suchen - die Komponente ruft ihn.
 */
export interface RemovalResult {
  readonly list: readonly OptimizerImage[];
  readonly revokedUrls: readonly string[];
}

export function removeImage(list: readonly OptimizerImage[], id: string): RemovalResult {
  const affected = list.find((image) => image.id === id);
  if (!affected) return { list, revokedUrls: [] };

  return {
    list: list.filter((image) => image.id !== id),
    revokedUrls: [affected.dataUrl],
  };
}

export function removeAll(list: readonly OptimizerImage[]): RemovalResult {
  return { list: [], revokedUrls: list.map((image) => image.dataUrl) };
}

/** Schiebt ein Bild in der Reihenfolge. Position 0 ist das Hauptbild. */
export function moveImage(
  list: readonly OptimizerImage[],
  id: string,
  direction: -1 | 1,
): readonly OptimizerImage[] {
  const from = list.findIndex((image) => image.id === id);
  const to = from + direction;
  if (from === -1 || to < 0 || to >= list.length) return list;

  const next = [...list];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}

export function saveCropIn(
  list: readonly OptimizerImage[],
  id: string,
  platformId: PlatformId,
  rect: Rect,
  selected: readonly PlatformProfile[],
): readonly OptimizerImage[] {
  return list.map((image) =>
    image.id === id ? { ...image, crops: setCrop(image.crops, platformId, rect, selected) } : image,
  );
}

export function applyCropToAllIn(
  list: readonly OptimizerImage[],
  id: string,
  platformId: PlatformId,
  selected: readonly PlatformProfile[],
): readonly OptimizerImage[] {
  return list.map((image) =>
    image.id === id
      ? { ...image, crops: applyCropToAll(image.crops, platformId, selected) }
      : image,
  );
}

export function markReviewed(
  list: readonly OptimizerImage[],
  id: string,
): readonly OptimizerImage[] {
  const target = list.find((image) => image.id === id);
  if (!target || target.reviewed) return list;

  return list.map((image) => (image.id === id ? { ...image, reviewed: true } : image));
}

export function toggleReviewed(
  list: readonly OptimizerImage[],
  id: string,
): readonly OptimizerImage[] {
  return list.map((image) => (image.id === id ? { ...image, reviewed: !image.reviewed } : image));
}

export function reviewedCount(list: readonly OptimizerImage[]): number {
  return list.filter((image) => image.reviewed).length;
}
```

- [ ] **Step 5: Test laufen lassen, Erfolg bestaetigen**

Run: `npx vitest run src/app/features/image-optimizer/services/image-collection.spec.ts`
Expected: PASS, 8 Tests.

- [ ] **Step 6: Drehdienst ausloesen**

Die Methoden `rotateFile` und `loadOriginalFile` wandern unveraendert aus der Komponente in einen Dienst. Die deutschen Kommentarbloecke werden mit uebernommen.

```ts
// src/app/features/image-optimizer/services/image-rotation.service.ts
import { Injectable } from '@angular/core';
import { Size } from '../models/platform-profile';

@Injectable({ providedIn: 'root' })
export class ImageRotationService {
  /**
   * Rendert `file` um `quarters` Viertelumdrehungen im Uhrzeigersinn gedreht in
   * eine neue Zeichenflaeche und liefert die Object-URL des Ergebnisses samt
   * resultierender Groesse.
   *
   * Gerendert wird immer aus der unveraenderten Originaldatei, nie aus dem
   * zuletzt gedrehten Ergebnis - sonst wuerde jede weitere Drehung erneut als
   * JPEG kodieren und das Bild verloere sichtbar an Qualitaet.
   */
  async rotate(file: File, quarters: 0 | 1 | 2 | 3): Promise<{ dataUrl: string; size: Size }> {
    const source = await this.loadOriginalFile(file);
    const width = source.width;
    const height = source.height;
    const swapped = quarters % 2 === 1;

    const canvas = document.createElement('canvas');
    canvas.width = swapped ? height : width;
    canvas.height = swapped ? width : height;

    const pen = canvas.getContext('2d');
    if (!pen) throw new Error('Der Browser stellt keine Zeichenflaeche bereit.');

    // Weisser Grund: wie beim Export bliebe sonst ein durchsichtiger
    // PNG-Bereich als Schwarz stehen, sobald als JPEG kodiert wird.
    pen.fillStyle = '#ffffff';
    pen.fillRect(0, 0, canvas.width, canvas.height);
    pen.imageSmoothingQuality = 'high';

    pen.translate(canvas.width / 2, canvas.height / 2);
    pen.rotate((quarters * 90 * Math.PI) / 180);
    pen.drawImage(source, -width / 2, -height / 2, width, height);

    if (source instanceof ImageBitmap) source.close();

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('Das gedrehte Bild liess sich nicht erzeugen.'))),
        'image/jpeg',
        0.92,
      );
    });

    return {
      dataUrl: URL.createObjectURL(blob),
      size: { width: canvas.width, height: canvas.height },
    };
  }

  /**
   * `createImageBitmap` wird bevorzugt (dekodiert ausserhalb des UI-Threads);
   * ohne diese API dient ein `<img>` an einer eigenen, danach wieder
   * freigegebenen Object-URL als Rueckfallebene.
   */
  private async loadOriginalFile(file: File): Promise<ImageBitmap | HTMLImageElement> {
    if (typeof createImageBitmap === 'function') return createImageBitmap(file);

    const url = URL.createObjectURL(file);
    try {
      return await new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('Das Bild liess sich nicht lesen.'));
        image.src = url;
      });
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}
```

- [ ] **Step 7: Komponente auf die neuen Bausteine umstellen**

In `image-optimizer.component.ts`:

- `OptimizerImage` und `fullImageRect` aus `./models/optimizer-image` importieren statt lokal zu definieren; die lokalen Definitionen entfernen.
- `rotateFile` und `loadOriginalFile` loeschen; stattdessen `private readonly rotation = inject(ImageRotationService);` und im Warteschlangenlauf `await this.rotation.rotate(image.file, nextRotation)`.
- `removeImage`, `moveImage`, `saveCrop`, `applyToAll` rufen die reinen Funktionen und legen das Ergebnis ins Signal. Beispiel:

```ts
removeImage(id: string): void {
  if (this.isBusy()) return;

  const result = removeImageFrom(this.images(), id);
  this.images.set([...result.list]);
  result.revokedUrls.forEach((url) => URL.revokeObjectURL(url));

  if (this.activeImageId() === id) {
    this.activeImageId.set(this.images()[0]?.id ?? null);
  }
}
```

- Beim Anlegen neuer Bilder in `addFiles` das Feld `reviewed: false` setzen.
- `image-list.component.ts` importiert `OptimizerImage` jetzt aus `../../models/optimizer-image` statt aus der Komponente.

- [ ] **Step 8: Gezielte Tests laufen lassen**

Run: `npx vitest run src/app/features/image-optimizer`
Expected: PASS, alle Tests des Ordners gruen.

- [ ] **Step 9: Commit**

```bash
git add src/app/features/image-optimizer
git commit -F - <<'EOF'
refactor(image-optimizer): extract state logic into pure functions

List handling and canvas rotation lived in the smart component, which
made both untestable without building the editor. They are now pure
functions and a service.

Object URL revocation deliberately stays in the component: it is a side
effect, so the pure functions only report which URLs to release. The
image type moved to models/ because the pure functions need it and
importing it back from the component would create a cycle.
EOF
```

---

## Task 3: Plattformauswahl neu

**Files:**

- Create: `src/app/features/image-optimizer/services/platform-selection.ts`
- Create: `src/app/features/image-optimizer/services/platform-selection.spec.ts`
- Create: `src/app/features/image-optimizer/components/platform-selector/platform-selector.component.ts`
- Create: `src/app/features/image-optimizer/components/platform-selector/platform-selector.component.html`
- Create: `src/app/features/image-optimizer/components/platform-tabs/platform-tabs.component.ts`
- Create: `src/app/features/image-optimizer/components/platform-tabs/platform-tabs.component.html`
- Modify: `src/app/features/image-optimizer/image-optimizer.component.ts`
- Modify: `src/app/features/image-optimizer/image-optimizer.component.html`

**Interfaces:**

- Consumes: `PlatformId`, `PlatformProfile`, `PLATFORM_PROFILES`, `applyCropToAllIn` (Tasks 1-2)
- Produces: `SelectionState`, `togglePlatformIn(state, id)`, `ToggleResult`, `PlatformSelectorComponent`, `PlatformTabsComponent`

- [ ] **Step 1: Den fehlschlagenden Test schreiben**

```ts
// src/app/features/image-optimizer/services/platform-selection.spec.ts
import { describe, it, expect } from 'vitest';
import { togglePlatformIn, SelectionState } from './platform-selection';

const empty: SelectionState = { selectedIds: [], workingId: null };

describe('Plattformauswahl', () => {
  it('startet leer', () => {
    expect(empty.selectedIds).toEqual([]);
    expect(empty.workingId).toBeNull();
  });

  it('macht die erste gewaehlte Plattform zum Arbeitsziel', () => {
    const { state, inheritFrom } = togglePlatformIn(empty, 'ebay');

    expect(state.selectedIds).toEqual(['ebay']);
    expect(state.workingId).toBe('ebay');
    expect(inheritFrom).toBeNull();
  });

  it('meldet beim Hinzuwaehlen das bisherige Arbeitsziel als Zuschnittquelle', () => {
    const first = togglePlatformIn(empty, 'ebay').state;
    const { state, inheritFrom } = togglePlatformIn(first, 'vinted');

    expect(state.selectedIds).toEqual(['ebay', 'vinted']);
    expect(state.workingId).toBe('ebay');
    expect(inheritFrom).toBe('ebay');
  });

  it('waehlt auch die letzte verbliebene Plattform ab', () => {
    const first = togglePlatformIn(empty, 'ebay').state;
    const { state } = togglePlatformIn(first, 'ebay');

    expect(state.selectedIds).toEqual([]);
    expect(state.workingId).toBeNull();
  });

  it('laesst beim Abwaehlen des Arbeitsziels die naechste nachruecken', () => {
    let state = togglePlatformIn(empty, 'ebay').state;
    state = togglePlatformIn(state, 'vinted').state;
    state = togglePlatformIn(state, 'ebay').state;

    expect(state.selectedIds).toEqual(['vinted']);
    expect(state.workingId).toBe('vinted');
  });

  it('laesst das Arbeitsziel unangetastet, wenn eine andere abgewaehlt wird', () => {
    let state = togglePlatformIn(empty, 'ebay').state;
    state = togglePlatformIn(state, 'vinted').state;
    state = togglePlatformIn(state, 'vinted').state;

    expect(state.workingId).toBe('ebay');
  });

  it('meldet beim Abwaehlen nie eine Zuschnittquelle', () => {
    const first = togglePlatformIn(empty, 'ebay').state;

    expect(togglePlatformIn(first, 'ebay').inheritFrom).toBeNull();
  });
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestaetigen**

Run: `npx vitest run src/app/features/image-optimizer/services/platform-selection.spec.ts`
Expected: FAIL mit `Failed to resolve import "./platform-selection"`.

- [ ] **Step 3: Auswahllogik umsetzen**

```ts
// src/app/features/image-optimizer/services/platform-selection.ts
import { PlatformId } from '../models/platform-profile';

export interface SelectionState {
  readonly selectedIds: readonly PlatformId[];
  readonly workingId: PlatformId | null;
}

export interface ToggleResult {
  readonly state: SelectionState;
  /**
   * Plattform, von der die neu hinzugewaehlte ihren Zuschnitt erben soll -
   * sonst wuerde fuer bereits bearbeitete Bilder unbemerkt das Vollbild
   * exportiert. Null beim Abwaehlen und bei der allerersten Auswahl.
   */
  readonly inheritFrom: PlatformId | null;
}

/** Waehlt eine Plattform aus oder ab. Es darf auch gar keine gewaehlt sein. */
export function togglePlatformIn(state: SelectionState, id: PlatformId): ToggleResult {
  if (state.selectedIds.includes(id)) {
    const selectedIds = state.selectedIds.filter((entry) => entry !== id);
    const workingId = state.workingId === id ? (selectedIds[0] ?? null) : state.workingId;
    return { state: { selectedIds, workingId }, inheritFrom: null };
  }

  const selectedIds = [...state.selectedIds, id];
  const inheritFrom = state.workingId;
  return {
    state: { selectedIds, workingId: state.workingId ?? id },
    inheritFrom,
  };
}
```

- [ ] **Step 4: Test laufen lassen, Erfolg bestaetigen**

Run: `npx vitest run src/app/features/image-optimizer/services/platform-selection.spec.ts`
Expected: PASS, 7 Tests.

- [ ] **Step 5: Auswahlkomponente anlegen**

```ts
// src/app/features/image-optimizer/components/platform-selector/platform-selector.component.ts
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import {
  LucideDynamicIcon,
  LucideCheck as Check,
  LucideCircleHelp as CircleHelp,
} from '@lucide/angular';
import { PlatformId, PlatformProfile } from '../../models/platform-profile';

/** Waehlt die Exportziele aus. Ein Klick genuegt in beide Richtungen. */
@Component({
  selector: 'app-platform-selector',
  imports: [LucideDynamicIcon],
  templateUrl: './platform-selector.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlatformSelectorComponent {
  readonly platforms = input.required<readonly PlatformProfile[]>();
  readonly selectedIds = input.required<readonly PlatformId[]>();
  readonly disabled = input(false);

  readonly toggled = output<PlatformId>();
  readonly helpRequested = output<PlatformId>();

  readonly checkIcon = Check;
  readonly helpIcon = CircleHelp;

  isSelected(id: PlatformId): boolean {
    return this.selectedIds().includes(id);
  }

  ratioLabel(platform: PlatformProfile): string {
    if (platform.exportRatio === 1) return '1:1';
    return platform.exportRatio < 1 ? '2:3' : '4:3';
  }
}
```

```html
<!-- src/app/features/image-optimizer/components/platform-selector/platform-selector.component.html -->
<div class="flex flex-wrap items-center gap-2" role="group" aria-label="Exportplattformen">
  <span class="mr-1 text-[10px] font-bold uppercase tracking-wider text-fb-text-muted">
    Plattformen
  </span>
  @for (p of platforms(); track p.id) {
  <div
    class="inline-flex items-stretch overflow-hidden rounded-xl border"
    [class.border-indigo-400/60]="isSelected(p.id)"
    [class.bg-indigo-500/20]="isSelected(p.id)"
    [class.border-fb-border]="!isSelected(p.id)"
  >
    <button
      type="button"
      (click)="toggled.emit(p.id)"
      [disabled]="disabled()"
      [attr.aria-pressed]="isSelected(p.id)"
      class="inline-flex cursor-pointer items-center gap-2 px-3 py-2 text-xs font-semibold text-fb-text-secondary hover:bg-fb-surface-hover hover:text-fb-text-primary disabled:cursor-not-allowed disabled:opacity-40"
    >
      @if (isSelected(p.id)) {
      <svg [lucideIcon]="checkIcon" class="h-3.5 w-3.5 text-indigo-300" aria-hidden="true"></svg>
      }
      <span>{{ p.name }}</span>
      <span class="text-[10px] font-normal text-fb-text-muted">{{ ratioLabel(p) }}</span>
    </button>
    <button
      type="button"
      (click)="helpRequested.emit(p.id)"
      [attr.aria-label]="'Hilfe zu ' + p.name"
      class="grid w-8 cursor-pointer place-items-center border-l border-fb-border text-fb-text-muted hover:bg-indigo-500/10 hover:text-indigo-200 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-400"
    >
      <svg [lucideIcon]="helpIcon" class="h-3.5 w-3.5" aria-hidden="true"></svg>
    </button>
  </div>
  }
</div>
```

- [ ] **Step 6: Reiterleiste fuer das Arbeitsziel anlegen**

```ts
// src/app/features/image-optimizer/components/platform-tabs/platform-tabs.component.ts
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { PlatformId, PlatformProfile } from '../../models/platform-profile';

/** Waehlt, fuer welche Plattform der Editor gerade den Ausschnitt einstellt. */
@Component({
  selector: 'app-platform-tabs',
  imports: [],
  templateUrl: './platform-tabs.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlatformTabsComponent {
  /** Nur die tatsaechlich gewaehlten Plattformen. */
  readonly platforms = input.required<readonly PlatformProfile[]>();
  readonly activeId = input<PlatformId | null>(null);
  readonly disabled = input(false);

  readonly selected = output<PlatformId>();
}
```

```html
<!-- src/app/features/image-optimizer/components/platform-tabs/platform-tabs.component.html -->
@if (platforms().length > 1) {
<div class="flex flex-wrap items-center gap-1" role="tablist" aria-label="Arbeitsziel">
  @for (p of platforms(); track p.id) {
  <button
    type="button"
    role="tab"
    [attr.aria-selected]="p.id === activeId()"
    (click)="selected.emit(p.id)"
    [disabled]="disabled()"
    class="cursor-pointer rounded-lg px-3 py-1.5 text-[11px] font-semibold disabled:cursor-not-allowed disabled:opacity-40"
    [class.bg-indigo-500/20]="p.id === activeId()"
    [class.text-indigo-200]="p.id === activeId()"
    [class.text-fb-text-muted]="p.id !== activeId()"
  >
    {{ p.name }}
  </button>
  }
</div>
}
```

Die Leiste erscheint erst ab zwei Plattformen. Bei genau einer gaebe es nichts zu wechseln, und ein einzelner Reiter wuerde nur eine Wahl vortaeuschen.

- [ ] **Step 7: Smart Component umstellen**

In `image-optimizer.component.ts`:

```ts
readonly selectedPlatformIds = signal<readonly PlatformId[]>([]);
readonly workingPlatformId = signal<PlatformId | null>(null);

readonly selectedPlatforms = computed<PlatformProfile[]>(() =>
  this.profiles.filter((p) => this.selectedPlatformIds().includes(p.id)),
);

readonly workingPlatform = computed<PlatformProfile | null>(
  () => this.selectedPlatforms().find((p) => p.id === this.workingPlatformId()) ?? null,
);

togglePlatform(id: PlatformId): void {
  if (this.isBusy()) return;

  const { state, inheritFrom } = togglePlatformIn(
    { selectedIds: this.selectedPlatformIds(), workingId: this.workingPlatformId() },
    id,
  );
  this.selectedPlatformIds.set(state.selectedIds);
  this.workingPlatformId.set(state.workingId);

  // Neu dazugewaehlt: aus dem bisherigen Arbeitsziel ableiten, damit fuer
  // bereits bearbeitete Bilder nicht unbemerkt das Vollbild exportiert wird.
  if (!inheritFrom) return;
  const selected = this.selectedPlatforms();
  this.images.update((list) =>
    list.map((image) =>
      image.crops[inheritFrom]
        ? { ...image, crops: setCrop(image.crops, inheritFrom, image.crops[inheritFrom]!, selected) }
        : image,
    ),
  );
}

setWorkingPlatform(id: PlatformId): void {
  if (this.isBusy()) return;
  this.workingPlatformId.set(id);
}
```

Die alte Methode `selectWorkingPlatform` (die stillschweigend hinzuwaehlte) entfaellt ersatzlos. `workingPlatform` faellt bewusst **nicht** mehr auf die erste gewaehlte Plattform zurueck - `togglePlatformIn` haelt `workingId` gueltig.

- [ ] **Step 8: Template umstellen**

Den bisherigen Plattformblock in `image-optimizer.component.html` (Zeilen 33-97) ersetzen:

```html
<div class="border-t border-fb-border px-5 py-3">
  <app-platform-selector
    [platforms]="profiles"
    [selectedIds]="selectedPlatformIds()"
    [disabled]="isBusy()"
    (toggled)="togglePlatform($event)"
    (helpRequested)="photoGuide.open($event)"
  ></app-platform-selector>
</div>
```

Im Editorbereich vor `<app-crop-editor>` einfuegen:

```html
<app-platform-tabs
  [platforms]="selectedPlatforms()"
  [activeId]="workingPlatformId()"
  [disabled]="isBusy()"
  (selected)="setWorkingPlatform($event)"
></app-platform-tabs>
```

Und den Zweig fuer "keine Plattform gewaehlt" ergaenzen. Der bisherige `@if (workingPlatform(); as platform)` bekommt ein `@else`:

```html
@else {
<div class="grid min-h-64 place-items-center px-6 py-12 text-center">
  <div>
    <p class="text-sm font-bold text-fb-text-primary">Keine Plattform gewählt</p>
    <p class="mt-1 text-xs text-fb-text-secondary">
      Wähle oben mindestens eine Plattform, für die du Bilder vorbereiten willst.
    </p>
  </div>
</div>
}
```

Die Exportvorschau und die Exportleiste bleiben sichtbar; beide zeigen bei leerer Auswahl von sich aus nichts bzw. sind gesperrt.

- [ ] **Step 9: Gezielte Tests laufen lassen**

Run: `npx vitest run src/app/features/image-optimizer`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add src/app/features/image-optimizer
git commit -F - <<'EOF'
feat(image-optimizer): rebuild platform selection

One button carried two meanings - export target and crop target - so a
platform could only be deselected once it was the working target AND a
second one was selected. Deselecting the default took three clicks and a
detour through another platform.

Selection is now a plain toggle with no minimum, and picking the working
target moved to its own tab strip above the editor. Nothing is selected
on load; the editor area explains what to do instead. Inheriting the crop
from the previous working target is kept - without it, an already cropped
image would silently export as a full frame.
EOF
```

---

## Task 4: Vinted-Vorschau korrigieren

**Files:**

- Modify: `src/app/features/image-optimizer/components/platform-preview/platform-preview.component.html`
- Modify: `src/app/features/image-optimizer/components/platform-preview/platform-preview.component.ts`
- Modify: `src/app/features/image-optimizer/components/platform-preview/platform-preview.component.spec.ts`
- Create: `src/app/features/image-optimizer/components/preview-grid/preview-grid.component.ts`
- Create: `src/app/features/image-optimizer/components/preview-grid/preview-grid.component.html`
- Modify: `src/app/features/image-optimizer/image-optimizer.component.html`

**Interfaces:**

- Consumes: `PlatformProfile`, `Crops`, `planPreview`, `planOutput` (Tasks 1-3)
- Produces: `PreviewGridComponent`

- [ ] **Step 1: Den fehlschlagenden Test schreiben**

An `platform-preview.component.spec.ts` anhaengen:

```ts
describe('Vorschau und Export stimmen ueberein', () => {
  it('liefert fuer jedes Profil einen Plan im Exportverhaeltnis', () => {
    const source = { width: 3000, height: 3000 };

    for (const p of PLATFORM_PROFILES) {
      const plan = planPreview(null, source, p);

      expect(plan, `${p.name} hat keinen Plan`).not.toBeNull();
      expect(plan!.width / plan!.height, `${p.name} weicht ab`).toBeCloseTo(p.exportRatio, 2);
    }
  });

  it('haelt Kachel- und Exportverhaeltnis deckungsgleich', () => {
    // Die Vorschau verzichtet bewusst auf einen eigenen Rahmen und laesst das
    // gerenderte Bild seine Groesse selbst bestimmen. Das ist nur zulaessig,
    // solange beide Verhaeltnisse gleich sind. Gehen sie je auseinander,
    // schlaegt dieser Test an und die Kachel braucht eine echte Nachbildung.
    for (const p of PLATFORM_PROFILES) {
      expect(p.tileRatio, `${p.name}`).toBeCloseTo(p.exportRatio, 5);
    }
  });

  it('erzeugt fuer Vinted ein hochkantes Ergebnis', () => {
    const plan = planPreview(null, { width: 3000, height: 3000 }, platformById('vinted'));

    expect(plan!.height).toBeGreaterThan(plan!.width);
    expect(plan!.width / plan!.height).toBeCloseTo(2 / 3, 2);
  });
});
```

Import-Zeile der Datei ergaenzen um `PLATFORM_PROFILES`, `planPreview` und `platformById`.

- [ ] **Step 2: Test laufen lassen**

Run: `npx vitest run src/app/features/image-optimizer/components/platform-preview`
Expected: PASS. Der Renderplan war nie falsch - der Fehler liegt allein im Layout. Diese Tests sichern die Annahme ab, auf der die Layoutkorrektur beruht.

- [ ] **Step 3: Layout korrigieren**

`seitenverhaeltnis` aus `platform-preview.component.ts` ersatzlos entfernen (der `computed` auf `tileRatio` wird nicht mehr gebraucht). Im Template den mittleren Block ersetzen:

```html
<div class="flex flex-1 items-center justify-center bg-black/30 p-4">
  <div class="relative flex h-64 w-full items-center justify-center">
    @if (previewUrl(); as url) {
    <img
      [src]="url"
      alt="Exportvorschau des Produktfotos für {{ platform().name }}"
      class="max-h-full max-w-full rounded-xl object-contain shadow-lg"
    />
    } @if (isRendering()) {
    <div class="absolute inset-0 grid place-items-center bg-black/35" aria-live="polite">
      <span class="text-[10px] font-medium text-white/70">Vorschau wird aktualisiert …</span>
    </div>
    } @else if (hasPreviewError()) {
    <div
      class="absolute inset-0 grid place-items-center bg-black/35 px-4 text-center"
      role="status"
    >
      <span class="text-[10px] font-medium text-rose-200">Vorschau nicht verfügbar</span>
    </div>
    }
  </div>
</div>
```

Der Unterschied zum bisherigen Stand:

- Die Buehne hat eine **feste Hoehe** (`h-64`) und **kein** eigenes Seitenverhaeltnis. Sie dient nur zum Zentrieren und haelt alle Karten im Raster gleich hoch.
- Das Bild bestimmt seine Groesse selbst (`max-h-full max-w-full object-contain`) und wird nie beschnitten. `object-cover` und `[style.aspect-ratio]` entfallen.
- Die Ueberlagerungen liegen auf der Buehne, nicht auf dem Bild. Die Karte faellt beim Rendern also nicht in sich zusammen.

- [ ] **Step 4: Vorschauraster als eigene Komponente**

```ts
// src/app/features/image-optimizer/components/preview-grid/preview-grid.component.ts
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { PlatformProfile } from '../../models/platform-profile';
import { Crops } from '../../services/crops';
import { PlatformPreviewComponent } from '../platform-preview/platform-preview.component';

/** Zeigt je gewaehlter Plattform, was der Export tatsaechlich liefert. */
@Component({
  selector: 'app-preview-grid',
  imports: [PlatformPreviewComponent],
  templateUrl: './preview-grid.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PreviewGridComponent {
  readonly platforms = input.required<readonly PlatformProfile[]>();
  readonly dataUrl = input.required<string>();
  readonly crops = input.required<Crops>();
}
```

```html
<!-- src/app/features/image-optimizer/components/preview-grid/preview-grid.component.html -->
@if (platforms().length > 0) {
<div class="mb-3 flex items-end justify-between gap-4">
  <div>
    <p class="text-[10px] font-bold uppercase tracking-wider text-fb-text-muted">Kontrolle</p>
    <h2 class="text-sm font-bold text-fb-text-primary">Exportvorschau</h2>
  </div>
  <p class="text-[10px] text-fb-text-muted">Kleine Bilder werden niemals künstlich vergrößert.</p>
</div>
<div class="grid grid-cols-1 items-stretch gap-4 md:grid-cols-2 xl:grid-cols-3">
  @for (p of platforms(); track p.id) {
  <app-platform-preview
    [platform]="p"
    [dataUrl]="dataUrl()"
    [crop]="crops()[p.id] ?? null"
  ></app-platform-preview>
  }
</div>
}
```

Im Haupttemplate den bisherigen Vorschau-Abschnitt ersetzen:

```html
<section>
  <app-preview-grid
    [platforms]="selectedPlatforms()"
    [dataUrl]="image.dataUrl"
    [crops]="image.crops"
  ></app-preview-grid>
</section>
```

- [ ] **Step 5: Tests laufen lassen**

Run: `npx vitest run src/app/features/image-optimizer`
Expected: PASS.

- [ ] **Step 6: Im Browser nachmessen**

Ein Layoutfehler wird von keinem Test bewiesen. Deshalb einmal im laufenden Stand pruefen:

1. `preview_start` mit der Konfiguration aus `.claude/launch.json` (falls nicht vorhanden, anlegen mit `npm start`, Port 4200).
2. Bildoptimierer oeffnen, alle drei Plattformen waehlen, ein Bild laden.
3. Fuer jede Vorschau ueber `javascript_tool` messen:

```js
[...document.querySelectorAll('app-platform-preview img')].map((i) => ({
  alt: i.alt,
  ratio: +(i.clientWidth / i.clientHeight).toFixed(3),
  natural: +(i.naturalWidth / i.naturalHeight).toFixed(3),
}));
```

Expected: Bei allen drei Eintraegen stimmen `ratio` und `natural` auf zwei Nachkommastellen ueberein; Vinted liegt bei rund `0.667`. Ein Screenshot wird dem Nutzer gezeigt.

- [ ] **Step 7: Commit**

```bash
git add src/app/features/image-optimizer
git commit -F - <<'EOF'
fix(image-optimizer): stop the Vinted preview from cropping

The preview frame was capped at 224x256px while declaring the platform
ratio. Vinted is 2:3, which needs 336px of height at that width, so the
box was squashed and object-cover cut off the top and bottom - the
preview showed something the export would never produce. eBay and
Kleinanzeigen stay under the cap, which is why only Vinted looked wrong.

Rather than raising the cap, the frame no longer declares a ratio at all.
The rendered preview comes from the same planning function as the export
and already carries the correct ratio, so it now sizes itself inside a
fixed stage. Frame and content can no longer diverge.

A test pins the assumption this relies on: tile ratio and export ratio
are identical for all three profiles. If they ever diverge, it fails.

Verified in the browser: measured ratio matches the natural ratio for all
three previews, Vinted at 0.667.
EOF
```

---

## Task 5: Drag-and-Drop und Zwischenablage

**Files:**

- Create: `src/app/features/image-optimizer/directives/file-drop.directive.ts`
- Create: `src/app/features/image-optimizer/directives/file-drop.directive.spec.ts`
- Create: `src/app/features/image-optimizer/components/drop-zone/drop-zone.component.ts`
- Create: `src/app/features/image-optimizer/components/drop-zone/drop-zone.component.html`
- Modify: `src/app/features/image-optimizer/image-optimizer.component.ts`
- Modify: `src/app/features/image-optimizer/image-optimizer.component.html`

**Interfaces:**

- Consumes: `ToastService` (aus `shared/`, nur genutzt)
- Produces: `FileDropDirective` mit `disabled` input, `filesDropped` und `dragActiveChanged` outputs; `splitImageFiles(files)`; `DropZoneComponent`

- [ ] **Step 1: Den fehlschlagenden Test schreiben**

```ts
// src/app/features/image-optimizer/directives/file-drop.directive.spec.ts
import { describe, it, expect } from 'vitest';
import { splitImageFiles } from './file-drop.directive';

function file(name: string, type: string): File {
  return new File([''], name, { type });
}

describe('Dateien sortieren', () => {
  it('trennt Bilder von allem anderen', () => {
    const result = splitImageFiles([
      file('a.jpg', 'image/jpeg'),
      file('b.pdf', 'application/pdf'),
      file('c.png', 'image/png'),
      file('d.txt', 'text/plain'),
    ]);

    expect(result.images.map((f) => f.name)).toEqual(['a.jpg', 'c.png']);
    expect(result.skipped).toBe(2);
  });

  it('meldet null uebersprungene, wenn alles Bilder sind', () => {
    expect(splitImageFiles([file('a.jpg', 'image/jpeg')]).skipped).toBe(0);
  });

  it('behandelt eine leere Liste', () => {
    const result = splitImageFiles([]);

    expect(result.images).toEqual([]);
    expect(result.skipped).toBe(0);
  });

  it('erkennt HEIC am Dateinamen, obwohl der Browser keinen Typ meldet', () => {
    // HEIC wird bewusst durchgelassen: Der Nutzer soll die verstaendliche
    // Meldung am Bild sehen, nicht ein stilles Verschwinden erleben.
    const result = splitImageFiles([file('foto.heic', '')]);

    expect(result.images.map((f) => f.name)).toEqual(['foto.heic']);
    expect(result.skipped).toBe(0);
  });
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestaetigen**

Run: `npx vitest run src/app/features/image-optimizer/directives/file-drop.directive.spec.ts`
Expected: FAIL mit `Failed to resolve import "./file-drop.directive"`.

- [ ] **Step 3: Direktive umsetzen**

```ts
// src/app/features/image-optimizer/directives/file-drop.directive.ts
import { Directive, input, output } from '@angular/core';

export interface FileSplit {
  readonly images: readonly File[];
  readonly skipped: number;
}

/**
 * Trennt Bilder von allem anderen.
 *
 * HEIC-Dateien meldet der Browser haeufig ohne `type`. Sie werden trotzdem
 * durchgelassen: Der Nutzer bekommt dann den erklaerenden Hinweis am Bild
 * ("HEIC-Dateien vom iPhone kann der Browser oft nicht oeffnen") statt einer
 * Datei, die kommentarlos verschwindet.
 */
export function splitImageFiles(files: readonly File[]): FileSplit {
  const images = files.filter(
    (file) => file.type.startsWith('image/') || /\.(heic|heif)$/i.test(file.name),
  );
  return { images, skipped: files.length - images.length };
}

/**
 * Nimmt Bilder per Drag-and-Drop und aus der Zwischenablage entgegen.
 *
 * Liegt auf der gesamten Arbeitsflaeche, damit auch bei bereits geladenen
 * Bildern abgelegt werden kann - genau der Fall, der im Alltag zaehlt.
 */
@Directive({
  selector: '[appFileDrop]',
  host: {
    '(dragenter)': 'onDragEnter($event)',
    '(dragover)': 'onDragOver($event)',
    '(dragleave)': 'onDragLeave($event)',
    '(drop)': 'onDrop($event)',
    '(document:paste)': 'onPaste($event)',
  },
})
export class FileDropDirective {
  readonly disabled = input(false);

  readonly filesDropped = output<readonly File[]>();
  readonly dragActiveChanged = output<boolean>();

  /**
   * Tiefenzaehler. `dragleave` feuert auch beim Uebergang auf ein Kindelement -
   * ohne Zaehler flackert die Ablageflaeche beim Ueberfahren der Oberflaeche.
   */
  private depth = 0;

  onDragEnter(event: DragEvent): void {
    if (this.disabled() || !this.carriesFiles(event)) return;
    event.preventDefault();
    this.depth++;
    if (this.depth === 1) this.dragActiveChanged.emit(true);
  }

  /**
   * Ohne `preventDefault` gilt das Ablegen als nicht erlaubt und der Browser
   * oeffnet die abgelegte Datei stattdessen selbst - die Seite wird verlassen
   * und die Arbeit ist weg.
   *
   * Deshalb geschieht die Abwehr **immer**, sobald Dateien im Spiel sind, und
   * ausdruecklich auch waehrend eines laufenden Exports. `disabled()`
   * unterdrueckt nur die *Wirkung* - Ueberlagerung und Weitergabe der Dateien -,
   * niemals die Abwehr selbst. Stuende `disabled()` davor, wuerde genau der
   * Fall eintreten, den dieser Kommentar beschreibt: Wer waehrend des Exports
   * ein Bild fallen laesst, verliert den laufenden Export.
   */
  onDragOver(event: DragEvent): void {
    if (!this.carriesFiles(event)) return;
    event.preventDefault();
    if (this.disabled()) return;
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
  }

  onDragLeave(event: DragEvent): void {
    if (this.disabled()) return;
    event.preventDefault();
    this.depth = Math.max(0, this.depth - 1);
    if (this.depth === 0) this.dragActiveChanged.emit(false);
  }

  /** Siehe `onDragOver`: Die Abwehr steht auch hier vor jeder Bedingung. */
  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.depth = 0;
    this.dragActiveChanged.emit(false);
    if (this.disabled()) return;

    const files = Array.from(event.dataTransfer?.files ?? []);
    if (files.length > 0) this.filesDropped.emit(files);
  }

  onPaste(event: ClipboardEvent): void {
    if (this.disabled()) return;

    const files = Array.from(event.clipboardData?.files ?? []);
    if (files.length > 0) this.filesDropped.emit(files);
  }

  /** Ignoriert das Ziehen von Text oder Verweisen innerhalb der Seite. */
  private carriesFiles(event: DragEvent): boolean {
    return Array.from(event.dataTransfer?.types ?? []).includes('Files');
  }
}
```

- [ ] **Step 4: Test laufen lassen, Erfolg bestaetigen**

Run: `npx vitest run src/app/features/image-optimizer/directives/file-drop.directive.spec.ts`
Expected: PASS, 4 Tests.

- [ ] **Step 5: Ablageflaeche als Komponente**

```ts
// src/app/features/image-optimizer/components/drop-zone/drop-zone.component.ts
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

/**
 * Zwei Zustaende in einer Komponente: die dauerhafte Flaeche, solange noch
 * kein Bild geladen ist, und die Ueberlagerung waehrend eines Ziehvorgangs.
 */
@Component({
  selector: 'app-drop-zone',
  imports: [],
  templateUrl: './drop-zone.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DropZoneComponent {
  readonly isDragActive = input(false);
  readonly hasImages = input(false);
  readonly disabled = input(false);

  readonly filesPicked = output<readonly File[]>();

  onFileInput(target: EventTarget | null): void {
    const input = target as HTMLInputElement | null;
    const files = Array.from(input?.files ?? []);
    if (files.length > 0) this.filesPicked.emit(files);
    if (input) input.value = '';
  }
}
```

Das Leeren von `input.value` ist wichtig: Ohne das laesst sich dieselbe Datei nicht zweimal hintereinander auswaehlen, weil `change` nicht erneut feuert.

```html
<!-- src/app/features/image-optimizer/components/drop-zone/drop-zone.component.html -->
@if (!hasImages()) {
<label
  class="linear-surface block cursor-pointer rounded-2xl border-2 border-dashed p-12 text-center shadow-xl focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-400/50"
  [class.border-indigo-500]="isDragActive()"
  [class.bg-indigo-500/10]="isDragActive()"
  [class.border-fb-border]="!isDragActive()"
>
  <input
    type="file"
    accept="image/*"
    multiple
    [disabled]="disabled()"
    class="sr-only"
    (change)="onFileInput($event.target)"
  />
  <span class="block text-sm font-bold text-fb-text-primary">
    {{ isDragActive() ? 'Jetzt loslassen' : 'Produktbilder hier ablegen' }}
  </span>
  <span class="mt-1 block text-xs text-fb-text-muted">
    oder klicken und mehrere Dateien auswählen
  </span>
</label>
} @else if (isDragActive()) {
<div
  class="pointer-events-none fixed inset-0 z-40 grid place-items-center bg-fb-surface/80 backdrop-blur-sm"
  aria-hidden="true"
>
  <div
    class="rounded-2xl border-2 border-dashed border-indigo-400 bg-fb-surface px-12 py-10 text-center shadow-2xl"
  >
    <span class="block text-base font-bold text-fb-text-primary">Bilder hier ablegen</span>
    <span class="mt-1 block text-xs text-fb-text-muted">Sie werden der Liste hinzugefügt</span>
  </div>
</div>
}
```

Die Ueberlagerung ist `pointer-events-none` und `aria-hidden`: Sie darf das darunterliegende `drop`-Ereignis nicht abfangen und ist fuer Screenreader ohne Bedeutung, weil der Knopf zum Auswaehlen weiterhin vollstaendig bedienbar bleibt.

- [ ] **Step 6: Smart Component verdrahten**

```ts
readonly isDragActive = signal(false);

addFiles(files: readonly File[]): void {
  if (this.isBusy() || files.length === 0) return;

  const { images, skipped } = splitImageFiles(files);

  if (skipped > 0) {
    const text = skipped === 1 ? '1 Datei übersprungen' : `${skipped} Dateien übersprungen`;
    if (images.length === 0) {
      this.toast.warning('Keine Bilder dabei', `${text}, weil es keine Bilder sind.`);
    } else {
      this.toast.info('Nicht alles war ein Bild', `${text}, weil es keine Bilder sind.`);
    }
  }
  if (images.length === 0) return;

  const added: OptimizerImage[] = images.map((file) => ({
    id: crypto.randomUUID(),
    file,
    dataUrl: URL.createObjectURL(file),
    crops: {},
    rotation: 0,
    loadError: null,
    naturalSize: null,
    reviewed: false,
  }));

  this.images.update((list) => [...list, ...added]);
  if (!this.activeImageId() && added.length > 0) {
    this.activeImageId.set(added[0].id);
  }

  for (const image of added) {
    void this.measureNaturalSize(image.id, image.dataUrl);
  }
}
```

Im Template die aeussere `<div class="space-y-5">` mit der Direktive versehen und die Ablageflaeche einhaengen:

Das ist das **umschliessende** Element der ganzen Seite; sein schliessendes
`</div>` steht unveraendert am Dateiende. Nur die Attribute kommen hinzu:

```text
<div class="space-y-5"
     appFileDrop
     [disabled]="isBusy()"
     (filesDropped)="addFiles($event)"
     (dragActiveChanged)="isDragActive.set($event)">
```

Der bisherige `@else`-Zweig mit dem gestrichelten Kasten wird durch die Komponente ersetzt:

```html
<app-drop-zone
  [isDragActive]="isDragActive()"
  [hasImages]="images().length > 0"
  [disabled]="isBusy()"
  (filesPicked)="addFiles($event)"
></app-drop-zone>
```

Die Komponente wird **ausserhalb** des `@if (activeImage(); as image)`-Blocks eingehaengt, damit die Ueberlagerung auch bei geladenen Bildern erscheint.

**Der Knopf "Bilder hinzufuegen" im Kopfbereich muss in diesem Schritt mit
umgestellt werden.** Er ruft bisher `addFiles($any($event.target).files)` und
uebergibt damit eine `FileList`. Ab jetzt erwartet `addFiles` ein Feld; die
`FileList` hat kein `filter`, und `splitImageFiles` wuerde zur Laufzeit
abstuerzen. Das `$any()` im Template verbirgt den Fehler vor der Typpruefung -
er faellt erst beim Klicken auf. Der Kopfbereich wird erst in Task 7 zu einer
eigenen Komponente, bis dahin gilt:

```ts
/** Wandelt die FileList des Dateifeldes in ein Feld und leert das Feld danach. */
onFileInput(target: EventTarget | null): void {
  const input = target as HTMLInputElement | null;
  const files = Array.from(input?.files ?? []);
  if (files.length > 0) this.addFiles(files);
  // Ohne das Leeren feuert `change` nicht erneut, wenn dieselbe Datei
  // ein zweites Mal ausgewaehlt wird.
  if (input) input.value = '';
}
```

Im Template beide verbliebenen Dateifelder auf `(change)="onFileInput($event.target)"`
umstellen und das `$any()` entfernen.

- [ ] **Step 7: Tests laufen lassen**

Run: `npx vitest run src/app/features/image-optimizer`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/app/features/image-optimizer
git commit -F - <<'EOF'
feat(image-optimizer): accept dropped and pasted images

The empty state has always promised "drop images here" while no drop
handler existed, and the dashed area disappeared as soon as the first
image loaded - so adding more meant hunting for the button.

Dropping now works across the whole workspace in both states, and Ctrl+V
pastes from the clipboard. Non-images were previously discarded in
silence, which left the user counting files; they are now reported.

HEIC is deliberately let through despite the browser reporting no MIME
type, so the user gets the explanatory hint on the image instead of a
file that vanishes.
EOF
```

---

## Task 6: Alle Bilder entfernen

**Files:**

- Modify: `src/app/features/image-optimizer/components/image-list/image-list.component.ts`
- Modify: `src/app/features/image-optimizer/components/image-list/image-list.component.html`
- Modify: `src/app/features/image-optimizer/image-optimizer.component.ts`
- Modify: `src/app/features/image-optimizer/image-optimizer.component.html`

**Interfaces:**

- Consumes: `removeAll` (Task 2), `ConfirmDialogService` und `ToastService` (aus `shared/`, nur genutzt)
- Produces: `ImageListComponent` mit zusaetzlichem output `clearAllRequested`

- [ ] **Step 1: Dienstvertrag pruefen**

Run: `sed -n '1,80p' src/app/shared/components/confirm-dialog/confirm-dialog.service.ts`
Expected: Die Methode zum Oeffnen einer Rueckfrage und ihr Rueckgabewert (Promise oder Signal) sind sichtbar. **Diese Signatur exakt uebernehmen**, nicht raten. Die Schnittstelle kennt `titel`, `text`, `bestaetigenText`, `abbrechenText`, `gefahr` und `nurHinweis`.

- [ ] **Step 2: Ausgabe in der Bilderliste ergaenzen**

In `image-list.component.ts`:

```ts
readonly reviewedCount = input(0);
readonly clearAllRequested = output<void>();
```

Im Kopf von `image-list.component.html`, oberhalb der bestehenden `@for`-Schleife:

```html
@if (images().length > 0) {
<div class="mb-3 flex items-center justify-between gap-2 px-1">
  <p class="text-[10px] text-fb-text-muted" aria-live="polite">
    {{ reviewedCount() }} von {{ images().length }} durchgesehen
  </p>
  <button
    type="button"
    (click)="clearAllRequested.emit()"
    [disabled]="disabled()"
    class="cursor-pointer rounded-lg px-2 py-1 text-[10px] font-semibold text-fb-text-muted hover:bg-rose-500/15 hover:text-rose-300 disabled:cursor-not-allowed disabled:opacity-40"
  >
    Alle entfernen
  </button>
</div>
}
```

- [ ] **Step 3: Rueckfrage in der Smart Component**

```ts
private readonly confirm = inject(ConfirmDialogService);

async clearAllImages(): Promise<void> {
  if (this.isBusy() || this.images().length === 0) return;

  const anzahl = this.images().length;
  const bestaetigt = await this.confirm.frage({
    titel: 'Alle Bilder entfernen?',
    text: `${anzahl} Bild(er) werden aus dem Bildoptimierer entfernt. Die Dateien auf deinem Rechner bleiben unberührt. Bereits gesetzte Ausschnitte gehen verloren.`,
    bestaetigenText: 'Alle entfernen',
    gefahr: true,
  });
  if (!bestaetigt) return;

  const result = removeAll(this.images());
  this.images.set([]);
  result.revokedUrls.forEach((url) => URL.revokeObjectURL(url));
  this.activeImageId.set(null);
  this.error.set(null);

  this.toast.success('Alle Bilder wurden entfernt.');
}
```

Der Methodenname `frage` ist ein Platzhalter fuer die in Step 1 abgelesene Signatur. **Die tatsaechliche Signatur verwenden.**

Plattformauswahl, Arbeitsziel und Grundname bleiben bewusst stehen: Der naechste Artikel wird meist genauso exportiert.

- [ ] **Step 4: Template verdrahten**

```html
<app-image-list
  [images]="images()"
  [activeId]="activeImageId()"
  [reviewedCount]="reviewedCount()"
  [disabled]="isBusy()"
  (selected)="setActiveImage($event)"
  (removed)="removeImage($event)"
  (moved)="moveImage($event.id, $event.direction)"
  (clearAllRequested)="clearAllImages()"
></app-image-list>
```

`reviewedCount()` wird in Task 8 als `computed` ergaenzt. Bis dahin genuegt:

```ts
readonly reviewedCount = computed(() => 0);
```

- [ ] **Step 5: Tests laufen lassen**

Run: `npx vitest run src/app/features/image-optimizer`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/features/image-optimizer
git commit -F - <<'EOF'
feat(image-optimizer): add a guarded clear-all action

Clearing a batch meant removing every image one by one. The action is
destructive and irreversible, so it goes through the existing confirm
dialog with the danger flag - red button, focus on cancel - rather than
a bare button.

Every object URL is released; without that the full-resolution photos
would stay in memory for the rest of the session. Platform selection and
base name are kept on purpose: the next item is usually exported the
same way.
EOF
```

---

## Task 7: Grundname, Kopfbereich und Exportleiste

**Files:**

- Create: `src/app/features/image-optimizer/services/file-name.ts`
- Create: `src/app/features/image-optimizer/services/file-name.spec.ts`
- Create: `src/app/features/image-optimizer/components/optimizer-header/optimizer-header.component.{ts,html}`
- Create: `src/app/features/image-optimizer/components/export-bar/export-bar.component.{ts,html}`
- Modify: `src/app/features/image-optimizer/services/image-export.service.ts`
- Modify: `src/app/features/image-optimizer/image-optimizer.component.{ts,html}`

**Interfaces:**

- Consumes: `PlatformProfile`, `folderName` (Task 1)
- Produces: `sanitizeBaseName(input)`, `exportFileName(index, baseName)`, `archiveName(baseName)`, `OptimizerHeaderComponent`, `ExportBarComponent`, `ExportStatus`

- [ ] **Step 1: Den fehlschlagenden Test schreiben**

```ts
// src/app/features/image-optimizer/services/file-name.spec.ts
import { describe, it, expect } from 'vitest';
import { archiveName, exportFileName, sanitizeBaseName } from './file-name';

describe('Namen entschaerfen', () => {
  it('schreibt Umlaute und Eszett aus', () => {
    expect(sanitizeBaseName('Größe 42 Äpfel')).toBe('groesse-42-aepfel');
  });

  it('entfernt in Dateinamen verbotene Zeichen', () => {
    expect(sanitizeBaseName('Nike / Air: Max?')).toBe('nike-air-max');
  });

  it('fasst Trennzeichen zusammen und schneidet Raender ab', () => {
    expect(sanitizeBaseName('  --nike---air--  ')).toBe('nike-air');
  });

  it('behaelt Unterstriche', () => {
    expect(sanitizeBaseName('nike_air_max')).toBe('nike_air_max');
  });

  it('begrenzt auf 60 Zeichen ohne Bindestrich am Ende', () => {
    const long = sanitizeBaseName('a'.repeat(80));

    expect(long.length).toBe(60);
    expect(long.endsWith('-')).toBe(false);
  });

  it('liefert eine leere Zeichenkette, wenn nichts Brauchbares uebrig bleibt', () => {
    expect(sanitizeBaseName('🎉🎉')).toBe('');
    expect(sanitizeBaseName('   ')).toBe('');
    expect(sanitizeBaseName('---')).toBe('');
  });
});

describe('Dateinamen bilden', () => {
  it('nummeriert ohne Grundnamen wie bisher', () => {
    expect(exportFileName(0, '')).toBe('01-main.jpg');
    expect(exportFileName(1, '')).toBe('02.jpg');
    expect(exportFileName(11, '')).toBe('12.jpg');
  });

  it('stellt den Grundnamen voran', () => {
    expect(exportFileName(0, 'nike-air-max-42')).toBe('nike-air-max-42-01-main.jpg');
    expect(exportFileName(2, 'nike-air-max-42')).toBe('nike-air-max-42-03.jpg');
  });

  it('benennt das Archiv nach dem Grundnamen', () => {
    expect(archiveName('')).toBe('flipbase-bilder.zip');
    expect(archiveName('nike-air-max-42')).toBe('nike-air-max-42.zip');
  });
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestaetigen**

Run: `npx vitest run src/app/features/image-optimizer/services/file-name.spec.ts`
Expected: FAIL mit `Failed to resolve import "./file-name"`.

- [ ] **Step 3: Umsetzen**

```ts
// src/app/features/image-optimizer/services/file-name.ts

/** Laenge, ab der ein Grundname abgeschnitten wird. */
const MAX_LENGTH = 60;

/**
 * Macht aus einer freien Eingabe einen Namensteil, der in jedem Dateisystem
 * funktioniert.
 *
 * Der Grund fuer die Strenge: `\ / : * ? " < > |` sind in Windows-Dateinamen
 * verboten. Ein Archiv mit solchen Eintraegen laesst sich nicht entpacken -
 * der Nutzer haette den Export umsonst gemacht.
 *
 * Bleibt nichts Brauchbares uebrig (etwa bei reiner Emoji-Eingabe), wird eine
 * leere Zeichenkette geliefert. Sie gilt als "nicht gesetzt", sodass die
 * bisherige Nummerierung greift statt eines Namens aus lauter Bindestrichen.
 */
export function sanitizeBaseName(input: string): string {
  return (
    input
      .replace(/ä/g, 'ae')
      .replace(/ö/g, 'oe')
      .replace(/ü/g, 'ue')
      .replace(/Ä/g, 'Ae')
      .replace(/Ö/g, 'Oe')
      .replace(/Ü/g, 'Ue')
      .replace(/ß/g, 'ss')
      .normalize('NFD')
      // Zerlegt "é" in "e" + Akzent und entfernt dann den Akzent. Die Umlaute
      // oben laufen absichtlich vorher: "ä" soll "ae" werden, nicht "a".
      .split('')
      .filter((zeichen) => {
        const code = zeichen.codePointAt(0) ?? 0;
        return code < 0x0300 || code > 0x036f;
      })
      .join('')
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, MAX_LENGTH)
      .replace(/-+$/g, '')
  );
}

/**
 * Name einer Exportdatei. Index 0 ist das Hauptbild - bei eBay das Bild im
 * Suchergebnis, bei Vinted das im Raster.
 */
export function exportFileName(index: number, baseName: string): string {
  const number = String(index + 1).padStart(2, '0');
  const suffix = index === 0 ? `${number}-main` : number;
  return baseName ? `${baseName}-${suffix}.jpg` : `${suffix}.jpg`;
}

/** Name des Archivs. Ohne Grundnamen bleibt es beim bisherigen Namen. */
export function archiveName(baseName: string): string {
  return baseName ? `${baseName}.zip` : 'flipbase-bilder.zip';
}
```

`exportFileName` ersetzt `fileName` aus `image-export.service.ts`; die dortige Funktion wird geloescht und ihr Import in der Komponente umgestellt.

- [ ] **Step 4: Test laufen lassen, Erfolg bestaetigen**

Run: `npx vitest run src/app/features/image-optimizer/services/file-name.spec.ts`
Expected: PASS, 9 Tests.

- [ ] **Step 5: Kopfbereich als Komponente**

```ts
// src/app/features/image-optimizer/components/optimizer-header/optimizer-header.component.ts
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

/** Titel, Grundname fuer die Exportdateien und der Knopf zum Hinzufuegen. */
@Component({
  selector: 'app-optimizer-header',
  imports: [],
  templateUrl: './optimizer-header.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OptimizerHeaderComponent {
  readonly baseName = input('');
  readonly disabled = input(false);

  readonly baseNameChanged = output<string>();
  readonly filesPicked = output<readonly File[]>();

  onFileInput(target: EventTarget | null): void {
    const input = target as HTMLInputElement | null;
    const files = Array.from(input?.files ?? []);
    if (files.length > 0) this.filesPicked.emit(files);
    if (input) input.value = '';
  }
}
```

```html
<!-- src/app/features/image-optimizer/components/optimizer-header/optimizer-header.component.html -->
<div class="flex flex-col gap-4 p-5 lg:flex-row lg:items-end lg:justify-between">
  <div class="max-w-2xl">
    <p class="mb-1 text-[10px] font-bold uppercase tracking-[0.18em] text-indigo-300">
      Produktbilder
    </p>
    <h1 class="text-lg font-bold text-fb-text-primary">Bildoptimierer</h1>
    <p class="mt-1 text-xs leading-relaxed text-fb-text-secondary">
      Plattform wählen, Ausschnitt festlegen und fertige Bilder herunterladen. Alles bleibt in
      deinem Browser.
    </p>
  </div>

  <div class="flex flex-col gap-3 sm:flex-row sm:items-end">
    <div class="flex flex-col gap-1">
      <label
        for="export-base-name"
        class="text-[10px] font-bold uppercase tracking-wider text-fb-text-muted"
      >
        Dateiname
      </label>
      <input
        id="export-base-name"
        type="text"
        [value]="baseName()"
        [disabled]="disabled()"
        (input)="baseNameChanged.emit($any($event.target).value)"
        placeholder="z. B. nike-air-max-42"
        class="w-56 rounded-xl border border-fb-border bg-fb-surface px-3 py-2 text-xs text-fb-text-primary placeholder:text-fb-text-muted focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-400/40 disabled:opacity-40"
      />
    </div>

    <label
      class="inline-flex cursor-pointer items-center justify-center rounded-xl border border-indigo-500/40 bg-indigo-500/15 px-4 py-2.5 text-xs font-bold text-indigo-200 hover:bg-indigo-500/25 focus-within:ring-2 focus-within:ring-indigo-400/50"
    >
      <input
        type="file"
        accept="image/*"
        multiple
        [disabled]="disabled()"
        class="sr-only"
        (change)="onFileInput($event.target)"
      />
      Bilder hinzufügen
    </label>
  </div>
</div>
```

- [ ] **Step 6: Exportleiste als Komponente**

Die Smart Component entscheidet, welcher Hinweis gilt, und reicht nur das Ergebnis durch. So bleibt die Dumb Component frei von Fallunterscheidungen.

```ts
// src/app/features/image-optimizer/components/export-bar/export-bar.component.ts
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

export interface ExportStatus {
  readonly kind: 'ready' | 'error';
  readonly title: string;
  readonly detail: string | null;
}

/** Statuszeile und Export-Knopf. */
@Component({
  selector: 'app-export-bar',
  imports: [],
  templateUrl: './export-bar.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExportBarComponent {
  readonly status = input.required<ExportStatus>();
  readonly isBusy = input(false);
  readonly canExport = input(false);

  readonly exportRequested = output<void>();
}
```

```html
<!-- src/app/features/image-optimizer/components/export-bar/export-bar.component.html -->
<section
  class="linear-surface flex flex-col gap-3 rounded-2xl border border-fb-border p-4 shadow-xl sm:flex-row sm:items-center sm:justify-between"
>
  <div>
    @if (status().kind === 'error') {
    <p class="text-[11px] text-rose-300" role="alert">{{ status().title }}</p>
    @if (status().detail; as detail) {
    <p class="text-[10px] text-rose-400/80">{{ detail }}</p>
    } } @else {
    <p class="text-xs font-semibold text-fb-text-primary">{{ status().title }}</p>
    @if (status().detail; as detail) {
    <p class="text-[10px] text-fb-text-muted">{{ detail }}</p>
    } }
  </div>

  <button
    type="button"
    (click)="exportRequested.emit()"
    [disabled]="isBusy() || !canExport()"
    class="linear-btn-primary cursor-pointer rounded-xl px-5 py-2.5 text-xs font-bold disabled:opacity-40"
  >
    {{ isBusy() ? 'Bilder werden erzeugt …' : 'Bilder exportieren' }}
  </button>
</section>
```

- [ ] **Step 7: Smart Component umstellen**

```ts
readonly baseNameInput = signal('');
readonly baseName = computed(() => sanitizeBaseName(this.baseNameInput()));

readonly exportStatus = computed<ExportStatus>(() => {
  const image = this.activeImage();
  if (image?.loadError) return { kind: 'error', title: image.loadError, detail: null };

  const issue = this.resolutionIssue();
  if (issue) {
    return {
      kind: 'error',
      title: `${issue.imageName} ist für ${issue.platformName} mit ${issue.width} × ${issue.height} px zu klein.`,
      detail: null,
    };
  }

  const failure = this.error();
  if (failure) return { kind: 'error', title: failure, detail: null };

  if (this.selectedPlatforms().length === 0) {
    return { kind: 'error', title: 'Noch keine Plattform gewählt', detail: 'Wähle oben mindestens eine aus.' };
  }

  return {
    kind: 'ready',
    title: 'Bereit für den Export',
    detail: 'JPEG mit hoher Qualität, sortiert nach Plattform.',
  };
});

readonly canExport = computed(
  () =>
    !this.rotationsPending() &&
    this.selectedPlatforms().length > 0 &&
    this.images().length > 0 &&
    this.resolutionIssue() === null,
);
```

In `exportImages()` die Namensbildung umstellen:

```ts
entries.push({
  folder: folderName(p),
  file: exportFileName(index, this.baseName()),
  data: await this.imageExport.create(element, crop, p),
});
```

und am Ende:

```ts
const archive = await this.zipExport.pack(entries);
this.download(archive, archiveName(this.baseName()));
```

- [ ] **Step 8: Template umstellen**

Kopfbereich und Exportleiste durch die Komponenten ersetzen:

```html
<app-optimizer-header
  [baseName]="baseNameInput()"
  [disabled]="isBusy()"
  (baseNameChanged)="baseNameInput.set($event)"
  (filesPicked)="addFiles($event)"
></app-optimizer-header>
```

```html
<app-export-bar
  [status]="exportStatus()"
  [isBusy]="isBusy()"
  [canExport]="canExport()"
  (exportRequested)="exportImages()"
></app-export-bar>
```

Die Exportleiste wandert **aus** dem `@if (activeImage(); as image)`-Block heraus und wird nur gezeigt, wenn Bilder vorhanden sind (`@if (images().length > 0)`).

- [ ] **Step 9: Tests laufen lassen**

Run: `npx vitest run src/app/features/image-optimizer`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add src/app/features/image-optimizer
git commit -F - <<'EOF'
feat(image-optimizer): let the user name the exported files

Every export produced 01-main.jpg inside flipbase-bilder.zip, so three
items in a row left three identically named archives in the download
folder with no way to tell them apart.

An optional base name now prefixes every file and names the archive. It
is sanitised hard - umlauts transliterated, anything outside a-z0-9_-
replaced, 60 characters max - because a slash or colon produces an
archive Windows cannot extract. An input that sanitises to nothing counts
as unset, so it falls back to the old numbering instead of a filename
made of dashes.

Header and export bar became presentation components; the export bar
receives one evaluated status object so the branching stays in the smart
component.
EOF
```

---

## Task 8: Fortschrittsanzeige

**Files:**

- Modify: `src/app/features/image-optimizer/components/image-list/image-list.component.{ts,html}`
- Modify: `src/app/features/image-optimizer/image-optimizer.component.{ts,html}`

**Interfaces:**

- Consumes: `markReviewed`, `toggleReviewed`, `reviewedCount` (Task 2)
- Produces: `ImageListComponent` mit output `reviewToggled`

- [ ] **Step 1: Markierung beim Anzeigen setzen**

```ts
setActiveImage(id: string): void {
  if (this.isBusy()) return;
  this.activeImageId.set(id);
  this.images.update((list) => [...markReviewed(list, id)]);
}

toggleReviewed(id: string): void {
  if (this.isBusy()) return;
  this.images.update((list) => [...toggleReviewedIn(list, id)]);
}

readonly reviewedCount = computed(() => countReviewed(this.images()));
```

Der `computed` aus Task 6 (`() => 0`) wird dabei ersetzt.

Damit auch das nach dem Upload automatisch geoeffnete Bild zaehlt, in `addFiles` nach dem Setzen von `activeImageId`:

```ts
if (!this.activeImageId() && added.length > 0) {
  this.activeImageId.set(added[0].id);
  this.images.update((list) => [...markReviewed(list, added[0].id)]);
}
```

- [ ] **Step 2: Abzeichen in der Bilderliste**

In `image-list.component.ts`:

```ts
readonly reviewToggled = output<string>();
```

Im Template innerhalb des `<article>`, in der Fusszeile neben `Bild {{ i + 1 }}`:

```html
<button
  type="button"
  (click)="reviewToggled.emit(bild.id)"
  [disabled]="disabled()"
  [attr.aria-pressed]="bild.reviewed"
  [attr.aria-label]="
    bild.reviewed
      ? 'Bild ' + (i + 1) + ' als nicht durchgesehen markieren'
      : 'Bild ' + (i + 1) + ' als durchgesehen markieren'
  "
  class="inline-flex cursor-pointer items-center gap-1 rounded-full px-2 py-1 text-[9px] font-bold disabled:cursor-not-allowed disabled:opacity-40"
  [class.bg-emerald-500/20]="bild.reviewed"
  [class.text-emerald-300]="bild.reviewed"
  [class.bg-fb-surface-hover]="!bild.reviewed"
  [class.text-fb-text-muted]="!bild.reviewed"
>
  {{ bild.reviewed ? '✓ Gesehen' : 'Offen' }}
</button>
```

Zusaetzlich das `<article>` fuer noch nicht durchgesehene Bilder leicht abdunkeln, damit der Fortschritt auch im Ueberblick erkennbar ist:

```html
[class.opacity-60]="!bild.reviewed && bild.id !== activeId()"
```

- [ ] **Step 3: Template verdrahten**

Am `<app-image-list>` ergaenzen:

```html
(reviewToggled)="toggleReviewed($event)"
```

- [ ] **Step 4: Tests laufen lassen**

Run: `npx vitest run src/app/features/image-optimizer`
Expected: PASS. Die Funktionen selbst sind bereits in Task 2 abgedeckt.

- [ ] **Step 5: Commit**

```bash
git add src/app/features/image-optimizer
git commit -F - <<'EOF'
feat(image-optimizer): show which images have been reviewed

Going through a batch gave no clue where you left off. Each image now
carries a reviewed flag, set when it has been shown in the editor and
toggleable by hand, with a counter above the list.

Deliberately not derived from stored crops: the cropper emits
imageCropped on load rather than on gesture, and setCrop fills in every
selected platform from a single drag - so a crop-based marker would have
shown every clicked image as done, and would have reset on rotation
because rotating discards the crops.
EOF
```

---

## Task 9: Endabnahme

**Files:**

- Modify: `docs/AI-CHANGELOG.md`

**Interfaces:**

- Consumes: alles aus Tasks 1-8
- Produces: nichts

- [ ] **Step 1: Vollstaendige automatisierte Pruefung**

Run: `npm run typecheck`
Expected: PASS, keine Ausgabe.

Run: `npx vitest run`
Expected: PASS, alle Testdateien gruen. Die Zahl muss **ueber** dem Stand vor Task 1 liegen (neu: `image-collection.spec.ts` 8, `platform-selection.spec.ts` 7, `file-name.spec.ts` 9, `file-drop.directive.spec.ts` 4, `platform-preview.component.spec.ts` +3).

Run: `npm run lint`
Expected: keine Fehler.

Run: `npm run build`
Expected: erfolgreich. Die Bundle-Groesse notieren.

- [ ] **Step 2: Nachweisen, dass nichts ausserhalb des Ordners geaendert wurde**

Run: `git diff --name-only master...HEAD | grep -v "^src/app/features/image-optimizer/" | grep -v "^docs/"`
Expected: leere Ausgabe. Jede Zeile hier waere ein Konflikt mit der parallelen Warenwirtschaft.

- [ ] **Step 3: Fachliche Abnahme im Browser**

Alle 13 Abnahmekriterien der Spezifikation der Reihe nach durchgehen. Besonders:

1. Beim Oeffnen ist keine Plattform gewaehlt, der Hinweis steht anstelle des Editors.
2. Jede Plattform mit **einem** Klick an und mit einem weiteren ab - auch die letzte.
3. Bilder auf die Flaeche ziehen, sowohl leer als auch mit geladenen Bildern; Strg+V.
4. Einen Ordner mit Bildern und einer PDF ablegen - die Meldung nennt 1 uebersprungene Datei.
5. `Größe 42/43` als Dateinamen eintragen, exportieren, Archiv entpacken - Dateien heissen `groesse-42-43-01-main.jpg`.
6. Leeres Namensfeld - Archiv heisst `flipbase-bilder.zip`, Dateien `01-main.jpg`.
7. Vinted-Vorschau messen (Messbefehl aus Task 4, Step 6).
8. Ein Bild anklicken, drehen, verschieben - die Markierung bleibt. Von Hand aus- und wieder einschalten.
9. "Alle entfernen" - Rueckfrage erscheint, danach ist die Liste leer, Plattformauswahl und Name stehen noch.

- [ ] **Step 4: Abnahme dokumentieren**

Neuen Eintrag **oben** in `docs/AI-CHANGELOG.md` einfuegen, direkt nach dem Abschnitt "Namenskonvention im Code". Format wie in der Datei vorgegeben, mit den echten Zahlen aus Step 1 und dem tatsaechlichen Messergebnis der Vinted-Vorschau aus Step 3. **Keine Zahl schaetzen** - nur eintragen, was wirklich beobachtet wurde. Offene Punkte, die aufgefallen sind, unter "Offen" nennen.

- [ ] **Step 5: Abschlusscommit**

```bash
git add docs/AI-CHANGELOG.md
git commit -F - <<'EOF'
docs: record image editor package 1 acceptance

Full verification run and the manual browser checks that automated tests
cannot cover, in particular the measured Vinted preview ratio - a layout
bug is not proven fixed by a passing unit test.
EOF
```

---

## Requirement Coverage Review

| Spezifikation                                                                 | Task                                                                        |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Schritt 0: Umbenennung auf Englisch                                           | 1                                                                           |
| Smart/Dumb-Zerlegung, sechs neue Komponenten                                  | 3 (selector, tabs), 4 (preview-grid), 5 (drop-zone), 7 (header, export-bar) |
| `image-collection.ts`, `image-rotation.service.ts`                            | 2                                                                           |
| Plattformauswahl: Umschalter, leerer Start, Nachruecken, Erben                | 3                                                                           |
| Hinweis bei leerer Auswahl                                                    | 3 (Step 8)                                                                  |
| Vinted-Vorschau, feste Buehne, Test der Verhaeltnisannahme                    | 4                                                                           |
| Drag-and-Drop, Zwischenablage, Tiefenzaehler, Meldung uebersprungener Dateien | 5                                                                           |
| Alle entfernen mit Rueckfrage und URL-Freigabe                                | 6                                                                           |
| Grundname, Entschaerfung, Archivname                                          | 7                                                                           |
| Fortschrittsmarkierung, Zaehler, manuelles Umschalten                         | 8                                                                           |
| Barrierefreiheit (`aria-pressed`, `role="tablist"`, `aria-live`)              | 3, 6, 8                                                                     |
| Endabnahme: Typpruefung, Suite, Build, Browser                                | 9                                                                           |
| Nur `features/image-optimizer/` geaendert                                     | 9 (Step 2)                                                                  |

## Plan Self-Review

- **Platzhalter:** Einer bleibt bewusst stehen - der Methodenname des `ConfirmDialogService` in Task 6, Step 3. Er wird in Step 1 desselben Tasks aus der Datei abgelesen. Raten waere hier schlechter als ein ausdruecklicher Leseschritt.
- **Typkonsistenz:** `OptimizerImage` wird in Task 2 definiert und ab da unveraendert verwendet. `reviewed` ist von Anfang an im Typ, wird aber erst in Task 8 sichtbar - deshalb der Zwischenstand `reviewedCount = computed(() => 0)` in Task 6, der in Task 8 ersetzt wird. Bewusst so, damit jeder Task fuer sich lauffaehig bleibt.
- **Namenskollision:** Die reinen Funktionen `removeImage`, `moveImage`, `toggleReviewed` heissen wie die Komponentenmethoden, die sie aufrufen. In der Komponente werden sie deshalb unter Alias importiert (`removeImage as removeImageFrom`, `toggleReviewed as toggleReviewedIn`, `reviewedCount as countReviewed`).
- **Reihenfolge:** Task 4 haengt an Task 3 (`selectedPlatforms`), Task 7 an Task 5 (`addFiles` nimmt `readonly File[]`), Task 8 an Task 2 und 6. Die Reihenfolge ist damit zwingend.
