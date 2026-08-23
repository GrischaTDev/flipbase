# Bildoptimierer – Umsetzungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein Werkzeug unter „Werkzeuge & Ertrag", das Produktfotos entgegennimmt, je Bild **einen** Zuschnitt festlegen lässt und daraus die Formate von eBay, Kleinanzeigen und Vinted erzeugt – mit einer Vorschau, die die Trefferliste der Plattform nachbaut.

**Architecture:** Die Rechenlogik liegt in reinen Funktionen ohne DOM (`zuschnitt.ts`) und ist vollständig testbar. Die Plattformwerte stehen als Daten in `plattform-profile.ts`. Komponenten enthalten keine Rechenlogik. Alles läuft im Browser, kein Supabase.

**Tech Stack:** Angular 22 (Standalone, Signals, OnPush), Tailwind, `ngx-image-cropper` (vorhanden), `browser-image-compression` (vorhanden), `jszip` (neu), vitest.

**Spec:** `docs/superpowers/specs/2026-08-23-bildoptimierer-design.md`

## Global Constraints

- **Commits:** Conventional Commits, Titel und Text auf **Englisch**, Titel im Imperativ. Der Text erklärt das Warum.
- **Keine Claude-Signatur im Commit.** Kein `Co-Authored-By`, keine andere Form von Werkzeug-Hinweis.
- **Oberflächentexte und Code-Kommentare auf Deutsch.**
- Angular: Standalone ohne `standalone: true`, `changeDetection: ChangeDetectionStrategy.OnPush`, `inject()`, Signals, **niemals Inline-Templates**.
- Styling ausschliesslich über Tailwind-Klassen im Template. Keine neuen `.scss`-Dateien.
- Tests mit `npm run test` (vitest, jsdom). Kein `TestBed` im Projekt; reine Funktionen werden direkt getestet, Dienste über `Injector.create` + `runInInjectionContext` (Vorbild: `src/app/core/services/landing-hint.service.spec.ts`).
- Jede Testdatei beginnt mit `import '@angular/compiler';`, wenn sie Angular-Code importiert.
- Nach jeder Aufgabe `npm run test`, `npm run lint`, `npm run typecheck` grün, `npm run format:check` sauber.
- **Gemessene Plattformwerte** (23.08.2026, Schreibtisch-Ansicht, 1280 px Fensterbreite): eBay Kachel 289 × 289 `contain` (schneidet nicht), Kleinanzeigen 200 × 150 `cover` (schneidet), Vinted 216 × 325 `cover` (schneidet). Diese Zahlen sind die Grundlage aller Profile.
- **Schneiden, nie auffüllen.** eBay verbietet hinzugefügte Ränder.
- Die Vorschau baut die Trefferlisten **ohne fremde Logos, Schriften oder Farbwelten** nach.

---

### Task 1: Plattformprofile

**Files:**

- Create: `src/app/features/image-optimizer/models/plattform-profile.ts`
- Test: `src/app/features/image-optimizer/models/plattform-profile.spec.ts`

**Interfaces:**

- Consumes: nichts.
- Produces:
  - `type Rechteck = { x: number; y: number; breite: number; hoehe: number }`
  - `type ProfilId = 'ebay' | 'kleinanzeigen' | 'vinted'`
  - `interface PlattformProfil` (Felder siehe Step 3)
  - `const PLATTFORM_PROFILE: readonly PlattformProfil[]`
  - `function profil(id: ProfilId): PlattformProfil`

- [ ] **Step 1: Write the failing test**

Datei `src/app/features/image-optimizer/models/plattform-profile.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { PLATTFORM_PROFILE, profil } from './plattform-profile';

/**
 * Die Werte stammen aus einer Messung an den echten Trefferlisten
 * (23.08.2026). Dieser Test haelt sie fest: Wer sie aendert, soll es
 * bewusst tun und nicht beilaeufig.
 */
describe('Plattformprofile', () => {
  it('kennt genau die drei Plattformen', () => {
    expect(PLATTFORM_PROFILE.map((p) => p.id)).toEqual(['ebay', 'kleinanzeigen', 'vinted']);
  });

  it('eBay ist quadratisch und schneidet nicht', () => {
    const p = profil('ebay');
    expect(p.exportVerhaeltnis).toBe(1);
    expect(p.exportBreite).toBe(1600);
    expect(p.exportHoehe).toBe(1600);
    expect(p.schneidet).toBe(false);
    expect(p.herkunft).toBe('offiziell');
  });

  it('Kleinanzeigen ist quer und schneidet', () => {
    const p = profil('kleinanzeigen');
    expect(p.exportVerhaeltnis).toBeCloseTo(4 / 3, 5);
    expect(p.schneidet).toBe(true);
    expect(p.herkunft).toBe('gemessen');
  });

  it('Vinted ist hochkant und schneidet', () => {
    const p = profil('vinted');
    expect(p.exportVerhaeltnis).toBeCloseTo(2 / 3, 5);
    expect(p.schneidet).toBe(true);
    expect(p.herkunft).toBe('gemessen');
  });

  it('das Kachelverhaeltnis entspricht dem Exportverhaeltnis', () => {
    // Wer im Werkzeug das Format erzeugt, das die Liste ohnehin herstellt,
    // sieht dort spaeter genau sein Bild.
    for (const p of PLATTFORM_PROFILE) {
      expect(p.kachelVerhaeltnis).toBeCloseTo(p.exportVerhaeltnis, 5);
    }
  });

  it('gemessene Werte tragen ein Messdatum, offizielle nicht', () => {
    for (const p of PLATTFORM_PROFILE) {
      if (p.herkunft === 'gemessen') {
        expect(p.gemessenAm).toBe('2026-08-23');
      } else {
        expect(p.gemessenAm).toBeUndefined();
      }
    }
  });

  it('nur Vinted kennt keine Dateigroessengrenze', () => {
    expect(profil('ebay').maxDateigroesseMB).toBe(12);
    expect(profil('kleinanzeigen').maxDateigroesseMB).toBe(12);
    expect(profil('vinted').maxDateigroesseMB).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- plattform-profile`
Expected: FAIL mit „Failed to resolve import ./plattform-profile".

- [ ] **Step 3: Write the implementation**

Datei `src/app/features/image-optimizer/models/plattform-profile.ts`:

```ts
/** Ein Rechteck in Pixeln des Originalbildes. */
export interface Rechteck {
  readonly x: number;
  readonly y: number;
  readonly breite: number;
  readonly hoehe: number;
}

export type ProfilId = 'ebay' | 'kleinanzeigen' | 'vinted';

/**
 * Beschreibt, was eine Verkaufsplattform mit einem Foto macht.
 *
 * `herkunft` sagt, worauf die Zahlen beruhen: "offiziell" steht in der Hilfe
 * der Plattform, "gemessen" wurde an der echten Trefferliste ausgelesen.
 * Diese Unterscheidung ist wichtiger als sie aussieht - sie verhindert, dass
 * jemand spaeter eine geraten wirkende Zahl fuer eine Zusage haelt.
 */
export interface PlattformProfil {
  readonly id: ProfilId;
  readonly name: string;
  /** Breite geteilt durch Hoehe. */
  readonly exportVerhaeltnis: number;
  readonly exportBreite: number;
  readonly exportHoehe: number;
  /** Grenze der Plattform in MB, oder null wenn keine bekannt ist. */
  readonly maxDateigroesseMB: number | null;
  /** Verhaeltnis der Kachel in der Trefferliste. */
  readonly kachelVerhaeltnis: number;
  /**
   * Ob die Trefferliste das Bild beschneidet (`cover`) oder einpasst
   * (`contain`). Nur schneidende Plattformen begrenzen die Safe-Area.
   */
  readonly schneidet: boolean;
  /** Wie die Vorschau aussieht: Zeile mit Bild links, oder Kachel im Raster. */
  readonly vorschauArt: 'zeile' | 'kachel';
  readonly herkunft: 'offiziell' | 'gemessen';
  /** Nur bei gemessenen Werten gesetzt. */
  readonly gemessenAm?: string;
}

/**
 * Gemessen am 23.08.2026 an den echten Trefferlisten, Schreibtisch-Ansicht
 * bei 1280 px Fensterbreite:
 *
 *   eBay          289 x 289  contain  -> schneidet nicht
 *   Kleinanzeigen 200 x 150  cover    -> schneidet, 4:3 quer
 *   Vinted        216 x 325  cover    -> schneidet, 2:3 hochkant
 *
 * Die Mobil-Apps wurden nicht gemessen und koennen abweichen.
 */
export const PLATTFORM_PROFILE: readonly PlattformProfil[] = [
  {
    id: 'ebay',
    name: 'eBay',
    exportVerhaeltnis: 1,
    exportBreite: 1600,
    exportHoehe: 1600,
    maxDateigroesseMB: 12,
    kachelVerhaeltnis: 1,
    // eBay passt das Bild in die quadratische Kachel ein, statt zu schneiden.
    // Das Quadrat sorgt nur dafuer, dass die Kachel gefuellt wird und das
    // Produkt neben quadratischen Konkurrenzbildern nicht schrumpft.
    schneidet: false,
    vorschauArt: 'kachel',
    herkunft: 'offiziell',
  },
  {
    id: 'kleinanzeigen',
    name: 'Kleinanzeigen',
    exportVerhaeltnis: 4 / 3,
    exportBreite: 1600,
    exportHoehe: 1200,
    maxDateigroesseMB: 12,
    kachelVerhaeltnis: 4 / 3,
    schneidet: true,
    vorschauArt: 'zeile',
    herkunft: 'gemessen',
    gemessenAm: '2026-08-23',
  },
  {
    id: 'vinted',
    name: 'Vinted',
    exportVerhaeltnis: 2 / 3,
    exportBreite: 1200,
    exportHoehe: 1800,
    // Vinted nennt keine Grenze; es wird nur auf Qualitaet komprimiert.
    maxDateigroesseMB: null,
    kachelVerhaeltnis: 2 / 3,
    schneidet: true,
    vorschauArt: 'kachel',
    herkunft: 'gemessen',
    gemessenAm: '2026-08-23',
  },
];

/** Holt ein Profil. Wirft, wenn die Kennung unbekannt ist. */
export function profil(id: ProfilId): PlattformProfil {
  const gefunden = PLATTFORM_PROFILE.find((p) => p.id === id);
  if (!gefunden) throw new Error(`Unbekanntes Plattformprofil: ${id}`);
  return gefunden;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- plattform-profile`
Expected: PASS, 7 Tests.

- [ ] **Step 5: Commit**

```bash
git add src/app/features/image-optimizer/models/
git commit -m "feat(tools): add the platform profiles for the image optimiser"
```

---

### Task 2: Die Rechenfunktionen

**Files:**

- Create: `src/app/features/image-optimizer/services/zuschnitt.ts`
- Test: `src/app/features/image-optimizer/services/zuschnitt.spec.ts`

**Interfaces:**

- Consumes: `Rechteck`, `PlattformProfil` aus Task 1.
- Produces:
  - `leiteAb(ausschnitt: Rechteck, verhaeltnis: number): Rechteck`
  - `schnittmenge(rechtecke: Rechteck[]): Rechteck | null`
  - `safeArea(ausschnitt: Rechteck, profile: readonly PlattformProfil[]): Rechteck`
  - `reichtAufloesung(ausschnitt: Rechteck, zielBreite: number, zielHoehe: number): boolean`
  - `vergroesserungsfaktor(ausschnitt: Rechteck, zielBreite: number): number`

- [ ] **Step 1: Write the failing test**

Datei `src/app/features/image-optimizer/services/zuschnitt.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  leiteAb,
  reichtAufloesung,
  safeArea,
  schnittmenge,
  vergroesserungsfaktor,
} from './zuschnitt';
import { PLATTFORM_PROFILE, Rechteck, profil } from '../models/plattform-profile';

const quadrat: Rechteck = { x: 100, y: 100, breite: 1000, hoehe: 1000 };

describe('Ableitung eines Plattformformats', () => {
  it('laesst ein passendes Verhaeltnis unveraendert', () => {
    expect(leiteAb(quadrat, 1)).toEqual(quadrat);
  });

  it('nimmt bei hochkant Breite weg, nicht Hoehe', () => {
    const hoch = leiteAb(quadrat, 2 / 3);
    expect(hoch.hoehe).toBe(1000);
    expect(hoch.breite).toBeCloseTo(666.67, 1);
  });

  it('nimmt bei quer Hoehe weg, nicht Breite', () => {
    const quer = leiteAb(quadrat, 4 / 3);
    expect(quer.breite).toBe(1000);
    expect(quer.hoehe).toBe(750);
  });

  it('bleibt mittig im Ausschnitt', () => {
    const quer = leiteAb(quadrat, 4 / 3);
    expect(quer.x + quer.breite / 2).toBeCloseTo(quadrat.x + quadrat.breite / 2, 5);
    expect(quer.y + quer.hoehe / 2).toBeCloseTo(quadrat.y + quadrat.hoehe / 2, 5);
  });

  it('bleibt immer innerhalb des Ausschnitts - es kommt nie Bild hinzu', () => {
    for (const verhaeltnis of [0.2, 0.5, 2 / 3, 1, 4 / 3, 3, 10]) {
      const r = leiteAb(quadrat, verhaeltnis);
      expect(r.x).toBeGreaterThanOrEqual(quadrat.x - 0.001);
      expect(r.y).toBeGreaterThanOrEqual(quadrat.y - 0.001);
      expect(r.x + r.breite).toBeLessThanOrEqual(quadrat.x + quadrat.breite + 0.001);
      expect(r.y + r.hoehe).toBeLessThanOrEqual(quadrat.y + quadrat.hoehe + 0.001);
    }
  });
});

describe('Schnittmenge', () => {
  it('von einem Rechteck ist das Rechteck selbst', () => {
    expect(schnittmenge([quadrat])).toEqual(quadrat);
  });

  it('von quer und hochkant ist der gemeinsame Kern', () => {
    const quer = leiteAb(quadrat, 4 / 3);
    const hoch = leiteAb(quadrat, 2 / 3);
    const kern = schnittmenge([quer, hoch]);

    expect(kern).not.toBeNull();
    expect(kern!.breite).toBeCloseTo(hoch.breite, 5);
    expect(kern!.hoehe).toBeCloseTo(quer.hoehe, 5);
  });

  it('ist null, wenn sich nichts ueberschneidet', () => {
    const links: Rechteck = { x: 0, y: 0, breite: 10, hoehe: 10 };
    const rechts: Rechteck = { x: 100, y: 0, breite: 10, hoehe: 10 };
    expect(schnittmenge([links, rechts])).toBeNull();
  });

  it('ist null bei leerer Liste', () => {
    expect(schnittmenge([])).toBeNull();
  });
});

describe('Safe-Area', () => {
  it('beruecksichtigt nur Plattformen, die schneiden', () => {
    // eBay passt ein, statt zu schneiden - es darf den Bereich nicht kleiner
    // machen als er ohne eBay waere.
    const mitEbay = safeArea(quadrat, [profil('ebay'), profil('vinted')]);
    const ohneEbay = safeArea(quadrat, [profil('vinted')]);
    expect(mitEbay).toEqual(ohneEbay);
  });

  it('ist der ganze Ausschnitt, wenn keine Plattform schneidet', () => {
    expect(safeArea(quadrat, [profil('ebay')])).toEqual(quadrat);
  });

  it('wird bei quer und hochkant gleichzeitig deutlich kleiner', () => {
    const beide = safeArea(quadrat, [profil('kleinanzeigen'), profil('vinted')]);
    expect(beide.breite).toBeLessThan(quadrat.breite);
    expect(beide.hoehe).toBeLessThan(quadrat.hoehe);
  });

  it('ist der ganze Ausschnitt, wenn gar keine Plattform gewaehlt ist', () => {
    expect(safeArea(quadrat, [])).toEqual(quadrat);
  });
});

describe('Qualitaetspruefungen', () => {
  it('erkennt ausreichende Aufloesung', () => {
    expect(reichtAufloesung(quadrat, 1000, 1000)).toBe(true);
  });

  it('erkennt zu geringe Aufloesung', () => {
    expect(reichtAufloesung(quadrat, 1600, 1600)).toBe(false);
  });

  it('gilt genau an der Grenze noch als ausreichend', () => {
    expect(reichtAufloesung(quadrat, 1000, 1000)).toBe(true);
    expect(reichtAufloesung(quadrat, 1001, 1000)).toBe(false);
  });

  it('rechnet den Vergroesserungsfaktor aus', () => {
    expect(vergroesserungsfaktor(quadrat, 1600)).toBeCloseTo(1.6, 5);
    expect(vergroesserungsfaktor(quadrat, 500)).toBeCloseTo(0.5, 5);
  });
});

describe('Alle Profile zusammen', () => {
  it('erzeugen aus einem Ausschnitt lauter gueltige Rechtecke', () => {
    for (const p of PLATTFORM_PROFILE) {
      const r = leiteAb(quadrat, p.exportVerhaeltnis);
      expect(r.breite).toBeGreaterThan(0);
      expect(r.hoehe).toBeGreaterThan(0);
      expect(r.breite / r.hoehe).toBeCloseTo(p.exportVerhaeltnis, 5);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- zuschnitt`
Expected: FAIL mit „Failed to resolve import ./zuschnitt".

- [ ] **Step 3: Write the implementation**

Datei `src/app/features/image-optimizer/services/zuschnitt.ts`:

```ts
import { PlattformProfil, Rechteck } from '../models/plattform-profile';

/**
 * Das groesste Rechteck mit dem gewuenschten Verhaeltnis, das mittig in den
 * Ausschnitt passt.
 *
 * Der Kern des Werkzeugs: Jede Plattformfassung ist damit ein **Teil** dessen,
 * was der Nutzer gerade sieht. Es kommt nie Bildinhalt hinzu, den er nicht
 * geprueft hat - und es entstehen nie Raender, die eBay ohnehin verbietet.
 */
export function leiteAb(ausschnitt: Rechteck, verhaeltnis: number): Rechteck {
  const eigenes = ausschnitt.breite / ausschnitt.hoehe;

  const breite = eigenes > verhaeltnis ? ausschnitt.hoehe * verhaeltnis : ausschnitt.breite;
  const hoehe = eigenes > verhaeltnis ? ausschnitt.hoehe : ausschnitt.breite / verhaeltnis;

  return {
    x: ausschnitt.x + (ausschnitt.breite - breite) / 2,
    y: ausschnitt.y + (ausschnitt.hoehe - hoehe) / 2,
    breite,
    hoehe,
  };
}

/** Der gemeinsame Bereich mehrerer Rechtecke, oder null wenn es keinen gibt. */
export function schnittmenge(rechtecke: Rechteck[]): Rechteck | null {
  if (rechtecke.length === 0) return null;

  const links = Math.max(...rechtecke.map((r) => r.x));
  const oben = Math.max(...rechtecke.map((r) => r.y));
  const rechts = Math.min(...rechtecke.map((r) => r.x + r.breite));
  const unten = Math.min(...rechtecke.map((r) => r.y + r.hoehe));

  if (rechts <= links || unten <= oben) return null;

  return { x: links, y: oben, breite: rechts - links, hoehe: unten - oben };
}

/**
 * Der Bereich, in dem das Produkt liegen muss, damit **keine** gewaehlte
 * Plattform es anschneidet.
 *
 * Plattformen, die einpassen statt zu schneiden (eBay), gehen bewusst nicht
 * ein: Sie schneiden nichts ab und duerfen den Bereich deshalb nicht
 * kuenstlich verkleinern.
 */
export function safeArea(ausschnitt: Rechteck, profile: readonly PlattformProfil[]): Rechteck {
  const schneidende = profile.filter((p) => p.schneidet);
  if (schneidende.length === 0) return ausschnitt;

  const abgeleitete = schneidende.map((p) => leiteAb(ausschnitt, p.exportVerhaeltnis));
  // Alle abgeleiteten Rechtecke teilen sich den Mittelpunkt des Ausschnitts,
  // eine Schnittmenge existiert deshalb immer.
  return schnittmenge(abgeleitete) ?? ausschnitt;
}

/** Ob der Ausschnitt genug Pixel fuer die Zielgroesse mitbringt. */
export function reichtAufloesung(
  ausschnitt: Rechteck,
  zielBreite: number,
  zielHoehe: number,
): boolean {
  return ausschnitt.breite >= zielBreite && ausschnitt.hoehe >= zielHoehe;
}

/** Um welchen Faktor der Ausschnitt hochgerechnet wird. Ueber 1 heisst: unschaerfer. */
export function vergroesserungsfaktor(ausschnitt: Rechteck, zielBreite: number): number {
  return zielBreite / ausschnitt.breite;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- zuschnitt`
Expected: PASS, 17 Tests.

- [ ] **Step 5: Commit**

```bash
git add src/app/features/image-optimizer/services/zuschnitt.ts src/app/features/image-optimizer/services/zuschnitt.spec.ts
git commit -m "feat(tools): derive platform formats from a single crop"
```

---

### Task 3: Export einzelner Bilder

**Files:**

- Create: `src/app/features/image-optimizer/services/bild-export.service.ts`
- Test: `src/app/features/image-optimizer/services/bild-export.spec.ts`

**Interfaces:**

- Consumes: `Rechteck`, `PlattformProfil`, `leiteAb`.
- Produces:
  - `dateiName(index: number, profil: PlattformProfil): string`
  - `class BildExportService` mit
    `erzeuge(bild: HTMLImageElement, ausschnitt: Rechteck, profil: PlattformProfil): Promise<Blob>`

- [ ] **Step 1: Write the failing test**

Nur der Namensteil ist ohne Browser pruefbar; das Zeichnen auf Canvas wird von
Hand geprueft (Task 8). Datei `src/app/features/image-optimizer/services/bild-export.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { dateiName } from './bild-export.service';
import { profil } from '../models/plattform-profile';

/**
 * Das erste Bild ist bei eBay das Bild im Suchergebnis und bei Vinted das im
 * Raster. Es muss beim Hochladen zuerst kommen - deshalb sortiert der Name.
 */
describe('Dateinamen fuer den Export', () => {
  it('nennt das erste Bild als Hauptbild', () => {
    expect(dateiName(0, profil('ebay'))).toBe('01-main.jpg');
  });

  it('zaehlt die uebrigen zweistellig durch, damit sie sortieren', () => {
    expect(dateiName(1, profil('ebay'))).toBe('02.jpg');
    expect(dateiName(9, profil('ebay'))).toBe('10.jpg');
  });

  it('bleibt auch jenseits von zehn sortierbar', () => {
    expect(dateiName(23, profil('vinted'))).toBe('24.jpg');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- bild-export`
Expected: FAIL mit „Failed to resolve import ./bild-export.service".

- [ ] **Step 3: Write the implementation**

Datei `src/app/features/image-optimizer/services/bild-export.service.ts`:

```ts
import { Injectable } from '@angular/core';
import imageCompression from 'browser-image-compression';
import { PlattformProfil, Rechteck } from '../models/plattform-profile';
import { leiteAb } from './zuschnitt';

/** Name einer Exportdatei. Index 0 ist das Hauptbild. */
export function dateiName(index: number, _profil: PlattformProfil): string {
  const nummer = String(index + 1).padStart(2, '0');
  return index === 0 ? `${nummer}-main.jpg` : `${nummer}.jpg`;
}

@Injectable({
  providedIn: 'root',
})
export class BildExportService {
  /**
   * Erzeugt die Plattformfassung eines Bildes.
   *
   * Es wird ausschliesslich geschnitten und skaliert - nie aufgefuellt. eBay
   * verbietet hinzugefuegte Raender, und ein Rand um ein Produktfoto sieht
   * ohnehin nach Amateur aus.
   */
  async erzeuge(
    bild: HTMLImageElement,
    ausschnitt: Rechteck,
    plattform: PlattformProfil,
  ): Promise<Blob> {
    const quelle = leiteAb(ausschnitt, plattform.exportVerhaeltnis);

    const flaeche = document.createElement('canvas');
    flaeche.width = plattform.exportBreite;
    flaeche.height = plattform.exportHoehe;

    const stift = flaeche.getContext('2d');
    if (!stift) throw new Error('Der Browser stellt keine Zeichenflaeche bereit.');

    // Weisser Grund: Bei durchsichtigen PNG-Bereichen bliebe sonst Schwarz
    // stehen, sobald als JPEG kodiert wird.
    stift.fillStyle = '#ffffff';
    stift.fillRect(0, 0, flaeche.width, flaeche.height);
    stift.imageSmoothingQuality = 'high';
    stift.drawImage(
      bild,
      quelle.x,
      quelle.y,
      quelle.breite,
      quelle.hoehe,
      0,
      0,
      flaeche.width,
      flaeche.height,
    );

    const roh = await new Promise<Blob>((aufloesen, ablehnen) => {
      flaeche.toBlob(
        (b) => (b ? aufloesen(b) : ablehnen(new Error('Das Bild liess sich nicht erzeugen.'))),
        'image/jpeg',
        0.92,
      );
    });

    if (plattform.maxDateigroesseMB === null) return roh;
    if (roh.size <= plattform.maxDateigroesseMB * 1024 * 1024) return roh;

    return imageCompression(new File([roh], 'export.jpg', { type: 'image/jpeg' }), {
      maxSizeMB: plattform.maxDateigroesseMB,
      maxWidthOrHeight: Math.max(plattform.exportBreite, plattform.exportHoehe),
      useWebWorker: true,
    });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- bild-export`
Expected: PASS, 3 Tests.

- [ ] **Step 5: Commit**

```bash
git add src/app/features/image-optimizer/services/bild-export.service.ts src/app/features/image-optimizer/services/bild-export.spec.ts
git commit -m "feat(tools): render a crop into a platform sized jpeg"
```

---

### Task 4: ZIP-Export

**Files:**

- Modify: `package.json` (neue Abhängigkeit `jszip`)
- Create: `src/app/features/image-optimizer/services/zip-export.service.ts`
- Test: `src/app/features/image-optimizer/services/zip-export.spec.ts`

**Interfaces:**

- Consumes: `dateiName`, `PlattformProfil`.
- Produces:
  - `ordnerName(profil: PlattformProfil): string`
  - `class ZipExportService` mit `packe(eintraege: ZipEintrag[]): Promise<Blob>`
  - `interface ZipEintrag { ordner: string; datei: string; daten: Blob }`

- [ ] **Step 1: Install the dependency**

```bash
npm install jszip
```

`jszip` bringt eigene Typdefinitionen mit, ein zusätzliches `@types`-Paket ist nicht nötig.

- [ ] **Step 2: Write the failing test**

Datei `src/app/features/image-optimizer/services/zip-export.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { ordnerName } from './zip-export.service';
import { PLATTFORM_PROFILE, profil } from '../models/plattform-profile';

/**
 * Der Ordnername landet im Dateisystem des Nutzers. Er soll ohne Nachdenken
 * erkennbar sein - beim Einstellen wird genau dieser Ordner geoeffnet.
 */
describe('Ordnernamen im ZIP', () => {
  it('benutzt den Anzeigenamen der Plattform', () => {
    expect(ordnerName(profil('ebay'))).toBe('eBay');
    expect(ordnerName(profil('kleinanzeigen'))).toBe('Kleinanzeigen');
    expect(ordnerName(profil('vinted'))).toBe('Vinted');
  });

  it('erzeugt fuer jede Plattform einen eigenen Namen', () => {
    const namen = PLATTFORM_PROFILE.map(ordnerName);
    expect(new Set(namen).size).toBe(namen.length);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm run test -- zip-export`
Expected: FAIL mit „Failed to resolve import ./zip-export.service".

- [ ] **Step 4: Write the implementation**

Datei `src/app/features/image-optimizer/services/zip-export.service.ts`:

```ts
import { Injectable } from '@angular/core';
import JSZip from 'jszip';
import { PlattformProfil } from '../models/plattform-profile';

export interface ZipEintrag {
  readonly ordner: string;
  readonly datei: string;
  readonly daten: Blob;
}

/** Der Ordner, in dem die Bilder einer Plattform liegen. */
export function ordnerName(plattform: PlattformProfil): string {
  return plattform.name;
}

@Injectable({
  providedIn: 'root',
})
export class ZipExportService {
  /**
   * Packt die Bilder in ein Archiv mit einem Ordner je Plattform.
   *
   * Der Grund fuer die Ordner: Beim Einstellen oeffnet man genau einen Ordner
   * und waehlt alles darin aus. Alle Bilder in einem Verzeichnis waeren beim
   * Hochladen ein Suchspiel.
   */
  async packe(eintraege: ZipEintrag[]): Promise<Blob> {
    const archiv = new JSZip();

    for (const eintrag of eintraege) {
      archiv.folder(eintrag.ordner)?.file(eintrag.datei, eintrag.daten);
    }

    return archiv.generateAsync({ type: 'blob' });
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test -- zip-export`
Expected: PASS, 2 Tests.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/app/features/image-optimizer/services/zip-export.service.ts src/app/features/image-optimizer/services/zip-export.spec.ts
git commit -m "feat(tools): pack exports into one archive per platform"
```

---

### Task 5: Seite, Route und Navigation

**Files:**

- Create: `src/app/features/image-optimizer/image-optimizer.component.ts`
- Create: `src/app/features/image-optimizer/image-optimizer.component.html`
- Modify: `src/app/app.routes.ts` (nach dem `listings`-Eintrag)
- Modify: `src/app/layout/sidebar/sidebar.component.ts` (`navItems`)
- Modify: `src/app/layout/sidebar/sidebar.component.html:85` und `:112` (die Ausschnitte)

**Interfaces:**

- Consumes: `PLATTFORM_PROFILE`, `ProfilId`.
- Produces: die Seite unter `/image-optimizer`, Signale `bilder`, `gewaehltePlattformen`, `aktivesBild`.

**Achtung – positionsbasierte Navigation:** Die Seitenleiste teilt `navItems`
mit `slice(0, 4)`, `slice(4, 9)` und `slice(9)` in Gruppen. Ein neuer Eintrag
an Position 7 verschiebt die beiden hinteren Grenzen auf `slice(4, 10)` und
`slice(10)`. Wer das vergisst, schiebt „Verkäufe" in die falsche Gruppe.

- [ ] **Step 1: Add the route**

In `src/app/app.routes.ts` direkt nach dem `listings`-Eintrag einfügen:

```ts
      {
        path: 'image-optimizer',
        loadComponent: () =>
          import('./features/image-optimizer/image-optimizer.component').then(
            (m) => m.ImageOptimizerComponent,
          ),
      },
```

- [ ] **Step 2: Add the navigation entry**

In `src/app/layout/sidebar/sidebar.component.ts` bei den Lucide-Importen
ergänzen:

```ts
  LucideImage as ImageIcon,
```

Und in `navItems` direkt **nach** dem `/listings`-Eintrag:

```ts
    {
      path: '/image-optimizer',
      labelKey: 'NAV.IMAGE_OPTIMIZER',
      label: 'Bildoptimierer',
      icon: ImageIcon,
    },
```

- [ ] **Step 3: Fix the group boundaries**

In `src/app/layout/sidebar/sidebar.component.html`:

- Zeile 85: `navItems.slice(4, 9)` → `navItems.slice(4, 10)`
- Zeile 112: `navItems.slice(9)` → `navItems.slice(10)`

- [ ] **Step 4: Write the page**

Datei `src/app/features/image-optimizer/image-optimizer.component.ts`:

```ts
import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { PLATTFORM_PROFILE, PlattformProfil, ProfilId } from './models/plattform-profile';
import { Rechteck } from './models/plattform-profile';

/** Ein hochgeladenes Bild mit seinem Zuschnitt. */
export interface OptimiererBild {
  readonly id: string;
  readonly datei: File;
  readonly datenUrl: string;
  /** Ausschnitt in Originalpixeln. Null, solange nichts gesetzt wurde. */
  readonly ausschnitt: Rechteck | null;
}

/**
 * Bereitet Produktfotos fuer die Verkaufsplattformen auf.
 *
 * Alles laeuft im Browser: Die Dateien werden nur gelesen, nichts wird
 * hochgeladen. Deshalb funktioniert das Werkzeug auch ohne Anmeldung am
 * Server und liesse sich spaeter eigenstaendig veroeffentlichen.
 */
@Component({
  selector: 'app-image-optimizer',
  imports: [],
  templateUrl: './image-optimizer.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ImageOptimizerComponent {
  readonly profile = PLATTFORM_PROFILE;

  readonly bilder = signal<OptimiererBild[]>([]);
  readonly gewaehlteIds = signal<ProfilId[]>(['ebay']);
  readonly aktivesBildId = signal<string | null>(null);

  readonly gewaehlteProfile = computed<PlattformProfil[]>(() =>
    this.profile.filter((p) => this.gewaehlteIds().includes(p.id)),
  );

  readonly aktivesBild = computed<OptimiererBild | null>(
    () => this.bilder().find((b) => b.id === this.aktivesBildId()) ?? null,
  );

  /** Ob mindestens eine gewaehlte Plattform tatsaechlich beschneidet. */
  readonly esWirdGeschnitten = computed<boolean>(() =>
    this.gewaehlteProfile().some((p) => p.schneidet),
  );

  schaltePlattform(id: ProfilId): void {
    this.gewaehlteIds.update((ids) =>
      ids.includes(id) ? ids.filter((v) => v !== id) : [...ids, id],
    );
  }

  async nimmDateien(dateien: FileList | null): Promise<void> {
    if (!dateien) return;

    const neue: OptimiererBild[] = [];
    for (const datei of Array.from(dateien)) {
      if (!datei.type.startsWith('image/')) continue;
      neue.push({
        id: crypto.randomUUID(),
        datei,
        datenUrl: URL.createObjectURL(datei),
        ausschnitt: null,
      });
    }

    this.bilder.update((liste) => [...liste, ...neue]);
    if (!this.aktivesBildId() && neue.length > 0) {
      this.aktivesBildId.set(neue[0].id);
    }
  }

  entferne(id: string): void {
    const betroffen = this.bilder().find((b) => b.id === id);
    if (betroffen) URL.revokeObjectURL(betroffen.datenUrl);

    this.bilder.update((liste) => liste.filter((b) => b.id !== id));
    if (this.aktivesBildId() === id) {
      this.aktivesBildId.set(this.bilder()[0]?.id ?? null);
    }
  }
}
```

Datei `src/app/features/image-optimizer/image-optimizer.component.html` – Aufbau
im Stil der übrigen Seiten (`linear-surface rounded-2xl p-5 …`, siehe
`src/app/features/deal-calculator/deal-calculator.component.html`):

```html
<div class="space-y-5">
  <div class="linear-surface rounded-2xl p-5 space-y-4 shadow-xl border border-fb-border">
    <h1 class="text-base font-bold text-fb-text-primary">Bildoptimierer</h1>
    <p class="text-xs text-fb-text-secondary leading-relaxed">
      Fotos hineinziehen, einmal den Ausschnitt festlegen – Flipbase erzeugt daraus die Formate der
      Plattformen. Die Bilder bleiben auf deinem Rechner.
    </p>

    <div class="flex flex-wrap gap-2">
      @for (p of profile; track p.id) {
      <button
        type="button"
        (click)="schaltePlattform(p.id)"
        [class.bg-indigo-500\/15]="gewaehlteIds().includes(p.id)"
        [class.border-indigo-500\/40]="gewaehlteIds().includes(p.id)"
        class="px-3 py-1.5 rounded-xl text-xs font-semibold border border-fb-border text-fb-text-secondary hover:text-fb-text-primary cursor-pointer"
      >
        {{ p.name }} @if (!p.schneidet) {
        <span class="text-[10px] text-fb-text-muted ml-1">passt ein</span>
        }
      </button>
      }
    </div>

    <label
      class="block border-2 border-dashed border-fb-border rounded-2xl p-8 text-center cursor-pointer hover:border-indigo-500/40"
    >
      <input
        type="file"
        accept="image/*"
        multiple
        hidden
        (change)="nimmDateien($any($event.target).files)"
      />
      <span class="text-xs text-fb-text-secondary">Bilder hierher ziehen oder auswählen</span>
    </label>

    @if (bilder().length > 0) {
    <p class="text-[11px] text-fb-text-muted">{{ bilder().length }} Bild(er) geladen.</p>
    }
  </div>
</div>
```

- [ ] **Step 5: Verify in the browser**

Diese Aufgabe hat keinen automatischen Test – geprüft wird von Hand:

```bash
npm start
```

1. `/image-optimizer` öffnen: Die Seite erscheint.
2. In der Seitenleiste steht „Bildoptimierer" **unter „Werkzeuge & Ertrag"**, direkt nach „Listing Studio". „Verkäufe" und „Packtisch & Versand" stehen weiterhin in derselben Gruppe, „Steuern & DATEV" weiterhin unter „System & Daten". Genau das prüft, ob die Ausschnittsgrenzen richtig nachgezogen wurden.
3. Mehrere Bilder auswählen: Die Anzahl erscheint.
4. Plattform-Knöpfe schalten sich ein und aus.

- [ ] **Step 6: Run checks and commit**

Run: `npm run test && npm run lint && npm run typecheck`

```bash
git add src/app/features/image-optimizer/ src/app/app.routes.ts src/app/layout/sidebar/
git commit -m "feat(tools): add the image optimiser page and its navigation entry"
```

---

### Task 6: Zuschnitt-Editor

**Files:**

- Create: `src/app/features/image-optimizer/components/zuschnitt-editor/zuschnitt-editor.component.ts`
- Create: `src/app/features/image-optimizer/components/zuschnitt-editor/zuschnitt-editor.component.html`
- Modify: `src/app/features/image-optimizer/image-optimizer.component.ts` (Ausschnitt übernehmen)
- Modify: `src/app/features/image-optimizer/image-optimizer.component.html` (Editor einbinden)

**Interfaces:**

- Consumes: `Rechteck`, `safeArea`, `gewaehlteProfile`.
- Produces: Komponente `app-zuschnitt-editor` mit
  `datenUrl = input.required<string>()`, `profile = input.required<PlattformProfil[]>()`,
  `ausschnittGeaendert = output<Rechteck>()`.

**Wichtig:** `ngx-image-cropper` liefert im `imageCropped`-Ereignis das Feld
`imagePosition` (`{ x1, y1, x2, y2 }`) – das ist der Ausschnitt **in
Originalpixeln**, genau was die Rechenfunktionen erwarten. `cropperPosition`
wäre dagegen in Anzeigepixeln und damit falsch.

- [ ] **Step 1: Write the component**

Datei `zuschnitt-editor.component.ts`:

```ts
import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { ImageCropperComponent, ImageCroppedEvent } from 'ngx-image-cropper';
import { LucideDynamicIcon, LucideRotateCw as RotateCw } from '@lucide/angular';
import { PlattformProfil, Rechteck } from '../../models/plattform-profile';
import { safeArea } from '../../services/zuschnitt';

/**
 * Legt den einen Ausschnitt fest, aus dem alle Plattformformate abgeleitet
 * werden.
 *
 * Der Rahmen ist bewusst frei im Seitenverhaeltnis: Der Nutzer waehlt den
 * Bildbereich, den er zeigen will - welches Format daraus wird, entscheidet
 * die Plattform, nicht er.
 */
@Component({
  selector: 'app-zuschnitt-editor',
  imports: [ImageCropperComponent, LucideDynamicIcon],
  templateUrl: './zuschnitt-editor.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ZuschnittEditorComponent {
  readonly datenUrl = input.required<string>();
  readonly profile = input.required<PlattformProfil[]>();

  readonly ausschnittGeaendert = output<Rechteck>();

  readonly drehung = signal(0);
  readonly letzterAusschnitt = signal<Rechteck | null>(null);

  readonly rotateIcon = RotateCw;

  /** Der Bereich, den keine gewaehlte Plattform anschneidet - als Anteil. */
  readonly sichererBereichInProzent = computed(() => {
    const a = this.letzterAusschnitt();
    if (!a) return null;

    const sicher = safeArea(a, this.profile());
    return {
      breite: (sicher.breite / a.breite) * 100,
      hoehe: (sicher.hoehe / a.hoehe) * 100,
    };
  });

  beiZuschnitt(ereignis: ImageCroppedEvent): void {
    // imagePosition ist in Pixeln des Originalbildes - cropperPosition waere
    // in Anzeigepixeln und damit von der Fenstergroesse abhaengig.
    const p = ereignis.imagePosition;
    const ausschnitt: Rechteck = {
      x: p.x1,
      y: p.y1,
      breite: p.x2 - p.x1,
      hoehe: p.y2 - p.y1,
    };

    this.letzterAusschnitt.set(ausschnitt);
    this.ausschnittGeaendert.emit(ausschnitt);
  }

  drehe(): void {
    this.drehung.update((g) => (g + 90) % 360);
  }
}
```

Datei `zuschnitt-editor.component.html`:

```html
<div class="space-y-3">
  <div class="relative">
    <image-cropper
      [imageURL]="datenUrl()"
      [maintainAspectRatio]="false"
      [format]="'jpeg'"
      [transform]="{ rotate: drehung() }"
      (imageCropped)="beiZuschnitt($event)"
    ></image-cropper>

    @if (sichererBereichInProzent(); as sicher) {
    <!-- Der Bereich, den keine gewaehlte Plattform anschneidet. Nur ein
           Hinweis, deshalb ohne Mausereignisse. -->
    <div
      class="absolute border-2 border-dashed border-emerald-400/70 pointer-events-none"
      [style.width.%]="sicher.breite"
      [style.height.%]="sicher.hoehe"
      [style.left.%]="(100 - sicher.breite) / 2"
      [style.top.%]="(100 - sicher.hoehe) / 2"
    ></div>
    }
  </div>

  <div class="flex items-center gap-2">
    <button
      type="button"
      (click)="drehe()"
      class="px-2.5 py-1.5 rounded-lg border border-fb-border text-fb-text-secondary hover:text-fb-text-primary cursor-pointer"
      aria-label="Bild drehen"
    >
      <svg [lucideIcon]="rotateIcon" class="w-3.5 h-3.5"></svg>
    </button>
    <p class="text-[11px] text-fb-text-muted">
      Der gestrichelte Bereich wird von keiner gewählten Plattform angeschnitten.
    </p>
  </div>
</div>
```

- [ ] **Step 2: Wire it into the page**

In `image-optimizer.component.ts` den Import ergänzen und in `imports`
aufnehmen, dazu eine Methode:

```ts
  merkeAusschnitt(id: string, ausschnitt: Rechteck): void {
    this.bilder.update((liste) =>
      liste.map((b) => (b.id === id ? { ...b, ausschnitt } : b)),
    );
  }
```

In `image-optimizer.component.html` unterhalb der Ladefläche:

```html
@if (aktivesBild(); as bild) {
<div class="linear-surface rounded-2xl p-5 shadow-xl border border-fb-border">
  <app-zuschnitt-editor
    [datenUrl]="bild.datenUrl"
    [profile]="gewaehlteProfile()"
    (ausschnittGeaendert)="merkeAusschnitt(bild.id, $event)"
  ></app-zuschnitt-editor>
</div>
}
```

- [ ] **Step 3: Verify in the browser**

```bash
npm start
```

1. Ein Bild laden – der Editor erscheint.
2. Den Rahmen verschieben und in der Größe ändern.
3. **eBay allein wählen:** Der gestrichelte Bereich füllt den ganzen Rahmen (eBay schneidet nicht).
4. **Kleinanzeigen dazuwählen:** Der Bereich wird flacher.
5. **Vinted zusätzlich:** Der Bereich wird zusätzlich schmaler.
6. Drehen ändert das Bild, der Bereich bleibt sinnvoll.

- [ ] **Step 4: Run checks and commit**

Run: `npm run test && npm run lint && npm run typecheck`

```bash
git add src/app/features/image-optimizer/
git commit -m "feat(tools): set one crop per image and show the safe area"
```

---

### Task 7: Vorschau als Nachbau der Trefferliste

**Files:**

- Create: `src/app/features/image-optimizer/components/plattform-vorschau/plattform-vorschau.component.ts`
- Create: `src/app/features/image-optimizer/components/plattform-vorschau/plattform-vorschau.component.html`
- Modify: `src/app/features/image-optimizer/image-optimizer.component.html`

**Interfaces:**

- Consumes: `PlattformProfil`, `Rechteck`, `leiteAb`.
- Produces: Komponente `app-plattform-vorschau` mit
  `plattform = input.required<PlattformProfil>()`, `datenUrl = input.required<string>()`,
  `ausschnitt = input<Rechteck | null>(null)`.

- [ ] **Step 1: Write the component**

Datei `plattform-vorschau.component.ts`:

```ts
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { PlattformProfil, Rechteck } from '../../models/plattform-profile';

/**
 * Zeigt, wie der Artikel in der Trefferliste der Plattform aussieht.
 *
 * Bewusst **kein** originalgetreuer Nachbau: keine fremden Logos, Schriften
 * oder Farbwelten. Fuer die Frage "wird mein Produkt angeschnitten?" traegt
 * allein die Bildoeffnung etwas bei - Seitenverhaeltnis und ob geschnitten
 * oder eingepasst wird. Beides ist gemessen, siehe Profil.
 */
@Component({
  selector: 'app-plattform-vorschau',
  imports: [],
  templateUrl: './plattform-vorschau.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlattformVorschauComponent {
  readonly plattform = input.required<PlattformProfil>();
  readonly datenUrl = input.required<string>();
  readonly ausschnitt = input<Rechteck | null>(null);

  /** `cover` schneidet, `contain` passt ein - genau wie die echte Liste. */
  readonly bildAnpassung = computed(() => (this.plattform().schneidet ? 'cover' : 'contain'));

  readonly seitenverhaeltnis = computed(() => this.plattform().kachelVerhaeltnis);
}
```

Datei `plattform-vorschau.component.html`:

```html
<div class="space-y-1.5">
  <p class="text-[10px] font-semibold uppercase tracking-wider text-fb-text-muted">
    {{ plattform().name }} · Vorschau
  </p>

  @if (plattform().vorschauArt === 'zeile') {
  <!-- Kleinanzeigen zeigt eine Liste: Bild links, Text rechts. -->
  <div class="flex gap-3 p-2 rounded-xl border border-fb-border bg-fb-surface">
    <div
      class="shrink-0 w-28 rounded-lg overflow-hidden bg-fb-bg"
      [style.aspect-ratio]="seitenverhaeltnis()"
    >
      <img
        [src]="datenUrl()"
        alt="Vorschau des Produktfotos"
        class="w-full h-full"
        [style.object-fit]="bildAnpassung()"
      />
    </div>
    <div class="min-w-0 space-y-1 py-0.5">
      <div class="h-2.5 w-32 rounded bg-fb-surface-hover"></div>
      <div class="h-2 w-20 rounded bg-fb-surface-hover"></div>
      <div class="h-2.5 w-14 rounded bg-emerald-500/30"></div>
    </div>
  </div>
  } @else {
  <!-- eBay und Vinted zeigen ein Raster aus Kacheln. -->
  <div class="w-36 rounded-xl border border-fb-border bg-fb-surface overflow-hidden">
    <div class="bg-fb-bg" [style.aspect-ratio]="seitenverhaeltnis()">
      <img
        [src]="datenUrl()"
        alt="Vorschau des Produktfotos"
        class="w-full h-full"
        [style.object-fit]="bildAnpassung()"
      />
    </div>
    <div class="p-2 space-y-1">
      <div class="h-2.5 w-24 rounded bg-fb-surface-hover"></div>
      <div class="h-2.5 w-12 rounded bg-emerald-500/30"></div>
    </div>
  </div>
  } @if (!plattform().schneidet) {
  <p class="text-[10px] text-fb-text-muted">Passt ein, schneidet nichts ab.</p>
  }
</div>
```

- [ ] **Step 2: Wire it into the page**

In `image-optimizer.component.html` neben dem Editor:

```html
@if (aktivesBild(); as bild) {
<div class="flex flex-wrap gap-4">
  @for (p of gewaehlteProfile(); track p.id) {
  <app-plattform-vorschau
    [plattform]="p"
    [datenUrl]="bild.datenUrl"
    [ausschnitt]="bild.ausschnitt"
  ></app-plattform-vorschau>
  }
</div>
}
```

- [ ] **Step 3: Verify in the browser**

```bash
npm start
```

Mit einem **hochkanten** Foto prüfen – dort sind die Unterschiede am deutlichsten:

1. eBay: Das ganze Bild ist zu sehen, mit Luft links und rechts (`contain`).
2. Kleinanzeigen: Oben und unten fehlt etwas (`cover`, 4:3 quer).
3. Vinted: Hochkante Kachel, links und rechts fehlt etwas.
4. Die drei Vorschauen unterscheiden sich sichtbar – wäre das nicht so, stimmte das Seitenverhältnis nicht.

- [ ] **Step 4: Run checks and commit**

Run: `npm run test && npm run lint && npm run typecheck`

```bash
git add src/app/features/image-optimizer/
git commit -m "feat(tools): preview a photo inside each marketplace result list"
```

---

### Task 8: Export, Warnungen und Hauptbild

**Files:**

- Modify: `src/app/features/image-optimizer/image-optimizer.component.ts`
- Modify: `src/app/features/image-optimizer/image-optimizer.component.html`
- Create: `src/app/features/image-optimizer/components/bild-liste/bild-liste.component.ts`
- Create: `src/app/features/image-optimizer/components/bild-liste/bild-liste.component.html`

**Interfaces:**

- Consumes: `BildExportService.erzeuge`, `ZipExportService.packe`, `dateiName`, `ordnerName`, `reichtAufloesung`, `vergroesserungsfaktor`.
- Produces: nichts für spätere Aufgaben.

- [ ] **Step 1: Write the film strip**

Datei `bild-liste.component.ts`:

```ts
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import {
  LucideDynamicIcon,
  LucideX as X,
  LucideChevronLeft as ChevronLeft,
  LucideChevronRight as ChevronRight,
} from '@lucide/angular';
import { OptimiererBild } from '../../image-optimizer.component';

/**
 * Die Filmleiste. Das erste Bild ist das Hauptbild - bei eBay das Bild im
 * Suchergebnis, bei Vinted das im Raster. Deshalb wird es markiert.
 */
@Component({
  selector: 'app-bild-liste',
  imports: [LucideDynamicIcon],
  templateUrl: './bild-liste.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BildListeComponent {
  readonly bilder = input.required<OptimiererBild[]>();
  readonly aktivesId = input<string | null>(null);

  readonly gewaehlt = output<string>();
  readonly entfernt = output<string>();
  readonly verschoben = output<{ id: string; richtung: -1 | 1 }>();

  readonly closeIcon = X;
  readonly linksIcon = ChevronLeft;
  readonly rechtsIcon = ChevronRight;
}
```

Datei `bild-liste.component.html`:

```html
<div class="flex gap-2 overflow-x-auto pb-1">
  @for (bild of bilder(); track bild.id; let i = $index) {
  <div class="relative shrink-0">
    <button
      type="button"
      (click)="gewaehlt.emit(bild.id)"
      [class.ring-2]="bild.id === aktivesId()"
      class="w-20 h-20 rounded-lg overflow-hidden border border-fb-border ring-indigo-400 cursor-pointer"
    >
      <img [src]="bild.datenUrl" alt="" class="w-full h-full object-cover" />
    </button>

    @if (i === 0) {
    <span
      class="absolute bottom-0 left-0 right-0 text-[9px] font-bold text-center bg-indigo-500/80 text-white"
    >
      HAUPTBILD
    </span>
    }

    <button
      type="button"
      (click)="entfernt.emit(bild.id)"
      class="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-fb-surface border border-fb-border flex items-center justify-center cursor-pointer"
      aria-label="Bild entfernen"
    >
      <svg [lucideIcon]="closeIcon" class="w-3 h-3"></svg>
    </button>

    <!-- Umsortieren ueber Schaltflaechen statt Ziehen: Das erste Bild ist
           das Hauptbild, die Reihenfolge muss sich also aendern lassen - und
           Ziehen ist mit der Tastatur nicht bedienbar. -->
    <div class="flex justify-center gap-1 pt-1">
      <button
        type="button"
        (click)="verschoben.emit({ id: bild.id, richtung: -1 })"
        [disabled]="i === 0"
        class="w-5 h-5 rounded border border-fb-border flex items-center justify-center cursor-pointer disabled:opacity-30"
        aria-label="Bild nach vorne schieben"
      >
        <svg [lucideIcon]="linksIcon" class="w-3 h-3"></svg>
      </button>
      <button
        type="button"
        (click)="verschoben.emit({ id: bild.id, richtung: 1 })"
        [disabled]="i === bilder().length - 1"
        class="w-5 h-5 rounded border border-fb-border flex items-center justify-center cursor-pointer disabled:opacity-30"
        aria-label="Bild nach hinten schieben"
      >
        <svg [lucideIcon]="rechtsIcon" class="w-3 h-3"></svg>
      </button>
    </div>
  </div>
  }
</div>
```

Und in `image-optimizer.component.ts` die zugehoerige Methode:

```ts
  /** Schiebt ein Bild in der Reihenfolge. Position 0 ist das Hauptbild. */
  verschiebe(id: string, richtung: -1 | 1): void {
    this.bilder.update((liste) => {
      const von = liste.findIndex((b) => b.id === id);
      const nach = von + richtung;
      if (von === -1 || nach < 0 || nach >= liste.length) return liste;

      const neu = [...liste];
      [neu[von], neu[nach]] = [neu[nach], neu[von]];
      return neu;
    });
  }
```

- [ ] **Step 2: Add export and warnings to the page**

In `image-optimizer.component.ts` ergänzen:

```ts
  private readonly bildExport = inject(BildExportService);
  private readonly zipExport = inject(ZipExportService);

  readonly laeuft = signal(false);
  readonly fehler = signal<string | null>(null);

  /** Bilder, deren Ausschnitt fuer mindestens eine Plattform zu klein ist. */
  readonly warnungen = computed<string[]>(() => {
    const meldungen: string[] = [];

    for (const [index, bild] of this.bilder().entries()) {
      if (!bild.ausschnitt) continue;

      for (const p of this.gewaehlteProfile()) {
        if (!reichtAufloesung(bild.ausschnitt, p.exportBreite, p.exportHoehe)) {
          const faktor = vergroesserungsfaktor(bild.ausschnitt, p.exportBreite);
          meldungen.push(
            `Bild ${index + 1} für ${p.name}: Der Ausschnitt wird ${faktor.toFixed(1)}-fach ` +
              `vergrößert und kann unscharf werden.`,
          );
        }
      }
    }

    return meldungen;
  });

  async exportiere(): Promise<void> {
    this.laeuft.set(true);
    this.fehler.set(null);

    try {
      const eintraege = [];

      for (const [index, bild] of this.bilder().entries()) {
        const element = await this.ladeBild(bild.datenUrl);
        const ausschnitt = bild.ausschnitt ?? {
          x: 0,
          y: 0,
          breite: element.naturalWidth,
          hoehe: element.naturalHeight,
        };

        for (const p of this.gewaehlteProfile()) {
          eintraege.push({
            ordner: ordnerName(p),
            datei: dateiName(index, p),
            daten: await this.bildExport.erzeuge(element, ausschnitt, p),
          });
        }
      }

      const archiv = await this.zipExport.packe(eintraege);
      this.ladeHerunter(archiv, 'flipbase-bilder.zip');
    } catch (e: unknown) {
      this.fehler.set(e instanceof Error ? e.message : 'Der Export ist fehlgeschlagen.');
    } finally {
      this.laeuft.set(false);
    }
  }

  private ladeBild(url: string): Promise<HTMLImageElement> {
    return new Promise((aufloesen, ablehnen) => {
      const bild = new Image();
      bild.onload = () => aufloesen(bild);
      bild.onerror = () =>
        ablehnen(
          new Error(
            'Das Bild liess sich nicht lesen. HEIC-Dateien vom iPhone kann der Browser oft nicht öffnen.',
          ),
        );
      bild.src = url;
    });
  }

  private ladeHerunter(daten: Blob, name: string): void {
    const url = URL.createObjectURL(daten);
    const verweis = document.createElement('a');
    verweis.href = url;
    verweis.download = name;
    verweis.click();
    URL.revokeObjectURL(url);
  }
```

Die nötigen Importe: `inject` aus `@angular/core`, `BildExportService`,
`dateiName`, `ZipExportService`, `ordnerName`, `reichtAufloesung`,
`vergroesserungsfaktor`.

- [ ] **Step 3: Add the export UI**

In `image-optimizer.component.html` unten ergänzen:

```html
@if (bilder().length > 0) {
<div class="linear-surface rounded-2xl p-5 space-y-3 shadow-xl border border-fb-border">
  <app-bild-liste
    [bilder]="bilder()"
    [aktivesId]="aktivesBildId()"
    (gewaehlt)="aktivesBildId.set($event)"
    (entfernt)="entferne($event)"
    (verschoben)="verschiebe($event.id, $event.richtung)"
  ></app-bild-liste>

  @for (warnung of warnungen(); track warnung) {
  <p class="text-[11px] text-amber-300">{{ warnung }}</p>
  } @if (fehler(); as f) {
  <p class="text-[11px] text-rose-400">{{ f }}</p>
  }

  <button
    type="button"
    (click)="exportiere()"
    [disabled]="laeuft() || gewaehlteProfile().length === 0"
    class="linear-btn-primary px-4 py-2 rounded-xl text-xs font-bold cursor-pointer disabled:opacity-40"
  >
    {{ laeuft() ? 'Erzeuge Bilder...' : 'Bilder exportieren' }}
  </button>
</div>
}
```

- [ ] **Step 4: Verify in the browser**

```bash
npm start
```

1. Drei Fotos laden, eBay und Vinted wählen.
2. Beim ersten Bild steht **HAUPTBILD**.
3. Exportieren: Es lädt `flipbase-bilder.zip` herunter.
4. **Das Archiv öffnen und nachmessen:** Ordner `eBay` und `Vinted`, darin `01-main.jpg`, `02.jpg`, `03.jpg`. Die eBay-Dateien müssen **1600 × 1600** sein, die Vinted-Dateien **1200 × 1800**. Stimmen die Maße nicht, stimmt die Ableitung nicht.
5. Ein sehr kleines Bild laden (unter 800 px): Die Warnung zum Vergrößerungsfaktor erscheint.
6. Ein Bild entfernen: Es verschwindet, das Hauptbild rückt nach.
7. Ein Bild mit den Pfeilen nach vorne schieben: Die Markierung **HAUPTBILD** wandert mit, und im nächsten Export heisst genau dieses Bild `01-main.jpg`.

- [ ] **Step 5: Run checks and commit**

Run: `npm run test && npm run lint && npm run typecheck && npm run build`

```bash
git add src/app/features/image-optimizer/
git commit -m "feat(tools): export every selected platform format as one archive"
```

---

## Reihenfolge und Abhängigkeiten

```
Task 1 (Profile)
   └─> Task 2 (Rechenfunktionen)
          ├─> Task 3 (Bildexport)
          │      └─> Task 4 (ZIP)
          └─> Task 5 (Seite, Route, Navigation)
                 └─> Task 6 (Zuschnitt-Editor)
                        └─> Task 7 (Vorschau)
                               └─> Task 8 (Export, Warnungen, Hauptbild)
```

Nach Task 5 ist die Seite erreichbar, nach Task 7 vollständig bedienbar ohne
Export, nach Task 8 fertig.

## Was dieser Plan bewusst nicht enthält

- KI, Objekterkennung, Hintergrundentfernung.
- Anbindung an Artikel oder Supabase-Speicher.
- Helligkeit, Kontrast, Filter.
- Eigener Zuschnitt je Plattform – der Aufbau lässt ihn später zu, ohne
  umgebaut zu werden.
- „Einstellungen auf alle Bilder anwenden" – sinnvoll, sobald mehrere Fotos
  unter gleichen Bedingungen entstehen, aber nicht nötig, um das Werkzeug
  brauchbar zu machen.
- Ein Übersetzungsschlüssel `NAV.IMAGE_OPTIMIZER` wird gesetzt; fehlt er in den
  Sprachdateien, greift das vorhandene `label` als Rückfall. Das entspricht dem
  Verhalten der übrigen Einträge.
