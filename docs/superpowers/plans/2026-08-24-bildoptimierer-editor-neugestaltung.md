# Bildoptimierer Editor Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Den bestehenden Bildoptimierer zu einem klaren, hochwertigen Flipbase-Editor umbauen, dessen Vorschau exakt dem Export entspricht und der niemals hochskaliert.

**Architecture:** `ngx-image-cropper` bleibt hinter `ZuschnittEditorComponent` gekapselt. Eine reine Renderplanung berechnet Quell- und Zielmaße; derselbe Canvas-Renderer erzeugt Vorschau und Export, während die Seite nur Zustand und Blob-Lebenszyklen koordiniert.

**Tech Stack:** Angular 22, Signals, Tailwind CSS 4, ngx-image-cropper 9.1.6, Canvas API, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-24-bildoptimierer-editor-neugestaltung.md`

## Global Constraints

- Oberflächentexte und Kommentare sind deutsch.
- Angular-Komponenten bleiben Standalone, OnPush und verwenden Signal-APIs.
- Styling steht als Tailwind-Klassen im Template; Cropper-interne Farben werden ausschließlich über seine CSS-Variablen gesetzt.
- Vorschau und Export dürfen keine getrennte Geometrie implementieren.
- Ein Export darf die Quellpixel niemals hochskalieren.
- Symbolschaltflächen besitzen ein `aria-label`; Auswahl ist nicht nur farblich erkennbar.
- Jede Verhaltensänderung beginnt mit einem nachweislich fehlschlagenden Test.

---

### Task 1: Gemeinsame Renderplanung ohne Hochskalierung

**Files:**

- Create: `src/app/features/image-optimizer/services/bild-renderer.ts`
- Create: `src/app/features/image-optimizer/services/bild-renderer.spec.ts`
- Modify: `src/app/features/image-optimizer/services/bild-export.service.ts`
- Modify: `src/app/features/image-optimizer/services/bild-export.spec.ts`

**Interfaces:**

- Produces: `planeAusgabe(ausschnitt: Rechteck, profil: PlattformProfil): RenderPlan`
- Produces: `rendereBild(bild: CanvasImageSource, plan: RenderPlan, qualitaet?: number): Promise<Blob>`
- `RenderPlan` enthält `quelle`, `breite` und `hoehe`.

- [ ] **Step 1: Write failing dimension tests**

```ts
expect(planeAusgabe({ x: 0, y: 0, breite: 800, hoehe: 800 }, profil('ebay'))).toMatchObject({
  breite: 800,
  hoehe: 800,
});
expect(
  planeAusgabe({ x: 0, y: 0, breite: 2400, hoehe: 1800 }, profil('kleinanzeigen')),
).toMatchObject({ breite: 1600, hoehe: 1200 });
```

- [ ] **Step 2: Run `npm run test -- bild-renderer` and confirm missing module failure.**
- [ ] **Step 3: Implement `planeAusgabe` with `Math.min(1, maxWidth/sourceWidth, maxHeight/sourceHeight)` and rounded positive dimensions.**
- [ ] **Step 4: Run the focused test and confirm it passes.**
- [ ] **Step 5: Add a failing export-service test that expects the canvas to receive the planned dimensions instead of fixed profile dimensions.**
- [ ] **Step 6: Make `BildExportService.erzeuge` consume `planeAusgabe` and `rendereBild`, then run `npm run test -- bild-export bild-renderer`.**

### Task 2: Echte Vorschau aus demselben Renderer

**Files:**

- Modify: `src/app/features/image-optimizer/components/plattform-vorschau/plattform-vorschau.component.ts`
- Modify: `src/app/features/image-optimizer/components/plattform-vorschau/plattform-vorschau.component.html`
- Modify: `src/app/features/image-optimizer/components/plattform-vorschau/plattform-vorschau.component.spec.ts`

**Interfaces:**

- Consumes: `planeAusgabe` und `rendereBild` aus Task 1.
- Produces: `vorschauUrl: Signal<string | null>` und `ausgabeGroesse`.

- [ ] **Step 1: Replace the existing CSS-position expectations with a failing test for a render plan whose source rectangle is moved to the right.**
- [ ] **Step 2: Run `npm run test -- plattform-vorschau` and confirm failure because the component still exposes percentage positioning.**
- [ ] **Step 3: Load the source image, create the preview Blob from the shared renderer, revoke stale object URLs, and expose the real output size.**
- [ ] **Step 4: Render only the generated URL with `object-cover`; remove all percentage width/left/top bindings.**
- [ ] **Step 5: Run `npm run test -- plattform-vorschau bild-renderer` and confirm all focused tests pass.**

### Task 3: Pintura-inspirierte Cropper-Bedienung

**Files:**

- Modify: `src/app/features/image-optimizer/components/zuschnitt-editor/zuschnitt-editor.component.ts`
- Modify: `src/app/features/image-optimizer/components/zuschnitt-editor/zuschnitt-editor.component.html`
- Create: `src/app/features/image-optimizer/components/zuschnitt-editor/zuschnitt-editor.component.spec.ts`

**Interfaces:**

- Produces: Zoomsignal zwischen `1` und `3`, `zentriere()`, `zuruecksetzen()` und `ImageTransform` für `ngx-image-cropper`.

- [ ] **Step 1: Write failing tests for clamped zoom values and resetting zoom to `1`.**
- [ ] **Step 2: Run `npm run test -- zuschnitt-editor` and confirm the missing control behavior.**
- [ ] **Step 3: Bind `[allowMoveImage]="true"`, two-way `transform`, `onlyScaleDown`, blob output and Flipbase cropper CSS variables.**
- [ ] **Step 4: Add accessible rotate, zoom, center and reset controls below the canvas.**
- [ ] **Step 5: Run `npm run test -- zuschnitt-editor` and `npm run typecheck`.**

### Task 4: Bilderleiste und einheitlicher Arbeitsbereich

**Files:**

- Modify: `src/app/features/image-optimizer/image-optimizer.component.html`
- Modify: `src/app/features/image-optimizer/components/bild-liste/bild-liste.component.html`
- Modify: `src/app/features/image-optimizer/components/plattform-vorschau/plattform-vorschau.component.html`
- Modify: `src/app/features/image-optimizer/image-optimizer.component.ts`

**Interfaces:**

- Consumes: Ausgabegröße aus Task 2.
- Produces: breites `lg:grid-cols-[minmax(0,1fr)_16rem]`-Layout und gleich hohe Plattformkarten.

- [ ] **Step 1: Move upload and platform selection into a compact header and widen the image column to 16rem.**
- [ ] **Step 2: Turn each thumbnail into a full-width card with an inner active border, metadata row, ordinary delete button and non-overlapping reorder buttons.**
- [ ] **Step 3: Use a three-column responsive preview grid whose outer cards share one structure and show actual dimensions.**
- [ ] **Step 4: Replace enlargement warnings with concise actual-output quality information.**
- [ ] **Step 5: Run `npm run test`, `npm run lint`, `npm run typecheck`, and `npm run format:check`.**

### Task 5: Browserprüfung und Abschluss

**Files:**

- Modify as required only when a browser observation has a failing regression test first.

- [ ] **Step 1: Start the app and load a wide test image.**
- [ ] **Step 2: Move the eBay, Kleinanzeigen and Vinted crops to the right edge and confirm every preview remains filled.**
- [ ] **Step 3: Verify zoom, move, rotate, center, reset, image switching, deletion, ordering and responsive layout with keyboard and pointer.**
- [ ] **Step 4: Export a small and a large crop; inspect dimensions and confirm the small crop was not enlarged.**
- [ ] **Step 5: Run fresh full `test`, `lint`, `typecheck`, `format:check`, and `build` commands.**
