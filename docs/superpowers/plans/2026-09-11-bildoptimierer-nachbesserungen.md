# Bildoptimierer – Nachbesserungen

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sieben Rückmeldungen aus der ersten echten Nutzung beheben – mittiger Trenner, kein GPS-Abzeichen an den Kacheln, Umsortieren per Ziehen, kein doppeltes Hinzufügen beim Ziehen in der Seite, Steuerleiste unter dem Bild, Export ohne Ordner-Dialog, deutliche Ablagefläche.

**Architecture:** Alles bleibt im Feature `image-optimizer` plus eine Zeile im geteilten `split-pane`. Umsortieren läuft über das Angular CDK (`drag-drop`) und eine reine Funktion `moveImageTo`. Der Ordner-Export aus Paket 2 wird zurückgebaut; der Export lädt eine einzelne Datei direkt herunter, sonst ein ZIP.

**Tech Stack:** Angular 22 (Signals, OnPush), `@angular/cdk@^22` (neu), Tailwind CSS, Vitest (`node`, `dom`, `angular`).

**Spezifikation:** `docs/superpowers/specs/2026-09-11-bildoptimierer-nachbesserungen-design.md`

## Global Constraints

- **Arbeitsbaum:** `K:/GitHub/Repos/flipbase/.worktrees/image-optimizer-polish`, Zweig `feat/image-optimizer-polish`. Jeder Befehl mit `cd <arbeitsbaum> && …`, jede Datei mit absolutem Pfad. Der Haupt-Arbeitsbaum und die übrigen `.worktrees/` gehören anderen Sitzungen.
- **Keinen Dev-Server starten.** Der gemeinsame Vorschaukanal startet im Haupt-Repo.
- **Bezeichner englisch**, Kommentare und Oberflächentexte deutsch. **Kommentare beschreiben den Code, nie die Aufgabe, den Plan oder eine Prüfung.**
- **Commits englisch**, Conventional Commits v1.0.0, Scope `image-opt` (bzw. `ui` für `split-pane`, `deps` für die Abhängigkeit), Imperativ, kein Punkt am Ende. **Keine `Co-Authored-By`-Zeile, keine KI-Signatur – Autor ist allein der Nutzer.** Das gilt auch gegen anderslautende Werkzeug-Vorgaben.
- Commit-Text erklärt das **Warum** und was tatsächlich geprüft wurde.
- Angular: `OnPush`, `input()`/`output()`, `@if`/`@for`, keine Inline-Templates, kein `ngClass`/`ngStyle`, kein `@HostBinding`/`@HostListener` (stattdessen `host`), `inject()`. Kein `mutate` auf Signals. Keine Arrow-Funktionen im Template. TypeScript strikt, kein `any`.
- Tailwind direkt im HTML. SCSS nur, wo Klassen einer Bibliothek gestylt werden müssen (Task 3).
- **Alle AXE-Prüfungen bestehen, WCAG AA erfüllen.**
- Node-Tests (`*.spec.ts`) ohne Browser-Globals (`File`, `Blob`, `document`, `window`, `TestBed` …). Was sie braucht, gehört in `*.dom.spec.ts` bzw. `*.angular.spec.ts`.
- **`tsc` prüft keine Angular-Vorlagen** – bei Template-Änderungen ist `npm run build` Pflicht.

## File Structure

| Datei                                                                                                        | Änderung                                                   |
| ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| `src/app/shared/components/split-pane/split-pane.component.ts`                                               | Griff-Spalte `1.5rem`                                      |
| `src/app/features/image-optimizer/image-optimizer.component.html`                                            | `lg:ml-4` weg, `(reordered)` binden                        |
| `src/app/features/image-optimizer/components/image-list/image-list.component.{ts,html,scss}`                 | GPS weg, Ziehen per CDK, `draggable="false"`               |
| `src/app/features/image-optimizer/components/image-list/image-list.component.angular.spec.ts`                | GPS-Test weg, Ziehen-Tests                                 |
| `src/app/features/image-optimizer/directives/file-drop.directive.ts` (+ `.angular.spec.ts`)                  | internes Ziehen ignorieren                                 |
| `src/app/features/image-optimizer/components/platform-preview/platform-preview.component.html`               | `draggable="false"`                                        |
| `src/app/features/image-optimizer/services/image-collection.ts` (+ `.dom.spec.ts`)                           | `moveImageTo`                                              |
| `src/app/features/image-optimizer/components/crop-editor/crop-editor.component.html`                         | Leiste unter das Bild                                      |
| `src/app/features/image-optimizer/image-optimizer.component.ts` (+ `.angular.spec.ts`)                       | `reorderImage`, Export ohne Dialog, Fortschritt ohne Phase |
| `src/app/features/image-optimizer/services/directory-export.service.ts` (+ `.dom.spec.ts`)                   | **löschen**                                                |
| `src/app/features/image-optimizer/services/free-folder-name.ts` (+ `.spec.ts`)                               | **löschen**                                                |
| `src/app/features/image-optimizer/components/drop-zone/drop-zone.component.{ts,html}` (+ `.angular.spec.ts`) | deutliche Ablagefläche                                     |

---

### Task 1: Trenner mittig, GPS-Abzeichen an den Kacheln entfernen

**Files:**

- Modify: `src/app/shared/components/split-pane/split-pane.component.ts:60`
- Modify: `src/app/features/image-optimizer/image-optimizer.component.html:100`
- Modify: `src/app/features/image-optimizer/components/image-list/image-list.component.{ts,html}`
- Test: `src/app/features/image-optimizer/components/image-list/image-list.component.angular.spec.ts`

**Interfaces:** keine neuen.

- [ ] **Step 1: Failing test**

In `image-list.component.angular.spec.ts` den bestehenden Test löschen, der das GPS-Abzeichen als `app-badge` festhält (samt der nur dafür nötigen Metadaten-Patches für `BadgeComponent`, falls sie danach unbenutzt sind). Stattdessen, mit den vorhandenen Helfern `image()` und `render()` der Datei:

```ts
it('zeigt an den Kacheln kein GPS-Abzeichen', () => {
  // Der Aufnahmeort wird beim Export ohnehin entfernt; die Warnung am Knopf
  // "Metadaten" im Editor bleibt, an jeder Kachel war sie nur Laerm.
  const withGps: OptimizerImage = {
    ...image('a'),
    metadata: { ...pendingMetadata(), status: 'read', gps: { latitude: 52.1, longitude: 8.6 } },
  };

  const element = render([withGps]);

  expect(element.querySelector('app-badge')).toBeNull();
  expect(element.textContent).not.toContain('GPS');
});
```

- [ ] **Step 2: Test laufen lassen, er muss fehlschlagen**

```bash
cd K:/GitHub/Repos/flipbase/.worktrees/image-optimizer-polish && npx vitest run --project=angular src/app/features/image-optimizer/components/image-list/
```

Erwartet: FAIL – das Abzeichen ist noch da.

- [ ] **Step 3: Umsetzen**

`image-list.component.html` – im `<footer>` den Kommentar „Das GPS-Abzeichen bleibt …“ und den ganzen `@if (image.metadata.gps) { <app-badge …> … </app-badge> }`-Block löschen.

`image-list.component.ts` – `BadgeComponent` aus Import und `imports` entfernen:

```ts
  imports: [LucideDynamicIcon],
```

`split-pane.component.ts:60`:

```ts
    this.isWide() ? `${this.ratio()}% 1.5rem 1fr` : '1fr',
```

`image-optimizer.component.html:100` – an der rechten `<aside>` `lg:ml-4` entfernen:

```html
class="linear-surface min-w-0 rounded-2xl border border-fb-border p-3 shadow-xl"
```

Damit liegen links und rechts des Griff-Strichs je `0.75rem`.

- [ ] **Step 4: Prüfen**

```bash
cd K:/GitHub/Repos/flipbase/.worktrees/image-optimizer-polish && npx vitest run src/app/features/image-optimizer/ src/app/shared/components/split-pane/ && npm run build
```

Erwartet: PASS, Bau erfolgreich.

- [ ] **Step 5: Commit**

```bash
git add -A src/ && git commit -m "fix(image-opt): center the splitter and drop the tile GPS badge" -m "The grip column was 0.75rem while the right pane added its own 1rem margin, so the line sat about 6px from the left box and 22px from the right. A 1.5rem column without the margin puts 0.75rem on either side.

The GPS badge on every tile repeated a warning the metadata button already carries, for data the export strips anyway.

Verified: image-list spec, split-pane spec, feature suite, npm run build."
```

---

### Task 2: Ziehen innerhalb der Seite fügt kein Bild mehr hinzu

**Files:**

- Modify: `src/app/features/image-optimizer/directives/file-drop.directive.ts`
- Modify: `src/app/features/image-optimizer/components/image-list/image-list.component.html` (`<img>`)
- Modify: `src/app/features/image-optimizer/components/platform-preview/platform-preview.component.html` (beide `<img>`)
- Test: `src/app/features/image-optimizer/directives/file-drop.directive.angular.spec.ts`

**Interfaces:**

- Produces: `FileDropDirective.onDragStart(): void`, `FileDropDirective.onDragEnd(): void`

**Ursache:** Chrome bietet ein gezogenes `<img>` aus der Seite als Datei an; `dataTransfer.types` enthält dann `Files`. `carriesFiles()` hält das für einen echten Datei-Drop.

- [ ] **Step 1: Failing tests**

In `file-drop.directive.angular.spec.ts`, mit den vorhandenen Helfern `file()`, `createFileEvent()` und `createDirective()`. Ausgänge so abonnieren, wie die Datei es schon tut.

```ts
describe('Ziehen, das in der Seite beginnt', () => {
  it('haelt es nicht fuer einen Datei-Drop', () => {
    // Chrome bietet ein gezogenes Vorschaubild als Datei an. Ohne diese
    // Sperre erschien "Bilder hier ablegen" und das Bild kam doppelt hinzu.
    const directive = createDirective();
    const active: boolean[] = [];
    const dropped: (readonly File[])[] = [];
    directive.dragActiveChanged.subscribe((value) => active.push(value));
    directive.filesDropped.subscribe((files) => dropped.push(files));

    directive.onDragStart();
    directive.onDragEnter(createFileEvent('dragenter') as DragEvent);
    directive.onDrop(createFileEvent('drop', [file('a.jpg', 'image/jpeg')]) as DragEvent);

    expect(active).not.toContain(true);
    expect(dropped).toEqual([]);
  });

  it('nimmt nach dem Ende des Ziehens wieder echte Dateien an', () => {
    const directive = createDirective();
    const dropped: (readonly File[])[] = [];
    directive.filesDropped.subscribe((files) => dropped.push(files));
    const photo = file('a.jpg', 'image/jpeg');

    directive.onDragStart();
    directive.onDragEnd();
    directive.onDrop(createFileEvent('drop', [photo]) as DragEvent);

    expect(dropped).toEqual([[photo]]);
  });

  it('hebt die Sperre auch nach einem Ablegen wieder auf', () => {
    // Endet das Ziehen mit einem Ablegen, feuert dragend nicht in jedem
    // Browser zuverlaessig. Der naechste echte Datei-Drop darf nicht haengen.
    const directive = createDirective();
    const dropped: (readonly File[])[] = [];
    directive.filesDropped.subscribe((files) => dropped.push(files));
    const photo = file('a.jpg', 'image/jpeg');

    directive.onDragStart();
    directive.onDrop(createFileEvent('drop', [photo]) as DragEvent);
    directive.onDrop(createFileEvent('drop', [photo]) as DragEvent);

    expect(dropped).toEqual([[photo]]);
  });
});
```

- [ ] **Step 2: Fehlschlag sehen**

```bash
cd K:/GitHub/Repos/flipbase/.worktrees/image-optimizer-polish && npx vitest run --project=angular src/app/features/image-optimizer/directives/
```

Erwartet: FAIL – `onDragStart` existiert nicht.

- [ ] **Step 3: Umsetzen**

`file-drop.directive.ts`, im `host`-Objekt ergänzen:

```ts
    '(document:dragstart)': 'onDragStart()',
    '(document:dragend)': 'onDragEnd()',
```

In der Klasse:

```ts
  /**
   * Ein Ziehen, das in der Seite selbst begonnen hat - etwa ein Vorschaubild.
   * Chrome bietet ein gezogenes `<img>` als Datei an, `dataTransfer.types`
   * enthaelt dann `Files`. Ohne diese Marke hielte `carriesFiles()` es fuer
   * einen echten Datei-Drop und das Bild kaeme ein zweites Mal hinzu.
   */
  private internalDrag = false;

  onDragStart(): void {
    this.internalDrag = true;
  }

  onDragEnd(): void {
    this.internalDrag = false;
  }
```

`onDrop` ersetzen:

```ts
  /** Siehe `onDragOver`: Die Abwehr steht auch hier vor jeder Bedingung. */
  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.depth = 0;
    this.dragActiveChanged.emit(false);
    // `dragend` feuert nach einem Ablegen nicht in jedem Browser verlaesslich;
    // die Marke wird deshalb auch hier zurueckgesetzt.
    const internal = this.internalDrag;
    this.internalDrag = false;
    if (this.disabled() || internal) return;

    const files = Array.from(event.dataTransfer?.files ?? []);
    if (files.length > 0) this.filesDropped.emit(files);
  }
```

`carriesFiles` ersetzen:

```ts
  /** Ignoriert Text, Verweise und alles, was in der Seite selbst gezogen wird. */
  private carriesFiles(event: DragEvent): boolean {
    if (this.internalDrag) return false;
    return Array.from(event.dataTransfer?.types ?? []).includes('Files');
  }
```

Zusätzlich an den Vorschaubildern `draggable="false"`, damit der Browser sie gar nicht erst als Datei anbietet:

- `image-list.component.html`: `<img [src]="image.dataUrl" alt="" draggable="false" class="h-full w-full object-contain" />`
- `platform-preview.component.html`: an beiden `<img` das Attribut `draggable="false"` ergänzen.

- [ ] **Step 4: Prüfen**

```bash
cd K:/GitHub/Repos/flipbase/.worktrees/image-optimizer-polish && npx vitest run src/app/features/image-optimizer/ && npm run build
```

Erwartet: PASS, Bau erfolgreich.

- [ ] **Step 5: Commit**

```bash
git add -A src/ && git commit -m "fix(image-opt): stop in-page drags from adding an image twice" -m "Chrome offers a dragged <img> as a file, so dragging a thumbnail within the page put 'Files' into the drag types. The page-wide drop handler took that for an upload, showed its drop overlay and added the same image again on release.

Two independent guards: thumbnails are no longer natively draggable, and the handler marks any drag that starts inside the page and ignores it until dragend or drop. The existing defence against a real file drop navigating away is untouched.

Verified: file-drop spec including the new in-page cases, feature suite, npm run build."
```

---

### Task 3: Umsortieren per Ziehen

**Files:**

- Modify: `package.json`, `package-lock.json` (`@angular/cdk`)
- Modify: `src/app/features/image-optimizer/services/image-collection.ts`
- Test: `src/app/features/image-optimizer/services/image-collection.dom.spec.ts`
- Modify: `src/app/features/image-optimizer/components/image-list/image-list.component.{ts,html}`
- Create: `src/app/features/image-optimizer/components/image-list/image-list.component.scss`
- Test: `src/app/features/image-optimizer/components/image-list/image-list.component.angular.spec.ts`
- Modify: `src/app/features/image-optimizer/image-optimizer.component.{ts,html}`
- Test: `src/app/features/image-optimizer/image-optimizer.component.angular.spec.ts`

**Interfaces:**

- Produces:
  - `moveImageTo(list: readonly OptimizerImage[], fromIndex: number, toIndex: number): readonly OptimizerImage[]`
  - `ImageListComponent.reordered = output<{ readonly fromIndex: number; readonly toIndex: number }>()`
  - `ImageListComponent.onDropped(event: CdkDragDrop<unknown>): void`
  - `ImageOptimizerComponent.reorderImage(fromIndex: number, toIndex: number): void`

- [ ] **Step 1: Abhängigkeit**

```bash
cd K:/GitHub/Repos/flipbase/.worktrees/image-optimizer-polish && npm install @angular/cdk@^22.0.0
```

Erwartet: `package.json` und `package-lock.json` geändert, Exitcode 0.

- [ ] **Step 2: Failing tests für `moveImageTo`**

In `image-collection.dom.spec.ts`. Hat die Datei schon eine Fabrik für `OptimizerImage`, diese benutzen; sonst:

```ts
function sample(id: string): OptimizerImage {
  return {
    id,
    file: new File([''], `${id}.jpg`, { type: 'image/jpeg' }),
    dataUrl: `blob:${id}`,
    crops: {},
    rotation: 0,
    loadError: null,
    naturalSize: null,
    reviewed: false,
    adjustments: defaultAdjustments(),
    metadata: pendingMetadata(),
  };
}

function ids(list: readonly OptimizerImage[]): string[] {
  return list.map((image) => image.id);
}

describe('Bild an eine neue Position ziehen', () => {
  const list = [sample('a'), sample('b'), sample('c'), sample('d')];

  it('zieht ein Bild nach vorn', () => {
    expect(ids(moveImageTo(list, 3, 1))).toEqual(['a', 'd', 'b', 'c']);
  });

  it('zieht ein Bild nach hinten', () => {
    expect(ids(moveImageTo(list, 0, 2))).toEqual(['b', 'c', 'a', 'd']);
  });

  it('macht ein Bild auf Position 0 zum Hauptbild', () => {
    expect(ids(moveImageTo(list, 2, 0))).toEqual(['c', 'a', 'b', 'd']);
  });

  it('laesst die Liste bei gleicher Position unveraendert', () => {
    expect(moveImageTo(list, 1, 1)).toBe(list);
  });

  it('laesst die Liste bei ungueltigen Positionen unveraendert', () => {
    expect(moveImageTo(list, -1, 2)).toBe(list);
    expect(moveImageTo(list, 1, 4)).toBe(list);
  });
});
```

```bash
cd K:/GitHub/Repos/flipbase/.worktrees/image-optimizer-polish && npx vitest run --project=dom src/app/features/image-optimizer/services/image-collection.dom.spec.ts
```

Erwartet: FAIL – `moveImageTo` fehlt.

- [ ] **Step 3: `moveImageTo`**

In `image-collection.ts` direkt unter `moveImage`:

```ts
/**
 * Verschiebt ein Bild an eine beliebige Position - fuer das Umsortieren per
 * Ziehen. Position 0 ist das Hauptbild. Ungueltige oder gleiche Positionen
 * lassen die Liste unveraendert, damit ein Loslassen am Ausgangsort keine
 * neue Liste und damit keine unnoetige Neuberechnung ausloest.
 */
export function moveImageTo(
  list: readonly OptimizerImage[],
  fromIndex: number,
  toIndex: number,
): readonly OptimizerImage[] {
  if (fromIndex === toIndex) return list;
  if (fromIndex < 0 || fromIndex >= list.length) return list;
  if (toIndex < 0 || toIndex >= list.length) return list;

  const next = [...list];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}
```

Test erneut laufen lassen: PASS.

- [ ] **Step 4: Failing tests für Kachel und Seite**

`image-list.component.angular.spec.ts`:

```ts
describe('Umsortieren per Ziehen', () => {
  it('meldet die neue Position, wenn ein Bild abgelegt wird', () => {
    TestBed.resetTestingModule();
    const fixture = TestBed.configureTestingModule({
      imports: [ImageListComponent],
    }).createComponent(ImageListComponent);
    const emitted: { fromIndex: number; toIndex: number }[] = [];
    fixture.componentInstance.reordered.subscribe((value) => emitted.push(value));

    fixture.componentInstance.onDropped({
      previousIndex: 2,
      currentIndex: 0,
    } as CdkDragDrop<unknown>);

    expect(emitted).toEqual([{ fromIndex: 2, toIndex: 0 }]);
  });

  it('meldet nichts, wenn das Bild an seinem Platz landet', () => {
    TestBed.resetTestingModule();
    const fixture = TestBed.configureTestingModule({
      imports: [ImageListComponent],
    }).createComponent(ImageListComponent);
    const emitted: unknown[] = [];
    fixture.componentInstance.reordered.subscribe((value) => emitted.push(value));

    fixture.componentInstance.onDropped({
      previousIndex: 1,
      currentIndex: 1,
    } as CdkDragDrop<unknown>);

    expect(emitted).toEqual([]);
  });
});
```

Import `CdkDragDrop` aus `@angular/cdk/drag-drop`. Braucht die Datei für `createComponent` die Eingänge als Signale untergeschoben (wie ihr bestehender `render()`-Helfer), diesen Weg benutzen.

`image-optimizer.component.angular.spec.ts`, mit den modulweiten Helfern `createComponent()` und `jpegFile()`:

```ts
describe('ImageOptimizerComponent – Umsortieren per Ziehen', () => {
  beforeAll(() => TestBed.resetTestingModule());

  it('verschiebt ein Bild an die abgelegte Position', () => {
    const component = createComponent();
    component.addFiles([jpegFile('a.jpg'), jpegFile('b.jpg'), jpegFile('c.jpg')]);
    const [a, b, c] = component.images().map((image) => image.id);

    component.reorderImage(2, 0);

    expect(component.images().map((image) => image.id)).toEqual([c, a, b]);
  });

  it('laesst die Reihenfolge waehrend eines Exports in Ruhe', () => {
    const component = createComponent();
    component.addFiles([jpegFile('a.jpg'), jpegFile('b.jpg')]);
    const before = component.images().map((image) => image.id);
    component.isBusy.set(true);

    component.reorderImage(1, 0);

    expect(component.images().map((image) => image.id)).toEqual(before);
  });
});
```

```bash
cd K:/GitHub/Repos/flipbase/.worktrees/image-optimizer-polish && npx vitest run --project=angular src/app/features/image-optimizer/components/image-list/ src/app/features/image-optimizer/image-optimizer.component.angular.spec.ts
```

Erwartet: FAIL – `onDropped` und `reorderImage` fehlen.

- [ ] **Step 5: Kachelraster ziehbar machen**

`image-list.component.ts`:

```ts
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { CdkDrag, CdkDragDrop, CdkDragPlaceholder, CdkDropList } from '@angular/cdk/drag-drop';
import {
  LucideDynamicIcon,
  LucideX as X,
  LucideArrowUp as ArrowUp,
  LucideArrowDown as ArrowDown,
} from '@lucide/angular';
import { OptimizerImage } from '../../models/optimizer-image';

/**
 * Die Bilderliste als Raster. Das erste Bild ist das Hauptbild - bei eBay das
 * Bild im Suchergebnis, bei Vinted das im Raster. Umsortiert wird per Ziehen;
 * die Pfeile in der Werkzeugleiste der Kachel bleiben als Weg ohne Ziehen fuer
 * Tastatur und Screenreader (WCAG 2.2, 2.5.7).
 */
@Component({
  selector: 'app-image-list',
  imports: [LucideDynamicIcon, CdkDropList, CdkDrag, CdkDragPlaceholder],
  templateUrl: './image-list.component.html',
  styleUrl: './image-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ImageListComponent {
  readonly images = input.required<OptimizerImage[]>();
  readonly activeId = input<string | null>(null);
  readonly disabled = input(false);
  readonly reviewedCount = input(0);

  readonly selected = output<string>();
  readonly removed = output<string>();
  readonly moved = output<{ id: string; direction: -1 | 1 }>();
  readonly reordered = output<{ readonly fromIndex: number; readonly toIndex: number }>();
  readonly clearAllRequested = output<void>();
  readonly reviewToggled = output<string>();

  readonly closeIcon = X;
  readonly moveUpIcon = ArrowUp;
  readonly moveDownIcon = ArrowDown;

  /** Ein Loslassen am Ausgangsort ist keine Umsortierung. */
  onDropped(event: CdkDragDrop<unknown>): void {
    if (event.previousIndex === event.currentIndex) return;
    this.reordered.emit({ fromIndex: event.previousIndex, toIndex: event.currentIndex });
  }
}
```

`image-list.component.html` – der Rasterbehälter bekommt die Ablageliste:

```html
<div
  data-testid="image-grid"
  cdkDropList
  cdkDropListOrientation="mixed"
  [cdkDropListDisabled]="disabled()"
  (cdkDropListDropped)="onDropped($event)"
  class="grid max-h-[calc(100vh-18rem)] grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-3 overflow-y-auto pb-2 pr-1"
></div>
```

Jede `<article>` bekommt `cdkDrag cdkDragPreviewContainer="parent"` (die übrigen Attribute bleiben), und als erstes Kind den Platzhalter:

```html
<article
  cdkDrag
  cdkDragPreviewContainer="parent"
  class="group relative overflow-hidden rounded-xl border bg-fb-surface transition"
  …bestehende
  [class.…]-Bindungen
  unveraendert…
>
  <ng-template cdkDragPlaceholder>
    <!-- Zeigt waehrend des Ziehens, wo das Bild landen wird. -->
    <div
      class="aspect-[4/3] rounded-xl border-2 border-dashed border-indigo-400 bg-indigo-500/10"
    ></div>
  </ng-template>
</article>
```

`image-list.component.scss` (neu):

```scss
// Diese Klassen setzt das Angular CDK waehrend eines Ziehvorgangs. Sie
// lassen sich nicht als Tailwind-Klassen ins Template schreiben - deshalb
// diese eine Stildatei.
.cdk-drag-preview {
  border-radius: 0.75rem;
  box-shadow: 0 12px 32px rgb(0 0 0 / 35%);
}

.cdk-drag-animating,
.cdk-drop-list-dragging .cdk-drag:not(.cdk-drag-placeholder) {
  transition: transform 200ms cubic-bezier(0, 0, 0.2, 1);
}

@media (prefers-reduced-motion: reduce) {
  .cdk-drag-animating,
  .cdk-drop-list-dragging .cdk-drag:not(.cdk-drag-placeholder) {
    transition: none;
  }
}
```

- [ ] **Step 6: In der Seite anschließen**

`image-optimizer.component.ts` – Import ergänzen:

```ts
  moveImage as moveImageIn,
  moveImageTo,
```

Methode unter `moveImage`:

```ts
  /** Verschiebt ein Bild per Ziehen an eine neue Position. Position 0 ist das Hauptbild. */
  reorderImage(fromIndex: number, toIndex: number): void {
    if (this.isBusy()) return;
    this.images.set([...moveImageTo(this.images(), fromIndex, toIndex)]);
  }
```

`image-optimizer.component.html`, an `<app-image-list>`:

```html
(moved)="moveImage($event.id, $event.direction)" (reordered)="reorderImage($event.fromIndex,
$event.toIndex)"
```

- [ ] **Step 7: Prüfen**

```bash
cd K:/GitHub/Repos/flipbase/.worktrees/image-optimizer-polish && npx vitest run src/app/features/image-optimizer/ && npm run typecheck && npm run build
```

Erwartet: PASS, Bau erfolgreich. Den Chunk `image-optimizer-component` aus der Bauausgabe notieren (vorher 98,17 kB roh).

- [ ] **Step 8: Commit**

```bash
git add -A package.json package-lock.json src/ && git commit -m "feat(image-opt): reorder images by dragging" -m "Arrow buttons are a slow way to put the main image first. Tiles are now draggable like the seller knows from Kleinanzeigen, with a dashed placeholder showing where the image lands.

The Angular CDK does the dragging: it works with mouse and touch, which matters for a PWA used on phones, and it does not use native HTML5 drag and drop - the mechanism that caused in-page drags to be taken for file uploads. It lands only in the lazily loaded optimizer chunk.

The arrows stay in the tile's tool overlay. Without a way to reorder that does not need dragging the page would fail WCAG 2.2 AA 2.5.7.

Verified: moveImageTo dom spec, image-list and optimizer specs, typecheck, npm run build."
```

---

### Task 4: Steuerleiste unter das Bild

**Files:**

- Modify: `src/app/features/image-optimizer/components/crop-editor/crop-editor.component.html`

**Interfaces:** keine neuen. Die Vorlagenreferenzen `#colorPanel` und `#colorToggleButton` bleiben, die Fokusführung in `crop-editor.component.ts` hängt daran.

Rein Layout; jsdom rechnet kein Layout. Keine Klassennamen-Tests schreiben. Die bestehenden Tests (Panel, Fokus, Zoom) müssen grün bleiben.

- [ ] **Step 1: Umbauen**

Die äußere Karte wird eine Spalte. Oben die Bildfläche, darunter der Leistenbereich im normalen Fluss:

```html
<div class="flex h-[62vh] min-h-96 flex-col overflow-hidden rounded-2xl bg-[#090b12] shadow-inner">
  <div class="relative flex min-h-0 flex-1 items-center justify-center p-3">
    <image-cropper …alle bisherigen Eingaenge, Stil und Ausgaenge unveraendert…></image-cropper>
  </div>

  <!--
    Die Leiste steht im normalen Fluss unter der Bildflaeche, damit der
    Ausschnitt nie dahinter liegt. Das Panel haengt mit `bottom-full` direkt
    ueber der Leiste und reicht in die Bildflaeche hinein - egal, ob die
    Leiste gerade ein- oder zweizeilig ist. DOM-Reihenfolge Leiste vor Panel,
    damit Tab von "Farbe" direkt ins Panel fuehrt.
  -->
  <div class="relative z-20 px-3 pb-3">
    <!--
      Deckender Grund: Produktfotos sind hier meist hell, und bei Transparenz
      waere kein Kontrastverhaeltnis zusicherbar. WCAG AA verlangt 4,5:1 fuer
      Text und 3:1 fuer Bedienelemente.
    -->
    <div class="flex flex-wrap items-center gap-1.5 rounded-xl bg-[#12141c] px-2 py-1.5 shadow-lg">
      …alle Knoepfe der Leiste unveraendert, einschliesslich des Kommentars zur Reihenfolge
      "Metadaten" vor "Farbe"…
    </div>

    @if (isPanelOpen()) {
    <!--
        `max-h` in vh: Die Karte ist auf 62vh begrenzt, 45vh lassen oberhalb
        des Panels immer einen Streifen der Bildflaeche frei.
      -->
    <div
      #colorPanel
      class="absolute inset-x-3 bottom-full mb-2 max-h-[45vh] overflow-y-auto rounded-xl border border-fb-border bg-fb-surface/95 p-3 shadow-2xl backdrop-blur"
      role="group"
      aria-label="Farbe und Belichtung"
    >
      <app-adjustment-controls …Bindungen unveraendert…></app-adjustment-controls>
    </div>
    }
  </div>
</div>
```

Entfällt: der bisherige Kommentar zur `flex-col-reverse`-Hülle und die Hülle `absolute inset-x-3 bottom-3 z-20 flex flex-col-reverse gap-2` selbst.

- [ ] **Step 2: Prüfen**

```bash
cd K:/GitHub/Repos/flipbase/.worktrees/image-optimizer-polish && npx vitest run --project=angular src/app/features/image-optimizer/components/crop-editor/ && npx vitest run src/app/features/image-optimizer/ && npm run build
```

Erwartet: PASS, Bau erfolgreich.

- [ ] **Step 3: Commit**

```bash
git add -A src/ && git commit -m "fix(image-opt): place the control bar below the image" -m "The bar was laid over the image area, so the lower edge of the crop frame and its handles ran behind it - with a portrait photo on Vinted the frame's bottom edge could not be grabbed.

The card is now a column: image area on top, bar below in normal flow. The colour panel hangs from the bar with bottom-full, so it always sits directly above the bar and over the image, whatever the bar's height. The card keeps its height; the image area gives up the bar's height instead of the page growing.

Verified: crop-editor spec (panel and focus behaviour unchanged), feature suite, npm run build. Layout itself needs a browser check."
```

---

### Task 5: Export ohne Ordner-Dialog

**Files:**

- Delete: `src/app/features/image-optimizer/services/directory-export.service.ts`, `directory-export.dom.spec.ts`
- Delete: `src/app/features/image-optimizer/services/free-folder-name.ts`, `free-folder-name.spec.ts`
- Modify: `src/app/features/image-optimizer/image-optimizer.component.ts`
- Test: `src/app/features/image-optimizer/image-optimizer.component.angular.spec.ts`

**Interfaces:**

- Consumes: `ZipEntry` und `ZipExportService` aus `services/zip-export.service.ts` (vorhanden).
- Produces: `reportExportProgress(done: number | null, total: number | null): void` – **ohne** `phase`. `exportProgress` ist `signal<{ done: number; total: number } | null>`.

- [ ] **Step 1: Tests anpassen und ergänzen**

In `image-optimizer.component.angular.spec.ts`:

1. Den ganzen Block `describe('Ordnerweg', …)` löschen.
2. Im Block `Aktionsmeldungen` den Kommentar entfernen, der erklärt, dass `canWriteDirectory()` unter jsdom `false` liefert.
3. Tests in `ImageOptimizerComponent – Exportfortschritt`, die eine Phase übergeben oder „wird gespeichert“ erwarten, auf die neue Form umstellen (`reportExportProgress(3, 12)`, Titel enthält „wird erstellt“).
4. Tests, die für einen Export mit genau **einer** Datei ein ZIP erwarten, auf den neuen Weg umstellen und das im Commit nennen.
5. Neu, im Harness des Blocks `Aktionsmeldungen` (er stubbt `zipExport` und `download`). Bild und Plattform so aufsetzen, wie der Block es für den Aufnahmedatum-Test bereits tut:

```ts
it('laedt eine einzelne Datei direkt herunter, ohne ZIP', async () => {
  // Ein Bild fuer eine Plattform ist genau eine Datei - dafuer braucht es
  // keine Huelle, sie landet als JPEG direkt im Download-Ordner.
  const { component, download, zipPack } = createComponentWithStubs(/* ein Bild, eine Plattform */);

  await component.exportImages();

  expect(zipPack).not.toHaveBeenCalled();
  expect(download).toHaveBeenCalledTimes(1);
  const [, fileName] = download.mock.calls[0] as [Blob, string];
  expect(fileName).toMatch(/-01\.jpg$/);
});

it('packt mehrere Dateien in ein ZIP', async () => {
  const { component, download, zipPack } =
    createComponentWithStubs(/* zwei Bilder, eine Plattform */);

  await component.exportImages();

  expect(zipPack).toHaveBeenCalledTimes(1);
  const [, archiveFileName] = download.mock.calls[0] as [Blob, string];
  expect(archiveFileName).toMatch(/\.zip$/);
});
```

Der Helfer `createComponentWithStubs` gibt heute `component`, `toast` und `download` zurück. Er wird so erweitert, dass er Bilder und Plattformen annehmen kann und auch den `zipExport.pack`-Stub als `zipPack` zurückgibt. Wie der bestehende Aufnahmedatum-Test Bilder und `imageExport` stubbt, so hier.

- [ ] **Step 2: Fehlschlag sehen**

```bash
cd K:/GitHub/Repos/flipbase/.worktrees/image-optimizer-polish && npx vitest run --project=angular src/app/features/image-optimizer/image-optimizer.component.angular.spec.ts
```

Erwartet: FAIL – die Einzeldatei landet noch im ZIP.

- [ ] **Step 3: Umsetzen**

In `image-optimizer.component.ts`:

- Den Import aus `./services/directory-export.service` (`canWriteDirectory`, `DirectoryExportService`, `ExportEntry`) entfernen. `ZipEntry` zum vorhandenen Import aus `./services/zip-export.service` hinzufügen.
- `private readonly directoryExport = inject(DirectoryExportService);` entfernen.
- `exportProgress`:

```ts
  /** Wie viele Dateien erstellt sind, waehrend ein Export laeuft. */
  readonly exportProgress = signal<{ done: number; total: number } | null>(null);
```

- `reportExportProgress`:

```ts
  /** Meldet den Fortschritt; `null` beendet die Anzeige wieder. */
  reportExportProgress(done: number | null, total: number | null): void {
    this.exportProgress.set(done === null || total === null ? null : { done, total });
  }
```

- In `exportStatus()` der Fortschrittsfall:

```ts
const progress = this.exportProgress();
if (progress) {
  // Gezaehlt werden Dateien, nicht Bilder: Ein Bild fuer drei Plattformen
  // sind drei Dateien.
  return {
    kind: 'progress',
    title: `Datei ${progress.done} von ${progress.total} wird erstellt`,
    detail: null,
  };
}
```

- In `exportImages()`: `const entries: ZipEntry[] = [];`, die beiden `reportExportProgress(…, 'render')`-Aufrufe ohne drittes Argument, und der Block nach der Schleife:

```ts
if (entries.length === 1) {
  // Eine einzige Datei braucht keine Huelle: Sie landet als JPEG direkt
  // im Download-Ordner.
  this.download(entries[0].data, entries[0].file);
  this.toast.success('Bild wurde heruntergeladen.');
} else {
  const archive = await this.zipExport.pack(entries);
  this.download(archive, archiveName(name));
  this.toast.success('Bilder wurden exportiert.');
}
```

Dann die vier Dateien löschen:

```bash
cd K:/GitHub/Repos/flipbase/.worktrees/image-optimizer-polish && git rm src/app/features/image-optimizer/services/directory-export.service.ts src/app/features/image-optimizer/services/directory-export.dom.spec.ts src/app/features/image-optimizer/services/free-folder-name.ts src/app/features/image-optimizer/services/free-folder-name.spec.ts
```

Danach `src/` nach `directory-export`, `free-folder-name`, `canWriteDirectory`, `DirectoryExportService`, `ExportEntry` und `showDirectoryPicker` durchsuchen. Es darf nichts übrig bleiben.

- [ ] **Step 4: Prüfen**

```bash
cd K:/GitHub/Repos/flipbase/.worktrees/image-optimizer-polish && npx vitest run src/app/features/image-optimizer/ && npm run typecheck && npm run build && npm run test:audit
```

Erwartet: PASS, Bau erfolgreich, Suite-Audit ohne Befund (gelöschte Dateien dürfen in keiner Liste mehr stehen).

- [ ] **Step 5: Commit**

```bash
git add -A src/ && git commit -m "feat(image-opt): download exports without a folder dialog" -m "Writing into a folder needs the directory picker, and a dialog on every export is exactly the friction the seller wanted gone. A browser cannot download a folder, so without the picker only two honest options remain: one file downloads directly as a JPEG, anything more becomes a ZIP with platform folders as it was before.

The directory export service and the free-folder-name search are removed with their tests - nothing can reach them any more. Overwriting is no longer a risk either: on a download the browser appends its own counter.

Kept: the capture date written into each file, the file naming, render progress. Progress now has only the render phase.

Verified: optimizer spec including single-file and multi-file cases, feature suite, typecheck, npm run build, test:audit."
```

---

### Task 6: Deutlichere Ablagefläche

**Files:**

- Modify: `src/app/features/image-optimizer/components/drop-zone/drop-zone.component.{ts,html}`
- Test: `src/app/features/image-optimizer/components/drop-zone/drop-zone.component.angular.spec.ts` (neu oder erweitern)

**Interfaces:**

- Produces: `DropZoneComponent.zoneClasses: Signal<string>`, `DropZoneComponent.iconClasses: Signal<string>`, `DropZoneComponent.uploadIcon`

**Ursache:** `.linear-surface` setzt seinen Hintergrund in normalem CSS (`src/styles.css`) und schlägt damit die Tailwind-Klasse `bg-indigo-500/10` – der Farbton beim Hineinziehen erschien nie.

Die Zustandsklassen stehen als ganze Ketten in einem `computed`: Ketten wie `motion-safe:scale-[1.01]` lassen sich nicht als `[class.…]`-Bindung schreiben, und Tailwind findet sie so im Quelltext – derselbe Weg wie in `two-column-layout` und `modal-shell`.

- [ ] **Step 1: Failing test**

`drop-zone.component.angular.spec.ts`. Eingänge wie in den übrigen Bauteiltests des Projekts als Signal unterschieben:

```ts
import '@angular/compiler';
import { beforeAll, describe, expect, it } from 'vitest';
import { ɵresolveComponentResources, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { readFile } from 'node:fs/promises';
import { DropZoneComponent } from './drop-zone.component';

beforeAll(async () => {
  await ɵresolveComponentResources((url) => readFile(new URL(url, import.meta.url), 'utf8'));
});

function render(isDragActive: boolean): HTMLElement {
  TestBed.resetTestingModule();
  const fixture = TestBed.configureTestingModule({
    imports: [DropZoneComponent],
  }).createComponent(DropZoneComponent);
  Object.assign(fixture.componentInstance, {
    isDragActive: signal(isDragActive),
    hasImages: signal(false),
  });
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('Ablageflaeche', () => {
  it('traegt kein linear-surface mehr', () => {
    // Rueckfallsicherung fuer die Ursache: dessen Hintergrund in normalem CSS
    // schlaegt jede Tailwind-Hintergrundklasse, der Ablagezustand blieb
    // unsichtbar.
    expect(render(false).querySelector('label')?.classList.contains('linear-surface')).toBe(false);
  });

  it('faerbt die Flaeche beim Hineinziehen deutlich ein', () => {
    const label = render(true).querySelector('label');

    expect(label?.className).toContain('bg-indigo-500/15');
    expect(label?.textContent).toContain('Jetzt loslassen');
  });

  it('zeigt schon im Ruhezustand ein Symbol', () => {
    expect(render(false).querySelector('label svg')).not.toBeNull();
  });
});
```

```bash
cd K:/GitHub/Repos/flipbase/.worktrees/image-optimizer-polish && npx vitest run --project=angular src/app/features/image-optimizer/components/drop-zone/
```

Erwartet: FAIL.

- [ ] **Step 2: Umsetzen**

`drop-zone.component.ts`:

```ts
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { LucideDynamicIcon, LucideImagePlus as ImagePlus } from '@lucide/angular';

/**
 * Zwei Zustaende in einer Komponente: die dauerhafte Flaeche, solange noch
 * kein Bild geladen ist, und die Ueberlagerung waehrend eines Ziehvorgangs.
 */
@Component({
  selector: 'app-drop-zone',
  imports: [LucideDynamicIcon],
  templateUrl: './drop-zone.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DropZoneComponent {
  readonly isDragActive = input(false);
  readonly hasImages = input(false);
  readonly disabled = input(false);

  readonly filesPicked = output<readonly File[]>();

  readonly uploadIcon = ImagePlus;

  /**
   * Hintergrund, Rand und Ring je Zustand als ganze Klassenkette. Bewusst ohne
   * `linear-surface`: dessen Hintergrund steht in normalem CSS und schlug
   * jeden Tailwind-Hintergrund - der Ablagezustand war dadurch unsichtbar.
   */
  readonly zoneClasses = computed(() =>
    this.isDragActive()
      ? 'border-indigo-500 bg-indigo-500/15 ring-4 ring-indigo-400/30 motion-safe:scale-[1.01]'
      : 'border-fb-border bg-fb-surface hover:border-indigo-500/40',
  );

  readonly iconClasses = computed(() =>
    this.isDragActive() ? 'text-indigo-500' : 'text-fb-text-muted',
  );

  onFileInput(target: EventTarget | null): void {
    const input = target as HTMLInputElement | null;
    const files = Array.from(input?.files ?? []);
    if (files.length > 0) this.filesPicked.emit(files);
    if (input) input.value = '';
  }
}
```

`drop-zone.component.html`:

```html
@if (!hasImages()) {
<label
  class="block cursor-pointer rounded-2xl border-2 border-dashed p-12 text-center shadow-xl transition focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-400/50 motion-reduce:transition-none"
  [class]="zoneClasses()"
>
  <input
    type="file"
    accept="image/*"
    multiple
    [disabled]="disabled()"
    class="sr-only"
    (change)="onFileInput($event.target)"
  />
  <svg
    [lucideIcon]="uploadIcon"
    class="mx-auto mb-3 h-10 w-10 transition-colors"
    [class]="iconClasses()"
    aria-hidden="true"
  ></svg>
  <span class="block text-base font-bold text-fb-text-primary">
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
    class="rounded-2xl border-2 border-dashed border-indigo-500 bg-fb-surface px-12 py-10 text-center shadow-2xl ring-4 ring-indigo-400/30"
  >
    <svg [lucideIcon]="uploadIcon" class="mx-auto mb-3 h-10 w-10 text-indigo-500"></svg>
    <span class="block text-base font-bold text-fb-text-primary">Bilder hier ablegen</span>
    <span class="mt-1 block text-xs text-fb-text-muted">Sie werden der Liste hinzugefügt</span>
  </div>
</div>
}
```

Hinweis: Angular führt ein statisches `class="…"` und eine `[class]`-Bindung zusammen; die festen Klassen bleiben erhalten.

- [ ] **Step 3: Prüfen**

```bash
cd K:/GitHub/Repos/flipbase/.worktrees/image-optimizer-polish && npx vitest run --project=angular src/app/features/image-optimizer/components/drop-zone/ && npx vitest run src/app/features/image-optimizer/ && npm run build
```

Erwartet: PASS, Bau erfolgreich. In der gebauten CSS nachsehen, dass `bg-indigo-500\/15` und `scale-\[1\.01\]` erzeugt wurden:

```bash
grep -l "bg-indigo-500\\\\/15" dist/*/browser/*.css dist/**/*.css 2>/dev/null | head -1
```

- [ ] **Step 4: Commit**

```bash
git add -A src/ && git commit -m "fix(image-opt): make the drop zone unmistakable while dragging" -m "Dragging files onto the empty optimizer only changed a line of text. The tint meant to show the drop state never rendered: .linear-surface sets its background in plain CSS, which beats the Tailwind background utility.

The drop zone no longer carries linear-surface. It sets its own surface, and while dragging it switches to a strong dashed indigo border, a clear tint, a ring and a slight scale that is dropped under reduced motion. An upload icon shows the purpose even before anything is dragged. The full-page overlay used once images are loaded gets the same look.

Verified: new drop-zone spec, feature suite, npm run build, generated CSS contains the state classes."
```

---

### Task 7: Abschluss (Controller)

- [ ] `npm run verify > log 2>&1; echo $?` – Exitcode 0, ohne Pipe gemessen.
- [ ] Mit aktuellem `origin/master` zusammenführen, Konflikte (erwartbar nur `docs/AI-CHANGELOG.md`) mit beiden Seiten auflösen, Bau erneut prüfen.
- [ ] Changelog-Eintrag über das ganze Paket oben in `docs/AI-CHANGELOG.md`, mit den echten Messwerten.
- [ ] Nach AGENTS.md fragen: „Soll ich jetzt den PR erstellen und nach erfolgreichen Tests mergen?“

## Nicht in diesem Plan

- Drehen schließt das Farb-Panel.
- Tastenkürzel zum Umsortieren – die Pfeile decken Tastatur und WCAG 2.5.7 ab.
