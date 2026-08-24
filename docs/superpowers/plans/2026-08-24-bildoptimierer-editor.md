# Bildoptimierer: Zuschnitt je Plattform – Umsetzungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Der Zuschnittrahmen nimmt das Format der Plattform an, für die gerade zugeschnitten wird — was im Rahmen liegt, ist die Exportdatei. Dazu ein kompakter Editor, die Bildliste rechts daneben, und die Safe-Area verschwindet.

**Architecture:** Der Zuschnitt gehört ab jetzt zu Bild **und** Plattform. Die Zustandsübergänge (erster Zuschnitt füllt die übrigen ab, Übernehmen überschreibt sie) liegen in reinen Funktionen mit Tests; die Komponenten rufen sie nur auf.

**Tech Stack:** Angular 22 (Standalone, Signals, OnPush), Tailwind, `ngx-image-cropper`, vitest.

**Spec:** `docs/superpowers/specs/2026-08-24-bildoptimierer-editor-design.md`

## Global Constraints

- **Commits:** Conventional Commits, Titel und Text auf **Englisch**, Titel im Imperativ, Text erklärt das Warum. **Kein leerer Text.**
- **Keine Claude-Signatur im Commit.** Kein `Co-Authored-By`, keine andere Form von Werkzeug-Hinweis.
- **Oberflächentexte und Code-Kommentare auf Deutsch.**
- Angular: Standalone ohne `standalone: true`, `ChangeDetectionStrategy.OnPush`, `inject()`, `input()`/`output()`-Funktionen, Signals, **niemals Inline-Templates**.
- Styling ausschliesslich über Tailwind im Template. Keine neuen `.scss`-Dateien.
- **Nicht** `@HostListener`/`@HostBinding` — stattdessen das `host`-Objekt im Decorator.
- Tests mit `npm run test` (vitest, jsdom). Kein `TestBed`; reine Funktionen direkt testen.
- WCAG AA: Symbolknöpfe brauchen `aria-label`, ausgewählte Zustände dürfen nicht nur farblich erkennbar sein, deaktivierte Knöpfe tragen ein echtes `disabled`.
- Nach jeder Aufgabe `npm run test`, `npm run lint`, `npm run typecheck`, `npm run format:check` grün.
- **Kein Zuschnitt wird beim Drehen behalten** — nach einer Drehung zeigt kein gespeichertes Rechteck mehr auf dieselbe Stelle.

---

### Task 1: Zuschnitte je Plattform als reine Zustandsübergänge

**Files:**

- Create: `src/app/features/image-optimizer/services/zuschnitte.ts`
- Test: `src/app/features/image-optimizer/services/zuschnitte.spec.ts`

**Interfaces:**

- Consumes: `Rechteck`, `ProfilId`, `PlattformProfil`, `profil(id)` aus `models/plattform-profile.ts`; `leiteAb(ausschnitt, verhaeltnis)` aus `services/zuschnitt.ts`.
- Produces:
  - `type Zuschnitte = Partial<Record<ProfilId, Rechteck>>`
  - `setzeZuschnitt(vorher, plattform, rechteck, gewaehlt): Zuschnitte`
  - `uebernimmAufAlle(vorher, quelle, gewaehlt): Zuschnitte`

- [ ] **Step 1: Write the failing test**

Datei `src/app/features/image-optimizer/services/zuschnitte.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { setzeZuschnitt, uebernimmAufAlle, Zuschnitte } from './zuschnitte';
import { Rechteck, profil } from '../models/plattform-profile';

const alle = [profil('ebay'), profil('kleinanzeigen'), profil('vinted')];
const quer: Rechteck = { x: 0, y: 0, breite: 1500, hoehe: 1000 };

describe('Zuschnitt einer Plattform setzen', () => {
  it('legt den Zuschnitt genau dieser Plattform ab', () => {
    const nachher = setzeZuschnitt({}, 'ebay', quer, alle);
    expect(nachher.ebay).toEqual(quer);
  });

  it('fuellt leere Plattformen aus dem neuen Zuschnitt ab', () => {
    // Ein Bild soll nach einer einzigen Geste fuer alle Plattformen fertig
    // sein - sonst muss man dreimal dasselbe tun.
    const nachher = setzeZuschnitt({}, 'ebay', quer, alle);

    expect(nachher.vinted).toBeDefined();
    expect(nachher.vinted!.breite / nachher.vinted!.hoehe).toBeCloseTo(2 / 3, 5);
    expect(nachher.kleinanzeigen!.breite / nachher.kleinanzeigen!.hoehe).toBeCloseTo(4 / 3, 5);
  });

  it('laesst bereits angepasste Plattformen unangetastet', () => {
    const eigener: Rechteck = { x: 10, y: 20, breite: 300, hoehe: 450 };
    const vorher: Zuschnitte = { vinted: eigener };

    const nachher = setzeZuschnitt(vorher, 'ebay', quer, alle);

    expect(nachher.vinted).toEqual(eigener);
  });

  it('fuellt nur gewaehlte Plattformen ab', () => {
    const nachher = setzeZuschnitt({}, 'ebay', quer, [profil('ebay'), profil('vinted')]);

    expect(nachher.kleinanzeigen).toBeUndefined();
    expect(nachher.vinted).toBeDefined();
  });
});

describe('Auf die anderen Plattformen uebernehmen', () => {
  it('ueberschreibt auch bereits angepasste Zuschnitte', () => {
    // Bewusst: Der Knopf heisst so, und ein halbherziges Uebernehmen waere
    // schwerer zu verstehen als ein vollstaendiges.
    const eigener: Rechteck = { x: 10, y: 20, breite: 300, hoehe: 450 };
    const vorher: Zuschnitte = { ebay: quer, vinted: eigener };

    const nachher = uebernimmAufAlle(vorher, 'ebay', alle);

    expect(nachher.vinted).not.toEqual(eigener);
    expect(nachher.vinted!.breite / nachher.vinted!.hoehe).toBeCloseTo(2 / 3, 5);
  });

  it('laesst die Quelle selbst unveraendert', () => {
    const nachher = uebernimmAufAlle({ ebay: quer }, 'ebay', alle);
    expect(nachher.ebay).toEqual(quer);
  });

  it('tut nichts, wenn die Quelle keinen Zuschnitt hat', () => {
    const vorher: Zuschnitte = { vinted: quer };
    expect(uebernimmAufAlle(vorher, 'ebay', alle)).toEqual(vorher);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- zuschnitte`
Expected: FAIL mit „Failed to resolve import ./zuschnitte".

- [ ] **Step 3: Write the implementation**

Datei `src/app/features/image-optimizer/services/zuschnitte.ts`:

```ts
import { PlattformProfil, ProfilId, Rechteck } from '../models/plattform-profile';
import { leiteAb } from './zuschnitt';

/** Je Plattform ein Zuschnitt. Fehlt einer, gilt beim Export das ganze Bild. */
export type Zuschnitte = Partial<Record<ProfilId, Rechteck>>;

/**
 * Legt den Zuschnitt einer Plattform ab und fuellt die uebrigen **leeren**
 * gewaehlten Plattformen daraus ab.
 *
 * Das Abfuellen ist der Ersatz fuer das frueher einzige Modell "einmal
 * zuschneiden, Formate ableiten": Ein Bild ist nach einer Geste fuer alle
 * Plattformen fertig, ohne dass die Ableitung noch der einzige Weg waere.
 * Bereits angepasste Zuschnitte bleiben unangetastet - wer sie ueberschreiben
 * will, drueckt den Knopf dafuer.
 */
export function setzeZuschnitt(
  vorher: Zuschnitte,
  plattform: ProfilId,
  rechteck: Rechteck,
  gewaehlt: readonly PlattformProfil[],
): Zuschnitte {
  const nachher: Zuschnitte = { ...vorher, [plattform]: rechteck };

  for (const p of gewaehlt) {
    if (p.id === plattform) continue;
    if (nachher[p.id]) continue;
    nachher[p.id] = leiteAb(rechteck, p.exportVerhaeltnis);
  }

  return nachher;
}

/**
 * Uebertraegt den Zuschnitt einer Plattform auf alle anderen gewaehlten -
 * auch auf solche, die schon einen eigenen hatten.
 */
export function uebernimmAufAlle(
  vorher: Zuschnitte,
  quelle: ProfilId,
  gewaehlt: readonly PlattformProfil[],
): Zuschnitte {
  const rechteck = vorher[quelle];
  if (!rechteck) return vorher;

  const nachher: Zuschnitte = { ...vorher };
  for (const p of gewaehlt) {
    if (p.id === quelle) continue;
    nachher[p.id] = leiteAb(rechteck, p.exportVerhaeltnis);
  }

  return nachher;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- zuschnitte`
Expected: PASS, 7 Tests.

- [ ] **Step 5: Commit**

```bash
git add src/app/features/image-optimizer/services/zuschnitte.ts src/app/features/image-optimizer/services/zuschnitte.spec.ts
git commit -m "feat(image-optimizer): keep one crop per platform"
```

---

### Task 2: Die Seite auf Zuschnitte je Plattform umstellen

**Files:**

- Modify: `src/app/features/image-optimizer/image-optimizer.component.ts`
- Modify: `src/app/features/image-optimizer/image-optimizer.component.html`

**Interfaces:**

- Consumes: `Zuschnitte`, `setzeZuschnitt`, `uebernimmAufAlle` aus Task 1.
- Produces:
  - `OptimiererBild.ausschnitte: Zuschnitte` **statt** `ausschnitt: Rechteck | null`
  - `aktivePlattform: Signal<ProfilId | null>`
  - `aktiverAusschnitt: Signal<Rechteck | null>` — der Zuschnitt des aktiven Bildes für die aktive Plattform
  - `merkeAusschnitt(id, rechteck)`, `uebernehmen(id)`, `waehleArbeitsziel(id)`

- [ ] **Step 1: Change the state shape**

In `image-optimizer.component.ts`:

```ts
  /** Zuschnitt je Plattform, in Originalpixeln. Leer, solange nichts gesetzt wurde. */
  readonly ausschnitte: Zuschnitte;
```

ersetzt das bisherige Feld `ausschnitt`. Beim Anlegen eines Bildes (`nimmDateien`) steht dort `ausschnitte: {}`.

- [ ] **Step 2: Add the active platform**

```ts
  /**
   * Die Plattform, fuer die gerade zugeschnitten wird. Der Rahmen im Editor
   * hat ihr Format - was darin liegt, ist die Exportdatei.
   */
  readonly aktivePlattformId = signal<ProfilId | null>('ebay');

  /** Faellt auf die erste gewaehlte Plattform zurueck, wenn die aktive abgewaehlt wurde. */
  readonly aktivePlattform = computed<PlattformProfil | null>(() => {
    const gewaehlt = this.gewaehlteProfile();
    if (gewaehlt.length === 0) return null;

    const aktiv = gewaehlt.find((p) => p.id === this.aktivePlattformId());
    return aktiv ?? gewaehlt[0];
  });

  /** Der Zuschnitt des aktiven Bildes fuer die aktive Plattform. */
  readonly aktiverAusschnitt = computed<Rechteck | null>(() => {
    const bild = this.aktivesBild();
    const plattform = this.aktivePlattform();
    if (!bild || !plattform) return null;
    return bild.ausschnitte[plattform.id] ?? null;
  });

  waehleArbeitsziel(id: ProfilId): void {
    this.aktivePlattformId.set(id);
  }
```

- [ ] **Step 3: Route the crop through the pure functions**

```ts
  merkeAusschnitt(id: string, rechteck: Rechteck): void {
    const plattform = this.aktivePlattform();
    if (!plattform) return;

    this.bilder.update((liste) =>
      liste.map((b) =>
        b.id === id
          ? {
              ...b,
              ausschnitte: setzeZuschnitt(b.ausschnitte, plattform.id, rechteck, this.gewaehlteProfile()),
            }
          : b,
      ),
    );
  }

  /** Der Knopf "auf die anderen Plattformen uebernehmen". */
  uebernehmen(id: string): void {
    const plattform = this.aktivePlattform();
    if (!plattform) return;

    this.bilder.update((liste) =>
      liste.map((b) =>
        b.id === id
          ? { ...b, ausschnitte: uebernimmAufAlle(b.ausschnitte, plattform.id, this.gewaehlteProfile()) }
          : b,
      ),
    );
  }
```

- [ ] **Step 4: Adjust rotation, export and warnings**

Beim Drehen werden **alle** Zuschnitte dieses Bildes verworfen — in `drehe(id)` steht künftig `ausschnitte: {}` statt `ausschnitt: null`.

Im Export und in den Warnungen wird der Zuschnitt je Plattform gelesen:

```ts
        for (const p of this.gewaehlteProfile()) {
          const ausschnitt = bild.ausschnitte[p.id] ?? vollesBild;
```

wobei `vollesBild` wie bisher aus den gespeicherten natürlichen Maßen gebildet wird. Dasselbe in `warnungen`: je Plattform deren Zuschnitt, ersatzweise das ganze Bild.

- [ ] **Step 5: Fill a newly selected platform**

Wird eine Plattform **nachtraeglich** dazugewaehlt, hat sie fuer bereits
zugeschnittene Bilder noch nichts. Ohne Nachfuellen wuerde fuer sie stumm das
ganze Bild exportiert, obwohl der Nutzer laengst zugeschnitten hat.

In `schaltePlattform(id)` deshalb beim **Hinzufuegen** aus dem Zuschnitt der
aktiven Plattform ableiten — hat auch die keinen, bleibt es leer:

```ts
  schaltePlattform(id: ProfilId): void {
    const wirdGewaehlt = !this.gewaehlteIds().includes(id);

    this.gewaehlteIds.update((ids) =>
      ids.includes(id) ? ids.filter((v) => v !== id) : [...ids, id],
    );

    if (!wirdGewaehlt) return;

    // Neu dazugewaehlt: aus dem Zuschnitt der aktiven Plattform ableiten,
    // damit bereits zugeschnittene Bilder nicht stumm im Vollbild exportiert
    // werden.
    const quelle = this.aktivePlattform();
    if (!quelle) return;

    const gewaehlt = this.gewaehlteProfile();
    this.bilder.update((liste) =>
      liste.map((b) => {
        const rechteck = b.ausschnitte[quelle.id];
        if (!rechteck) return b;
        return { ...b, ausschnitte: setzeZuschnitt(b.ausschnitte, quelle.id, rechteck, gewaehlt) };
      }),
    );
  }
```

- [ ] **Step 6: Wire the platform row's second role**

Die Plattformknöpfe im Template bekommen einen zweiten Zustand. Ein Klick auf eine **bereits gewählte** Plattform macht sie zum Arbeitsziel; ein Klick auf eine nicht gewählte wählt sie zusätzlich aus **und** macht sie zum Arbeitsziel. Ein zweiter Knopf je Plattform zum Abwählen wäre verwirrend — deshalb ein kleines Kreuz an der aktiven Plattform, wenn mehr als eine gewählt ist.

Das Arbeitsziel ist zusätzlich zur Farbe durch ein Wort erkennbar:

```html
@if (aktivePlattform()?.id === p.id) {
<span class="text-[10px] font-normal opacity-80">· wird bearbeitet</span>
}
```

- [ ] **Step 7: Verify in the browser**

```bash
npm start
```

1. Zwei Bilder laden, eBay als Arbeitsziel, Bild 1 zuschneiden.
2. Auf Vinted wechseln: Der Rahmen zeigt einen **abgeleiteten** hochkanten Ausschnitt, nicht das ganze Bild.
3. Diesen anpassen, zurück auf eBay: Der eBay-Zuschnitt steht unverändert.
4. „Auf die anderen Plattformen übernehmen": Der Vinted-Zuschnitt wird durch die Ableitung ersetzt.
5. Drehen: Alle Zuschnitte dieses Bildes sind verworfen, der Rahmen umfasst wieder das ganze Bild.

- [ ] **Step 8: Run checks and commit**

Run: `npm run test && npm run lint && npm run typecheck`

```bash
git add src/app/features/image-optimizer/
git commit -m "feat(image-optimizer): choose the platform you are cropping for"
```

---

### Task 3: Editor auf festes Format und kompaktes Fenster

**Files:**

- Modify: `src/app/features/image-optimizer/components/zuschnitt-editor/zuschnitt-editor.component.ts`
- Modify: `src/app/features/image-optimizer/components/zuschnitt-editor/zuschnitt-editor.component.html`
- Modify: `src/app/features/image-optimizer/services/zuschnitt.ts` (entfernen)
- Modify: `src/app/features/image-optimizer/services/zuschnitt.spec.ts` (entfernen)

**Interfaces:**

- Consumes: `aktivePlattform`, `aktiverAusschnitt` aus Task 2.
- Produces: der Editor nimmt `verhaeltnis = input.required<number>()` statt `profile`, und `gespeicherterAusschnitt = input<Rechteck | null>(null)` bleibt.

- [ ] **Step 1: Lock the frame to the platform ratio**

In `zuschnitt-editor.component.html`:

```html
<image-cropper
  [imageURL]="datenUrl()"
  [maintainAspectRatio]="true"
  [aspectRatio]="verhaeltnis()"
  [format]="'jpeg'"
  [cropper]="cropperEingabe()"
  [resizeToWidth]="32"
  (imageCropped)="beiZuschnitt($event)"
  (imageLoaded)="beiBildGeladen($event)"
  (cropperReady)="beiCropperBereit($event)"
  (loadImageFailed)="ladenFehlgeschlagen.emit()"
></image-cropper>
```

`[maintainAspectRatio]` auf `true` und `[aspectRatio]` an das Verhältnis der
aktiven Plattform gebunden. Der Eingabewert `verhaeltnis` ersetzt `profile`;
in der Komponente also `readonly verhaeltnis = input.required<number>();`
statt `profile`.

Und in `image-optimizer.component.html` entsprechend verdrahten:

```html
<app-zuschnitt-editor
  [datenUrl]="bild.datenUrl"
  [verhaeltnis]="aktivePlattform()!.exportVerhaeltnis"
  [gespeicherterAusschnitt]="aktiverAusschnitt()"
  (ausschnittGeaendert)="merkeAusschnitt(bild.id, $event)"
  (drehen)="drehe(bild.id)"
  (ladenFehlgeschlagen)="beiLadeFehler(bild.id)"
  (bildGeladen)="beiBildGeladen(bild.id)"
></app-zuschnitt-editor>
```

Der Editorblock steht dabei in einem `@if (aktivePlattform())`, damit das
`!` gedeckt ist — ohne gewählte Plattform gibt es nichts zuzuschneiden.

- [ ] **Step 2: Give the editor a calm, fixed height**

Das umschliessende Element bekommt eine feste Höhe, damit das Bild nicht mehr den ganzen Bereich füllt:

```html
<div class="relative h-[420px] max-h-[60vh] flex items-center justify-center overflow-hidden"></div>
```

`ngx-image-cropper` passt sich seinem Container an; damit steht das Bild in einem ruhigen Fenster statt in Originalgrösse.

- [ ] **Step 3: Remove the safe area**

Aus dem Template verschwinden das gestrichelte Overlay und die Erklärzeile darunter. Aus der Komponente verschwinden:

- der Import von `safeArea`,
- `sichererBereichRahmen` und alles, was nur dafür da war: `rahmenRect()`, `versatz()`, `rahmenVersion`, der `host`-Eintrag `'(window:resize)'` und `beiFenstergroesse()`,
  `angezeigteGroesse` **bleibt**: Es wird von `cropperEingabe` gebraucht, um den
  gespeicherten Zuschnitt beim Bildwechsel wiederherzustellen, nicht nur vom
  Overlay.

- [ ] **Step 4: Delete the now unused pure functions**

In `src/app/features/image-optimizer/services/zuschnitt.ts` entfallen `safeArea()` und `schnittmenge()` samt ihrer Kommentare. `leiteAb`, `reichtAufloesung` und `vergroesserungsfaktor` bleiben.

In `zuschnitt.spec.ts` entfallen die beiden `describe`-Blöcke „Schnittmenge" und „Safe-Area". Alle übrigen Tests bleiben unverändert.

- [ ] **Step 5: Run tests**

Run: `npm run test -- zuschnitt`
Expected: PASS. Die Tests zu `leiteAb`, den Qualitätsprüfungen und „Alle Profile zusammen" laufen weiter; die entfernten erscheinen nicht mehr.

Run: `npm run typecheck`
Expected: keine Ausgabe. Schlägt es fehl, ist noch ein Aufrufer von `safeArea` übrig — den mit entfernen, nicht die Funktion zurückholen.

- [ ] **Step 6: Verify in the browser**

```bash
npm start
```

1. Bild laden: Der Editor steht in einem Fenster fester Höhe, das Bild ist eingepasst.
2. Der Rahmen lässt sich **nicht** in ein anderes Seitenverhältnis ziehen — bei eBay bleibt er quadratisch.
3. Plattform wechseln: Der Rahmen ändert sein Format sofort.
4. Es ist keine gestrichelte Linie mehr zu sehen.

- [ ] **Step 7: Run checks and commit**

Run: `npm run test && npm run lint && npm run typecheck`

```bash
git add src/app/features/image-optimizer/
git commit -m "feat(image-optimizer): lock the crop frame to the platform format"
```

---

### Task 4: Bildliste rechts und der Vorschaufehler

**Files:**

- Modify: `src/app/features/image-optimizer/image-optimizer.component.html`
- Modify: `src/app/features/image-optimizer/components/bild-liste/bild-liste.component.html`
- Modify: `src/app/features/image-optimizer/components/plattform-vorschau/plattform-vorschau.component.ts`

**Interfaces:**

- Consumes: alles aus den Tasks 2 und 3.
- Produces: nichts für spätere Aufgaben.

- [ ] **Step 1: Put the film strip beside the editor**

In `image-optimizer.component.html` werden Editor und Bildliste zu einem Raster zusammengefasst, statt untereinander zu stehen:

```html
<div class="grid grid-cols-1 lg:grid-cols-[1fr_11rem] gap-4">
  <div class="linear-surface rounded-2xl p-5 shadow-xl border border-fb-border">
    <!-- Plattformreihe und Editor wie gehabt -->
  </div>

  <div class="linear-surface rounded-2xl p-3 shadow-xl border border-fb-border">
    <app-bild-liste …></app-bild-liste>
  </div>
</div>
```

Auf schmalen Bildschirmen (`lg:` greift nicht) steht die Liste weiterhin darunter — das ist gewollt.

- [ ] **Step 2: Make the film strip vertical when it sits beside the editor**

In `bild-liste.component.html` wird aus der waagerechten Leiste eine senkrechte Spalte, sobald Platz ist:

```html
<div
  class="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-x-visible lg:overflow-y-auto lg:max-h-[420px]"
></div>
```

Die Höhe entspricht der des Editorfensters, damit beide Spalten gleich hoch abschliessen.

- [ ] **Step 3: Fix the stale preview size**

In `plattform-vorschau.component.ts` wird die gemerkte Bildgrösse zurückgesetzt, sobald ein anderes Bild kommt:

```ts
  constructor() {
    // Die natuerliche Groesse gehoert zu genau einem datenUrl. Ohne dieses
    // Zuruecksetzen rechnet die Kachel nach einem Bildwechsel - und nach einer
    // Drehung, bei der Breite und Hoehe tauschen - mit den Maßen des vorherigen
    // Fotos weiter und zeigt verschobene, angeschnittene Bereiche.
    effect(() => {
      this.datenUrl();
      this.bildgroesse.set(null);
    });
  }
```

`effect` und `untracked` werden aus `@angular/core` importiert; der Effect liest ausschliesslich `datenUrl()`.

- [ ] **Step 4: Point the preview at the platform's own crop**

Die Vorschau bekommt nicht mehr den einen Zuschnitt, sondern den der jeweiligen Plattform:

```html
<app-plattform-vorschau
  [plattform]="p"
  [datenUrl]="bild.datenUrl"
  [ausschnitt]="bild.ausschnitte[p.id] ?? null"
></app-plattform-vorschau>
```

Damit zeigt jede Kachel exakt das, was für diese Plattform exportiert wird — die Ableitung in der Vorschau entfällt, weil der Zuschnitt schon im richtigen Format vorliegt. `leiteAb` in der Vorschau bleibt trotzdem stehen: Ist für eine Plattform noch nichts gesetzt und greift die volle Bildgrösse, muss weiterhin abgeleitet werden.

- [ ] **Step 5: Verify in the browser**

```bash
npm start
```

1. Vier Bilder laden: Die Liste steht rechts neben dem Editor und ist senkrecht.
2. Durchklicken: Der Editor wechselt, die Auswahl ist erkennbar.
3. **Der Vorschaufehler:** Bild 1 zuschneiden, auf Bild 2 wechseln, zurück — die Vorschaukacheln zeigen zu keinem Zeitpunkt verschobene oder angeschnittene Bereiche.
4. Ein Bild drehen und sofort die Kacheln ansehen: ebenfalls sauber.
5. Fenster schmal ziehen: Die Liste rutscht unter den Editor.

- [ ] **Step 6: Run checks and commit**

Run: `npm run test && npm run lint && npm run typecheck && npm run build`

```bash
git add src/app/features/image-optimizer/
git commit -m "feat(image-optimizer): move the film strip beside the editor"
```

---

## Reihenfolge und Abhängigkeiten

```
Task 1 (Zuschnitte je Plattform, rein)
   └─> Task 2 (Seite: Zustand, aktive Plattform)
          └─> Task 3 (Editor: festes Format, kompakt, Safe-Area raus)
                 └─> Task 4 (Layout und Vorschaufehler)
```

Nach Task 3 ist der Umbau funktional; Task 4 macht ihn benutzbar und behebt den gemeldeten Vorschaufehler.

## Was dieser Plan bewusst nicht enthält

- „Auf alle Bilder anwenden" — sinnvoll, sobald mehrere Fotos unter gleichen
  Bedingungen entstehen, aber nicht nötig für den Zweck.
- Rückgängig-Funktion.
- Eine Warnung, wenn ein abgeleiteter Zuschnitt das Produkt anschneidet: Ohne
  Objekterkennung nicht seriös feststellbar; die Vorschaukacheln zeigen es.
