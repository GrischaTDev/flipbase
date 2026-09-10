# Bildoptimierer 3 – Arbeitsfläche, Steuerelemente, Metadaten-Modal, Exportvorschau

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Der Bildoptimierer passt auf einen Bildschirm: links die Vorschau, rechts ein Raster der Bilder, dazwischen ein verschiebbarer Trenner. Steuerelemente liegen auf dem Bild, Metadaten stecken in einem Modal, und die Exportvorschau ist zugleich die Plattformauswahl.

**Architecture:** Eine neue geteilte Komponente `split-pane` trägt das Layout; ihre gesamte Rechenlogik liegt in reinen Funktionen und wird ohne DOM geprüft. Im Feature wandern `adjustment-controls` und `metadata-panel` aus der Seite in ein Panel beziehungsweise ein Modal, ohne ihre Logik zu ändern. `platform-tabs` und `preview-grid` verschmelzen zu einer Kachelreihe, die zugleich Vorschau und Auswahl ist.

**Tech Stack:** Angular 22 (Signals, `model()`, OnPush), Tailwind CSS, Pointer Events, Vitest (`node`, `angular`).

**Spezifikation:** `docs/superpowers/specs/2026-09-10-bildoptimierer-arbeitsflaeche-design.md`, Teil 1, 2, 4 (Abschnitt „Anzeige im Modal") und 7.

**Voraussetzung:** Plan 1 und Plan 2 sind gemergt.

## Global Constraints

- **Arbeitsbaum:** `.worktrees/image-optimizer-workspace`, neuer Zweig `feat/image-optimizer-layout` von aktuellem `origin/master`. **`npm ci` muss dort gelaufen sein** — ein frischer Worktree hat kein `node_modules`.
- **Bezeichner im Code englisch**, Kommentare und Oberflächentexte deutsch.
- **Commit-Nachrichten englisch**, Conventional Commits v1.0.0, Scope `image-opt` oder `ui`. Titel im Imperativ, kein Punkt am Ende. **Keine KI-Signatur.**
- **Angular-Vorgaben:** Standalone ohne `standalone: true`, `changeDetection: OnPush`, `input()`/`output()`/`model()`, `@if`/`@for`, **niemals Inline-Templates**, **kein** `@HostBinding`/`@HostListener` (stattdessen `host`-Objekt), **kein** `ngClass`/`ngStyle` (stattdessen `class`- und `style`-Bindings), keine Arrow-Funktionen und kein `new Date()` in Vorlagen.
- **Tailwind-Klassen direkt im HTML.** SCSS nur, wenn das HTML sonst unlesbar würde.
- **Barrierefreiheit ist Abnahmebedingung, nicht Kür:** alle AXE-Prüfungen grün, WCAG AA erfüllt. Fokus sichtbar, Fokusreihenfolge sinnvoll, Kontrast 4,5:1 für Text und 3:1 für Bedienelemente.
- **Node-Tests (`*.spec.ts`) dürfen `window`, `document`, `localStorage`, `TestBed` und Verwandte nicht benutzen** — `npm run test:audit` bricht sonst ab. Deshalb nehmen die reinen Funktionen ihre Eingaben als Werte entgegen.
- **`tsc` prüft keine Angular-Vorlagen.** Eine Bindung an einen nicht existierenden Eingang fällt erst beim Bau auf — `npm run build` gehört zu jeder Abnahme.

## File Structure

| Datei                                                                                                | Verantwortung                                                                             |
| ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `src/app/shared/components/split-pane/split-pane-ratio.ts`                                           | Rechnen am Verhältnis: begrenzen, aus Zeigerposition, aus Taste, aus Speicher. Rein. Neu. |
| `src/app/shared/components/split-pane/split-pane-ratio.spec.ts`                                      | Node-Tests dazu. Neu.                                                                     |
| `src/app/shared/components/split-pane/split-pane.component.ts`                                       | Zwei Fächer, Griff dazwischen, Speicherung. Neu.                                          |
| `src/app/shared/components/split-pane/split-pane.component.html`                                     | Gitter und Griff. Neu.                                                                    |
| `src/app/shared/components/split-pane/split-pane.component.angular.spec.ts`                          | Bauteiltests. Neu.                                                                        |
| `src/app/features/image-optimizer/components/image-list/image-list.component.html`                   | Raster statt Spalte, Werkzeuge als Überlagerung.                                          |
| `src/app/features/image-optimizer/image-optimizer.component.html`                                    | Trenner als Arbeitsfläche, aufgelöste Abschnitte.                                         |
| `src/app/features/image-optimizer/components/crop-editor/crop-editor.component.*`                    | Leiste auf dem Bild, Farb-Panel, Metadaten-Knopf.                                         |
| `src/app/features/image-optimizer/components/adjustment-controls/adjustment-controls.component.html` | Nur noch Panel-Inhalt, ohne eigenen Kartenrahmen.                                         |
| `src/app/features/image-optimizer/components/metadata-modal/`                                        | Ehemals `metadata-panel`, jetzt in `app-modal-shell`.                                     |
| `src/app/features/image-optimizer/components/platform-preview/platform-preview.component.*`          | Kleinere, klickbare Kachel mit Warnung und Lupe.                                          |
| `src/app/features/image-optimizer/components/preview-grid/`                                          | Entfällt.                                                                                 |
| `src/app/features/image-optimizer/components/platform-tabs/`                                         | Entfällt.                                                                                 |

---

### Task 0: Zweig und Arbeitsbaum vorbereiten

**Files:** keine.

- [ ] **Step 1: Auf aktuellen Stand gehen und abzweigen**

```bash
git fetch origin
git switch -c feat/image-optimizer-layout origin/master
npm ci
```

Erwartet: Exitcode 0. `npm ci` erzeugt über `postinstall` auch `src/app/core/version.ts`.

- [ ] **Step 2: Ausgangsstand prüfen**

```bash
npx vitest run src/app/features/image-optimizer/ src/app/shared/
```

Erwartet: PASS. Ist hier etwas rot, erst klären.

---

### Task 1: Rechnen am Trennerverhältnis

**Files:**

- Create: `src/app/shared/components/split-pane/split-pane-ratio.ts`
- Create: `src/app/shared/components/split-pane/split-pane-ratio.spec.ts`

**Interfaces:**

- Consumes: nichts.
- Produces:
  - `clampRatio(value: number, min: number, max: number): number`
  - `ratioFromPointer(pointerX: number, left: number, width: number, min: number, max: number): number`
  - `ratioFromKey(key: string, current: number, shift: boolean, min: number, max: number): number | null`
  - `readStoredRatio(raw: string | null, min: number, max: number): number | null`

`ratioFromPointer` nimmt `left` und `width` als Zahlen statt eines `DOMRect`:
Ein `DOMRect` gibt es im Node-Test nicht, und die Funktion braucht ohnehin nur
diese beiden Werte.

- [ ] **Step 1: Write the failing tests**

Neue Datei `src/app/shared/components/split-pane/split-pane-ratio.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { clampRatio, ratioFromKey, ratioFromPointer, readStoredRatio } from './split-pane-ratio';

describe('Verhaeltnis begrenzen', () => {
  it('laesst einen Wert innerhalb der Grenzen stehen', () => {
    expect(clampRatio(50, 25, 75)).toBe(50);
  });

  it('zieht einen zu kleinen Wert auf die Untergrenze', () => {
    expect(clampRatio(5, 25, 75)).toBe(25);
  });

  it('zieht einen zu grossen Wert auf die Obergrenze', () => {
    expect(clampRatio(120, 25, 75)).toBe(75);
  });

  it('faengt Unsinn mit der Mitte zwischen den Grenzen ab', () => {
    // NaN entsteht aus einer kaputten Zahl im Speicher. Ungefiltert wuerde
    // daraus eine Gitterbreite von "NaN%" und die Seite waere kaputt.
    expect(clampRatio(Number.NaN, 25, 75)).toBe(50);
  });
});

describe('Verhaeltnis aus der Zeigerposition', () => {
  it('rechnet die Mitte des Bereichs auf 50', () => {
    expect(ratioFromPointer(600, 100, 1000, 25, 75)).toBe(55);
  });

  it('haelt die Untergrenze ein, auch weit links daneben', () => {
    expect(ratioFromPointer(-500, 100, 1000, 25, 75)).toBe(25);
  });

  it('haelt die Obergrenze ein, auch weit rechts daneben', () => {
    expect(ratioFromPointer(5000, 100, 1000, 25, 75)).toBe(75);
  });

  it('liefert bei Breite null die Mitte statt einer Division durch null', () => {
    expect(ratioFromPointer(0, 0, 0, 25, 75)).toBe(50);
  });
});

describe('Verhaeltnis aus einem Tastendruck', () => {
  it('geht mit Pfeil links um zwei Prozentpunkte zurueck', () => {
    expect(ratioFromKey('ArrowLeft', 50, false, 25, 75)).toBe(48);
  });

  it('geht mit Pfeil rechts um zwei Prozentpunkte vor', () => {
    expect(ratioFromKey('ArrowRight', 50, false, 25, 75)).toBe(52);
  });

  it('geht mit Umschalttaste in Zehnerschritten', () => {
    expect(ratioFromKey('ArrowRight', 50, true, 25, 75)).toBe(60);
  });

  it('springt mit Pos1 auf die Untergrenze', () => {
    expect(ratioFromKey('Home', 50, false, 25, 75)).toBe(25);
  });

  it('springt mit Ende auf die Obergrenze', () => {
    expect(ratioFromKey('End', 50, false, 25, 75)).toBe(75);
  });

  it('bleibt an der Grenze stehen, statt darueber hinaus zu laufen', () => {
    expect(ratioFromKey('ArrowLeft', 25, false, 25, 75)).toBe(25);
  });

  it('meldet bei einer nicht zustaendigen Taste null', () => {
    // null heisst: nicht behandelt. Die Komponente laesst das Ereignis dann
    // in Ruhe, statt Tab oder Escape zu verschlucken.
    expect(ratioFromKey('Tab', 50, false, 25, 75)).toBeNull();
  });
});

describe('Gemerktes Verhaeltnis lesen', () => {
  it('liest eine gespeicherte Zahl', () => {
    expect(readStoredRatio('63', 25, 75)).toBe(63);
  });

  it('meldet ohne gespeicherten Wert null', () => {
    expect(readStoredRatio(null, 25, 75)).toBeNull();
  });

  it('meldet bei Unsinn null statt eines geratenen Werts', () => {
    // Aus fremdem Inhalt im Speicher darf keine kaputte Seite entstehen.
    expect(readStoredRatio('links', 25, 75)).toBeNull();
    expect(readStoredRatio('', 25, 75)).toBeNull();
  });

  it('holt einen Wert ausserhalb der Grenzen zurueck', () => {
    // Die Grenzen koennen sich geaendert haben, seit gespeichert wurde.
    expect(readStoredRatio('90', 25, 75)).toBe(75);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run --project=node src/app/shared/components/split-pane/split-pane-ratio.spec.ts
```

Erwartet: FAIL — die Datei `./split-pane-ratio` gibt es nicht.

- [ ] **Step 3: Write the implementation**

Neue Datei `src/app/shared/components/split-pane/split-pane-ratio.ts`:

```ts
/**
 * Das Rechnen hinter dem verschiebbaren Trenner, ohne DOM.
 *
 * Alles, was der Griff tut, laesst sich als Zahl ausdruecken - Grenzen,
 * Zeigerposition, Tastendruck, gemerkter Wert. Getrennt gehalten, damit es
 * ohne Browser prueffbar bleibt und die Komponente nur noch Ereignisse
 * entgegennimmt.
 */

const STEP = 2;
const BIG_STEP = 10;

/**
 * Haelt einen Wert zwischen den Grenzen.
 *
 * `NaN` faellt auf die Mitte zurueck: Es entsteht aus einer kaputten Zahl im
 * Speicher, und ungefiltert wuerde daraus eine Gitterbreite von "NaN%" - die
 * Seite waere unbedienbar.
 */
export function clampRatio(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return (min + max) / 2;

  return Math.min(max, Math.max(min, value));
}

/**
 * Wo der Zeiger steht, als Anteil der linken Spalte.
 *
 * `left` und `width` statt eines `DOMRect`: Mehr braucht die Rechnung nicht,
 * und `DOMRect` gibt es im Test ohne Browser nicht.
 */
export function ratioFromPointer(
  pointerX: number,
  left: number,
  width: number,
  min: number,
  max: number,
): number {
  if (width <= 0) return (min + max) / 2;

  return clampRatio(Math.round(((pointerX - left) / width) * 100), min, max);
}

/**
 * Das neue Verhaeltnis nach einem Tastendruck, oder `null`, wenn diese Taste
 * den Trenner nichts angeht.
 *
 * `null` ist wichtig: Die Komponente darf nur die Tasten verschlucken, die
 * sie wirklich behandelt. Wuerde sie jedes Ereignis abfangen, kaeme man mit
 * Tab nicht mehr aus dem Griff heraus.
 */
export function ratioFromKey(
  key: string,
  current: number,
  shift: boolean,
  min: number,
  max: number,
): number | null {
  const step = shift ? BIG_STEP : STEP;

  if (key === 'ArrowLeft') return clampRatio(current - step, min, max);
  if (key === 'ArrowRight') return clampRatio(current + step, min, max);
  if (key === 'Home') return min;
  if (key === 'End') return max;

  return null;
}

/** Der gemerkte Wert, oder `null`, wenn nichts Brauchbares gespeichert war. */
export function readStoredRatio(raw: string | null, min: number, max: number): number | null {
  if (raw === null || raw.trim() === '') return null;

  const value = Number(raw);
  if (!Number.isFinite(value)) return null;

  // Die Grenzen koennen sich geaendert haben, seit gespeichert wurde.
  return clampRatio(value, min, max);
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run --project=node src/app/shared/components/split-pane/split-pane-ratio.spec.ts
```

Erwartet: PASS, 19 Tests.

- [ ] **Step 5: Commit**

```bash
git add src/app/shared/components/split-pane/split-pane-ratio.ts src/app/shared/components/split-pane/split-pane-ratio.spec.ts
git commit -m "feat(ui): add the arithmetic behind a draggable split

Everything the handle does is a number - bounds, pointer position, key press,
remembered value - so none of it needs a browser to be tested.

ratioFromKey returns null for keys it does not own. Swallowing every key event
would trap the user inside the handle with no way to Tab out.

NaN falls back to the midpoint rather than propagating. It arrives from a
corrupted stored value, and an unfiltered one renders a grid column of \"NaN%\",
which leaves the page unusable."
```

---

### Task 2: Die Trenner-Komponente

**Files:**

- Create: `src/app/shared/components/split-pane/split-pane.component.ts`
- Create: `src/app/shared/components/split-pane/split-pane.component.html`
- Create: `src/app/shared/components/split-pane/split-pane.component.angular.spec.ts`

**Interfaces:**

- Consumes: alle vier Funktionen aus Task 1.
- Produces: `SplitPaneComponent` mit `ratio = model<number>(50)`, `storageKey = input<string>('')`, `minRatio = input(25)`, `maxRatio = input(75)`, `leftLabel = input.required<string>()`, `rightLabel = input.required<string>()`, `onKeydown(event: KeyboardEvent): void`.

- [ ] **Step 1: Write the failing test**

Neue Datei `src/app/shared/components/split-pane/split-pane.component.angular.spec.ts`:

```ts
import '@angular/compiler';
import { beforeAll, describe, expect, it } from 'vitest';
import { ɵresolveComponentResources, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { readFile } from 'node:fs/promises';
import { SplitPaneComponent } from './split-pane.component';

beforeAll(async () => {
  await ɵresolveComponentResources((url) => readFile(new URL(url, import.meta.url), 'utf8'));
});

/**
 * Pflichteingaenge werden wie in den uebrigen Bauteiltests dieses Projekts
 * als Signal untergeschoben - beim Erzeugen sind sie noch leer, und die
 * Vorlage liest sie sofort.
 */
function createComponent(): SplitPaneComponent {
  TestBed.resetTestingModule();
  const fixture = TestBed.configureTestingModule({
    imports: [SplitPaneComponent],
  }).createComponent(SplitPaneComponent);
  Object.assign(fixture.componentInstance, {
    leftLabel: signal('Vorschau'),
    rightLabel: signal('Bilder'),
  });
  fixture.detectChanges();
  return fixture.componentInstance;
}

function press(key: string, shift = false): KeyboardEvent {
  return new KeyboardEvent('keydown', { key, shiftKey: shift, cancelable: true });
}

describe('Verschiebbarer Trenner', () => {
  it('startet in der Mitte', () => {
    expect(createComponent().ratio()).toBe(50);
  });

  it('laesst sich mit den Pfeiltasten verschieben', () => {
    // Ohne Tastaturbedienung faellt ein Trenner durch AXE.
    const component = createComponent();

    component.onKeydown(press('ArrowRight'));

    expect(component.ratio()).toBe(52);
  });

  it('geht mit Umschalttaste in groesseren Schritten', () => {
    const component = createComponent();

    component.onKeydown(press('ArrowRight', true));

    expect(component.ratio()).toBe(60);
  });

  it('springt mit Pos1 und Ende an die Grenzen', () => {
    const component = createComponent();

    component.onKeydown(press('Home'));
    expect(component.ratio()).toBe(25);

    component.onKeydown(press('End'));
    expect(component.ratio()).toBe(75);
  });

  it('verschluckt eine Taste, die es nicht behandelt, nicht', () => {
    // Sonst kaeme man mit Tab nicht mehr aus dem Griff heraus.
    const component = createComponent();
    const event = press('Tab');

    component.onKeydown(event);

    expect(event.defaultPrevented).toBe(false);
  });

  it('verhindert die Voreinstellung bei einer behandelten Taste', () => {
    // Sonst scrollt der Browser die Seite zusaetzlich zum Verschieben.
    const component = createComponent();
    const event = press('ArrowRight');

    component.onKeydown(event);

    expect(event.defaultPrevented).toBe(true);
  });

  it('beschreibt seinen Stand fuer Screenreader', () => {
    const component = createComponent();

    component.onKeydown(press('ArrowRight'));

    expect(component.ratio()).toBe(52);
    expect(component.handleLabel()).toContain('Vorschau');
    expect(component.handleLabel()).toContain('Bilder');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run --project=angular src/app/shared/components/split-pane/split-pane.component.angular.spec.ts
```

Erwartet: FAIL — die Komponente gibt es nicht.

- [ ] **Step 3: Write the implementation**

Neue Datei `src/app/shared/components/split-pane/split-pane.component.ts`:

```ts
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  input,
  model,
  signal,
} from '@angular/core';
import { clampRatio, ratioFromKey, ratioFromPointer, readStoredRatio } from './split-pane-ratio';

/**
 * Zwei Spalten mit einem Griff dazwischen, den der Nutzer verschieben kann.
 *
 * Liegt in `shared/`, nicht im Bildoptimierer: Der Trenner weiss nichts von
 * Bildern, und im Projekt gab es bisher nur feste Verhaeltnisse
 * (`two-column-layout`).
 *
 * Unterhalb von `lg` faellt das Gitter einspaltig und der Griff verschwindet
 * aus dem Baum - auf einem schmalen Bildschirm gibt es nichts zu verteilen,
 * und ein unbedienbarer Griff in der Tabreihenfolge waere ein Hindernis.
 */
@Component({
  selector: 'app-split-pane',
  templateUrl: './split-pane.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'block w-full',
  },
})
export class SplitPaneComponent {
  private readonly host = inject(ElementRef<HTMLElement>);

  /** Anteil der linken Spalte in Prozent. */
  readonly ratio = model<number>(50);

  /** Schluessel fuer den Browserspeicher. Leer heisst: nicht merken. */
  readonly storageKey = input<string>('');
  readonly minRatio = input<number>(25);
  readonly maxRatio = input<number>(75);
  readonly leftLabel = input.required<string>();
  readonly rightLabel = input.required<string>();

  /** Waehrend einer Ziehbewegung; schaltet die Textauswahl ab. */
  readonly isDragging = signal(false);

  // Wird unten durch die Fassung mit `isWide` ersetzt - siehe Vorlage.
  readonly columns = computed(() => `${this.ratio()}% 0.75rem 1fr`);

  readonly handleLabel = computed(
    () => `Breite von ${this.leftLabel()} und ${this.rightLabel()} verschieben`,
  );

  constructor() {
    const stored = readStoredRatio(this.read(), this.minRatio(), this.maxRatio());
    if (stored !== null) this.ratio.set(stored);
  }

  onKeydown(event: KeyboardEvent): void {
    const next = ratioFromKey(
      event.key,
      this.ratio(),
      event.shiftKey,
      this.minRatio(),
      this.maxRatio(),
    );
    // null heisst: geht den Trenner nichts an. Das Ereignis bleibt
    // unangetastet, sonst kaeme man mit Tab nicht mehr heraus.
    if (next === null) return;

    event.preventDefault();
    this.apply(next);
  }

  onPointerDown(event: PointerEvent): void {
    // Der Zeiger wird eingefangen, damit das Ziehen auch dann weiterlaeuft,
    // wenn die Maus den schmalen Griff verlaesst - und beim Loslassen
    // ausserhalb des Fensters sauber endet.
    (event.target as Element).setPointerCapture(event.pointerId);
    this.isDragging.set(true);
  }

  onPointerMove(event: PointerEvent): void {
    if (!this.isDragging()) return;

    const bounds = (this.host.nativeElement as HTMLElement).getBoundingClientRect();
    this.apply(
      ratioFromPointer(event.clientX, bounds.left, bounds.width, this.minRatio(), this.maxRatio()),
    );
  }

  onPointerUp(event: PointerEvent): void {
    if (!this.isDragging()) return;

    (event.target as Element).releasePointerCapture(event.pointerId);
    this.isDragging.set(false);
  }

  /** Doppelklick stellt die Mitte wieder her - schneller als zurueckzuziehen. */
  onDoubleClick(): void {
    this.apply(clampRatio(50, this.minRatio(), this.maxRatio()));
  }

  private apply(value: number): void {
    this.ratio.set(value);
    this.write(String(value));
  }

  /**
   * Der Zugriff auf den Browserspeicher ist gekapselt und faengt jeden Fehler
   * ab: In einem privaten Fenster wirft schon das Lesen, und ein Trenner darf
   * daran nicht die ganze Seite mitreissen.
   */
  private read(): string | null {
    const key = this.storageKey();
    if (!key) return null;
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  private write(value: string): void {
    const key = this.storageKey();
    if (!key) return;
    try {
      localStorage.setItem(key, value);
    } catch {
      // Ohne Speicher bleibt die Position eben nur fuer diese Sitzung stehen.
    }
  }
}
```

Neue Datei `src/app/shared/components/split-pane/split-pane.component.html`:

```html
<div
  class="grid items-start gap-4 lg:gap-0"
  [style.grid-template-columns]="columns()"
  [class.select-none]="isDragging()"
  (pointermove)="onPointerMove($event)"
  (pointerup)="onPointerUp($event)"
  (pointercancel)="onPointerUp($event)"
>
  <div class="min-w-0">
    <ng-content select="[left]" />
  </div>

  <div
    role="separator"
    tabindex="0"
    aria-orientation="vertical"
    [attr.aria-label]="handleLabel()"
    [attr.aria-valuenow]="ratio()"
    [attr.aria-valuemin]="minRatio()"
    [attr.aria-valuemax]="maxRatio()"
    (keydown)="onKeydown($event)"
    (pointerdown)="onPointerDown($event)"
    (dblclick)="onDoubleClick()"
    class="group hidden h-full cursor-col-resize touch-none place-items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 lg:grid"
  >
    <span
      class="h-16 w-1 rounded-full bg-fb-border transition group-hover:bg-indigo-400 group-focus-visible:bg-indigo-400"
      aria-hidden="true"
    ></span>
  </div>

  <div class="min-w-0">
    <ng-content select="[right]" />
  </div>
</div>
```

Je Auswahl steht `ng-content` genau **einmal** im Bauteil. Zwei Fassungen
desselben Fachs fuer schmal und breit gaebe es nicht: Angular projiziert
jeden Inhalt nur an die erste passende Stelle, das zweite Fach bliebe leer.
Der einspaltige Umbruch kommt deshalb ueber die Spaltenbindung, nicht ueber
doppelte Fächer.

Eine Vorlage kennt keine Medienabfrage, also liest die Komponente die
Fensterbreite in ein Signal:

```ts
  /** Ab hier lohnt sich das Verteilen; darunter wird gestapelt. */
  private readonly isWide = signal(false);

  readonly columns = computed(() => (this.isWide() ? `${this.ratio()}% 0.75rem 1fr` : '1fr'));
```

Das ersetzt die weiter oben gezeigte einfache Fassung von `columns`. Gefuellt
wird `isWide` im Konstruktor ueber `afterNextRender`, damit es beim Bau ohne
Browser nicht laeuft:

```ts
const destroyRef = inject(DestroyRef);
afterNextRender(() => {
  const query = window.matchMedia('(min-width: 1024px)');
  const update = (matches: boolean): void => this.isWide.set(matches);
  update(query.matches);

  const listener = (event: MediaQueryListEvent): void => update(event.matches);
  query.addEventListener('change', listener);
  destroyRef.onDestroy(() => query.removeEventListener('change', listener));
});
```

`afterNextRender` und `DestroyRef` werden dafuer aus `@angular/core` importiert.
Der Zuhoerer wird wieder abgemeldet - ohne das haengt er an jeder je erzeugten
Instanz und die Medienabfrage sammelt sie alle ein.

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run --project=angular src/app/shared/components/split-pane/split-pane.component.angular.spec.ts
npm run build
```

Erwartet: PASS und ein erfolgreicher Bau. Der Bau ist hier Pflicht — `tsc`
prüft die Vorlage nicht, und eine Bindung an einen falschen Namen fällt erst
dort auf.

- [ ] **Step 5: Commit**

```bash
git add src/app/shared/components/split-pane/
git commit -m "feat(ui): add a draggable split pane

two-column-layout only knows three fixed ratios, which is why the image list
was stuck at 16rem no matter how wide the window got.

The handle is a real separator: role, orientation, valuenow and full keyboard
control. Arrow keys move it, Shift moves it faster, Home and End jump to the
bounds, double-click recentres. Without that it fails AXE outright.

The pointer is captured on press so a drag survives leaving the 12px handle,
and localStorage access is wrapped - reading it throws outright in a private
window, and a splitter must not take the page down with it."
```

---

### Task 3: Bilder als Raster

**Files:**

- Modify: `src/app/features/image-optimizer/components/image-list/image-list.component.html`
- Create: `src/app/features/image-optimizer/components/image-list/image-list.component.angular.spec.ts`

**Interfaces:**

- Consumes: nichts Neues. Die Eingänge und Ausgänge von `ImageListComponent` bleiben unverändert.
- Produces: nichts Neues.

- [ ] **Step 1: Write the failing test**

Neue Datei `src/app/features/image-optimizer/components/image-list/image-list.component.angular.spec.ts`:

```ts
import '@angular/compiler';
import { beforeAll, describe, expect, it } from 'vitest';
import { ɵresolveComponentResources, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { readFile } from 'node:fs/promises';
import { ImageListComponent } from './image-list.component';
import { OptimizerImage } from '../../models/optimizer-image';
import { defaultAdjustments } from '../../services/adjustments';
import { pendingMetadata } from '../../models/image-metadata';

beforeAll(async () => {
  await ɵresolveComponentResources((url) => readFile(new URL(url, import.meta.url), 'utf8'));
});

function image(id: string): OptimizerImage {
  return {
    id,
    file: new File([''], `${id}.jpg`, { type: 'image/jpeg' }),
    dataUrl: `blob:${id}`,
    crops: {},
    rotation: 0,
    loadError: null,
    naturalSize: { width: 3000, height: 4000 },
    reviewed: false,
    adjustments: defaultAdjustments(),
    metadata: pendingMetadata(),
  };
}

function render(images: readonly OptimizerImage[]): HTMLElement {
  TestBed.resetTestingModule();
  const fixture = TestBed.configureTestingModule({
    imports: [ImageListComponent],
  }).createComponent(ImageListComponent);
  Object.assign(fixture.componentInstance, {
    images: signal(images),
    activeId: signal(images[0]?.id ?? null),
    reviewedCount: signal(0),
    disabled: signal(false),
  });
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

/**
 * Zwei dieser Tests pruefen Klassennamen. Das ist bewusst so und muss ehrlich
 * benannt werden: jsdom rechnet kein Layout, es gibt also nichts zu messen.
 * Sie sind **Rueckfallsicherungen**, keine Verhaltenspruefungen - sie fangen
 * ein versehentliches Zurueckdrehen auf die alte Spalte und ein Entfernen der
 * Tastaturerreichbarkeit. Ob das Raster gut aussieht, entscheidet die Probe im
 * Browser, nicht dieser Test.
 */
describe('Bilderraster', () => {
  it('legt die Kacheln in ein Raster, nicht in eine waagerechte Liste', () => {
    // Rueckfallsicherung: Die alte Fassung war ein `flex` mit
    // `overflow-x-auto`. Beides darf nicht zurueckkommen - eine Spalte
    // verschenkt die Breite, sobald der Trenner nach links gezogen wird.
    const element = render([image('a'), image('b'), image('c')]);
    const grid = element.querySelector('[data-testid="image-grid"]');

    expect(grid?.className).toContain('grid-cols-[repeat(auto-fill');
    expect(grid?.className).not.toContain('overflow-x-auto');
  });

  it('zeigt zu jedem Bild eine Kachel', () => {
    const element = render([image('a'), image('b'), image('c')]);

    expect(element.querySelectorAll('article')).toHaveLength(3);
  });

  it('haelt die Werkzeuge bei Tastaturfokus erreichbar', () => {
    // Rueckfallsicherung fuer eine Barrierefreiheits-Eigenschaft, die beim
    // Aufraeumen leicht verloren geht: Nur bei :hover eingeblendet waeren die
    // Werkzeuge mit der Tastatur unerreichbar, und AXE meldet das nicht,
    // weil die Knoepfe im Baum stehen.
    const element = render([image('a'), image('b')]);
    const tools = element.querySelector('[data-testid="image-tools"]');

    expect(tools?.className).toContain('group-focus-within:opacity-100');
  });

  it('kennzeichnet das erste Bild als Hauptbild', () => {
    const element = render([image('a'), image('b')]);

    expect(element.textContent).toContain('HAUPTBILD');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run --project=angular src/app/features/image-optimizer/components/image-list/image-list.component.angular.spec.ts
```

Erwartet: FAIL — es gibt weder `data-testid="image-grid"` noch das Raster.

- [ ] **Step 3: Write the implementation**

In `src/app/features/image-optimizer/components/image-list/image-list.component.html` den
äußeren Behälter ersetzen. Statt

```html
<div
  class="flex gap-3 overflow-x-auto pb-2 lg:max-h-[560px] lg:flex-col lg:overflow-x-visible lg:overflow-y-auto lg:pr-1"
></div>
```

nun:

```html
<!--
  auto-fill mit minmax richtet sich nach der tatsaechlichen Breite dieser
  Spalte, nicht nach der Fensterbreite. Das ist der Punkt: Eine Medienabfrage
  kennt die Trennerposition nicht und laege beim Ziehen falsch.
-->
<div
  data-testid="image-grid"
  class="grid max-h-[calc(100vh-18rem)] grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-3 overflow-y-auto pb-2 pr-1"
></div>
```

Jede Kachel wird zur `group`, damit die Werkzeuge auf Fokus reagieren. Das
`article`-Element bekommt `group relative` und die feste Breite entfällt:

```html
    <article
      class="group relative overflow-hidden rounded-xl border bg-fb-surface transition"
```

Die bisherige `footer`-Leiste mit vier Knöpfen wird zur Überlagerung. Sie
ersetzt den `<footer>`-Block; Nummer, GPS-Abzeichen und die Marke
„durchgesehen" bleiben unten sichtbar, die drei Ordnungsknöpfe wandern nach
oben rechts:

```html
<div
  data-testid="image-tools"
  class="absolute right-1.5 top-1.5 flex items-center gap-1 rounded-lg bg-black/75 p-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
  [class.opacity-100]="image.id === activeId()"
>
  <button
    type="button"
    (click)="moved.emit({ id: image.id, direction: -1 })"
    [disabled]="disabled() || i === 0"
    class="grid h-7 w-7 cursor-pointer place-items-center rounded-md text-white/80 hover:bg-white/15 hover:text-white disabled:cursor-not-allowed disabled:opacity-25"
    aria-label="Bild in der Reihenfolge nach vorne schieben"
    title="Nach vorne"
  >
    <svg [lucideIcon]="moveUpIcon" class="h-3.5 w-3.5" aria-hidden="true"></svg>
  </button>
  <button
    type="button"
    (click)="moved.emit({ id: image.id, direction: 1 })"
    [disabled]="disabled() || i === images().length - 1"
    class="grid h-7 w-7 cursor-pointer place-items-center rounded-md text-white/80 hover:bg-white/15 hover:text-white disabled:cursor-not-allowed disabled:opacity-25"
    aria-label="Bild in der Reihenfolge nach hinten schieben"
    title="Nach hinten"
  >
    <svg [lucideIcon]="moveDownIcon" class="h-3.5 w-3.5" aria-hidden="true"></svg>
  </button>
  <button
    type="button"
    (click)="removed.emit(image.id)"
    [disabled]="disabled()"
    class="grid h-7 w-7 cursor-pointer place-items-center rounded-md text-white/80 hover:bg-rose-500/40 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
    aria-label="Bild entfernen"
    title="Entfernen"
  >
    <svg [lucideIcon]="closeIcon" class="h-3.5 w-3.5" aria-hidden="true"></svg>
  </button>
</div>
```

Der verbleibende Fuß trägt nur noch Nummer, GPS und die Marke:

```html
<footer class="flex items-center gap-1.5 border-t border-fb-border px-2 py-1.5">
  <span class="text-[11px] font-semibold text-fb-text-secondary">{{ i + 1 }}</span>
  @if (image.metadata.gps) {
  <span
    class="rounded-full bg-amber-400/15 px-1.5 py-0.5 text-[9px] font-bold text-amber-200"
    title="Dieses Foto enthält den Aufnahmeort"
  >
    <span aria-hidden="true">◉</span>
    <span class="sr-only">Enthält Standortdaten. </span>GPS
  </span>
  }
  <button
    type="button"
    (click)="reviewToggled.emit(image.id)"
    [disabled]="disabled()"
    [attr.aria-pressed]="image.reviewed"
    [attr.aria-label]="
            image.reviewed
              ? 'Bild ' + (i + 1) + ' als nicht durchgesehen markieren'
              : 'Bild ' + (i + 1) + ' als durchgesehen markieren'
          "
    class="ml-auto inline-flex cursor-pointer items-center rounded-full px-1.5 py-0.5 text-[9px] font-bold disabled:cursor-not-allowed disabled:opacity-40"
    [class.bg-emerald-500/20]="image.reviewed"
    [class.text-emerald-300]="image.reviewed"
    [class.bg-fb-surface-hover]="!image.reviewed"
    [class.text-fb-text-muted]="!image.reviewed"
  >
    {{ image.reviewed ? '✓' : 'Offen' }}
  </button>
</footer>
```

Das `AKTIV`- und das `HAUPTBILD`-Abzeichen auf dem Bild bleiben unverändert.

- [ ] **Step 4: Run tests and build**

```bash
npx vitest run --project=angular src/app/features/image-optimizer/components/image-list/image-list.component.angular.spec.ts
npm run build
```

Erwartet: PASS und erfolgreicher Bau.

- [ ] **Step 5: Commit**

```bash
git add src/app/features/image-optimizer/components/image-list/
git commit -m "feat(image-opt): lay the images out as a grid

A single column wasted whatever width the splitter gave it. auto-fill with
minmax follows the actual column width instead of the viewport, which matters
here: a media query knows nothing about where the handle sits and would be
wrong the moment it moves.

The reorder and remove buttons moved onto the tile and appear on hover - and
on focus-within, without which they would be unreachable by keyboard. They stay
visible on the active tile so there is always one obvious way in."
```

---

### Task 4: Arbeitsfläche auf den Trenner umstellen

**Files:**

- Modify: `src/app/features/image-optimizer/image-optimizer.component.html`
- Modify: `src/app/features/image-optimizer/image-optimizer.component.ts`

**Interfaces:**

- Consumes: `SplitPaneComponent` aus Task 2.
- Produces: nichts Neues.

- [ ] **Step 1: Vorlage umbauen**

In `src/app/features/image-optimizer/image-optimizer.component.html` den Block
`@if (activeImage(); as image) { ... }` so umstellen, dass der Editor links und
die Bilderliste rechts im Trenner sitzen. Die beiden bisherigen Abschnitte
`<section class="linear-surface min-w-0 …">` (Editor) und `<aside …>` (Liste)
bleiben inhaltlich erhalten und wandern in die Fächer:

```html
@if (activeImage(); as image) {
<app-split-pane
  storageKey="flipbase.image-optimizer.split"
  leftLabel="Vorschau"
  rightLabel="Deine Bilder"
>
  <section left class="linear-surface min-w-0 rounded-2xl border border-fb-border p-4 shadow-xl">
    <!-- unveraendert: Kopfzeile, Cropper, Plattformkacheln -->
  </section>

  <aside
    right
    class="linear-surface min-w-0 rounded-2xl border border-fb-border p-3 shadow-xl lg:ml-4"
  >
    <!-- unveraendert: Kopf der Bilderliste und app-image-list -->
  </aside>
</app-split-pane>
}
```

Die bisherigen eigenständigen Abschnitte unter dem Trenner entfallen ersatzlos:

- `<app-adjustment-controls>` — zieht in Task 5 ins Panel des Editors
- `<app-preview-grid>` — geht in Task 7 in den Kacheln auf
- `<app-metadata-panel>` — wird in Task 6 zum Modal

- [ ] **Step 2: Komponente anpassen**

In `src/app/features/image-optimizer/image-optimizer.component.ts` in `imports`
`SplitPaneComponent` aufnehmen und `PreviewGridComponent`, `MetadataPanelComponent`
sowie `AdjustmentControlsComponent` erst entfernen, wenn die zugehörigen Tasks
sie ersetzt haben. **Reihenfolge beachten:** Wird ein Bauteil hier entfernt,
bevor sein Ersatz steht, bricht der Bau.

Für diesen Task genügt:

```ts
import { SplitPaneComponent } from '../../shared/components/split-pane/split-pane.component';
```

und in `imports` ergänzen.

- [ ] **Step 3: Bauen und im Browser ansehen**

```bash
npm run build
```

Erwartet: erfolgreicher Bau. Danach die Vorschau starten und prüfen:

1. Zwei Spalten, Start bei 50/50.
2. Griff mit der Maus ziehen — die Spalten folgen, das Bilderraster wechselt seine Spaltenzahl mit.
3. Fenster schmaler als 1024 px ziehen — alles fällt untereinander, der Griff verschwindet.
4. Seite neu laden — die zuletzt eingestellte Breite steht wieder da.
5. Mit Tab auf den Griff und mit den Pfeiltasten verschieben.

- [ ] **Step 4: Commit**

```bash
git add src/app/features/image-optimizer/image-optimizer.component.html src/app/features/image-optimizer/image-optimizer.component.ts
git commit -m "feat(image-opt): put preview and images either side of a splitter

The 16rem sidebar was the whole problem: on a wide screen the images sat in a
thin strip pinned to the right edge while the editor kept the rest, and no
window size changed that. Both panes now start at half and the seller decides.

The chosen width is remembered, so this is a one-time adjustment rather than a
per-session chore."
```

---

### Task 5: Steuerelemente auf die Vorschau

**Files:**

- Modify: `src/app/features/image-optimizer/components/crop-editor/crop-editor.component.ts`
- Modify: `src/app/features/image-optimizer/components/crop-editor/crop-editor.component.html`
- Modify: `src/app/features/image-optimizer/components/adjustment-controls/adjustment-controls.component.html`
- Modify: `src/app/features/image-optimizer/image-optimizer.component.html`
- Test: neue Fälle in `src/app/features/image-optimizer/components/crop-editor/` (Datei `crop-editor.component.angular.spec.ts`, neu)

**Interfaces:**

- Consumes: `AdjustmentControlsComponent` (unverändert in seiner Logik).
- Produces: `CropEditorComponent` zusätzlich mit
  - `adjustments = input.required<Adjustments>()`
  - `hasLocation = input(false)`
  - `adjustmentsChanged = output<Adjustments>()`, `adjustmentsResetRequested = output<void>()`, `adjustmentsApplyToAllRequested = output<void>()`, `metadataRequested = output<void>()`
  - `isPanelOpen = signal(false)`, `togglePanel(): void`, `closePanel(): void`
  - `zoomIn(): void`, `zoomOut(): void`

- [ ] **Step 1: Write the failing test**

Neue Datei `src/app/features/image-optimizer/components/crop-editor/crop-editor.component.angular.spec.ts`:

```ts
import '@angular/compiler';
import { beforeAll, describe, expect, it } from 'vitest';
import { ɵresolveComponentResources, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { readFile } from 'node:fs/promises';
import { CropEditorComponent } from './crop-editor.component';
import { defaultAdjustments } from '../../services/adjustments';

beforeAll(async () => {
  await ɵresolveComponentResources((url) => readFile(new URL(url, import.meta.url), 'utf8'));
});

function createComponent(): CropEditorComponent {
  TestBed.resetTestingModule();
  const fixture = TestBed.configureTestingModule({
    imports: [CropEditorComponent],
  }).createComponent(CropEditorComponent);
  Object.assign(fixture.componentInstance, {
    dataUrl: signal('blob:a'),
    ratio: signal(1),
    adjustments: signal(defaultAdjustments()),
  });
  fixture.detectChanges();
  return fixture.componentInstance;
}

describe('Steuerelemente auf der Vorschau', () => {
  it('haelt das Farb-Panel zunaechst geschlossen', () => {
    // Die Regler haben frueher die Seite verlaengert. Standardmaessig zu.
    expect(createComponent().isPanelOpen()).toBe(false);
  });

  it('oeffnet und schliesst das Panel auf Klick', () => {
    const component = createComponent();

    component.togglePanel();
    expect(component.isPanelOpen()).toBe(true);

    component.togglePanel();
    expect(component.isPanelOpen()).toBe(false);
  });

  it('schliesst das Panel beim Bildwechsel', () => {
    // Ein offenes Panel ueber einem anderen Bild waere irrefuehrend - die
    // Regler zeigten dann Werte des vorigen.
    const component = createComponent();
    component.togglePanel();

    Object.assign(component, { dataUrl: signal('blob:b') });
    TestBed.flushEffects();

    expect(component.isPanelOpen()).toBe(false);
  });

  it('vergroessert und verkleinert den Zoom in Schritten', () => {
    const component = createComponent();

    component.zoomIn();

    expect(component.transform().scale).toBeCloseTo(1.05, 5);
  });

  it('geht beim Verkleinern nicht unter die Untergrenze', () => {
    const component = createComponent();

    component.zoomOut();

    expect(component.transform().scale).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run --project=angular src/app/features/image-optimizer/components/crop-editor/crop-editor.component.angular.spec.ts
```

Erwartet: FAIL — `isPanelOpen`, `togglePanel`, `zoomIn`, `zoomOut` gibt es nicht.

- [ ] **Step 3: Write the implementation**

In `crop-editor.component.ts` ergänzen:

```ts
import { AdjustmentControlsComponent } from '../adjustment-controls/adjustment-controls.component';
import { Adjustments } from '../../models/image-adjustments';
import {
  LucideInfo as Info,
  LucideMinus as Minus,
  LucidePlus as Plus,
  LucideSlidersHorizontal as Sliders,
} from '@lucide/angular';
```

In `imports` des Decorators `AdjustmentControlsComponent` aufnehmen.

Neue Eingänge, Ausgänge und Zustand:

```ts
  readonly adjustments = input.required<Adjustments>();
  /** Ob dieses Foto den Aufnahmeort enthaelt - der Knopf traegt dann einen Punkt. */
  readonly hasLocation = input(false);

  readonly adjustmentsChanged = output<Adjustments>();
  readonly adjustmentsResetRequested = output<void>();
  readonly adjustmentsApplyToAllRequested = output<void>();
  readonly metadataRequested = output<void>();

  readonly panelIcon = Sliders;
  readonly infoIcon = Info;
  readonly plusIcon = Plus;
  readonly minusIcon = Minus;

  /**
   * Das Farb-Panel liegt ueber dem Bild und ist standardmaessig zu.
   *
   * Vorher standen die Regler als eigene Karte unter dem Editor und machten
   * die Seite so lang, dass man zum Vergleichen scrollen musste - also genau
   * beim Beurteilen einer Farbaenderung das Bild nicht mehr sah.
   */
  readonly isPanelOpen = signal(false);

  togglePanel(): void {
    this.isPanelOpen.update((open) => !open);
  }

  closePanel(): void {
    this.isPanelOpen.set(false);
  }

  private readonly ZOOM_STEP = 0.05;

  zoomIn(): void {
    this.setZoom(String((this.transform().scale ?? 1) + this.ZOOM_STEP));
  }

  zoomOut(): void {
    this.setZoom(String((this.transform().scale ?? 1) - this.ZOOM_STEP));
  }
```

Im bestehenden `effect()` im Konstruktor wird das Panel beim Bildwechsel
geschlossen — direkt in den Zweig `if (dataUrl !== this.lastDataUrl)`:

```ts
this.isPanelOpen.set(false);
```

In `crop-editor.component.html` wird die Leiste unter dem Bild zur Leiste **im**
Bildbereich. Der äußere Behälter bekommt `relative`, die Leiste sitzt unten
darin, und das Panel schwebt darüber:

```html
<div
  class="relative flex h-[62vh] min-h-96 items-center justify-center overflow-hidden rounded-2xl bg-[#090b12] p-3 shadow-inner"
>
  <image-cropper
    <!-- unveraendert -->
  ></image-cropper>

  @if (isPanelOpen()) {
    <div
      class="absolute inset-x-3 bottom-16 z-10 rounded-xl border border-fb-border bg-fb-surface/95 p-3 shadow-2xl backdrop-blur"
      role="group"
      aria-label="Farbe und Belichtung"
    >
      <app-adjustment-controls
        [adjustments]="adjustments()"
        [disabled]="disabled()"
        [canApplyToAll]="true"
        (changed)="adjustmentsChanged.emit($event)"
        (resetRequested)="adjustmentsResetRequested.emit()"
        (applyToAllRequested)="adjustmentsApplyToAllRequested.emit()"
      ></app-adjustment-controls>
    </div>
  }

  <!--
    Deckender Grund, kein durchsichtiges Overlay: Produktfotos sind hier
    meist hell, und bei Transparenz waere kein Kontrastverhaeltnis
    zusicherbar. WCAG AA verlangt 4,5:1 fuer Text und 3:1 fuer Bedienelemente.
  -->
  <div
    class="absolute inset-x-3 bottom-3 z-20 flex flex-wrap items-center gap-1.5 rounded-xl bg-[#12141c] px-2 py-1.5 shadow-lg"
  >
    <button
      type="button"
      (click)="rotateRequested.emit()"
      [disabled]="disabled()"
      class="grid h-8 w-8 cursor-pointer place-items-center rounded-lg text-white/75 hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
      aria-label="Bild drehen"
      title="Drehen"
    >
      <svg [lucideIcon]="rotateIcon" class="h-3.5 w-3.5" aria-hidden="true"></svg>
    </button>

    <div class="mx-0.5 h-5 w-px bg-white/15" aria-hidden="true"></div>

    <button
      type="button"
      (click)="zoomOut()"
      [disabled]="disabled()"
      class="grid h-8 w-8 cursor-pointer place-items-center rounded-lg text-white/75 hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
      aria-label="Verkleinern"
      title="Verkleinern"
    >
      <svg [lucideIcon]="minusIcon" class="h-3.5 w-3.5" aria-hidden="true"></svg>
    </button>
    <span class="w-12 text-center text-[10px] tabular-nums text-white/70" aria-live="polite">
      {{ ((transform().scale ?? 1) * 100).toFixed(0) }} %
    </span>
    <button
      type="button"
      (click)="zoomIn()"
      [disabled]="disabled()"
      class="grid h-8 w-8 cursor-pointer place-items-center rounded-lg text-white/75 hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
      aria-label="Vergrößern"
      title="Vergrößern"
    >
      <svg [lucideIcon]="plusIcon" class="h-3.5 w-3.5" aria-hidden="true"></svg>
    </button>

    <div class="mx-0.5 h-5 w-px bg-white/15" aria-hidden="true"></div>

    <button
      type="button"
      (click)="center()"
      [disabled]="disabled()"
      class="grid h-8 w-8 cursor-pointer place-items-center rounded-lg text-white/75 hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
      aria-label="Bild im Ausschnitt zentrieren"
      title="Zentrieren"
    >
      <svg [lucideIcon]="centerIcon" class="h-3.5 w-3.5" aria-hidden="true"></svg>
    </button>
    <button
      type="button"
      (click)="reset()"
      [disabled]="disabled()"
      class="grid h-8 w-8 cursor-pointer place-items-center rounded-lg text-white/75 hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
      aria-label="Bildbearbeitung zurücksetzen"
      title="Zurücksetzen"
    >
      <svg [lucideIcon]="resetIcon" class="h-3.5 w-3.5" aria-hidden="true"></svg>
    </button>

    <button
      type="button"
      (click)="togglePanel()"
      [disabled]="disabled()"
      [attr.aria-expanded]="isPanelOpen()"
      class="ml-auto inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-semibold text-white/75 hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
      [class.bg-white/15]="isPanelOpen()"
    >
      <svg [lucideIcon]="panelIcon" class="h-3.5 w-3.5" aria-hidden="true"></svg>
      Farbe
    </button>
    <button
      type="button"
      (click)="metadataRequested.emit()"
      class="relative inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-semibold text-white/75 hover:bg-white/10 hover:text-white"
    >
      <svg [lucideIcon]="infoIcon" class="h-3.5 w-3.5" aria-hidden="true"></svg>
      Metadaten
      @if (hasLocation()) {
        <span
          class="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-amber-400"
          aria-hidden="true"
        ></span>
        <span class="sr-only">Dieses Foto enthält den Aufnahmeort.</span>
      }
    </button>
  </div>
</div>
```

Der bisherige Block mit Zoom-Schieberegler und den Textknöpfen unter dem Bild
entfällt vollständig.

`Escape` schließt das Panel. Das gehört ins `host`-Objekt des Decorators, nicht
an `@HostListener`:

```ts
  host: {
    '(keydown.escape)': 'closePanel()',
  },
```

In `adjustment-controls.component.html` fällt der äußere Kartenrahmen weg — das
Panel bringt seinen eigenen mit. Aus

```html
<div class="linear-surface rounded-2xl border border-fb-border p-4 shadow-xl"></div>
```

wird

```html
<div></div>
```

Kopfzeile („Bildwirkung" / „Farbe und Belichtung") entfällt, weil das Panel
bereits beschriftet ist; die beiden Knöpfe rutschen unter die Regler.

In `image-optimizer.component.html` bekommt `<app-crop-editor>` die neuen
Bindungen:

```html
<app-crop-editor
  [dataUrl]="image.dataUrl"
  [ratio]="platform.exportRatio"
  [storedCrop]="activeCrop()"
  [disabled]="isBusy()"
  [adjustments]="image.adjustments"
  [hasLocation]="image.metadata.gps !== null"
  (cropChanged)="saveCrop(image.id, $event)"
  (rotateRequested)="rotate(image.id)"
  (loadFailed)="onLoadFailed(image.id)"
  (imageLoadedEvent)="onImageLoaded(image.id)"
  (adjustmentsChanged)="setAdjustments($event)"
  (adjustmentsResetRequested)="resetAdjustments()"
  (adjustmentsApplyToAllRequested)="applyAdjustmentsToAllImages()"
  (metadataRequested)="isMetadataOpen.set(true)"
></app-crop-editor>
```

`isMetadataOpen` wird in Task 6 angelegt; bis dahin bleibt die letzte Bindung
weg, damit der Bau durchläuft.

- [ ] **Step 4: Run tests and build**

```bash
npx vitest run src/app/features/image-optimizer/
npm run build
```

Erwartet: PASS und erfolgreicher Bau.

- [ ] **Step 5: Commit**

```bash
git add src/app/features/image-optimizer/components/crop-editor/ src/app/features/image-optimizer/components/adjustment-controls/adjustment-controls.component.html src/app/features/image-optimizer/image-optimizer.component.html
git commit -m "feat(image-opt): move the image controls onto the preview

The colour sliders sat in their own card below the editor and made the page
long enough that judging a change meant scrolling the image out of view - the
one moment you need to see it. The panel now floats over the image and starts
closed.

The bar is opaque, not a translucent overlay. Product photos here are usually
bright, and over an arbitrary photo no contrast ratio can be promised, while AA
demands 4.5:1 for text and 3:1 for controls.

The zoom slider became minus/plus buttons: at a 12px-wide bar a range input is
hard to hit and impossible to read."
```

---

### Task 6: Metadaten ins Modal

**Files:**

- Create: `src/app/features/image-optimizer/components/metadata-modal/metadata-modal.component.ts`
- Create: `src/app/features/image-optimizer/components/metadata-modal/metadata-modal.component.html`
- Delete: `src/app/features/image-optimizer/components/metadata-panel/`
- Modify: `src/app/features/image-optimizer/image-optimizer.component.ts` und `.html`

**Interfaces:**

- Consumes: `ModalShellComponent` aus `shared/components/modal-shell/`.
- Produces: `MetadataModalComponent` mit `metadata = input.required<ImageMetadata>()` und `closed = output<void>()`. Die gesamte abgeleitete Logik (`isEmpty`, `fields`, `coordinates`, `hasAiSignal`, `hasContentCredential`, `credentialChecked`, `fieldCountLabel`) wird **unverändert** aus `metadata-panel.component.ts` übernommen.

- [ ] **Step 1: Komponente anlegen**

`metadata-panel.component.ts` nach `metadata-modal/metadata-modal.component.ts`
kopieren, Klassennamen und `selector` ändern (`app-metadata-modal`), `closed`
ergänzen und `ModalShellComponent` in `imports` aufnehmen. Die Rechenlogik
bleibt Zeile für Zeile dieselbe — sie ist geprüft und ändert sich nicht.

`metadata-panel.component.html` nach `metadata-modal.component.html` kopieren
und den äußeren `<section>` durch die Hülle ersetzen:

```html
<app-modal-shell
  title="Metadaten der Datei"
  subtitle="Was in dieser Datei steckt – und was davon beim Export verschwindet"
  size="lg"
  [hasFooter]="false"
  (closed)="closed.emit()"
>
  <!-- unveraendert: der gesamte @switch-Block aus dem bisherigen Panel -->
</app-modal-shell>
```

Der Zähler oben rechts wandert in ein `[header-actions]`-Fach:

```html
@if (metadata().status === 'read' && fields().length > 0) {
<p header-actions class="text-[10px] tabular-nums text-fb-text-muted">{{ fieldCountLabel() }}</p>
}
```

`app-modal-shell` bringt Fokusfalle, `Escape` und die Fokusrückgabe über
`ModalDialogDirective` bereits mit — davon muss hier nichts nachgebaut werden.

- [ ] **Step 2: Einbinden und altes Bauteil entfernen**

In `image-optimizer.component.ts`:

```ts
import { MetadataModalComponent } from './components/metadata-modal/metadata-modal.component';
```

`MetadataPanelComponent` aus Import und `imports` entfernen, `MetadataModalComponent`
aufnehmen. Neues Signal:

```ts
  /** Ob das Metadaten-Fenster offen ist. */
  readonly isMetadataOpen = signal(false);
```

Am Ende von `image-optimizer.component.html`, neben dem Fotoguide:

```html
@if (isMetadataOpen() && activeImage(); as image) {
<app-metadata-modal
  [metadata]="image.metadata"
  (closed)="isMetadataOpen.set(false)"
></app-metadata-modal>
}
```

Die in Task 5 zurückgestellte Bindung `(metadataRequested)="isMetadataOpen.set(true)"`
wird jetzt ergänzt.

Danach das alte Verzeichnis löschen:

```bash
git rm -r src/app/features/image-optimizer/components/metadata-panel/
```

- [ ] **Step 3: Prüfen**

```bash
npx vitest run src/app/features/image-optimizer/
npm run build
```

Erwartet: PASS und erfolgreicher Bau. Verweist ein bestehender Test noch auf
`MetadataPanelComponent`, wird er auf das Modal umgestellt — die geprüfte
Logik ist dieselbe.

Im Browser: Knopf „Metadaten" öffnet das Fenster, `Escape` schließt es, der
Fokus kehrt auf den Knopf zurück. Bei einem Foto mit Standort trägt der Knopf
einen Punkt.

- [ ] **Step 4: Commit**

```bash
git add -A src/app/features/image-optimizer/components/ src/app/features/image-optimizer/image-optimizer.component.ts src/app/features/image-optimizer/image-optimizer.component.html
git commit -m "feat(image-opt): show the metadata in a modal instead of a wall

A phone photo carries dozens of EXIF fields, and the full list pushed the
export bar off the screen on every single image. The list is worth having in
full - that was a deliberate decision - but not permanently in the way.

The derived logic moved over line for line; only the wrapper changed.
modal-shell already supplies the focus trap, Escape and focus return, so none
of that is rebuilt here.

The button carries a dot when the photo has GPS: otherwise the one field with
real consequences would sit behind a click nobody makes."
```

---

### Task 7: Exportvorschau in die Plattformkacheln

**Files:**

- Modify: `src/app/features/image-optimizer/components/platform-preview/platform-preview.component.ts` und `.html`
- Delete: `src/app/features/image-optimizer/components/preview-grid/`, `src/app/features/image-optimizer/components/platform-tabs/`
- Modify: `src/app/features/image-optimizer/image-optimizer.component.html` und `.ts`

**Interfaces:**

- Consumes: `checkOutput` aus `services/platform-validation`.
- Produces: `PlatformPreviewComponent` zusätzlich mit `isActive = input(false)`, `issue = input<{ width: number; height: number } | null>(null)`, `selected = output<PlatformId>()`, `enlargeRequested = output<PlatformId>()`.

- [ ] **Step 1: Kachel umbauen**

`platform-preview.component.html`: Aus dem `<article>` wird ein anklickbares
Element. Die Höhe sinkt von `h-64` auf `h-32`, damit drei Kacheln nebeneinander
unter den Cropper passen.

```html
<div
  class="flex h-full flex-col overflow-hidden rounded-xl border transition"
  [class.border-indigo-400]="isActive()"
  [class.ring-2]="isActive()"
  [class.ring-indigo-400/30]="isActive()"
  [class.border-rose-400]="issue() !== null"
  [class.border-fb-border]="!isActive() && issue() === null"
>
  <button
    type="button"
    (click)="selected.emit(platform().id)"
    [attr.aria-current]="isActive() ? 'true' : null"
    class="flex flex-1 cursor-pointer flex-col bg-fb-surface text-left"
  >
    <div class="flex flex-1 items-center justify-center bg-black/30 p-2">
      <div class="relative flex h-32 w-full items-center justify-center">
        @if (previewUrl(); as url) {
        <img
          [src]="url"
          alt="Exportvorschau für {{ platform().name }}"
          class="max-h-full max-w-full rounded object-contain shadow"
        />
        } @if (isRendering()) {
        <div class="absolute inset-0 grid place-items-center bg-black/35" aria-live="polite">
          <span class="text-[10px] font-medium text-white/70">Wird aktualisiert …</span>
        </div>
        } @else if (hasPreviewError()) {
        <div
          class="absolute inset-0 grid place-items-center bg-black/35 px-2 text-center"
          role="status"
        >
          <span class="text-[10px] font-medium text-rose-200">Vorschau nicht verfügbar</span>
        </div>
        }
      </div>
    </div>

    <div class="flex items-center justify-between gap-2 border-t border-fb-border px-2.5 py-1.5">
      <span class="text-[11px] font-bold text-fb-text-primary">{{ platform().name }}</span>
      @if (outputSize(); as size) {
      <span class="text-[10px] tabular-nums text-fb-text-muted">
        {{ size.width }} × {{ size.height }}
      </span>
      }
    </div>
  </button>

  @if (issue(); as tooSmall) {
  <!--
      Die Warnung steht an der Kachel, die sie betrifft. Als eigene Leiste
      ueber dem Bild musste sie erst die Plattform nennen, und bei mehreren
      betroffenen Plattformen zeigte sie nur die erste.
    -->
  <p class="bg-rose-500/15 px-2.5 py-1.5 text-[10px] leading-snug text-rose-200" role="alert">
    Nur {{ tooSmall.width }} × {{ tooSmall.height }} px – {{ platform().name }} verlangt mehr. Wähle
    einen größeren Ausschnitt.
  </p>
  }

  <button
    type="button"
    (click)="enlargeRequested.emit(platform().id)"
    class="border-t border-fb-border px-2.5 py-1 text-[10px] font-semibold text-fb-text-muted hover:text-fb-text-primary"
  >
    Groß ansehen
  </button>
</div>
```

Der Schalter „Groß ansehen" statt eines Lupensymbols: Ein zweiter Knopf
**innerhalb** des Auswahlknopfes wäre verschachtelte Bedienung und in HTML
unzulässig.

- [ ] **Step 2: In die Seite einsetzen**

In `image-optimizer.component.html` ersetzt eine Kachelreihe unter dem Cropper
sowohl `<app-platform-tabs>` als auch den bisherigen `<app-preview-grid>`-Block
und die rote Warnleiste über dem Bild:

```html
<div class="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
  @for (p of selectedPlatforms(); track p.id) {
  <app-platform-preview
    [platform]="p"
    [dataUrl]="image.dataUrl"
    [crop]="image.crops[p.id] ?? null"
    [look]="activeLook()"
    [isActive]="p.id === workingPlatformId()"
    [issue]="issueFor(p.id)"
    (selected)="setWorkingPlatform($event)"
    (enlargeRequested)="enlargedPlatformId.set($event)"
  ></app-platform-preview>
  }
</div>
```

In `image-optimizer.component.ts`:

```ts
  /** Welche Plattform gerade in Originalgroesse gezeigt wird. */
  readonly enlargedPlatformId = signal<PlatformId | null>(null);

  /**
   * Die Aufloesungswarnung je Plattform - null, wenn alles passt.
   *
   * Frueher stand eine einzige Leiste ueber dem Bild und nannte nur die
   * erste betroffene Plattform. Jetzt traegt jede Kachel ihre eigene.
   */
  issueFor(id: PlatformId): { width: number; height: number } | null {
    const image = this.activeImage();
    const platform = this.selectedPlatforms().find((p) => p.id === id);
    if (!image || !platform) return null;

    const check = checkOutput(image.crops[id] ?? null, image.naturalSize, platform);
    return check && !check.isValid ? { width: check.width, height: check.height } : null;
  }
```

`PlatformTabsComponent` und `PreviewGridComponent` aus Import und `imports`
entfernen, die Verzeichnisse löschen:

```bash
git rm -r src/app/features/image-optimizer/components/preview-grid/ src/app/features/image-optimizer/components/platform-tabs/
```

Die große Ansicht nutzt wieder `app-modal-shell` und dieselbe
`platform-preview`-Rechenlogik, nur ohne Höhenbegrenzung. Am Ende der Vorlage:

```html
@if (enlargedPlatformId(); as id) { @if (activeImage(); as image) {
<app-preview-modal
  [platform]="platformById(id)"
  [dataUrl]="image.dataUrl"
  [crop]="image.crops[id] ?? null"
  [look]="activeLook()"
  (closed)="enlargedPlatformId.set(null)"
></app-preview-modal>
} }
```

**Kein eigenes Bauteil für die große Ansicht.** `PlatformPreviewComponent`
trägt bereits die gesamte Render-Maschinerie: Entprellen der Reglerbewegungen,
Lebensdauer der Object-URLs, verzögertes Overlay, Fehlerzustand. Ein zweites
Bauteil daneben würde das alles doppeln, und die beiden Fassungen liefen
auseinander, sobald jemand nur eine anfasst.

Stattdessen bekommt die Kachel eine Darstellungsart:

```ts
  /** `tile` in der Reihe unter dem Bild, `full` im Fenster. */
  readonly variant = input<'tile' | 'full'>('tile');
```

Die Vorlage verzweigt darauf, und **nur** darauf:

- `tile` — wie oben beschrieben: klickbar, Fußzeile mit Name und Maß, Knopf „Groß ansehen", Bildhöhe `h-32`
- `full` — nur das Bild, ohne Höhenbegrenzung (`max-h-[80vh]`), ohne Auswahlknopf, ohne Fußzeile, ohne Lupe

Die Ausgänge `selected` und `enlargeRequested` bleiben in der `full`-Fassung
einfach unverbunden. Kein zusätzlicher Zustand, keine zweite Renderstrecke.

Das Fenster selbst steht in der Vorlage des Bildoptimierers, nicht in einem
eigenen Bauteil:

```html
@if (enlargedPlatform(); as platform) { @if (activeImage(); as image) {
<app-modal-shell
  [title]="'Exportvorschau für ' + platform.name"
  size="full"
  [hasFooter]="false"
  (closed)="enlargedPlatformId.set(null)"
>
  <app-platform-preview
    variant="full"
    [platform]="platform"
    [dataUrl]="image.dataUrl"
    [crop]="image.crops[platform.id] ?? null"
    [look]="activeLook()"
  ></app-platform-preview>
</app-modal-shell>
} }
```

`enlargedPlatform` ist ein `computed`, das aus der gemerkten Kennung das Profil
sucht — in Vorlagen sind freie Funktionen wie `platformById` nicht aufrufbar:

```ts
  readonly enlargedPlatform = computed<PlatformProfile | null>(
    () => this.selectedPlatforms().find((p) => p.id === this.enlargedPlatformId()) ?? null,
  );
```

Über `selectedPlatforms()` statt `platformById()`, damit eine inzwischen
abgewählte Plattform das Fenster nicht offen hält.

- [ ] **Step 3: Prüfen**

```bash
npx vitest run src/app/features/image-optimizer/
npm run build
```

Erwartet: PASS und erfolgreicher Bau. Die bestehende
`platform-preview.component.spec.ts` wird um die neuen Eingänge ergänzt.

Im Browser: Drei Kacheln unter dem Bild, Klick wechselt die bearbeitete
Plattform, ein zu kleiner Ausschnitt färbt genau die betroffene Kachel rot,
„Groß ansehen" öffnet das Fenster.

- [ ] **Step 4: Commit**

```bash
git add -A src/app/features/image-optimizer/
git commit -m "feat(image-opt): make the platform previews the platform picker

Text tabs and three large preview cards said the same thing in two places at
opposite ends of the page, so choosing a platform and checking its result
needed a scroll between them. One row of tiles does both.

The resolution warning moved onto the tile it concerns. As a single bar above
the image it had to name the platform in prose, and with two platforms too
small it only ever showed the first.

Enlarging is its own button beside the tile rather than an icon inside it -
a button within a button is invalid HTML and unreachable by keyboard."
```

---

### Task 8: Barrierefreiheit, Gesamtprüfung, PR

**Files:**

- Modify: `docs/AI-CHANGELOG.md`

- [ ] **Step 1: AXE über die Seite**

Die Seite im Browser öffnen und mit der AXE-Erweiterung prüfen, und zwar in
**drei** Zuständen, weil sich der Baum dazwischen ändert:

1. Grundzustand mit geladenen Bildern
2. mit offenem Farb-Panel
3. mit offenem Metadaten-Fenster

Erwartet: null Verstöße. Jeden gefundenen Verstoß beheben, nicht wegdiskutieren.

- [ ] **Step 2: Tastaturweg abgehen**

Nur mit der Tastatur, ohne Maus:

1. Mit Tab bis zum Trenner, mit den Pfeiltasten verschieben — `aria-valuenow` muss sich ändern.
2. Weiter zu den Bildkacheln: Die Werkzeuge müssen sichtbar werden, sobald ein Knopf darin den Fokus hat.
3. Farb-Panel mit Enter öffnen, Regler erreichen, mit `Escape` schließen — der Fokus muss auf dem Knopf „Farbe" zurückliegen.
4. Metadaten-Fenster öffnen, mit Tab darin herumgehen (der Fokus darf es nicht verlassen), `Escape` schließen.
5. Plattformkacheln mit Enter wechseln.

- [ ] **Step 3: Vollständige Prüfung**

```bash
npm run verify > /tmp/verify-3.log 2>&1; echo "Exitcode: $?"
```

Erwartet: `Exitcode: 0`. Nicht durch eine Pipe messen.

- [ ] **Step 4: Bündelgröße vergleichen**

```bash
grep -i "image-optimizer" /tmp/verify-3.log
```

`preview-grid` und `platform-tabs` sind entfallen, `split-pane` ist dazugekommen.
Der Chunk sollte etwa gleich bleiben; eine deutliche Zunahme gehört erklärt.

- [ ] **Step 5: Changelog-Eintrag**

Oben in `docs/AI-CHANGELOG.md`, Absätze **Auftrag/Ergebnis**, **Betroffen**,
**Geprüft** — mit dem AXE-Ergebnis aus Schritt 1, dem Tastaturweg aus Schritt 2
und den Bündelzahlen aus Schritt 4. Abschließen mit `---`.

```bash
npx prettier --write docs/AI-CHANGELOG.md
```

- [ ] **Step 6: Commit, Push, PR**

```bash
git add docs/AI-CHANGELOG.md
git commit -m "docs(image-opt): record the workspace rework"
git push -u origin feat/image-optimizer-layout
gh pr create --base master --title "feat(image-opt): rebuild the workspace around a resizable split" --body "..."
```

Der Body nennt das **Warum** — die 16rem-Spalte, die verlängernde
Reglerkarte, die Metadatenwand, die doppelt gezeigte Exportvorschau — und was
tatsächlich geprüft wurde, einschließlich AXE. Nach grünen Prüfungen per
Merge-Commit veröffentlichen.

---

## Nicht in diesem Plan

- **Umsortieren per Ziehen.** Im Raster wäre es die natürliche Geste, ist aber eigenständige Arbeit mit eigener Tastaturersatzbedienung. Die Pfeilknöpfe bleiben und funktionieren.
- **Der Trenner an anderen Stellen im Projekt.** `split-pane` liegt in `shared/` und ist dafür bereit, wird hier aber nur im Bildoptimierer eingesetzt.
