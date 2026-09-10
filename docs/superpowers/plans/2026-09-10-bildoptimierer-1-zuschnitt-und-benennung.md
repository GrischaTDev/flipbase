# Bildoptimierer 1 – Zuschnitt und Benennung

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Jede Plattform startet mit dem größtmöglichen Ausschnitt ihres Formats aus dem Vollbild, und Exportdateien tragen eine durchgehende Nummer hinter einem Namen, der nie leer ist.

**Architecture:** Reine Funktionen in `services/crops.ts` und `services/file-name.ts` tragen die gesamte Logik und werden ohne DOM geprüft. Die Smart Component `image-optimizer.component.ts` reicht nur noch die Bildgröße und die Exportzeit durch. Kein neues Feld am Datenmodell: Ob der Nutzer den Rahmen selbst gezogen hat, wird aus dem Vergleich mit dem Maximum abgeleitet.

**Tech Stack:** Angular 22 (Signals, OnPush), TypeScript strict, Vitest (Projekt `node` für reine Funktionen, `angular` für Bauteile).

**Spezifikation:** `docs/superpowers/specs/2026-09-10-bildoptimierer-arbeitsflaeche-design.md`, Teil 3 und Teil 6.

## Global Constraints

- **Arbeitsbaum:** `.worktrees/image-optimizer-workspace`, Zweig `feat/image-optimizer-workspace`. Alle Befehle von dort aus. Der Hauptarbeitsbaum gehört anderen Sitzungen und wird nicht angefasst.
- **Bezeichner im Code englisch**, Kommentare und Oberflächentexte deutsch.
- **Commit-Nachrichten englisch**, Conventional Commits v1.0.0, Scope `image-opt`. Titel im Imperativ, kein Punkt am Ende. **Keine `Co-Authored-By`-Zeile und keine andere KI-Signatur.**
- **Node-Tests (`*.spec.ts`) dürfen `TestBed`, `ComponentFixture`, `window`, `document`, `File`, `Blob`, `Image`, `ImageData`, `localStorage`, `navigator` und `HTMLCanvasElement` nicht benutzen** — `npm run test:audit` bricht sonst ab. Was Browserdinge braucht, kommt in `*.dom.spec.ts` oder `*.angular.spec.ts`.
- **`changeDetection: ChangeDetectionStrategy.OnPush`** in jedem Bauteil.
- **Kein `mutate` auf Signals**, nur `set` oder `update`.
- **`any` vermeiden**, bei Unsicherheit `unknown`.
- **Der Grundsatz des Werkzeugs bleibt:** Es wird nie hochskaliert und nie aufgefüllt, und in keinem Export darf Bildinhalt landen, den der Nutzer nicht gesehen hat.

## File Structure

| Datei                                                                        | Verantwortung                                                                            |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `src/app/features/image-optimizer/services/crops.ts`                         | Zuschnitte je Plattform: Maximum bilden, vorbelegen, ableiten. Reine Funktionen.         |
| `src/app/features/image-optimizer/services/crops.spec.ts`                    | Node-Tests dazu. Datei existiert bereits, wird erweitert.                                |
| `src/app/features/image-optimizer/services/image-collection.ts`              | Reicht die Bildgröße aus `OptimizerImage` an `setCrop` durch.                            |
| `src/app/features/image-optimizer/services/file-name.ts`                     | Namensbildung: Grundname, Dateiname, Archivname. Reine Funktionen.                       |
| `src/app/features/image-optimizer/services/file-name.spec.ts`                | Node-Tests dazu. Datei existiert bereits, wird erweitert.                                |
| `src/app/features/image-optimizer/image-optimizer.component.ts`              | Verdrahtung: Vorbelegen nach dem Messen, nach dem Drehen, beim Zuwählen einer Plattform. |
| `src/app/features/image-optimizer/image-optimizer.component.angular.spec.ts` | Bauteiltests dazu. Datei existiert bereits, wird erweitert.                              |

---

### Task 0: Arbeitsbaum lauffähig machen

**Files:** keine — reine Einrichtung.

Der Arbeitsbaum wurde mit `git worktree add` angelegt. Git legt darin nur die
versionierten Dateien an; `node_modules/` fehlt, weil es in `.gitignore` steht.
Ohne diesen Schritt schlägt jeder Testbefehl mit „Cannot find module" fehl, und
`npx` zieht sich stattdessen fremde Fassungen der Werkzeuge aus dem Netz.

- [ ] **Step 1: Abhängigkeiten installieren**

```bash
npm ci
```

Erwartet: Exitcode 0. `npm ci` statt `npm install`, damit genau die Fassungen
aus `package-lock.json` landen. Der `postinstall`-Haken erzeugt dabei auch
`src/app/core/version.ts` — ohne diese Datei meldet `tsc` einen fehlenden
Modulpfad in `sidebar.component.ts`.

- [ ] **Step 2: Ausgangsstand prüfen, bevor irgendetwas geändert wird**

```bash
npx vitest run src/app/features/image-optimizer/
```

Erwartet: PASS. Ist hier schon etwas rot, liegt es **nicht** an diesem Plan —
erst klären, dann anfangen.

- [ ] **Step 3: Kein Commit**

Es wurde nichts an versionierten Dateien geändert. `git status --short` muss
leer sein; erscheint dort `node_modules/`, fehlt der Eintrag in `.gitignore`
und das ist getrennt zu klären.

---

### Task 1: Maximaler Ausschnitt und Erkennung, ob er noch unberührt ist

**Files:**

- Modify: `src/app/features/image-optimizer/services/crops.ts`
- Test: `src/app/features/image-optimizer/services/crops.spec.ts`

**Interfaces:**

- Consumes: `deriveRect(rect: Rect, ratio: number): Rect` aus `./crop`; `Rect`, `Size`, `PlatformProfile`, `PlatformId` aus `../models/platform-profile`.
- Produces:
  - `maximumCrop(size: Size, ratio: number): Rect`
  - `isMaximum(rect: Rect, size: Size, ratio: number): boolean`

- [ ] **Step 1: Write the failing tests**

An `src/app/features/image-optimizer/services/crops.spec.ts` anhängen. Der bestehende Import in Zeile 2 wird erweitert — die Datei importiert bisher `setCrop, applyCropToAll, Crops`:

```ts
import { setCrop, applyCropToAll, Crops, maximumCrop, isMaximum } from './crops';
import { Rect, Size, platformById } from '../models/platform-profile';
```

Danach ans Dateiende:

```ts
/** Ein Handyfoto im Hochformat: 3000 x 4000 px, Verhaeltnis 3:4. */
const phone: Size = { width: 3000, height: 4000 };

describe('Groesster Ausschnitt im Vollbild', () => {
  it('nutzt bei einem Hochformat fuer 2:3 die volle Hoehe', () => {
    // Vinted. Die Breite ist 4000 * 2/3 = 2666,67 - also 88,9 % der 3000.
    const rect = maximumCrop(phone, 2 / 3);

    expect(rect.height).toBeCloseTo(4000, 5);
    expect(rect.width).toBeCloseTo(2666.6667, 3);
    expect(rect.y).toBeCloseTo(0, 5);
  });

  it('legt den Ausschnitt mittig auf die schmalere Achse', () => {
    const rect = maximumCrop(phone, 2 / 3);

    expect(rect.x).toBeCloseTo((3000 - 2666.6667) / 2, 3);
  });

  it('nutzt bei einem Hochformat fuer 1:1 die volle Breite', () => {
    // eBay. Das Quadrat ist so breit wie das Foto und mittig in der Hoehe.
    const rect = maximumCrop(phone, 1);

    expect(rect.width).toBeCloseTo(3000, 5);
    expect(rect.height).toBeCloseTo(3000, 5);
    expect(rect.y).toBeCloseTo(500, 5);
  });

  it('liefert bei passendem Verhaeltnis das ganze Bild', () => {
    const rect = maximumCrop({ width: 1200, height: 1800 }, 2 / 3);

    expect(rect).toEqual({ x: 0, y: 0, width: 1200, height: 1800 });
  });

  it('ist deutlich groesser als der aus dem eBay-Quadrat abgeleitete Rahmen', () => {
    // Genau der gemeldete Fehler: Aus dem Quadrat abgeleitet blieben nur
    // 66,7 % der Fotobreite uebrig, aus dem Vollbild sind es 88,9 %.
    const fromSquare = deriveRect(maximumCrop(phone, 1), 2 / 3);
    const fromFull = maximumCrop(phone, 2 / 3);

    expect(fromSquare.width).toBeCloseTo(2000, 3);
    expect(fromFull.width).toBeCloseTo(2666.6667, 3);
  });
});

describe('Erkennen, ob ein Ausschnitt noch das Maximum ist', () => {
  it('erkennt den unveraenderten Rahmen', () => {
    expect(isMaximum(maximumCrop(phone, 2 / 3), phone, 2 / 3)).toBe(true);
  });

  it('erkennt einen vom Nutzer verkleinerten Rahmen', () => {
    const smaller: Rect = { x: 200, y: 200, width: 1200, height: 1800 };

    expect(isMaximum(smaller, phone, 2 / 3)).toBe(false);
  });

  it('verzeiht eine Abweichung von unter einem Pixel', () => {
    // Der Cropper rechnet ueber die Anzeigegroesse und rundet dabei. Ohne
    // Toleranz gaelte ein nie angefasster Rahmen als vom Nutzer gezogen.
    const max = maximumCrop(phone, 2 / 3);
    const rounded: Rect = {
      x: Math.round(max.x),
      y: max.y,
      width: Math.round(max.width),
      height: max.height,
    };

    expect(isMaximum(rounded, phone, 2 / 3)).toBe(true);
  });

  it('erkennt einen verschobenen Rahmen gleicher Groesse', () => {
    const max = maximumCrop(phone, 2 / 3);
    const moved: Rect = { ...max, x: max.x + 100 };

    expect(isMaximum(moved, phone, 2 / 3)).toBe(false);
  });
});
```

Dafür wird `deriveRect` zusätzlich importiert:

```ts
import { deriveRect } from './crop';
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run --project=node src/app/features/image-optimizer/services/crops.spec.ts
```

Erwartet: FAIL mit `maximumCrop is not a function` beziehungsweise einem TypeScript-Fehler, weil `maximumCrop` und `isMaximum` nicht exportiert sind.

- [ ] **Step 3: Write the implementation**

An `src/app/features/image-optimizer/services/crops.ts` anhängen, und `Size` in den Import der ersten Zeile aufnehmen:

```ts
import { PlatformProfile, PlatformId, Rect, Size } from '../models/platform-profile';
```

```ts
/**
 * Der groesste Ausschnitt im gewuenschten Verhaeltnis, mittig im **ganzen**
 * Bild.
 *
 * Der Unterschied zu `deriveRect` ist der Bezugspunkt, und genau der war der
 * Fehler: `deriveRect` schneidet aus einem vorhandenen Rahmen, diese Funktion
 * aus dem Vollbild. Bei einem 3:4-Handyfoto bekommt Vinted damit 88,9 % der
 * Breite statt der 66,7 %, die aus dem eBay-Quadrat uebrig blieben.
 */
export function maximumCrop(size: Size, ratio: number): Rect {
  return deriveRect({ x: 0, y: 0, width: size.width, height: size.height }, ratio);
}

/**
 * Ab hier gilt ein Rahmen als vom Nutzer angefasst.
 *
 * Der Cropper rechnet ueber die Anzeigegroesse und rundet dabei; ohne
 * Toleranz gaelte ein nie beruehrter Rahmen bereits als gezogen, und das
 * Vorbelegen aus dem Vollbild fiele fuer jede spaeter zugewaehlte Plattform
 * aus.
 */
const TOLERANCE_PX = 1;

/** Ob dieser Ausschnitt (noch) dem Maximum aus dem Vollbild entspricht. */
export function isMaximum(rect: Rect, size: Size, ratio: number): boolean {
  const max = maximumCrop(size, ratio);

  return (
    Math.abs(rect.x - max.x) <= TOLERANCE_PX &&
    Math.abs(rect.y - max.y) <= TOLERANCE_PX &&
    Math.abs(rect.width - max.width) <= TOLERANCE_PX &&
    Math.abs(rect.height - max.height) <= TOLERANCE_PX
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run --project=node src/app/features/image-optimizer/services/crops.spec.ts
```

Erwartet: PASS, alle Tests der Datei grün (die vier bestehenden aus `setCrop`/`applyCropToAll` eingeschlossen).

- [ ] **Step 5: Commit**

```bash
git add src/app/features/image-optimizer/services/crops.ts src/app/features/image-optimizer/services/crops.spec.ts
git commit -m "feat(image-opt): derive the largest crop from the full image

deriveRect() crops out of an existing frame, which is right when the user has
already chosen one. For the very first frame of a platform there is no such
frame, and using another platform's was the bug: on a 3:4 phone photo eBay
claims the full square first, so Vinted derived from that square gets 66.7% of
the photo width where 88.9% fits straight out of the full image.

isMaximum() carries a one-pixel tolerance on purpose. The cropper computes
through the displayed size and rounds, so an exact comparison would report a
never-touched frame as user-dragged."
```

---

### Task 2: Vorbelegen und Ableiten je nachdem, ob der Nutzer gezogen hat

**Files:**

- Modify: `src/app/features/image-optimizer/services/crops.ts`
- Modify: `src/app/features/image-optimizer/services/image-collection.ts:46-56`
- Test: `src/app/features/image-optimizer/services/crops.spec.ts`

**Interfaces:**

- Consumes: `maximumCrop`, `isMaximum` aus Task 1.
- Produces:
  - `seedCrops(size: Size, selected: readonly PlatformProfile[]): Crops`
  - `setCrop(before: Crops, platform: PlatformId, rect: Rect, selected: readonly PlatformProfile[], size: Size | null): Crops` — **fünfter Parameter neu**
  - `saveCropIn` behält seine Signatur; es liest `image.naturalSize` selbst.

- [ ] **Step 1: Write the failing tests**

Import in `crops.spec.ts` erweitern:

```ts
import { setCrop, applyCropToAll, Crops, maximumCrop, isMaximum, seedCrops } from './crops';
```

Ans Dateiende anhängen:

```ts
describe('Alle gewaehlten Plattformen vorbelegen', () => {
  it('gibt jeder gewaehlten Plattform ihr eigenes Maximum', () => {
    const crops = seedCrops(phone, all);

    expect(crops.ebay).toEqual(maximumCrop(phone, 1));
    expect(crops.vinted).toEqual(maximumCrop(phone, 2 / 3));
    expect(crops.kleinanzeigen).toEqual(maximumCrop(phone, 4 / 3));
  });

  it('belegt nur gewaehlte Plattformen', () => {
    const crops = seedCrops(phone, [platformById('vinted')]);

    expect(crops.vinted).toBeDefined();
    expect(crops.ebay).toBeUndefined();
    expect(crops.kleinanzeigen).toBeUndefined();
  });

  it('liefert bei leerer Auswahl nichts', () => {
    expect(seedCrops(phone, [])).toEqual({});
  });
});

describe('Zuschnitt setzen, wenn die Bildgroesse bekannt ist', () => {
  it('belegt leere Plattformen aus dem Vollbild, solange der Rahmen unberuehrt ist', () => {
    // Der Kern der Regel: Wer nichts eingeschraenkt hat, soll fuer die neue
    // Plattform auch nicht eingeschraenkt werden.
    const untouched = maximumCrop(phone, 1);

    const after = setCrop({ ebay: untouched }, 'ebay', untouched, all, phone);

    expect(after.vinted!.width).toBeCloseTo(maximumCrop(phone, 2 / 3).width, 3);
  });

  it('leitet aus dem aktiven Rahmen ab, sobald der Nutzer gezogen hat', () => {
    // Der Grundsatz des Werkzeugs: In keinem Export darf Inhalt landen, den
    // der Nutzer nicht gesehen hat.
    const dragged: Rect = { x: 400, y: 600, width: 1500, height: 1500 };

    const after = setCrop({ ebay: dragged }, 'ebay', dragged, all, phone);

    expect(after.vinted!.width).toBeCloseTo(1000, 3);
    expect(after.vinted!.x).toBeGreaterThanOrEqual(dragged.x);
    expect(after.vinted!.y).toBeGreaterThanOrEqual(dragged.y);
  });

  it('leitet ohne bekannte Bildgroesse wie bisher aus dem Rahmen ab', () => {
    const rect: Rect = { x: 0, y: 0, width: 1500, height: 1000 };

    const after = setCrop({}, 'ebay', rect, all, null);

    expect(after.vinted!.width / after.vinted!.height).toBeCloseTo(2 / 3, 5);
    expect(after.vinted!.width).toBeLessThanOrEqual(rect.width);
  });

  it('laesst bereits angepasste Plattformen auch beim Vorbelegen unangetastet', () => {
    const own: Rect = { x: 10, y: 20, width: 300, height: 450 };
    const untouched = maximumCrop(phone, 1);

    const after = setCrop({ vinted: own }, 'ebay', untouched, all, phone);

    expect(after.vinted).toEqual(own);
  });
});
```

Die vier bestehenden `setCrop`-Tests am Anfang der Datei rufen `setCrop` noch mit vier Argumenten auf. Sie bekommen `null` als fünftes:

```ts
const after = setCrop({}, 'ebay', wide, all, null);
```

Das gilt für alle vier Aufrufe in `describe('Zuschnitt einer Plattform setzen')` — auch für den mit der eingeschränkten Auswahl und den mit `before`.

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run --project=node src/app/features/image-optimizer/services/crops.spec.ts
```

Erwartet: FAIL — `seedCrops is not a function`, und `setCrop` nimmt noch keinen fünften Parameter.

- [ ] **Step 3: Write the implementation**

In `src/app/features/image-optimizer/services/crops.ts` `setCrop` ersetzen und `seedCrops` ergänzen:

```ts
/**
 * Die Vorbelegung eines frisch geladenen Bildes: jede gewaehlte Plattform
 * bekommt ihr eigenes Maximum aus dem Vollbild.
 *
 * Damit ist ein Bild sofort fuer alle Plattformen brauchbar, ohne dass eine
 * Plattform die andere einschraenkt. Der Grundsatz bleibt gewahrt: Solange
 * der Nutzer nichts eingeschraenkt hat, ist das ganze Foto der ehrliche
 * Ausgangspunkt.
 */
export function seedCrops(size: Size, selected: readonly PlatformProfile[]): Crops {
  const crops: Crops = {};

  for (const platform of selected) {
    crops[platform.id] = maximumCrop(size, platform.exportRatio);
  }

  return crops;
}

/**
 * Legt den Zuschnitt einer Plattform ab und fuellt die uebrigen **leeren**
 * gewaehlten Plattformen.
 *
 * Woraus gefuellt wird, haengt daran, ob der Nutzer den aktiven Rahmen selbst
 * gezogen hat:
 *
 * - **unberuehrt** (noch das Maximum) - die leeren Plattformen bekommen
 *   ebenfalls ihr Maximum aus dem Vollbild. Ohne diesen Fall erbte etwa
 *   Vinted (2:3) vom eBay-Quadrat und bekaeme bei einem Handyfoto nur 66,7 %
 *   der Breite statt 88,9 %.
 * - **gezogen** - es wird wie bisher aus dem aktiven Rahmen abgeleitet. So
 *   landet in keinem Export Inhalt, den der Nutzer nicht gesehen hat.
 *
 * Ohne bekannte Bildgroesse (`size` ist null) bleibt es beim Ableiten:
 * Es gibt dann kein Vollbild, auf das sich ein Maximum beziehen koennte.
 *
 * Bereits angepasste Zuschnitte bleiben in beiden Faellen unangetastet - wer
 * sie ueberschreiben will, drueckt den Knopf dafuer.
 */
export function setCrop(
  before: Crops,
  platform: PlatformId,
  rect: Rect,
  selected: readonly PlatformProfile[],
  size: Size | null,
): Crops {
  const after: Crops = { ...before, [platform]: rect };

  const active = selected.find((p) => p.id === platform);
  const seedFromFull =
    size !== null && active !== undefined && isMaximum(rect, size, active.exportRatio);

  for (const p of selected) {
    if (p.id === platform) continue;
    if (after[p.id]) continue;
    after[p.id] =
      seedFromFull && size !== null
        ? maximumCrop(size, p.exportRatio)
        : deriveRect(rect, p.exportRatio);
  }

  return after;
}
```

In `src/app/features/image-optimizer/services/image-collection.ts` reicht `saveCropIn` die Größe des jeweiligen Bildes durch (Zeilen 53–55):

```ts
return list.map((image) =>
  image.id === id
    ? {
        ...image,
        crops: setCrop(image.crops, platformId, rect, selected, image.naturalSize),
      }
    : image,
);
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run --project=node src/app/features/image-optimizer/services/crops.spec.ts src/app/features/image-optimizer/services/image-collection.dom.spec.ts
```

Erwartet: PASS. Falls `image-collection.dom.spec.ts` `setCrop` indirekt prüft, muss dort nichts geändert werden — `saveCropIn` hat seine Signatur behalten.

- [ ] **Step 5: Typprüfung, damit kein Aufrufer übersehen wurde**

```bash
npm run typecheck
```

Erwartet: Exitcode 0. Schlägt es fehl, nennt `tsc` die Stelle, an der `setCrop` noch mit vier Argumenten gerufen wird — dort `null` oder die passende Größe ergänzen.

- [ ] **Step 6: Commit**

```bash
git add src/app/features/image-optimizer/services/crops.ts src/app/features/image-optimizer/services/crops.spec.ts src/app/features/image-optimizer/services/image-collection.ts
git commit -m "feat(image-opt): seed untouched platform crops from the full image

Filling an empty platform from the active platform's frame is correct only
once the user has narrowed that frame down. Before that it silently shrinks
every other format: an untouched eBay square hands Vinted 66.7% of a phone
photo's width where the full image offers 88.9%.

Which source applies is read off the data instead of a new flag - a frame that
still equals its own maximum has not been dragged. That keeps OptimizerImage
unchanged and leaves the rule testable without a component."
```

---

### Task 3: Vorbelegung in der Komponente verdrahten

**Files:**

- Modify: `src/app/features/image-optimizer/image-optimizer.component.ts`
- Test: `src/app/features/image-optimizer/image-optimizer.component.angular.spec.ts`

**Interfaces:**

- Consumes: `seedCrops` aus Task 2.
- Produces: keine neuen öffentlichen Namen. `measureNaturalSize`, `rotate` und `togglePlatform` belegen die Zuschnitte vor.

Drei Stellen brauchen die Vorbelegung:

1. `measureNaturalSize()` — sobald die Größe eines frisch geladenen Bildes bekannt ist.
2. `rotate()` — dort werden die Zuschnitte bereits verworfen (`crops: {}`); sie werden mit der neuen Größe neu belegt.
3. `togglePlatform()` — eine gerade zugewählte Plattform bekommt für Bilder mit bekannter Größe ihr Maximum, wenn der aktive Rahmen unberührt ist. Das übernimmt bereits `setCrop`; hier muss nur die Größe hineinkommen.

- [ ] **Step 1: Write the failing test**

In `src/app/features/image-optimizer/image-optimizer.component.angular.spec.ts` liegen `createComponent` und `jpegFile` heute in einem inneren `describe`. **Beide werden auf Modulebene hochgezogen**, damit der neue Block sie mitbenutzt — wortgleich zu kopieren wäre doppelte Logik, und beim nächsten Konstruktorwechsel würde eine der beiden Fassungen vergessen.

Danach ein eigenes `describe` anhängen:

```ts
describe('ImageOptimizerComponent – Zuschnitt vorbelegen', () => {
  beforeAll(() => TestBed.resetTestingModule());

  /**
   * Die echte Messung laeuft ueber ein `Image`-Element, das in jsdom nie
   * laedt. Der Test setzt die Groesse deshalb so, wie `measureNaturalSize`
   * es tut, und prueft die daran haengende Vorbelegung.
   */
  function withSize(component: ImageOptimizerComponent, id: string, size: Size): void {
    component.applyNaturalSize(id, size);
  }

  it('gibt jeder gewaehlten Plattform ihr Maximum, sobald die Groesse bekannt ist', () => {
    const component = createComponent();
    component.togglePlatform('ebay');
    component.togglePlatform('vinted');
    component.addFiles([jpegFile('a.jpg')]);
    const id = component.images()[0].id;

    withSize(component, id, { width: 3000, height: 4000 });

    const crops = component.images()[0].crops;
    expect(crops.vinted!.width).toBeCloseTo(2666.6667, 3);
    expect(crops.ebay!.width).toBeCloseTo(3000, 3);
  });

  it('gibt einer spaeter zugewaehlten Plattform ebenfalls ihr Maximum', () => {
    // Der gemeldete Fall: eBay steht, Vinted kommt dazu. Ohne die Regel
    // erbte Vinted vom eBay-Quadrat und waere um ein Drittel zu schmal.
    const component = createComponent();
    component.togglePlatform('ebay');
    component.addFiles([jpegFile('a.jpg')]);
    const id = component.images()[0].id;
    withSize(component, id, { width: 3000, height: 4000 });

    component.togglePlatform('vinted');

    expect(component.images()[0].crops.vinted!.width).toBeCloseTo(2666.6667, 3);
  });

  it('erbt vom aktiven Rahmen, sobald der Nutzer gezogen hat', () => {
    const component = createComponent();
    component.togglePlatform('ebay');
    component.addFiles([jpegFile('a.jpg')]);
    const id = component.images()[0].id;
    withSize(component, id, { width: 3000, height: 4000 });

    component.saveCrop(id, { x: 400, y: 600, width: 1500, height: 1500 });
    component.togglePlatform('vinted');

    expect(component.images()[0].crops.vinted!.width).toBeCloseTo(1000, 3);
  });
});
```

Die Datei braucht dafür zusätzlich:

```ts
import { Size } from './models/platform-profile';
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run --project=angular src/app/features/image-optimizer/image-optimizer.component.angular.spec.ts
```

Erwartet: FAIL — `component.applyNaturalSize is not a function`.

- [ ] **Step 3: Write the implementation**

In `src/app/features/image-optimizer/image-optimizer.component.ts`:

Import ergänzen:

```ts
import { setCrop, seedCrops } from './services/crops';
```

`Size` in den bestehenden Import aus `./models/platform-profile` aufnehmen:

```ts
import {
  PLATFORM_PROFILES,
  PlatformProfile,
  PlatformId,
  Rect,
  Size,
} from './models/platform-profile';
```

Neue Methode, direkt über `measureNaturalSize` eingefügt:

```ts
/**
 * Traegt eine ermittelte Bildgroesse ein und belegt die Zuschnitte damit vor.
 *
 * Oeffentlich, damit sich die Vorbelegung ohne ein `Image`-Element pruefen
 * laesst: `measureNaturalSize` wartet auf dessen `load`, und das kommt unter
 * jsdom nie. Ohne diesen Einstieg waere die Regel, die den zu kleinen
 * Vinted-Rahmen behebt, nur von Hand im Browser nachweisbar.
 *
 * Der Abgleich `image.dataUrl === dataUrl` schuetzt vor einer veralteten
 * Antwort; wird keine URL uebergeben, ist der Aufrufer selbst dafuer
 * zustaendig (siehe `rotate`).
 */
applyNaturalSize(id: string, size: Size, dataUrl?: string): void {
  const selected = this.selectedPlatforms();
  this.images.update((list) =>
    list.map((image) =>
      image.id === id && (dataUrl === undefined || image.dataUrl === dataUrl)
        ? { ...image, naturalSize: size, crops: seedCrops(size, selected) }
        : image,
    ),
  );
}
```

`measureNaturalSize` benutzt sie (der `try`-Block wird ersetzt):

```ts
  private async measureNaturalSize(id: string, dataUrl: string): Promise<void> {
    try {
      const element = await this.loadImage(dataUrl);
      this.applyNaturalSize(
        id,
        { width: element.naturalWidth, height: element.naturalHeight },
        dataUrl,
      );
    } catch {
      // Siehe Kommentar oben - bewusst kein Fehlerpfad hier.
    }
  }
```

In `rotate()` wird die bisherige Zeile `crops: {},` durch die Vorbelegung mit der neuen Größe ersetzt:

```ts
            // Ein vor der Drehung gezogener Ausschnitt bezieht sich auf
            // die ungedrehte Geometrie. Statt leer zu bleiben, wird mit dem
            // Maximum der gedrehten Groesse neu vorbelegt - sonst muesste
            // der Nutzer nach jeder Drehung von Hand aufziehen.
            crops: seedCrops(size, selected),
```

Dafür wird die Auswahl vor dem `this.images.update(...)` in `rotate()` festgehalten:

```ts
const selected = this.selectedPlatforms();
```

In `togglePlatform()` bekommt der Aufruf von `setCrop` die Bildgröße:

```ts
this.images.update((list) =>
  list.map((image) =>
    image.crops[inheritFrom]
      ? {
          ...image,
          crops: setCrop(
            image.crops,
            inheritFrom,
            image.crops[inheritFrom]!,
            selected,
            image.naturalSize,
          ),
        }
      : image,
  ),
);
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run --project=angular src/app/features/image-optimizer/image-optimizer.component.angular.spec.ts
```

Erwartet: PASS, alle Tests der Datei grün.

- [ ] **Step 5: Run the full image-optimizer suite**

```bash
npx vitest run src/app/features/image-optimizer/
```

Erwartet: PASS. Läuft ein bestehender Test rot, weil er das alte Verhalten festhält (leere Zuschnitte nach dem Drehen, leere Zuschnitte vor der ersten Geste), wird **der Test** angepasst und die Änderung im Commit begründet — die neue Vorbelegung ist gewollt.

- [ ] **Step 6: Commit**

```bash
git add src/app/features/image-optimizer/image-optimizer.component.ts src/app/features/image-optimizer/image-optimizer.component.angular.spec.ts
git commit -m "feat(image-opt): preset every platform crop once the size is known

The crop editor reports a first frame from its own default the moment an image
loads, and that frame used to become the stored one. Feeding the preset in
beforehand means the maximum is what the cropper restores, so the user never
sees the too-small frame at all - no change to the library was needed.

Rotation now re-presets instead of clearing. Clearing was safe but made every
rotation cost a manual drag on all three platforms.

applyNaturalSize is public so the preset can be tested without an Image
element, which never loads under jsdom."
```

---

### Task 4: Benennung ohne `-main`, mit Zeitstempel als Ersatzname

**Files:**

- Modify: `src/app/features/image-optimizer/services/file-name.ts`
- Modify: `src/app/features/image-optimizer/image-optimizer.component.ts`
- Test: `src/app/features/image-optimizer/services/file-name.spec.ts`

**Interfaces:**

- Consumes: `sanitizeBaseName(input: string): string` (vorhanden).
- Produces:
  - `effectiveBaseName(baseName: string, now: Date): string`
  - `exportFileName(index: number, baseName: string): string` — `-main` entfällt, `baseName` gilt als nie leer
  - `archiveName(baseName: string): string` — ohne Ersatzwort, erwartet einen bereits wirksamen Namen

- [ ] **Step 1: Write the failing tests**

An `src/app/features/image-optimizer/services/file-name.spec.ts` anhängen, Import um `effectiveBaseName` erweitern:

```ts
describe('Wirksamer Grundname', () => {
  const noon = new Date(2026, 8, 10, 14, 32, 5);

  it('nimmt den eingetippten Namen, wenn einer da ist', () => {
    expect(effectiveBaseName('macbook-air', noon)).toBe('macbook-air');
  });

  it('setzt ohne Eingabe Datum und Uhrzeit ein', () => {
    // Jahr zuerst, damit der Explorer von allein chronologisch sortiert.
    expect(effectiveBaseName('', noon)).toBe('2026-09-10-1432');
  });

  it('fuellt Monat, Tag, Stunde und Minute auf zwei Stellen', () => {
    expect(effectiveBaseName('', new Date(2026, 0, 3, 7, 4, 0))).toBe('2026-01-03-0704');
  });

  it('benutzt keinen Doppelpunkt', () => {
    // In Windows-Dateinamen verboten - eine Datei mit Doppelpunkt liesse
    // sich gar nicht erst schreiben.
    expect(effectiveBaseName('', noon)).not.toContain(':');
  });
});

describe('Name einer Exportdatei', () => {
  it('nummeriert durchgehend, auch das erste Bild', () => {
    // Das frueher angehaengte "-main" unterbrach die Zahlenkette am Ende des
    // Namens und brachte die Sortierung in Windows durcheinander.
    expect(exportFileName(0, 'macbook-air')).toBe('macbook-air-01.jpg');
    expect(exportFileName(1, 'macbook-air')).toBe('macbook-air-02.jpg');
  });

  it('haengt kein main mehr an', () => {
    expect(exportFileName(0, 'macbook-air')).not.toContain('main');
  });

  it('behaelt die fuehrende Null bis zur neunten Datei', () => {
    // Die Upload-Dialoge der Plattformen sortieren rein alphabetisch; ohne
    // Null stuende dort 10 vor 2.
    expect(exportFileName(8, 'x')).toBe('x-09.jpg');
    expect(exportFileName(9, 'x')).toBe('x-10.jpg');
  });

  it('setzt den Namen vor die Nummer', () => {
    // Andersherum mischten sich mehrere Artikel im selben Ordner
    // ineinander: erst alle Einsen, dann alle Zweien.
    expect(exportFileName(0, 'macbook-air').startsWith('macbook-air')).toBe(true);
  });
});

describe('Name des Archivs', () => {
  it('haengt nur die Endung an den wirksamen Namen', () => {
    expect(archiveName('macbook-air')).toBe('macbook-air.zip');
  });

  it('benennt den Zeitstempel genauso wie die Dateien darin', () => {
    // Der ZIP-Rueckfall darf nicht anders benennen als der Hauptweg.
    const stamp = effectiveBaseName('', new Date(2026, 8, 10, 14, 32, 5));

    expect(archiveName(stamp)).toBe('2026-09-10-1432.zip');
    expect(exportFileName(0, stamp)).toBe('2026-09-10-1432-01.jpg');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run --project=node src/app/features/image-optimizer/services/file-name.spec.ts
```

Erwartet: FAIL — `effectiveBaseName` fehlt, und `exportFileName(0, 'macbook-air')` liefert noch `macbook-air-01-main.jpg`.

- [ ] **Step 3: Write the implementation**

In `src/app/features/image-optimizer/services/file-name.ts` die letzten beiden Funktionen ersetzen:

```ts
/** Zweistellig, mit fuehrender Null. */
function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/**
 * Der Grundname, oder Datum und Uhrzeit, wenn keiner eingetippt wurde.
 *
 * Ein namenloser Export hiess frueher `flipbase-bilder` mit Dateien `01.jpg`,
 * `02.jpg`. Sobald eine solche Datei aus ihrem Ordner gezogen wurde, war
 * nicht mehr erkennbar, wozu sie gehoert - und ein zweiter Export ueberschrieb
 * den ersten. Der Zeitstempel loest beides.
 *
 * Jahr zuerst, damit der Explorer chronologisch sortiert. Kein Doppelpunkt
 * zwischen Stunde und Minute: In Windows-Dateinamen ist er verboten.
 *
 * `now` ist ein Parameter und kein `new Date()` in der Funktion. Der Aufrufer
 * nimmt die Zeit **einmal** je Export; zoege jede Datei ihre eigene, koennte
 * ein Export ueber einen Minutenwechsel hinweg in zwei Namen zerfallen.
 */
export function effectiveBaseName(baseName: string, now: Date): string {
  if (baseName) return baseName;

  return [
    now.getFullYear(),
    '-',
    pad(now.getMonth() + 1),
    '-',
    pad(now.getDate()),
    '-',
    pad(now.getHours()),
    pad(now.getMinutes()),
  ].join('');
}

/**
 * Name einer Exportdatei. Durchgehend nummeriert, ohne Sonderfall fuer das
 * erste Bild.
 *
 * Frueher trug Bild 1 ein angehaengtes `-main`. Das unterbrach die Zahlenkette
 * am Ende des Namens; beim Durchblaettern eines geoeffneten Ordners fiel die
 * Datei aus der Reihe. Dass Bild 1 das Hauptbild ist, sagt das Abzeichen in
 * der Oberflaeche.
 *
 * `baseName` ist hier nie leer - der Aufrufer schickt `effectiveBaseName()`
 * hindurch.
 */
export function exportFileName(index: number, baseName: string): string {
  return `${baseName}-${pad(index + 1)}.jpg`;
}

/** Name des Archivs fuer den ZIP-Rueckfall. Erwartet den wirksamen Namen. */
export function archiveName(baseName: string): string {
  return `${baseName}.zip`;
}
```

`MAX_LENGTH` und `sanitizeBaseName` bleiben unverändert stehen.

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run --project=node src/app/features/image-optimizer/services/file-name.spec.ts
```

Erwartet: PASS. Bestehende Tests, die `01-main` oder `flipbase-bilder.zip` erwarten, werden gelöscht — sie halten genau das Verhalten fest, das hier abgeschafft wird.

- [ ] **Step 5: Verdrahten im Export**

In `src/app/features/image-optimizer/image-optimizer.component.ts` den Import erweitern:

```ts
import {
  archiveName,
  effectiveBaseName,
  exportFileName,
  sanitizeBaseName,
} from './services/file-name';
```

In `exportImages()` wird die Zeit einmal genommen und überall benutzt. Direkt nach `const snapshot = createExportSnapshot(...)`:

```ts
// Einmal je Export, nicht je Datei: Sonst koennte ein Lauf ueber einen
// Minutenwechsel hinweg zwei verschiedene Namen erzeugen.
const name = effectiveBaseName(this.baseName(), new Date());
```

Die beiden Verwendungsstellen im selben `try`-Block:

```ts
            file: exportFileName(index, name),
```

```ts
this.download(archive, archiveName(name));
```

- [ ] **Step 6: Typprüfung und Gesamtlauf des Bildoptimierers**

```bash
npm run typecheck
npx vitest run src/app/features/image-optimizer/
```

Erwartet: beide Exitcode 0.

- [ ] **Step 7: Commit**

```bash
git add src/app/features/image-optimizer/services/file-name.ts src/app/features/image-optimizer/services/file-name.spec.ts src/app/features/image-optimizer/image-optimizer.component.ts
git commit -m "feat(image-opt): number every export file in one unbroken run

The first image used to carry an appended -main. That broke the digit run at
the end of the name, so paging through an opened folder with the arrow keys
fell out of order at exactly the image the seller looks at first. The badge in
the UI still says which one is the main image.

An empty base name now becomes a YYYY-MM-DD-hhmm stamp rather than a fixed
word. Two nameless exports no longer collide, and a file pulled out of its
folder stays traceable - the previous 01.jpg did not. No colon: Windows
forbids it in filenames.

The clock is read once per export and passed down, so a run crossing a minute
boundary cannot split its own naming, and the function stays testable."
```

---

### Task 5: Gesamtprüfung und Protokoll

**Files:**

- Modify: `docs/AI-CHANGELOG.md`

- [ ] **Step 1: Vollständige Prüfung fahren**

```bash
npm run verify > /tmp/verify-1.log 2>&1; echo "Exitcode: $?"
```

Erwartet: `Exitcode: 0`. **Den Exitcode nicht durch eine Pipe messen** — `npm run verify | tail` meldet den Code von `tail` und sieht auch bei ESLint-Fehlern grün aus.

Bei Fehlschlag: `tail -60 /tmp/verify-1.log` zeigt die Ursache. `npm run typecheck` allein genügt nicht, weil `tsc` keine Angular-Vorlagen prüft.

- [ ] **Step 2: Im Browser gegenprüfen**

Vorschau starten und ein Hochformat-Foto laden (3:4, etwa vom Handy). Prüfen:

1. eBay, Kleinanzeigen und Vinted anwählen.
2. Ein Bild hinzufügen, ohne den Rahmen anzufassen.
3. Auf den Vinted-Reiter wechseln: Der Rahmen muss über die **volle Höhe** gehen und links wie rechts nur einen schmalen Streifen frei lassen.
4. Bild drehen: Der Rahmen muss wieder maximal sein, nicht leer.
5. Ohne Namen exportieren: Das Archiv heißt `JJJJ-MM-TT-hhmm.zip`, die Dateien darin `JJJJ-MM-TT-hhmm-01.jpg` aufwärts, kein `-main`.

- [ ] **Step 3: Changelog-Eintrag schreiben**

Oben in `docs/AI-CHANGELOG.md`, direkt unter der Überschrift `# 🤖 KI-Änderungsprotokoll`, einfügen. Absätze mit **Auftrag/Ergebnis**, **Ursache**, **Betroffen** und **Geprüft** — mit den tatsächlichen Messwerten aus Schritt 2, nicht mit den hier geplanten. Abschließen mit einer Zeile `---`.

```bash
npx prettier --write docs/AI-CHANGELOG.md
```

- [ ] **Step 4: Commit und Push**

```bash
git add docs/AI-CHANGELOG.md
git commit -m "docs(image-opt): record the crop and naming rework"
git push -u origin feat/image-optimizer-workspace
```

- [ ] **Step 5: PR eröffnen**

```bash
gh pr create --base master --title "feat(image-opt): fix the undersized platform crops and the export naming" --body "..."
```

Der Body erklärt das **Warum** — den zu kleinen Vinted-Rahmen mit der Rechnung (66,7 % gegen 88,9 % bei einem 3:4-Foto) und die unterbrochene Zahlenkette durch `-main` — und nennt, was tatsächlich geprüft wurde. Kein Punkt am Ende des Titels, keine KI-Signatur.

Nach grünen Prüfungen per **Merge-Commit** veröffentlichen. Kein direkter Push auf `master`.

---

## Nicht in diesem Plan

- **Export als Ordner statt ZIP, EXIF-Datum** — Plan 2. Dieser Plan lässt den ZIP-Weg unverändert, benennt ihn nur richtig.
- **Arbeitsfläche, Trenner, Bildraster, Steuerelemente auf der Vorschau, Metadaten-Modal, Exportvorschau in den Reitern** — Plan 3.
