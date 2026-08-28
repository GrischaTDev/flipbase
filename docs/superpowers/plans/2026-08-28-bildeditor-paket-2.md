# Bildoptimierer Paket 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Der Bildoptimierer zeigt die Metadaten eines Fotos – vor allem GPS – und erlaubt Farb- und Belichtungskorrekturen je Bild, die in Vorschau und Export zwangslaeufig identisch wirken.

**Architecture:** Die Anpassungen bleiben Zahlen am Bild und werden erst beim Rendern als CSS-Filter angewandt. Weil `renderImage()` die einzige Canvas-Ausgabe ist und von Vorschau **und** Export benutzt wird, koennen beide nicht auseinanderlaufen. Die Metadaten liest ein Dienst, der `exifr` vollstaendig kapselt; die C2PA-Feststellung ist eigener Code, weil keine leichtgewichtige Bibliothek das abdeckt.

**Tech Stack:** Angular 22 (Signals, Standalone, `@if`/`@for`, `host`-Objekt), Tailwind CSS 4, Vitest mit jsdom, `exifr` (neu), Canvas 2D.

**Spec:** `docs/superpowers/specs/2026-08-28-bildeditor-paket-2-design.md`

## Global Constraints

- Branch ist `feature/bildeditor-paket-2`, abgezweigt von `feature/bildeditor-anpassungen`. Es werden **ausschliesslich** Dateien unter `src/app/features/image-optimizer/` geaendert, dazu `package.json` und `package-lock.json` fuer die neue Abhaengigkeit.
- **Alle Bezeichner englisch**: Datei-, Ordner-, Klassen-, Typ-, Methoden-, Feld- und Variablennamen. Das gilt **auch innerhalb von Tests**: Hilfsfunktionen, lokale Variablen und DOM-Kennungen (`id`, `for`, `aria-labelledby`). **Deutsch bleiben nur**: Code-Kommentare, sichtbare Oberflaechentexte und der Text in `describe(...)` und `it(...)`. Falls ein Codebeispiel in diesem Plan dagegen verstoesst, gilt diese Vorgabe und nicht das Beispiel.
- **Commit-Nachrichten sind englisch**, Format Conventional Commits (`type(scope): imperative summary`). **Niemals** eine `Co-Authored-By`-Zeile oder eine andere KI-Signatur anhaengen.
- Jede Komponente: Standalone (kein `standalone: true` im Decorator), `changeDetection: ChangeDetectionStrategy.OnPush`, externes HTML-Template, relative Pfade.
- Kein `@HostBinding`/`@HostListener` - stattdessen das `host`-Objekt. Kein `ngClass`/`ngStyle` - stattdessen `class`- und `style`-Bindings.
- Tailwind-Klassen direkt im Template. **Keine** neuen `.scss`-Dateien.
- Tests importieren `describe`/`it`/`expect`/`vi` ausdruecklich aus `vitest` (`globals: false`).
- `inject()` statt Constructor Injection. Signals fuer State, `computed()` fuer abgeleiteten State.
- Barrierefreiheit: AXE-Checks und WCAG AA.
- **Genau eine neue Abhaengigkeit:** `exifr`. Der Chunk des Bildoptimierers darf dadurch um hoechstens **80 kB roh** wachsen.
- **Die Oberflaeche behauptet nirgends**, ein Bild sei nach dem Export nicht mehr als KI-Bild erkennbar. Unsichtbare Wasserzeichen bleiben erhalten, und das wird ausgesprochen.
- Waehrend der Umsetzung nur gezielte Tests je Task; `typecheck`, komplette Suite und Produktions-Build einmal am Ende.

---

## Wichtige Vorbedingung: `renderImage` ist heute ungetestet

`services/image-renderer.spec.ts` prueft ausschliesslich `planOutput`, die reine Planungsfunktion. `renderImage` selbst hat **keine** Testabdeckung, weil jsdom keine Zeichenflaeche bereitstellt (`getContext('2d')` liefert `null`, das Paket `canvas` ist nicht installiert und wird auch nicht installiert).

Genau dort sitzt aber die fehleranfaellige Stelle dieses Pakets: die Reihenfolge von weissem Grund, Filter und Bild. Task 2 loest das mit einem Attrappen-Kontext, der die Aufrufreihenfolge protokolliert. Das prueft die Reihenfolge – also den Defekt, der sonst entstuende –, ohne echte Pixel zu brauchen. Der Pixelnachweis folgt in Task 8 im Browser.

## File Structure

| Datei                                                      | Verantwortung                                                                                                         |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `models/image-adjustments.ts`                              | **Neu.** Typ `Adjustments`. Bewusst anders benannt als der Dienst, damit nicht zwei Dateien `adjustments.ts` heissen. |
| `services/adjustments.ts`                                  | **Neu.** Reine Funktionen: Standardwerte, Begrenzung, Filterausdruck.                                                 |
| `models/image-metadata.ts`                                 | **Neu.** `ImageMetadata`, `MetadataStatus`, `AiProvenance`.                                                           |
| `services/c2pa-detection.ts`                               | **Neu.** Feststellen eines C2PA-Nachweises im JPEG. Eigener Code.                                                     |
| `services/metadata-reader.service.ts`                      | **Neu.** Kapselt `exifr` vollstaendig. Kein anderer Code kennt die Bibliothek.                                        |
| `components/adjustment-controls/`                          | **Neu.** Vier Regler, Zuruecksetzen, Auf alle uebernehmen.                                                            |
| `components/metadata-panel/`                               | **Neu.** Anzeige der Metadaten des aktiven Bildes.                                                                    |
| `services/image-renderer.ts`                               | Nimmt einen Filterausdruck entgegen.                                                                                  |
| `models/optimizer-image.ts`                                | Zwei neue Felder: `adjustments`, `metadata`.                                                                          |
| `components/platform-preview/`, `components/preview-grid/` | Reichen den Filterausdruck durch.                                                                                     |
| `components/image-list/`                                   | GPS-Hinweis auf der Kachel.                                                                                           |
| `image-optimizer.component.{ts,html}`                      | Verdrahtung, Uebertragen auf alle Bilder, Anstossen des Auslesens.                                                    |

---

## Task 1: Anpassungen als Modell und reine Funktionen

**Files:**

- Create: `src/app/features/image-optimizer/models/image-adjustments.ts`
- Create: `src/app/features/image-optimizer/services/adjustments.ts`
- Create: `src/app/features/image-optimizer/services/adjustments.spec.ts`

**Interfaces:**

- Produces: `Adjustments`, `defaultAdjustments()`, `clampAdjustments(values)`, `isDefault(values)`, `toFilterString(values)`, `adjustmentRange(key)`, `AdjustmentRange`

- [ ] **Step 1: Den fehlschlagenden Test schreiben**

```ts
// src/app/features/image-optimizer/services/adjustments.spec.ts
import { describe, it, expect } from 'vitest';
import {
  adjustmentRange,
  clampAdjustments,
  defaultAdjustments,
  isDefault,
  toFilterString,
} from './adjustments';
import { Adjustments } from '../models/image-adjustments';

describe('Standardwerte', () => {
  it('ist neutral', () => {
    expect(defaultAdjustments()).toEqual({
      brightness: 1,
      contrast: 1,
      saturation: 1,
      grayscale: 0,
    });
  });

  it('erkennt die neutralen Werte', () => {
    expect(isDefault(defaultAdjustments())).toBe(true);
  });

  it('erkennt jede einzelne Abweichung', () => {
    const base = defaultAdjustments();
    expect(isDefault({ ...base, brightness: 1.1 })).toBe(false);
    expect(isDefault({ ...base, contrast: 0.9 })).toBe(false);
    expect(isDefault({ ...base, saturation: 1.4 })).toBe(false);
    expect(isDefault({ ...base, grayscale: 0.2 })).toBe(false);
  });
});

describe('Werte begrenzen', () => {
  it('haelt jeden Wert in seinem Bereich', () => {
    const extreme: Adjustments = {
      brightness: 99,
      contrast: -5,
      saturation: 42,
      grayscale: -1,
    };

    expect(clampAdjustments(extreme)).toEqual({
      brightness: 1.5,
      contrast: 0.5,
      saturation: 2,
      grayscale: 0,
    });
  });

  it('faellt bei unbrauchbaren Zahlen auf den Standard zurueck', () => {
    const broken = {
      brightness: Number.NaN,
      contrast: Number.POSITIVE_INFINITY,
      saturation: 1,
      grayscale: 0,
    };

    const result = clampAdjustments(broken);
    expect(result.brightness).toBe(1);
    expect(result.contrast).toBe(1);
  });

  it('laesst gueltige Werte unveraendert', () => {
    const valid: Adjustments = { brightness: 1.2, contrast: 0.8, saturation: 1.5, grayscale: 0.4 };
    expect(clampAdjustments(valid)).toEqual(valid);
  });

  it('nennt zu jedem Regler seinen Bereich', () => {
    expect(adjustmentRange('saturation')).toEqual({ min: 0, max: 2, standard: 1 });
    expect(adjustmentRange('grayscale')).toEqual({ min: 0, max: 1, standard: 0 });
  });
});

describe('Filterausdruck', () => {
  it('liefert bei neutralen Werten eine leere Zeichenkette', () => {
    expect(toFilterString(defaultAdjustments())).toBe('');
  });

  it('nennt alle vier Werte, sobald einer abweicht', () => {
    const values: Adjustments = { brightness: 1.2, contrast: 1, saturation: 1, grayscale: 0 };

    expect(toFilterString(values)).toBe('brightness(1.2) contrast(1) saturate(1) grayscale(0)');
  });

  it('begrenzt vor dem Bilden des Ausdrucks', () => {
    const extreme: Adjustments = { brightness: 99, contrast: 1, saturation: 1, grayscale: 0 };

    expect(toFilterString(extreme)).toBe('brightness(1.5) contrast(1) saturate(1) grayscale(0)');
  });
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestaetigen**

Run: `npx vitest run src/app/features/image-optimizer/services/adjustments.spec.ts`
Expected: FAIL mit `Failed to resolve import "./adjustments"`.

- [ ] **Step 3: Modell anlegen**

```ts
// src/app/features/image-optimizer/models/image-adjustments.ts

/**
 * Farb- und Belichtungswerte eines Bildes.
 *
 * Die Werte werden **nie** ins Bild gerechnet, sondern erst beim Rendern
 * angewandt. So bleiben sie jederzeit ruecknehmbar, und mehrfaches Verstellen
 * kostet keine Qualitaet - anders als beim Drehen, wo jede Runde neu als JPEG
 * kodiert und das Bild sichtbar weicher wird.
 */
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

- [ ] **Step 4: Reine Funktionen umsetzen**

```ts
// src/app/features/image-optimizer/services/adjustments.ts
import { Adjustments } from '../models/image-adjustments';

export interface AdjustmentRange {
  readonly min: number;
  readonly max: number;
  readonly standard: number;
}

const RANGES: Record<keyof Adjustments, AdjustmentRange> = {
  brightness: { min: 0.5, max: 1.5, standard: 1 },
  contrast: { min: 0.5, max: 1.5, standard: 1 },
  saturation: { min: 0, max: 2, standard: 1 },
  grayscale: { min: 0, max: 1, standard: 0 },
};

/** Grenzen und Standardwert eines Reglers - auch von der Oberflaeche genutzt. */
export function adjustmentRange(key: keyof Adjustments): AdjustmentRange {
  return RANGES[key];
}

export function defaultAdjustments(): Adjustments {
  return { brightness: 1, contrast: 1, saturation: 1, grayscale: 0 };
}

/**
 * Haelt jeden Wert in seinem Bereich. Unbrauchbare Zahlen (NaN, Unendlich)
 * fallen auf den Standard zurueck statt den Filterausdruck zu vergiften -
 * `brightness(NaN)` wuerde die Zeichenflaeche stillschweigend nichts zeichnen
 * lassen.
 */
export function clampAdjustments(values: Adjustments): Adjustments {
  const limit = (key: keyof Adjustments): number => {
    const range = RANGES[key];
    const value = values[key];
    if (!Number.isFinite(value)) return range.standard;
    return Math.min(range.max, Math.max(range.min, value));
  };

  return {
    brightness: limit('brightness'),
    contrast: limit('contrast'),
    saturation: limit('saturation'),
    grayscale: limit('grayscale'),
  };
}

export function isDefault(values: Adjustments): boolean {
  const standard = defaultAdjustments();
  return (
    values.brightness === standard.brightness &&
    values.contrast === standard.contrast &&
    values.saturation === standard.saturation &&
    values.grayscale === standard.grayscale
  );
}

/**
 * Der Filterausdruck fuer die Zeichenflaeche.
 *
 * Bei neutralen Werten bewusst eine **leere Zeichenkette**: Dann wird gar kein
 * Filter gesetzt. Ein gesetzter Filter kostet Rechenzeit und kann die Ausgabe
 * minimal veraendern, auch wenn er rechnerisch nichts tut - und genau das
 * wuerde die Zusicherung brechen, dass Zuruecksetzen wieder exakt dieselbe
 * Datei erzeugt.
 */
export function toFilterString(values: Adjustments): string {
  const safe = clampAdjustments(values);
  if (isDefault(safe)) return '';

  return [
    `brightness(${safe.brightness})`,
    `contrast(${safe.contrast})`,
    `saturate(${safe.saturation})`,
    `grayscale(${safe.grayscale})`,
  ].join(' ');
}
```

Beachte: In CSS heisst die Funktion `saturate`, das Feld im Modell `saturation`. Das ist kein Tippfehler.

- [ ] **Step 5: Test laufen lassen, Erfolg bestaetigen**

Run: `npx vitest run src/app/features/image-optimizer/services/adjustments.spec.ts`
Expected: PASS, 9 Tests.

- [ ] **Step 6: Commit**

```bash
git add src/app/features/image-optimizer/models/image-adjustments.ts src/app/features/image-optimizer/services/adjustments.ts src/app/features/image-optimizer/services/adjustments.spec.ts
git commit -F - <<'EOF'
feat(image-optimizer): add colour adjustment values

Pure functions only - no rendering yet. The values are deliberately kept
as numbers on the image rather than burned into it, so resetting restores
the original bit for bit and repeated edits cost no quality.

toFilterString returns an empty string for neutral values so no filter is
set at all. Setting one costs time and can alter output slightly even
when it is mathematically neutral, which would break exactly that
guarantee.
EOF
```

---

## Task 2: `renderImage` nimmt einen Filter entgegen

**Files:**

- Modify: `src/app/features/image-optimizer/services/image-renderer.ts`
- Modify: `src/app/features/image-optimizer/services/image-renderer.spec.ts`

**Interfaces:**

- Consumes: nichts aus Task 1 (der Filter kommt als Zeichenkette)
- Produces: `renderImage(image, plan, quality?, filter?)`

- [ ] **Step 1: Den fehlschlagenden Test schreiben**

An `image-renderer.spec.ts` anhaengen. Der Test braucht **keine** echte Zeichenflaeche: Er ersetzt sie durch eine Attrappe, die jeden Aufruf zusammen mit dem gerade gesetzten Filter protokolliert. Genau die Reihenfolge ist das, was schiefgehen kann.

```ts
import { vi } from 'vitest';
import { renderImage } from './image-renderer';

interface CanvasStub {
  readonly canvas: HTMLCanvasElement;
  readonly calls: string[];
}

function createCanvasStub(): CanvasStub {
  const calls: string[] = [];

  const context = {
    fillStyle: '',
    filter: 'none',
    imageSmoothingEnabled: false,
    imageSmoothingQuality: 'low',
    fillRect(): void {
      calls.push(`fillRect filter=${context.filter}`);
    },
    drawImage(): void {
      calls.push(`drawImage filter=${context.filter}`);
    },
  };

  const canvas = {
    width: 0,
    height: 0,
    getContext: () => context,
    toBlob: (callback: (blob: Blob | null) => void) =>
      callback(new Blob([''], { type: 'image/jpeg' })),
  };

  return { canvas: canvas as unknown as HTMLCanvasElement, calls };
}

function useCanvasStub(stub: CanvasStub): void {
  const original = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation((tag: string) =>
    tag === 'canvas' ? stub.canvas : original(tag as 'div'),
  );
}

const plan = { source: { x: 0, y: 0, width: 100, height: 100 }, width: 50, height: 50 };

describe('Filter beim Rendern', () => {
  it('zeichnet den weissen Grund, bevor der Filter gesetzt wird', async () => {
    // Sonst faerbte brightness(0.6) auch den Grund ein und jedes Bild bekaeme
    // einen grauen statt eines weissen Randes.
    const stub = createCanvasStub();
    useCanvasStub(stub);

    await renderImage({} as CanvasImageSource, plan, 0.92, 'brightness(0.6)');

    expect(stub.calls).toEqual(['fillRect filter=none', 'drawImage filter=brightness(0.6)']);
    vi.restoreAllMocks();
  });

  it('setzt ohne Filterausdruck gar keinen Filter', async () => {
    const stub = createCanvasStub();
    useCanvasStub(stub);

    await renderImage({} as CanvasImageSource, plan, 0.92, '');

    expect(stub.calls).toEqual(['fillRect filter=none', 'drawImage filter=none']);
    vi.restoreAllMocks();
  });

  it('setzt den Filter nach dem Zeichnen zurueck', async () => {
    const stub = createCanvasStub();
    useCanvasStub(stub);

    await renderImage({} as CanvasImageSource, plan, 0.92, 'grayscale(1)');

    const context = stub.canvas.getContext('2d') as unknown as { filter: string };
    expect(context.filter).toBe('none');
    vi.restoreAllMocks();
  });
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestaetigen**

Run: `npx vitest run src/app/features/image-optimizer/services/image-renderer.spec.ts`
Expected: FAIL. Der erste Test scheitert, weil `renderImage` den vierten Parameter noch nicht kennt und deshalb nie einen Filter setzt – erwartet `drawImage filter=brightness(0.6)`, erhalten `drawImage filter=none`.

- [ ] **Step 3: `renderImage` erweitern**

```ts
/**
 * Rendert einen Plan als JPEG. Diese Funktion ist die einzige Canvas-Ausgabe
 * für Vorschau und Export - ein hier gesetzter Filter wirkt deshalb
 * zwangsläufig in beiden, und sie können nicht auseinanderlaufen.
 */
export async function renderImage(
  image: CanvasImageSource,
  plan: RenderPlan,
  quality = 0.92,
  filter = '',
): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = plan.width;
  canvas.height = plan.height;

  const context = canvas.getContext('2d');
  if (!context) throw new Error('Der Browser stellt keine Zeichenfläche bereit.');

  // Der weiße Grund wird bewusst OHNE Filter gezeichnet. Stünde der Filter
  // schon, färbte brightness(0.6) auch ihn ein, und jedes Bild bekäme einen
  // grauen Rand statt eines weißen. Der Grund existiert nur deshalb, weil
  // durchsichtige Bereiche beim JPEG-Kodieren sonst schwarz würden.
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';

  if (filter) context.filter = filter;
  context.drawImage(
    image,
    plan.source.x,
    plan.source.y,
    plan.source.width,
    plan.source.height,
    0,
    0,
    plan.width,
    plan.height,
  );
  if (filter) context.filter = 'none';

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Das Bild ließ sich nicht erzeugen.'))),
      'image/jpeg',
      quality,
    );
  });
}
```

- [ ] **Step 4: Test laufen lassen, Erfolg bestaetigen**

Run: `npx vitest run src/app/features/image-optimizer/services/image-renderer.spec.ts`
Expected: PASS, die drei bisherigen Plan-Tests plus drei neue.

- [ ] **Step 5: Commit**

```bash
git add src/app/features/image-optimizer/services/image-renderer.ts src/app/features/image-optimizer/services/image-renderer.spec.ts
git commit -F - <<'EOF'
feat(image-optimizer): apply a filter when rendering

renderImage had no test coverage at all - jsdom provides no canvas, so
only the planning function was exercised. That is precisely where the
ordering bug would live, so the new tests drive a stubbed context that
records what the filter was at each call.

The white background is drawn before the filter is set. The other way
round, brightness(0.6) would tint it and every export would come out with
a grey border instead of a white one.
EOF
```

---

## Task 3: Anpassungen durch Vorschau und Export reichen

**Files:**

- Modify: `src/app/features/image-optimizer/models/optimizer-image.ts`
- Modify: `src/app/features/image-optimizer/components/platform-preview/platform-preview.component.ts`
- Modify: `src/app/features/image-optimizer/components/preview-grid/preview-grid.component.{ts,html}`
- Modify: `src/app/features/image-optimizer/services/image-export.service.ts`
- Modify: `src/app/features/image-optimizer/image-optimizer.component.{ts,html}`
- Modify: alle bestehenden `*.spec.ts`, die ein `OptimizerImage` bauen (die Typpruefung zeigt sie)

**Interfaces:**

- Consumes: `Adjustments`, `defaultAdjustments()`, `toFilterString()` (Task 1); `renderImage(..., filter)` (Task 2)
- Produces: `OptimizerImage.adjustments`, `PlatformPreviewComponent.filter` input, `PreviewGridComponent.filter` input

- [ ] **Step 1: Modell ergaenzen**

In `models/optimizer-image.ts`:

```ts
import { Adjustments } from './image-adjustments';
```

und im Interface, nach `reviewed`:

```ts
  /**
   * Farb- und Belichtungswerte. Werden erst beim Rendern angewandt und nie
   * in `dataUrl` gerechnet - so bleibt Zuruecksetzen verlustfrei.
   */
  readonly adjustments: Adjustments;
```

- [ ] **Step 2: Vorschau nimmt den Filter entgegen**

In `components/platform-preview/platform-preview.component.ts` ein weiteres Input ergaenzen:

```ts
  /** Filterausdruck fuer die Zeichenflaeche. Leer heisst: kein Filter. */
  readonly filter = input('');
```

Im `effect`, der die Vorschau anstoesst, den Filter mitlesen und an `renderPreview` weiterreichen; in `renderPreview` an `renderImage` durchreichen:

```ts
const blob = await renderImage(image, plan, 0.92, filter);
```

Wichtig: Der Filter muss **im `effect` gelesen** werden, damit eine Aenderung die Vorschau neu rendert. Wird er nur in der privaten Methode gelesen, merkt das Signal-System die Abhaengigkeit nicht und die Vorschau bleibt stehen.

- [ ] **Step 3: Raster reicht durch**

In `components/preview-grid/preview-grid.component.ts`:

```ts
  readonly filter = input('');
```

und im Template am `<app-platform-preview>`:

```html
[filter]="filter()"
```

- [ ] **Step 4: Smart Component verdrahten**

In `image-optimizer.component.ts`:

```ts
readonly activeFilter = computed(() => {
  const image = this.activeImage();
  return image ? toFilterString(image.adjustments) : '';
});
```

Beim Anlegen neuer Bilder in `addFiles` das Feld setzen:

```ts
      adjustments: defaultAdjustments(),
```

Im Export (`exportImages`) den Filter des jeweiligen Bildes mitgeben. Der Snapshot enthaelt die vollstaendigen Bilder, also:

```ts
          data: await this.imageExport.create(element, crop, p, toFilterString(image.adjustments)),
```

Dazu `ImageExportService.create` um denselben vierten Parameter erweitern und ihn an `renderImage` weiterreichen:

```ts
  async create(
    image: HTMLImageElement,
    crop: Rect,
    platform: PlatformProfile,
    filter = '',
  ): Promise<Blob> {
    const plan = planOutput(crop, platform);
    const raw = await renderImage(image, plan, 0.92, filter);
    ...
  }
```

Im Template am `<app-preview-grid>`:

```html
[filter]="activeFilter()"
```

- [ ] **Step 5: Gezielte Tests laufen lassen**

Run: `npx vitest run src/app/features/image-optimizer`
Expected: PASS. Bestehende Tests, die `OptimizerImage`-Objekte bauen, muessen um `adjustments: defaultAdjustments()` ergaenzt werden - die Typpruefung zeigt jede Stelle.

Run: `npm run typecheck`
Expected: sauber.

- [ ] **Step 6: Commit**

```bash
git add src/app/features/image-optimizer
git commit -F - <<'EOF'
feat(image-optimizer): route adjustments into preview and export

Both go through renderImage, so passing the filter there is enough to
make them agree by construction - there is no second code path that could
drift.

The filter is read inside the preview's effect, not only in the private
render method. Reading it deeper would hide the dependency from the
signal system and the preview would simply not update.
EOF
```

---

## Task 4: Regler, Zuruecksetzen und Uebertragen auf alle

**Files:**

- Create: `src/app/features/image-optimizer/components/adjustment-controls/adjustment-controls.component.{ts,html}`
- Modify: `src/app/features/image-optimizer/image-optimizer.component.{ts,html}`
- Modify: `src/app/features/image-optimizer/services/image-collection.ts`
- Modify: `src/app/features/image-optimizer/services/image-collection.spec.ts`

**Interfaces:**

- Consumes: `Adjustments`, `adjustmentRange()`, `defaultAdjustments()`, `clampAdjustments()` (Task 1)
- Produces: `setAdjustmentsIn(list, id, values)`, `applyAdjustmentsToAll(list, values)`, `AdjustmentControlsComponent`

- [ ] **Step 1: Den fehlschlagenden Test fuer die Listenfunktionen schreiben**

An `services/image-collection.spec.ts` **anhaengen**. Die Datei hat bereits eine Hilfsfunktion `image(id, reviewed)`, die seit Task 3 auch `adjustments` setzt – sie wird wiederverwendet, keine zweite daneben stellen. Die Import-Zeile oben um `applyAdjustmentsToAll` und `setAdjustmentsIn` ergaenzen und `defaultAdjustments` aus `./adjustments` dazunehmen.

```ts
const bright = { ...defaultAdjustments(), brightness: 1.3 };

describe('Anpassungen in der Liste', () => {
  it('setzt die Werte nur am gemeinten Bild', () => {
    const list = setAdjustmentsIn([image('a'), image('b')], 'a', bright);

    expect(list[0].adjustments.brightness).toBe(1.3);
    expect(list[1].adjustments.brightness).toBe(1);
  });

  it('begrenzt dabei unbrauchbare Werte', () => {
    const list = setAdjustmentsIn([image('a')], 'a', { ...defaultAdjustments(), brightness: 99 });

    expect(list[0].adjustments.brightness).toBe(1.5);
  });

  it('uebertraegt die Werte auf jedes Bild', () => {
    const list = applyAdjustmentsToAll([image('a'), image('b'), image('c')], bright);

    expect(list.map((entry) => entry.adjustments.brightness)).toEqual([1.3, 1.3, 1.3]);
  });

  it('laesst die Liste unveraendert, wenn die Kennung unbekannt ist', () => {
    const list = [image('a')];

    expect(setAdjustmentsIn(list, 'gibtesnicht', bright)[0].adjustments.brightness).toBe(1);
  });
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestaetigen**

Run: `npx vitest run src/app/features/image-optimizer/services/image-collection.spec.ts`
Expected: FAIL, `setAdjustmentsIn` ist kein Export von `./image-collection`.

- [ ] **Step 3: Listenfunktionen ergaenzen**

An `services/image-collection.ts` anhaengen:

```ts
import { Adjustments } from '../models/image-adjustments';
import { clampAdjustments } from './adjustments';

export function setAdjustmentsIn(
  list: readonly OptimizerImage[],
  id: string,
  values: Adjustments,
): readonly OptimizerImage[] {
  const safe = clampAdjustments(values);
  return list.map((image) => (image.id === id ? { ...image, adjustments: safe } : image));
}

/** Uebertraegt eine Einstellung auf jedes Bild - alle Fotos eines Artikels
 *  entstehen meist im selben Licht. */
export function applyAdjustmentsToAll(
  list: readonly OptimizerImage[],
  values: Adjustments,
): readonly OptimizerImage[] {
  const safe = clampAdjustments(values);
  return list.map((image) => ({ ...image, adjustments: safe }));
}
```

- [ ] **Step 4: Test laufen lassen, Erfolg bestaetigen**

Run: `npx vitest run src/app/features/image-optimizer/services/image-collection.spec.ts`
Expected: PASS. Die vier neuen Tests plus die bestehenden der Datei.

- [ ] **Step 5: Reglerkomponente anlegen**

```ts
// src/app/features/image-optimizer/components/adjustment-controls/adjustment-controls.component.ts
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { Adjustments } from '../../models/image-adjustments';
import { adjustmentRange, isDefault } from '../../services/adjustments';

interface Slider {
  readonly key: keyof Adjustments;
  readonly label: string;
  readonly step: number;
}

/** Farbe und Belichtung des aktiven Bildes. */
@Component({
  selector: 'app-adjustment-controls',
  imports: [],
  templateUrl: './adjustment-controls.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdjustmentControlsComponent {
  readonly adjustments = input.required<Adjustments>();
  readonly disabled = input(false);
  readonly canApplyToAll = input(false);

  readonly changed = output<Adjustments>();
  readonly resetRequested = output<void>();
  readonly applyToAllRequested = output<void>();

  /** Beschriftungen bleiben deutsch - sie stehen sichtbar in der Oberflaeche. */
  readonly sliders: readonly Slider[] = [
    { key: 'brightness', label: 'Helligkeit', step: 0.01 },
    { key: 'contrast', label: 'Kontrast', step: 0.01 },
    { key: 'saturation', label: 'Sättigung', step: 0.01 },
    { key: 'grayscale', label: 'Graustufen', step: 0.01 },
  ];

  range(key: keyof Adjustments): { min: number; max: number } {
    return adjustmentRange(key);
  }

  valueOf(key: keyof Adjustments): number {
    return this.adjustments()[key];
  }

  /** Als Prozent, weil "1.2" niemandem etwas sagt und "120 %" schon. */
  percentOf(key: keyof Adjustments): number {
    return Math.round(this.adjustments()[key] * 100);
  }

  isUntouched(): boolean {
    return isDefault(this.adjustments());
  }

  onSlider(key: keyof Adjustments, raw: string): void {
    this.changed.emit({ ...this.adjustments(), [key]: Number(raw) });
  }
}
```

```html
<!-- src/app/features/image-optimizer/components/adjustment-controls/adjustment-controls.component.html -->
<div class="linear-surface rounded-2xl border border-fb-border p-4 shadow-xl">
  <div class="mb-3 flex items-center justify-between gap-3">
    <div>
      <p class="text-[10px] font-bold uppercase tracking-wider text-fb-text-muted">Bildwirkung</p>
      <h2 class="text-sm font-bold text-fb-text-primary">Farbe und Belichtung</h2>
    </div>
    <div class="flex items-center gap-2">
      <button
        type="button"
        (click)="applyToAllRequested.emit()"
        [disabled]="disabled() || !canApplyToAll()"
        class="cursor-pointer rounded-lg border border-fb-border px-3 py-1.5 text-[11px] font-semibold text-fb-text-secondary hover:border-indigo-500/40 hover:text-fb-text-primary disabled:cursor-not-allowed disabled:opacity-40"
      >
        Auf alle Bilder übernehmen
      </button>
      <button
        type="button"
        (click)="resetRequested.emit()"
        [disabled]="disabled() || isUntouched()"
        class="cursor-pointer rounded-lg px-3 py-1.5 text-[11px] font-semibold text-fb-text-muted hover:bg-fb-surface-hover hover:text-fb-text-primary disabled:cursor-not-allowed disabled:opacity-40"
      >
        Zurücksetzen
      </button>
    </div>
  </div>

  <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
    @for (slider of sliders; track slider.key) {
    <div class="flex items-center gap-3">
      <label
        [attr.for]="'adjust-' + slider.key"
        class="w-24 shrink-0 text-[11px] font-semibold text-fb-text-secondary"
      >
        {{ slider.label }}
      </label>
      <input
        [id]="'adjust-' + slider.key"
        type="range"
        [min]="range(slider.key).min"
        [max]="range(slider.key).max"
        [step]="slider.step"
        [value]="valueOf(slider.key)"
        [disabled]="disabled()"
        (input)="onSlider(slider.key, $any($event.target).value)"
        class="h-1.5 flex-1 cursor-pointer accent-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
      />
      <span class="w-12 text-right text-[10px] tabular-nums text-fb-text-muted">
        {{ percentOf(slider.key) }} %
      </span>
    </div>
    }
  </div>
</div>
```

- [ ] **Step 6: Smart Component verdrahten**

In `image-optimizer.component.ts`:

```ts
setAdjustments(values: Adjustments): void {
  if (this.isBusy()) return;
  const id = this.activeImageId();
  if (!id) return;
  this.images.update((list) => [...setAdjustmentsIn(list, id, values)]);
}

resetAdjustments(): void {
  this.setAdjustments(defaultAdjustments());
}

applyAdjustmentsToAllImages(): void {
  if (this.isBusy()) return;
  const image = this.activeImage();
  if (!image) return;
  this.images.update((list) => [...applyAdjustmentsToAll(list, image.adjustments)]);
  this.toast.success('Farbe und Belichtung wurden auf alle Bilder übernommen.');
}
```

Im Template, direkt **ueber** dem Vorschauraster (die Regler gehoeren zur Vorschau, nicht zum Zuschnitt-Editor):

```html
<app-adjustment-controls
  [adjustments]="image.adjustments"
  [disabled]="isBusy()"
  [canApplyToAll]="images().length > 1"
  (changed)="setAdjustments($event)"
  (resetRequested)="resetAdjustments()"
  (applyToAllRequested)="applyAdjustmentsToAllImages()"
></app-adjustment-controls>
```

- [ ] **Step 7: Gezielte Tests laufen lassen**

Run: `npx vitest run src/app/features/image-optimizer`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/app/features/image-optimizer
git commit -F - <<'EOF'
feat(image-optimizer): add colour and exposure controls

Four sliders per image with a reset and an apply-to-all, since every
photo of one item is usually shot under the same light.

They sit above the preview grid rather than on the crop editor. A filter
on the cropper would tint its own frame and mask too - the library offers
no way to reach the inner image without reaching into foreign CSS - so
the split is deliberate: the editor is for geometry, the preview cards
show the result.
EOF
```

---

## Task 5: C2PA feststellen

**Files:**

- Create: `src/app/features/image-optimizer/services/c2pa-detection.ts`
- Create: `src/app/features/image-optimizer/services/c2pa-detection.spec.ts`

**Interfaces:**

- Produces: `hasContentCredential(bytes: Uint8Array): boolean`

- [ ] **Step 1: Den fehlschlagenden Test schreiben**

```ts
// src/app/features/image-optimizer/services/c2pa-detection.spec.ts
import { describe, it, expect } from 'vitest';
import { hasContentCredential } from './c2pa-detection';

/** Baut ein minimales JPEG mit beliebigen Segmenten. */
function jpeg(segments: readonly { marker: number; payload: Uint8Array }[]): Uint8Array {
  const parts: number[] = [0xff, 0xd8];

  for (const segment of segments) {
    const length = segment.payload.length + 2;
    parts.push(0xff, segment.marker, (length >> 8) & 0xff, length & 0xff);
    parts.push(...segment.payload);
  }

  parts.push(0xff, 0xd9);
  return new Uint8Array(parts);
}

function ascii(text: string): number[] {
  return [...text].map((character) => character.charCodeAt(0));
}

/** Eine JUMBF-Box, wie C2PA sie in ein APP11-Segment legt. */
function jumbfBox(label: string): Uint8Array {
  return new Uint8Array([
    0x00,
    0x00,
    0x00,
    0x20,
    ...ascii('jumb'),
    0x00,
    0x00,
    0x00,
    0x18,
    ...ascii('jumd'),
    ...ascii(label),
    0x00,
  ]);
}

describe('C2PA-Herkunftsnachweis feststellen', () => {
  it('erkennt einen Nachweis in einem APP11-Segment', () => {
    const file = jpeg([{ marker: 0xeb, payload: jumbfBox('c2pa') }]);

    expect(hasContentCredential(file)).toBe(true);
  });

  it('meldet nichts bei einem gewoehnlichen Foto', () => {
    const file = jpeg([{ marker: 0xe1, payload: new Uint8Array(ascii('Exif\0\0')) }]);

    expect(hasContentCredential(file)).toBe(false);
  });

  it('faellt nicht auf die Zeichenfolge in einem fremden Segment herein', () => {
    // Ein Kommentar oder Dateiname darf keinen Treffer ausloesen - deshalb
    // laeuft die Erkennung ueber die Segmentstruktur und nicht ueber die
    // ganze Datei.
    const file = jpeg([{ marker: 0xfe, payload: new Uint8Array(ascii('foto-c2pa-jumb.jpg')) }]);

    expect(hasContentCredential(file)).toBe(false);
  });

  it('meldet nichts bei einer Datei, die kein JPEG ist', () => {
    expect(hasContentCredential(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe(false);
  });

  it('kommt mit einer abgeschnittenen Datei zurecht', () => {
    expect(hasContentCredential(new Uint8Array([0xff, 0xd8, 0xff, 0xeb]))).toBe(false);
  });
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestaetigen**

Run: `npx vitest run src/app/features/image-optimizer/services/c2pa-detection.spec.ts`
Expected: FAIL mit `Failed to resolve import "./c2pa-detection"`.

- [ ] **Step 3: Umsetzen**

```ts
// src/app/features/image-optimizer/services/c2pa-detection.ts

const START_OF_IMAGE = 0xd8;
const APP11 = 0xeb;
const START_OF_SCAN = 0xda;

/**
 * Stellt fest, ob die Datei einen C2PA-Herkunftsnachweis traegt.
 *
 * Bewusst **nur Feststellung, keine Pruefung**: Ob die Signatur gueltig ist
 * und von wem sie stammt, beantwortet dieser Code nicht. Die offizielle
 * Bibliothek dafuer ist WASM-basiert und mehrere hundert Kilobyte gross -
 * fuer die Aussage "ein Nachweis liegt vor" waere das unverhaeltnismaessig.
 *
 * Gesucht wird ueber die Segmentstruktur, nicht ueber die ganze Datei: Ein
 * Dateiname oder ein Kommentar koennte die Zeichenfolge `c2pa` sonst
 * faelschlich ausloesen.
 */
export function hasContentCredential(bytes: Uint8Array): boolean {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== START_OF_IMAGE) return false;

  let offset = 2;

  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) return false;

    const marker = bytes[offset + 1];
    // Ab dem Bilddatenstrom gibt es keine Segmente mehr, die uns betreffen.
    if (marker === START_OF_SCAN) return false;

    const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
    if (length < 2) return false;

    const payloadStart = offset + 4;
    const payloadEnd = payloadStart + length - 2;
    if (payloadEnd > bytes.length) return false;

    if (marker === APP11 && containsC2paLabel(bytes, payloadStart, payloadEnd)) return true;

    offset = payloadEnd;
  }

  return false;
}

/** Sucht die Kennung `c2pa` innerhalb eines APP11-Nutzdatenbereichs. */
function containsC2paLabel(bytes: Uint8Array, start: number, end: number): boolean {
  const label = [0x63, 0x32, 0x70, 0x61]; // "c2pa"

  for (let index = start; index + label.length <= end; index++) {
    let matches = true;
    for (let offset = 0; offset < label.length; offset++) {
      if (bytes[index + offset] !== label[offset]) {
        matches = false;
        break;
      }
    }
    if (matches) return true;
  }

  return false;
}
```

- [ ] **Step 4: Test laufen lassen, Erfolg bestaetigen**

Run: `npx vitest run src/app/features/image-optimizer/services/c2pa-detection.spec.ts`
Expected: PASS, 5 Tests.

- [ ] **Step 5: Commit**

```bash
git add src/app/features/image-optimizer/services/c2pa-detection.ts src/app/features/image-optimizer/services/c2pa-detection.spec.ts
git commit -F - <<'EOF'
feat(image-optimizer): detect content credentials

exifr covers EXIF, XMP, IPTC and GPS but not C2PA, and the official C2PA
library is WASM-based and hundreds of kilobytes - far too much for the
one statement we need.

Detection walks the JPEG segment structure rather than scanning the whole
file, so a filename or comment containing "c2pa" cannot trigger a false
positive. It reports presence only; whether a signature is valid and who
signed it is deliberately not answered here.
EOF
```

---

## Task 6: Metadaten lesen

**Files:**

- Modify: `package.json` (Abhaengigkeit `exifr`)
- Create: `src/app/features/image-optimizer/models/image-metadata.ts`
- Create: `src/app/features/image-optimizer/services/metadata-reader.service.ts`
- Create: `src/app/features/image-optimizer/services/metadata-reader.service.spec.ts`

**Interfaces:**

- Consumes: `hasContentCredential(bytes)` (Task 5)
- Produces: `ImageMetadata`, `MetadataStatus`, `AiProvenance`, `pendingMetadata()`, `MetadataReaderService.read(file)`

- [ ] **Step 1: Bundle-Groesse vor dem Einbau messen**

Run: `npm run build`
Notieren: die Rohgroesse der Zeile `image-optimizer-component` aus der Lazy-Chunk-Tabelle. Diese Zahl wird in Task 8 gebraucht.

- [ ] **Step 2: Abhaengigkeit installieren**

```bash
npm install exifr
```

Expected: `package.json` und `package-lock.json` geaendert, keine weiteren Dateien.

- [ ] **Step 3: Modell anlegen**

```ts
// src/app/features/image-optimizer/models/image-metadata.ts

/**
 * `read` heisst: nachgesehen. Sind dann alle Felder leer, enthaelt die Datei
 * nachweislich nichts. `failed` heisst: konnte nicht nachsehen. Das sind fuer
 * den Nutzer zwei verschiedene Aussagen und duerfen nie zusammenfallen.
 */
export type MetadataStatus = 'pending' | 'read' | 'unsupported' | 'failed';

export interface AiProvenance {
  /** Ein C2PA-Nachweis liegt vor. Nur festgestellt, nicht geprueft. */
  readonly contentCredential: boolean;
  /** XMP `digitalSourceType`, etwa `trainedAlgorithmicMedia`. */
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

export function pendingMetadata(): ImageMetadata {
  return {
    status: 'pending',
    gps: null,
    cameraMake: null,
    cameraModel: null,
    capturedAt: null,
    software: null,
    ai: { contentCredential: false, declaredSource: null },
  };
}

/** Ob ueberhaupt etwas gefunden wurde - fuer die Formulierung in der Anzeige. */
export function hasAnyMetadata(metadata: ImageMetadata): boolean {
  return (
    metadata.gps !== null ||
    metadata.cameraMake !== null ||
    metadata.cameraModel !== null ||
    metadata.capturedAt !== null ||
    metadata.software !== null ||
    metadata.ai.contentCredential ||
    metadata.ai.declaredSource !== null
  );
}
```

- [ ] **Step 4: Den fehlschlagenden Test schreiben**

`exifr` wird ersetzt, weil hier die **Uebersetzung** geprueft wird, nicht die Bibliothek. Dass die Bibliothek richtig angebunden ist, weist Task 8 mit einem echten Foto im Browser nach – ein von Hand gebauter EXIF-Bytestrom wuerde dafuer wenig beweisen und viel schiefgehen koennen.

```ts
// src/app/features/image-optimizer/services/metadata-reader.service.spec.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const parseMock = vi.fn();
vi.mock('exifr', () => ({ default: { parse: (...args: unknown[]) => parseMock(...args) } }));

import { MetadataReaderService } from './metadata-reader.service';

function jpegFile(): File {
  return new File([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], 'foto.jpg', { type: 'image/jpeg' });
}

describe('Metadaten lesen', () => {
  let reader: MetadataReaderService;

  beforeEach(() => {
    parseMock.mockReset();
    reader = new MetadataReaderService();
  });

  it('uebersetzt GPS, Kamera und Datum', async () => {
    parseMock.mockResolvedValue({
      latitude: 52.5,
      longitude: 13.4,
      Make: 'Apple',
      Model: 'iPhone 15',
      DateTimeOriginal: new Date('2026-05-01T10:00:00Z'),
      Software: 'iOS 19',
    });

    const result = await reader.read(jpegFile());

    expect(result.status).toBe('read');
    expect(result.gps).toEqual({ latitude: 52.5, longitude: 13.4 });
    expect(result.cameraMake).toBe('Apple');
    expect(result.cameraModel).toBe('iPhone 15');
    expect(result.capturedAt).toBe('2026-05-01T10:00:00.000Z');
    expect(result.software).toBe('iOS 19');
  });

  it('meldet read mit leeren Feldern, wenn die Datei nichts enthaelt', async () => {
    parseMock.mockResolvedValue({});

    const result = await reader.read(jpegFile());

    expect(result.status).toBe('read');
    expect(result.gps).toBeNull();
    expect(result.cameraMake).toBeNull();
  });

  it('verschluckt jeden Fehler und meldet failed', async () => {
    parseMock.mockRejectedValue(new Error('kaputt'));

    const result = await reader.read(jpegFile());

    expect(result.status).toBe('failed');
    expect(result.gps).toBeNull();
  });

  it('wertet Nicht-JPEG gar nicht erst aus', async () => {
    const png = new File([new Uint8Array([0x89, 0x50])], 'bild.png', { type: 'image/png' });

    const result = await reader.read(png);

    expect(result.status).toBe('unsupported');
    expect(parseMock).not.toHaveBeenCalled();
  });

  it('erkennt eine erklaerte KI-Herkunft aus XMP', async () => {
    parseMock.mockResolvedValue({ digitalSourceType: 'trainedAlgorithmicMedia' });

    const result = await reader.read(jpegFile());

    expect(result.ai.declaredSource).toBe('trainedAlgorithmicMedia');
  });

  it('meldet einen fehlenden GPS-Teilwert als kein GPS', async () => {
    parseMock.mockResolvedValue({ latitude: 52.5 });

    const result = await reader.read(jpegFile());

    expect(result.gps).toBeNull();
  });
});
```

- [ ] **Step 5: Test laufen lassen, Fehlschlag bestaetigen**

Run: `npx vitest run src/app/features/image-optimizer/services/metadata-reader.service.spec.ts`
Expected: FAIL mit `Failed to resolve import "./metadata-reader.service"`.

- [ ] **Step 6: Dienst umsetzen**

```ts
// src/app/features/image-optimizer/services/metadata-reader.service.ts
import { Injectable } from '@angular/core';
import exifr from 'exifr';
import { AiProvenance, ImageMetadata, pendingMetadata } from '../models/image-metadata';
import { hasContentCredential } from './c2pa-detection';

/** Nur diese Felder werden ausgelesen - nicht die Voreinstellung der Bibliothek. */
const WANTED_FIELDS = [
  'latitude',
  'longitude',
  'Make',
  'Model',
  'DateTimeOriginal',
  'CreateDate',
  'Software',
  'digitalSourceType',
];

/**
 * Kapselt `exifr` vollstaendig. Kein anderer Teil des Codes kennt die
 * Bibliothek - waere sie eines Tages zu ersetzen, betrifft das nur diese
 * Datei.
 */
@Injectable({ providedIn: 'root' })
export class MetadataReaderService {
  /**
   * Liest die Metadaten einer Datei.
   *
   * Wirft **nie**. Die Metadaten sind eine Zusatzinformation; ihr Fehlen darf
   * die Arbeit am Bild nicht unterbrechen. Jeder Fehlschlag wird zu `failed`.
   */
  async read(file: File): Promise<ImageMetadata> {
    const base = pendingMetadata();

    if (!isJpeg(file)) return { ...base, status: 'unsupported' };

    try {
      const raw = (await exifr.parse(file, { pick: WANTED_FIELDS })) ?? {};
      const bytes = new Uint8Array(await file.arrayBuffer());

      return {
        status: 'read',
        gps: readGps(raw),
        cameraMake: text(raw['Make']),
        cameraModel: text(raw['Model']),
        capturedAt: readDate(raw),
        software: text(raw['Software']),
        ai: readAi(raw, bytes),
      };
    } catch {
      // Bewusst kein Fehlerpfad nach aussen - siehe Kommentar oben.
      return { ...base, status: 'failed' };
    }
  }
}

function isJpeg(file: File): boolean {
  const type = (file.type || '').toLowerCase();
  if (type === 'image/jpeg' || type === 'image/jpg') return true;
  return /\.(jpe?g)$/i.test(file.name);
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

/** Nur wenn beide Werte da sind - ein halber Koordinatensatz ist keiner. */
function readGps(raw: Record<string, unknown>): ImageMetadata['gps'] {
  const latitude = raw['latitude'];
  const longitude = raw['longitude'];
  if (typeof latitude !== 'number' || typeof longitude !== 'number') return null;
  return { latitude, longitude };
}

function readDate(raw: Record<string, unknown>): string | null {
  const value = raw['DateTimeOriginal'] ?? raw['CreateDate'];
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return null;
  return value.toISOString();
}

function readAi(raw: Record<string, unknown>, bytes: Uint8Array): AiProvenance {
  return {
    contentCredential: hasContentCredential(bytes),
    declaredSource: text(raw['digitalSourceType']),
  };
}
```

- [ ] **Step 7: Test laufen lassen, Erfolg bestaetigen**

Run: `npx vitest run src/app/features/image-optimizer/services/metadata-reader.service.spec.ts`
Expected: PASS, 6 Tests.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json src/app/features/image-optimizer
git commit -F - <<'EOF'
feat(image-optimizer): read image metadata

exifr is confined to this one service; nothing else in the codebase knows
the library exists, so replacing it later would touch a single file.

The reader never throws. Metadata is supplementary information and its
absence must not interrupt work on the photo, so every failure becomes a
status instead. "Looked and found nothing" and "could not look" stay
distinguishable - they are different statements to the user.
EOF
```

---

## Task 7: Metadaten anzeigen und GPS in der Liste kennzeichnen

**Files:**

- Create: `src/app/features/image-optimizer/components/metadata-panel/metadata-panel.component.{ts,html}`
- Modify: `src/app/features/image-optimizer/models/optimizer-image.ts`
- Modify: `src/app/features/image-optimizer/components/image-list/image-list.component.html`
- Modify: `src/app/features/image-optimizer/image-optimizer.component.{ts,html}`

**Interfaces:**

- Consumes: `ImageMetadata`, `hasAnyMetadata()`, `pendingMetadata()` (Task 6), `MetadataReaderService` (Task 6)
- Produces: `OptimizerImage.metadata`, `MetadataPanelComponent`

- [ ] **Step 1: Modell ergaenzen**

In `models/optimizer-image.ts`:

```ts
import { ImageMetadata } from './image-metadata';
```

und im Interface:

```ts
  /**
   * Metadaten der Originaldatei. Gelesen wird aus `file`, nicht aus
   * `dataUrl` - eine Drehung erzeugt zwar eine neue `dataUrl`, laesst `file`
   * aber unberuehrt, sodass der Stand nicht veralten kann.
   */
  readonly metadata: ImageMetadata;
```

- [ ] **Step 2: Anzeigekomponente anlegen**

```ts
// src/app/features/image-optimizer/components/metadata-panel/metadata-panel.component.ts
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { hasAnyMetadata, ImageMetadata } from '../../models/image-metadata';

/** Zeigt, was in der Originaldatei steckt - und dass es beim Export verschwindet. */
@Component({
  selector: 'app-metadata-panel',
  imports: [],
  templateUrl: './metadata-panel.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MetadataPanelComponent {
  readonly metadata = input.required<ImageMetadata>();

  readonly isEmpty = computed(() => !hasAnyMetadata(this.metadata()));

  readonly coordinates = computed(() => {
    const gps = this.metadata().gps;
    if (!gps) return null;
    return `${gps.latitude.toFixed(5)}, ${gps.longitude.toFixed(5)}`;
  });

  readonly capturedLabel = computed(() => {
    const value = this.metadata().capturedAt;
    if (!value) return null;
    return new Date(value).toLocaleString('de-DE');
  });
}
```

```html
<!-- src/app/features/image-optimizer/components/metadata-panel/metadata-panel.component.html -->
<section class="linear-surface rounded-2xl border border-fb-border p-4 shadow-xl">
  <div class="mb-3">
    <p class="text-[10px] font-bold uppercase tracking-wider text-fb-text-muted">Herkunft</p>
    <h2 class="text-sm font-bold text-fb-text-primary">Metadaten der Datei</h2>
  </div>

  @switch (metadata().status) { @case ('pending') {
  <p class="text-[11px] text-fb-text-muted">Wird gelesen …</p>
  } @case ('unsupported') {
  <p class="text-[11px] text-fb-text-muted">
    Nur JPEG-Dateien werden ausgewertet. Über diese Datei ist nichts bekannt.
  </p>
  } @case ('failed') {
  <p class="text-[11px] text-fb-text-muted">
    Die Metadaten ließen sich nicht lesen. Das sagt nichts darüber aus, ob welche enthalten sind.
  </p>
  } @case ('read') { @if (isEmpty()) {
  <p class="text-[11px] text-fb-text-muted">Diese Datei enthält keine Metadaten.</p>
  } @else {
  <dl class="space-y-2 text-[11px]">
    @if (coordinates(); as position) {
    <div
      class="flex flex-col gap-0.5 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2"
    >
      <dt class="font-bold text-amber-200">Standort der Aufnahme</dt>
      <dd class="tabular-nums text-amber-100">{{ position }}</dd>
    </div>
    } @if (metadata().cameraMake || metadata().cameraModel) {
    <div class="flex justify-between gap-3">
      <dt class="text-fb-text-muted">Kamera</dt>
      <dd class="text-right text-fb-text-secondary">
        {{ metadata().cameraMake }} {{ metadata().cameraModel }}
      </dd>
    </div>
    } @if (capturedLabel(); as captured) {
    <div class="flex justify-between gap-3">
      <dt class="text-fb-text-muted">Aufgenommen</dt>
      <dd class="text-right text-fb-text-secondary">{{ captured }}</dd>
    </div>
    } @if (metadata().software; as software) {
    <div class="flex justify-between gap-3">
      <dt class="text-fb-text-muted">Software</dt>
      <dd class="text-right text-fb-text-secondary">{{ software }}</dd>
    </div>
    } @if (metadata().ai.declaredSource; as source) {
    <div class="flex justify-between gap-3">
      <dt class="text-fb-text-muted">Angegebene Herkunft</dt>
      <dd class="text-right text-fb-text-secondary">{{ source }}</dd>
    </div>
    } @if (metadata().ai.contentCredential) {
    <div class="rounded-lg border border-fb-border px-3 py-2">
      <dt class="font-bold text-fb-text-primary">KI-Herkunftsnachweis</dt>
      <dd class="mt-0.5 leading-relaxed text-fb-text-secondary">
        Die Datei trägt einen Content-Credential-Eintrag. Ob er gültig ist, prüft Flipbase nicht.
      </dd>
    </div>
    }
  </dl>
  }

  <p class="mt-3 border-t border-fb-border pt-3 text-[10px] leading-relaxed text-fb-text-muted">
    <span class="font-semibold text-fb-text-secondary"
      >Diese Angaben werden beim Export entfernt.</span
    >
    Die Exportdateien enthalten keine Metadaten. @if (metadata().ai.contentCredential) { Unsichtbare
    Wasserzeichen im Bild selbst bleiben erhalten – sie lassen sich durch Zuschneiden oder
    Neuspeichern nicht entfernen. }
  </p>
  } }
</section>
```

- [ ] **Step 3: GPS-Hinweis in der Bilderliste**

In `image-list.component.html`, in der Fusszeile jeder Kachel neben der Bildnummer:

```html
@if (image.metadata.gps) {
<span
  class="rounded-full bg-amber-400/15 px-2 py-0.5 text-[9px] font-bold text-amber-200"
  title="Dieses Foto enthält den Aufnahmeort"
>
  <span aria-hidden="true">◉</span>
  <span class="sr-only">Enthält Standortdaten. </span>GPS
</span>
}
```

- [ ] **Step 4: Auslesen anstossen**

In `image-optimizer.component.ts`:

```ts
private readonly metadataReader = inject(MetadataReaderService);
```

Beim Anlegen neuer Bilder in `addFiles`:

```ts
      metadata: pendingMetadata(),
```

und in derselben Schleife, in der die Bildgroesse ermittelt wird:

```ts
for (const image of added) {
  void this.measureNaturalSize(image.id, image.dataUrl);
  void this.readMetadata(image.id, image.file);
}
```

Dazu die Methode:

```ts
  /**
   * Liest die Metadaten im Hintergrund, nach demselben Muster wie die
   * Bildgroesse. Gelesen wird aus `file`: Die Originaldatei aendert sich nie,
   * also kann hier - anders als bei der Groesse - keine veraltete Antwort
   * einen neueren Stand ueberschreiben.
   */
  private async readMetadata(id: string, file: File): Promise<void> {
    const metadata = await this.metadataReader.read(file);
    this.images.update((list) =>
      list.map((image) => (image.id === id ? { ...image, metadata } : image)),
    );
  }
```

Im Template, unter dem Vorschauraster:

```html
<app-metadata-panel [metadata]="image.metadata"></app-metadata-panel>
```

- [ ] **Step 5: Gezielte Tests laufen lassen**

Run: `npx vitest run src/app/features/image-optimizer`
Expected: PASS. Bestehende Tests, die `OptimizerImage` bauen, brauchen `metadata: pendingMetadata()`; die Typpruefung zeigt jede Stelle.

Run: `npm run typecheck`
Expected: sauber.

- [ ] **Step 6: Commit**

```bash
git add src/app/features/image-optimizer
git commit -F - <<'EOF'
feat(image-optimizer): show what a photo carries

The GPS row is the point of the feature: a phone photo taken at home
carries the seller's address into every listing, and until now nothing
said so. The image list marks affected photos so it is visible without
opening anything.

The panel states that the export removes these fields, which has always
been true. It does not say the image is no longer recognisable as
AI-made - pixel watermarks survive re-encoding by design, and where a
content credential is present the panel says exactly that instead.
EOF
```

---

## Task 8: Endabnahme

**Files:**

- Modify: `docs/AI-CHANGELOG.md`

**Interfaces:**

- Consumes: alles aus Tasks 1-7
- Produces: nichts

- [ ] **Step 1: Vollstaendige automatisierte Pruefung**

Run: `npm run typecheck`
Expected: sauber.

Run: `npx vitest run`
Expected: alle Testdateien gruen. Die Zahl muss ueber dem Stand vor Task 1 liegen (neu: `adjustments.spec.ts` 9, `image-renderer.spec.ts` +3, `image-collection.spec.ts` +4, `c2pa-detection.spec.ts` 5, `metadata-reader.service.spec.ts` 6).

Run: `npm run lint`
Expected: keine Fehler unter `src/app/features/image-optimizer/`.

Run: `npm run build`
Expected: erfolgreich.

- [ ] **Step 2: Bundle-Grenze pruefen**

Die Rohgroesse der Zeile `image-optimizer-component` aus der Lazy-Chunk-Tabelle mit dem in Task 6, Step 1 notierten Wert vergleichen.

Expected: Zuwachs **hoechstens 80 kB roh**. Wird das ueberschritten, auf eine kleinere Ausgabevariante von `exifr` wechseln (etwa den Teil-Import statt des Vollpakets) und erneut messen. Beide Zahlen im Aenderungsprotokoll festhalten.

- [ ] **Step 3: Abgrenzung nachweisen**

Run: `git diff --name-only feature/bildeditor-anpassungen...HEAD | grep -v "^src/app/features/image-optimizer/" | grep -v "^docs/" | grep -v "^package"`
Expected: leere Ausgabe.

- [ ] **Step 4: Fachliche Abnahme im Browser**

Der Entwicklungsserver laeuft ueber `.claude/launch.json`, Eintrag `flipbase-dev`. Anmeldung ueber „Demo-Modus starten", dann `/image-optimizer`.

Alle 14 Abnahmekriterien der Spezifikation durchgehen. Besonders:

1. **Ein echtes Foto mit GPS hochladen.** Das ist zugleich der Nachweis, dass `exifr` richtig angebunden ist - die Unit-Tests pruefen nur die Uebersetzung, nicht die Bibliothek. Koordinaten muessen im Feld stehen und die Kachel muss den GPS-Hinweis tragen.
2. Eine PNG-Datei zeigt „Nur JPEG-Dateien werden ausgewertet", ohne Fehler.
3. **Vorschau gegen Export messen.** Bei `brightness` auf 0,6 die mittlere Helligkeit beider Bilder bestimmen:

```js
async function meanBrightness(blobOrUrl) {
  const image = await new Promise((resolve, reject) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = reject;
    element.src = typeof blobOrUrl === 'string' ? blobOrUrl : URL.createObjectURL(blobOrUrl);
  });
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext('2d');
  context.drawImage(image, 0, 0);
  const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
  let sum = 0;
  for (let index = 0; index < data.length; index += 4) sum += data[index];
  return Math.round(sum / (data.length / 4));
}
```

Expected: Vorschau und Exportdatei liegen im selben Bereich und deutlich unter dem unveraenderten Bild.

4. **Weisser Grund bleibt weiss.** Ein Bild exportieren, dessen Ausschnitt schmaler ist als das Zielformat, bei `brightness` 0,6. Die Randpixel muessen `255,255,255` sein.
5. **Zuruecksetzen erzeugt dieselbe Datei.** Einmal ohne jede Anpassung exportieren, dann verstellen, zuruecksetzen, erneut exportieren. Die beiden Archive byteweise vergleichen.
6. Die Exportdateien enthalten weder EXIF- noch XMP- oder Herkunftsdaten - durch Auslesen einer
   Exportdatei belegen. Ein ICC-Farbprofil und ein JFIF-Kopf bleiben, weil die Zeichenflaeche sie
   beim Kodieren anlegt; der Text in der Oberflaeche sagt das ausdruecklich.
7. Nirgends in der Oberflaeche steht, ein Bild sei nach dem Export nicht mehr als KI-Bild erkennbar.

- [ ] **Step 5: Abnahme dokumentieren**

Neuen Eintrag **oben** in `docs/AI-CHANGELOG.md` einfuegen, direkt nach dem Abschnitt „Namenskonvention im Code". Format wie in der Datei vorgegeben, mit den echten Zahlen aus Step 1, den beiden Bundle-Groessen aus Step 2 und den tatsaechlichen Messwerten aus Step 4. **Keine Zahl schaetzen.** Offene Punkte unter „Offen" nennen.

- [ ] **Step 6: Abschlusscommit**

```bash
git add docs/AI-CHANGELOG.md
git commit -F - <<'EOF'
docs: record image editor package 2 acceptance

Includes the two measurements automated tests cannot make: preview and
export brightness compared against each other with a darkening filter,
and the byte-identical export after resetting the sliders, which is what
proves the values are never burned into the image.

The real-photo GPS check doubles as the integration proof for exifr - the
unit tests only exercise our own translation layer, not the library.
EOF
```

---

## Requirement Coverage Review

| Spezifikation                                                   | Task                                    |
| --------------------------------------------------------------- | --------------------------------------- |
| `Adjustments`-Modell, Standardwerte, Begrenzung, Filterausdruck | 1                                       |
| Leerer Filterausdruck bei neutralen Werten                      | 1                                       |
| `renderImage` mit Filter, weisser Grund ungefiltert             | 2                                       |
| Vorschau und Export nutzen denselben Filter                     | 3                                       |
| Vier Regler, Zuruecksetzen, Auf alle uebernehmen                | 4                                       |
| Werte werden nie eingebrannt                                    | 1 (Entwurf), 8 (Nachweis)               |
| C2PA feststellen ueber die Segmentstruktur                      | 5                                       |
| `exifr` gekapselt, vier Zustaende, wirft nie                    | 6                                       |
| GPS, Kamera, Datum, Software, KI-Herkunft anzeigen              | 7                                       |
| GPS-Hinweis in der Bilderliste                                  | 7                                       |
| Keine Aussage zur Nicht-Erkennbarkeit von KI-Bildern            | 7 (Text), 8 (Nachweis)                  |
| Bundle-Grenze 80 kB                                             | 6 (Messung vorher), 8 (Messung nachher) |
| Barrierefreiheit: Beschriftungen, Screenreader-Text             | 4, 7                                    |
| Endabnahme mit Messungen                                        | 8                                       |

## Plan Self-Review

- **Platzhalter:** keine.
- **Abweichung von der Spezifikation, bewusst und benannt:** Die Spezifikation nannte „ein echtes JPEG als Pruefdatei" fuer den Leser. Der Plan verlegt diesen Nachweis in die Browser-Abnahme (Task 8, Step 4.1) statt eine Binaerdatei ins Repository zu legen. Grund: Ein von Hand gebauter EXIF-Bytestrom haette viele Fehlerquellen und wenig Aussagekraft, und ein echtes Foto im Browser prueft dieselbe Sache unter echten Bedingungen. Die Unit-Tests decken weiterhin die Uebersetzungsschicht ab, die uns gehoert.
- **Typkonsistenz:** `Adjustments` entsteht in Task 1 und wird ab Task 3 unveraendert verwendet. `ImageMetadata` entsteht in Task 6, das Feld am Bild kommt in Task 7 - beide Felder werden in Tasks 3 und 7 getrennt am Modell ergaenzt, jeweils mit einer Typpruefung, die alle Bauplaetze zeigt.
- **Namenskollision:** `isDefault` aus `services/adjustments.ts` heisst wie nichts anderes im Ordner; `setAdjustmentsIn` und `applyAdjustmentsToAll` sind bewusst mit Suffix benannt, damit sie nicht mit den Komponentenmethoden kollidieren - dieselbe Konvention wie bei `removeImageFrom` und `toggleReviewedIn` aus Paket 1.
- **Reihenfolge:** Task 3 haengt an 1 und 2, Task 4 an 1 und 3, Task 6 an 5, Task 7 an 6. Tasks 1-4 (Farbe) und 5-7 (Metadaten) sind voneinander unabhaengig und koennten getauscht werden; Farbe steht vorn, weil sie im Alltag den groesseren Unterschied macht.
