# Bildoptimierer 2 – Export als Ordner und erhaltenes Aufnahmedatum

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Der Export schreibt die Bilder als echte Ordner auf die Platte statt in ein ZIP, überschreibt dabei nie etwas, und die fertigen JPEG-Dateien tragen wieder das Aufnahmedatum.

**Architecture:** Zwei neue, voneinander unabhängige reine Bausteine — ein Schreiber für ein minimales EXIF-Segment (`exif-writer.ts`, arbeitet nur auf `Uint8Array`) und die Namenssuche für einen freien Zielordner (`free-folder-name.ts`, arbeitet gegen die Verzeichnis-Schnittstelle). Darum herum ein Dienst, der schreibt (`directory-export.service.ts`), und die Smart Component, die zwischen Ordner und ZIP wählt. `zip-export.service.ts` bleibt unverändert als Rückfall.

**Tech Stack:** Angular 22 (Signals, OnPush), TypeScript strict, File System Access API, Vitest (`node` für reine Funktionen, `dom` für alles mit `Blob`).

**Spezifikation:** `docs/superpowers/specs/2026-09-10-bildoptimierer-arbeitsflaeche-design.md`, Teil 4 (Abschnitt „Datum erhalten") und Teil 5.

**Voraussetzung:** Plan 1 ist gemergt. Dieser Plan setzt `effectiveBaseName()` und `exportFileName()` ohne `-main` voraus.

## Global Constraints

- **Arbeitsbaum:** `.worktrees/image-optimizer-workspace`. Nach dem Merge von Plan 1 dort `git fetch origin && git reset --hard origin/master` und einen neuen Zweig `feat/image-optimizer-export` anlegen. Der Hauptarbeitsbaum gehört anderen Sitzungen.
- **`npm ci` muss im Arbeitsbaum gelaufen sein** — ein frischer Worktree hat kein `node_modules`.
- **Bezeichner im Code englisch**, Kommentare und Oberflächentexte deutsch.
- **Commit-Nachrichten englisch**, Conventional Commits v1.0.0, Scope `image-opt`. Titel im Imperativ, kein Punkt am Ende. **Keine KI-Signatur, keine `Co-Authored-By`-Zeile.**
- **Node-Tests (`*.spec.ts`) dürfen `File`, `Blob`, `window`, `document`, `Image`, `ImageData`, `localStorage`, `navigator`, `HTMLCanvasElement`, `TestBed` nicht benutzen** — `npm run test:audit` bricht sonst ab. Deshalb arbeitet `exif-writer` auf `Uint8Array` und nicht auf `Blob`.
- **Geschrieben wird ausschließlich Aufnahme- und Erstelldatum.** Nie Hersteller, Modell, Software, Urheber, GPS oder XMP. Das ist die Grenze der in der Spezifikation eingeschränkt aufgehobenen Entscheidung aus Paket 2.
- **Das EXIF-Segment wird als letzter Schritt gesetzt**, nach der Größenkomprimierung. Davor gesetzt wirft `browser-image-compression` es weg.
- **Es wird nie eine vorhandene Datei überschrieben.**

## File Structure

| Datei                                                                            | Verantwortung                                                                         |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `src/app/features/image-optimizer/services/capture-date.ts`                      | Aufnahmedatum aus den rohen exifr-Werten lesen und ins EXIF-Textformat bringen. Rein. |
| `src/app/features/image-optimizer/services/capture-date.spec.ts`                 | Node-Tests dazu. Neu.                                                                 |
| `src/app/features/image-optimizer/services/exif-writer.ts`                       | Minimales EXIF-APP1-Segment bauen und in ein JPEG einsetzen. Nur `Uint8Array`. Neu.   |
| `src/app/features/image-optimizer/services/exif-writer.spec.ts`                  | Node-Tests dazu. Neu.                                                                 |
| `src/app/features/image-optimizer/models/image-metadata.ts`                      | Feld `capturedAt` am Metadatenmodell.                                                 |
| `src/app/features/image-optimizer/services/metadata-reader.service.ts`           | Füllt `capturedAt`.                                                                   |
| `src/app/features/image-optimizer/services/image-export.service.ts`              | Setzt das Segment als letzten Schritt.                                                |
| `src/app/features/image-optimizer/services/free-folder-name.ts`                  | Ersten freien Ordnernamen finden. Rein, gegen die Verzeichnis-Schnittstelle. Neu.     |
| `src/app/features/image-optimizer/services/free-folder-name.spec.ts`             | Node-Tests dazu. Neu.                                                                 |
| `src/app/features/image-optimizer/services/directory-export.service.ts`          | Ordner erfragen und hineinschreiben, mit Fortschritt. Neu.                            |
| `src/app/features/image-optimizer/services/directory-export.dom.spec.ts`         | DOM-Tests dazu. Neu.                                                                  |
| `src/app/features/image-optimizer/components/export-bar/export-bar.component.ts` | Fortschrittsfall in `ExportStatus`.                                                   |
| `src/app/features/image-optimizer/image-optimizer.component.ts`                  | Wählt Ordner oder ZIP, meldet Fortschritt.                                            |

---

### Task 1: Aufnahmedatum lesen und ins EXIF-Format bringen

**Files:**

- Create: `src/app/features/image-optimizer/services/capture-date.ts`
- Create: `src/app/features/image-optimizer/services/capture-date.spec.ts`

**Interfaces:**

- Consumes: nichts.
- Produces:
  - `readCapturedAt(raw: Record<string, unknown>): Date | null`
  - `toExifDateTime(value: Date): string`

- [ ] **Step 1: Write the failing tests**

Neue Datei `src/app/features/image-optimizer/services/capture-date.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readCapturedAt, toExifDateTime } from './capture-date';

describe('Aufnahmedatum aus den rohen Werten lesen', () => {
  const taken = new Date(2026, 4, 17, 9, 5, 3);

  it('nimmt das Aufnahmedatum, wenn es da ist', () => {
    expect(readCapturedAt({ DateTimeOriginal: taken })).toEqual(taken);
  });

  it('weicht auf das Erstelldatum aus', () => {
    expect(readCapturedAt({ CreateDate: taken })).toEqual(taken);
  });

  it('weicht zuletzt auf DateCreated aus', () => {
    expect(readCapturedAt({ DateCreated: taken })).toEqual(taken);
  });

  it('bevorzugt das Aufnahmedatum vor dem Erstelldatum', () => {
    // Das Aufnahmedatum sagt, wann fotografiert wurde. Das Erstelldatum kann
    // von einer spaeteren Bearbeitung stammen.
    const created = new Date(2026, 6, 1, 12, 0, 0);

    expect(readCapturedAt({ DateTimeOriginal: taken, CreateDate: created })).toEqual(taken);
  });

  it('liefert null, wenn kein Datum da ist', () => {
    expect(readCapturedAt({})).toBeNull();
  });

  it('liefert null bei einem ungueltigen Datum', () => {
    // exifr reicht kaputte Zeitangaben als Invalid Date durch. Ein solcher
    // Wert darf nicht als Datum in die Exportdatei wandern.
    expect(readCapturedAt({ DateTimeOriginal: new Date('kaputt') })).toBeNull();
  });

  it('liefert null bei einem Wert, der kein Datum ist', () => {
    expect(readCapturedAt({ DateTimeOriginal: '2026:05:17 09:05:03' })).toBeNull();
  });
});

describe('EXIF-Textformat', () => {
  it('schreibt Datum und Uhrzeit im festgelegten Aufbau', () => {
    expect(toExifDateTime(new Date(2026, 4, 17, 9, 5, 3))).toBe('2026:05:17 09:05:03');
  });

  it('fuellt einstellige Werte auf', () => {
    expect(toExifDateTime(new Date(2026, 0, 2, 3, 4, 5))).toBe('2026:01:02 03:04:05');
  });

  it('ist immer genau 19 Zeichen lang', () => {
    // Die Feldlaenge im EXIF-Block ist fest auf 20 Byte gesetzt - 19 Zeichen
    // plus Abschluss-Null. Eine andere Laenge zerstoert den Aufbau.
    expect(toExifDateTime(new Date(2026, 11, 31, 23, 59, 59))).toHaveLength(19);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run --project=node src/app/features/image-optimizer/services/capture-date.spec.ts
```

Erwartet: FAIL — die Datei `./capture-date` gibt es nicht.

- [ ] **Step 3: Write the implementation**

Neue Datei `src/app/features/image-optimizer/services/capture-date.ts`:

```ts
/**
 * Das Aufnahmedatum einer Datei - das einzige Metadatum, das den Export
 * ueberlebt.
 *
 * Warum es ueberhaupt erhalten bleibt: Die Exportdateien landen nicht nur bei
 * der Plattform, sondern auch im eigenen Archiv des Verkaeufers, und dort
 * soll sich nach Aufnahmedatum sortieren lassen. Alles andere - Geraet, Ort,
 * Urheber, Software, Herkunftsnachweis - wird weiterhin entfernt.
 */

/** Reihenfolge der Herkunft: Aufnahme vor Erstellung. */
const KEYS: readonly string[] = ['DateTimeOriginal', 'CreateDate', 'DateCreated'];

/**
 * Liest das Aufnahmedatum aus der rohen Ausgabe von `exifr`.
 *
 * `exifr` reicht kaputte Zeitangaben als `Invalid Date` durch. Ein solcher
 * Wert wird zu `null` - lieber gar kein Datum in der Exportdatei als ein
 * falsches.
 */
export function readCapturedAt(raw: Record<string, unknown>): Date | null {
  for (const key of KEYS) {
    const value = raw[key];
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  }

  return null;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/**
 * Das von EXIF vorgeschriebene Textformat `YYYY:MM:DD HH:MM:SS`, in Ortszeit.
 *
 * Genau 19 Zeichen - die Feldlaenge im Block ist fest auf 20 Byte gesetzt
 * (19 Zeichen plus Abschluss-Null). Eine abweichende Laenge zerstoert den
 * Aufbau des Segments.
 */
export function toExifDateTime(value: Date): string {
  const date = [value.getFullYear(), pad(value.getMonth() + 1), pad(value.getDate())].join(':');
  const time = [pad(value.getHours()), pad(value.getMinutes()), pad(value.getSeconds())].join(':');

  return `${date} ${time}`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run --project=node src/app/features/image-optimizer/services/capture-date.spec.ts
```

Erwartet: PASS, 10 Tests.

- [ ] **Step 5: Commit**

```bash
git add src/app/features/image-optimizer/services/capture-date.ts src/app/features/image-optimizer/services/capture-date.spec.ts
git commit -m "feat(image-opt): read the capture date and format it for EXIF

Kept separate from metadata-fields.ts, which formats values for the screen.
The screen wants a readable German date, EXIF wants exactly 19 characters in
a fixed shape - one function cannot serve both without a flag.

exifr passes malformed timestamps through as Invalid Date. Those become null:
a wrong date written into an export file is worse than no date at all."
```

---

### Task 2: EXIF-Segment bauen und in ein JPEG einsetzen

**Files:**

- Create: `src/app/features/image-optimizer/services/exif-writer.ts`
- Create: `src/app/features/image-optimizer/services/exif-writer.spec.ts`

**Interfaces:**

- Consumes: `toExifDateTime` aus Task 1.
- Produces:
  - `buildDateExif(captured: Date): Uint8Array` — vollständiges APP1-Segment einschließlich `FFE1`, immer 138 Byte
  - `withExif(jpeg: Uint8Array, app1: Uint8Array): Uint8Array`

Der Aufbau liegt fest, damit er prüfbar ist. Alle Angaben relativ zum Beginn
des TIFF-Kopfes:

| Offset | Inhalt                                                                    |
| ------ | ------------------------------------------------------------------------- |
| 0      | `MM` — Bytereihenfolge groß zuerst                                        |
| 2      | `002A` — TIFF-Kennung                                                     |
| 4      | `00000008` — Offset des IFD0                                              |
| 8      | IFD0: Anzahl der Einträge = 2                                             |
| 10     | Eintrag `DateTime` (0x0132), Typ ASCII, 20 Zeichen, Wert bei 38           |
| 22     | Eintrag `ExifIFDPointer` (0x8769), Typ LONG, 1, Wert 58                   |
| 34     | `00000000` — kein weiteres IFD                                            |
| 38     | Text `DateTime`, 20 Byte                                                  |
| 58     | Exif-IFD: Anzahl der Einträge = 2                                         |
| 60     | Eintrag `DateTimeOriginal` (0x9003), Typ ASCII, 20 Zeichen, Wert bei 88   |
| 72     | Eintrag `DateTimeDigitized` (0x9004), Typ ASCII, 20 Zeichen, Wert bei 108 |
| 84     | `00000000`                                                                |
| 88     | Text `DateTimeOriginal`, 20 Byte                                          |
| 108    | Text `DateTimeDigitized`, 20 Byte                                         |

TIFF-Block also 128 Byte. Segment: `FFE1` (2) + Längenfeld (2) + `Exif\0\0` (6) + 128 = **138 Byte**, Längenfeld = 136.

- [ ] **Step 1: Write the failing tests**

Neue Datei `src/app/features/image-optimizer/services/exif-writer.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildDateExif, withExif } from './exif-writer';

const taken = new Date(2026, 4, 17, 9, 5, 3);

/** Liest einen ASCII-Text fester Laenge, ohne die Abschluss-Null. */
function textAt(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + length - 1));
}

/** Ein winziges, aber gueltiges JPEG-Geruest: SOI, ein APP0, SOS, EOI. */
function minimalJpeg(): Uint8Array {
  return new Uint8Array([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xda, 0x00, 0x02, 0x11, 0x22, 0xff, 0xd9,
  ]);
}

describe('EXIF-Segment bauen', () => {
  it('faengt mit dem APP1-Kennzeichen an', () => {
    const app1 = buildDateExif(taken);

    expect(app1[0]).toBe(0xff);
    expect(app1[1]).toBe(0xe1);
  });

  it('ist genau 138 Byte lang', () => {
    expect(buildDateExif(taken)).toHaveLength(138);
  });

  it('traegt die Laenge ohne das Kennzeichen ein', () => {
    // Das Laengenfeld zaehlt sich selbst mit, aber nicht die zwei Bytes
    // FFE1 davor. 136 = 2 + 6 + 128.
    const app1 = buildDateExif(taken);

    expect((app1[2] << 8) | app1[3]).toBe(136);
  });

  it('traegt die Exif-Kennung ein', () => {
    const app1 = buildDateExif(taken);

    expect(textAt(app1, 4, 5)).toBe('Exif');
    expect(app1[8]).toBe(0);
    expect(app1[9]).toBe(0);
  });

  it('schreibt den TIFF-Kopf gross zuerst', () => {
    const tiff = buildDateExif(taken).subarray(10);

    expect(textAt(tiff, 0, 3)).toBe('MM');
    expect((tiff[2] << 8) | tiff[3]).toBe(0x002a);
  });

  it('schreibt das Aufnahmedatum an die festgelegte Stelle', () => {
    const tiff = buildDateExif(taken).subarray(10);

    expect(textAt(tiff, 88, 20)).toBe('2026:05:17 09:05:03');
  });

  it('schreibt dasselbe Datum in alle drei Felder', () => {
    const tiff = buildDateExif(taken).subarray(10);

    expect(textAt(tiff, 38, 20)).toBe('2026:05:17 09:05:03');
    expect(textAt(tiff, 108, 20)).toBe('2026:05:17 09:05:03');
  });

  it('traegt genau zwei Eintraege je Verzeichnis ein', () => {
    const tiff = buildDateExif(taken).subarray(10);

    expect((tiff[8] << 8) | tiff[9]).toBe(2);
    expect((tiff[58] << 8) | tiff[59]).toBe(2);
  });

  it('enthaelt keine Angabe zu Geraet, Software oder Ort', () => {
    // Die Grenze der Entscheidung: nur Datum, sonst nichts. Die Tags
    // Make (0x010F), Model (0x0110), Software (0x0131) und der
    // GPS-Zeiger (0x8825) duerfen nirgends vorkommen.
    const tiff = buildDateExif(taken).subarray(10);
    const tags: number[] = [];
    for (const start of [10, 60]) {
      for (let i = 0; i < 2; i++) {
        const at = start + i * 12;
        tags.push((tiff[at] << 8) | tiff[at + 1]);
      }
    }

    expect(tags).toEqual([0x0132, 0x8769, 0x9003, 0x9004]);
  });
});

describe('Segment in ein JPEG einsetzen', () => {
  it('setzt es unmittelbar hinter den Dateianfang', () => {
    const result = withExif(minimalJpeg(), buildDateExif(taken));

    expect(result[0]).toBe(0xff);
    expect(result[1]).toBe(0xd8);
    expect(result[2]).toBe(0xff);
    expect(result[3]).toBe(0xe1);
  });

  it('laesst die Bilddaten unveraendert', () => {
    const jpeg = minimalJpeg();
    const result = withExif(jpeg, buildDateExif(taken));

    // Der Bilddatenstrom ab SOS steht am Ende weiterhin unveraendert.
    expect(Array.from(result.subarray(result.length - 6))).toEqual([
      0xff, 0xda, 0x00, 0x02, 0x11, 0x22,
    ]);
    expect(result).toHaveLength(jpeg.length + 138 - 2);
  });

  it('behaelt andere Segmente', () => {
    const result = withExif(minimalJpeg(), buildDateExif(taken));

    // Das APP0 aus der Vorlage muss hinter unserem APP1 wieder auftauchen.
    expect(result[140]).toBe(0xff);
    expect(result[141]).toBe(0xe0);
  });

  it('ersetzt ein bereits vorhandenes EXIF-Segment, statt zwei zu erzeugen', () => {
    // Zwei EXIF-Segmente in einer Datei sind laut Spezifikation unzulaessig;
    // Leseprogramme nehmen dann willkuerlich eines davon.
    const once = withExif(minimalJpeg(), buildDateExif(taken));
    const twice = withExif(once, buildDateExif(taken));

    expect(twice).toHaveLength(once.length);
  });

  it('laesst etwas, das kein JPEG ist, unangetastet', () => {
    // Lieber gar kein Datum als eine zerstoerte Datei.
    const notJpeg = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

    expect(withExif(notJpeg, buildDateExif(taken))).toBe(notJpeg);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run --project=node src/app/features/image-optimizer/services/exif-writer.spec.ts
```

Erwartet: FAIL — die Datei `./exif-writer` gibt es nicht.

- [ ] **Step 3: Write the implementation**

Neue Datei `src/app/features/image-optimizer/services/exif-writer.ts`:

```ts
import { toExifDateTime } from './capture-date';

/**
 * Schreibt ein minimales EXIF-Segment mit dem Aufnahmedatum in eine
 * JPEG-Datei.
 *
 * Warum von Hand und nicht mit einer Bibliothek: Gebraucht werden drei feste
 * Tags mit festem Aufbau. `piexifjs` und Verwandte bringen einen
 * vollstaendigen Leser und Schreiber fuer alles mit, wovon hier nichts
 * benutzt wird, und wuerden den nachgeladenen Teil des Bildoptimierers ohne
 * Gegenwert vergroessern. Dasselbe Vorgehen wie bei `webp-metadata.ts` und
 * `c2pa-detection.ts`.
 *
 * Absichtlich **nur** `Uint8Array` in und aus: So laeuft der ganze Baustein
 * ohne Browser und wird als reiner Node-Test geprueft.
 */

const ASCII = 2;
const LONG = 4;

/** 19 Zeichen plus Abschluss-Null. Die Laenge ist in EXIF festgelegt. */
const DATE_BYTES = 20;

const TAG_DATE_TIME = 0x0132;
const TAG_EXIF_POINTER = 0x8769;
const TAG_DATE_TIME_ORIGINAL = 0x9003;
const TAG_DATE_TIME_DIGITIZED = 0x9004;

/** Offsets im TIFF-Block. Siehe Tabelle im Plan. */
const IFD0_AT = 8;
const DATE_TIME_AT = 38;
const EXIF_IFD_AT = 58;
const ORIGINAL_AT = 88;
const DIGITIZED_AT = 108;
const TIFF_BYTES = 128;

class Writer {
  readonly bytes: Uint8Array;
  private readonly view: DataView;

  constructor(length: number) {
    this.bytes = new Uint8Array(length);
    this.view = new DataView(this.bytes.buffer);
  }

  u16(offset: number, value: number): void {
    this.view.setUint16(offset, value, false);
  }

  u32(offset: number, value: number): void {
    this.view.setUint32(offset, value, false);
  }

  ascii(offset: number, value: string): void {
    for (let i = 0; i < value.length; i++) {
      this.bytes[offset + i] = value.charCodeAt(i) & 0x7f;
    }
    // Der Rest bleibt null - das ist zugleich der Abschluss.
  }

  /** Ein Verzeichniseintrag: Tag, Typ, Anzahl, Wert oder Wertoffset. */
  entry(offset: number, tag: number, type: number, count: number, value: number): void {
    this.u16(offset, tag);
    this.u16(offset + 2, type);
    this.u32(offset + 4, count);
    this.u32(offset + 8, value);
  }
}

/** Das vollstaendige APP1-Segment einschliesslich Kennzeichen. Immer 138 Byte. */
export function buildDateExif(captured: Date): Uint8Array {
  const stamp = toExifDateTime(captured);
  const tiff = new Writer(TIFF_BYTES);

  tiff.ascii(0, 'MM');
  tiff.u16(2, 0x002a);
  tiff.u32(4, IFD0_AT);

  tiff.u16(IFD0_AT, 2);
  tiff.entry(IFD0_AT + 2, TAG_DATE_TIME, ASCII, DATE_BYTES, DATE_TIME_AT);
  tiff.entry(IFD0_AT + 14, TAG_EXIF_POINTER, LONG, 1, EXIF_IFD_AT);
  tiff.u32(IFD0_AT + 26, 0);
  tiff.ascii(DATE_TIME_AT, stamp);

  tiff.u16(EXIF_IFD_AT, 2);
  tiff.entry(EXIF_IFD_AT + 2, TAG_DATE_TIME_ORIGINAL, ASCII, DATE_BYTES, ORIGINAL_AT);
  tiff.entry(EXIF_IFD_AT + 14, TAG_DATE_TIME_DIGITIZED, ASCII, DATE_BYTES, DIGITIZED_AT);
  tiff.u32(EXIF_IFD_AT + 26, 0);
  tiff.ascii(ORIGINAL_AT, stamp);
  tiff.ascii(DIGITIZED_AT, stamp);

  // FFE1 + Laengenfeld + "Exif\0\0" + TIFF-Block.
  const segment = new Writer(2 + 2 + 6 + TIFF_BYTES);
  segment.u16(0, 0xffe1);
  // Das Laengenfeld zaehlt sich selbst mit, das Kennzeichen davor nicht.
  segment.u16(2, 2 + 6 + TIFF_BYTES);
  segment.ascii(4, 'Exif');
  segment.bytes.set(tiff.bytes, 10);

  return segment.bytes;
}

/** Ob an dieser Stelle ein APP1-Segment mit Exif-Kennung beginnt. */
function isExifSegment(jpeg: Uint8Array, offset: number): boolean {
  return (
    jpeg[offset + 4] === 0x45 && // E
    jpeg[offset + 5] === 0x78 && // x
    jpeg[offset + 6] === 0x69 && // i
    jpeg[offset + 7] === 0x66 && // f
    jpeg[offset + 8] === 0x00
  );
}

/**
 * Setzt das Segment direkt hinter den Dateianfang und entfernt dabei ein
 * bereits vorhandenes EXIF-Segment.
 *
 * Zwei EXIF-Segmente in einer Datei sind unzulaessig; Leseprogramme nehmen
 * dann willkuerlich eines davon. Der Rueckgabewert ist deshalb nie laenger
 * als noetig.
 *
 * Ist die Eingabe kein JPEG, kommt sie unveraendert zurueck. Lieber gar kein
 * Datum als eine zerstoerte Datei.
 */
export function withExif(jpeg: Uint8Array, app1: Uint8Array): Uint8Array {
  if (jpeg.length < 2 || jpeg[0] !== 0xff || jpeg[1] !== 0xd8) return jpeg;

  const keep: Array<readonly [number, number]> = [];
  let offset = 2;

  // Die Segmente vor dem Bilddatenstrom durchgehen. Ab SOS (FFDA) stehen
  // Bilddaten, in denen FF kein Kennzeichen mehr ist - dort wird abgebrochen
  // und der Rest unveraendert uebernommen.
  while (offset + 4 <= jpeg.length && jpeg[offset] === 0xff) {
    const marker = jpeg[offset + 1];
    if (marker === 0xda || marker === 0xd9) break;

    const length = (jpeg[offset + 2] << 8) | jpeg[offset + 3];
    if (length < 2) break;
    const end = offset + 2 + length;
    if (end > jpeg.length) break;

    if (!(marker === 0xe1 && isExifSegment(jpeg, offset))) {
      keep.push([offset, end] as const);
    }
    offset = end;
  }

  const kept = keep.reduce((sum, [from, to]) => sum + (to - from), 0);
  const result = new Uint8Array(2 + app1.length + kept + (jpeg.length - offset));

  let at = 0;
  result.set(jpeg.subarray(0, 2), at);
  at += 2;
  result.set(app1, at);
  at += app1.length;
  for (const [from, to] of keep) {
    result.set(jpeg.subarray(from, to), at);
    at += to - from;
  }
  result.set(jpeg.subarray(offset), at);

  return result;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run --project=node src/app/features/image-optimizer/services/exif-writer.spec.ts
```

Erwartet: PASS, 15 Tests.

- [ ] **Step 5: Gegenprobe mit einem unabhängigen Leser**

Der eigene Aufbau nützt nichts, wenn ihn fremde Software nicht versteht.
`exifr` liegt bereits als Abhängigkeit vor und ist ein unabhängiger Zeuge.
Als zusätzlicher Test in `exif-writer.spec.ts` anhängen:

```ts
it('wird von exifr wieder als Aufnahmedatum gelesen', async () => {
  // Gegenprobe mit einem unabhaengigen Leser: Der eigene Aufbau nuetzt
  // nichts, wenn ihn niemand sonst versteht.
  const exifr = (await import('exifr')).default;
  const jpeg = withExif(minimalJpeg(), buildDateExif(taken));

  const parsed = await exifr.parse(jpeg, { tiff: true, exif: true });

  expect(parsed.DateTimeOriginal.getFullYear()).toBe(2026);
  expect(parsed.DateTimeOriginal.getMonth()).toBe(4);
  expect(parsed.DateTimeOriginal.getDate()).toBe(17);
});
```

Läuft `exifr` im Node-Projekt nicht (es greift auf Browserdinge zu), wandert
**nur dieser eine Test** in eine neue Datei `exif-writer.dom.spec.ts` mit
denselben Hilfsfunktionen; die übrigen bleiben, wo sie sind.

```bash
npx vitest run --project=node src/app/features/image-optimizer/services/exif-writer.spec.ts
```

Erwartet: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/features/image-optimizer/services/exif-writer.ts src/app/features/image-optimizer/services/exif-writer.spec.ts
git commit -m "feat(image-opt): write a minimal EXIF date segment into a JPEG

Three fixed tags with a fixed layout do not justify piexifjs, which ships a
full reader and writer for everything we deliberately refuse to write and
would grow the lazily loaded chunk for nothing. Same approach as
webp-metadata.ts and c2pa-detection.ts.

withExif drops an existing EXIF segment instead of prepending a second one -
two are illegal and readers then pick one at random. Input that is not a JPEG
comes back untouched: no date beats a corrupted file.

Uint8Array in and out, so the whole thing is a plain node test. A separate
test parses the result back with exifr, because a layout only we understand
would be useless."
```

---

### Task 3: `capturedAt` am Modell und im Leser

**Files:**

- Modify: `src/app/features/image-optimizer/models/image-metadata.ts`
- Modify: `src/app/features/image-optimizer/services/metadata-reader.service.ts`
- Test: `src/app/features/image-optimizer/services/metadata-reader.service.dom.spec.ts`

**Interfaces:**

- Consumes: `readCapturedAt` aus Task 1.
- Produces: `ImageMetadata.capturedAt: Date | null`, in `pendingMetadata()` mit `null` vorbelegt.

- [ ] **Step 1: Write the failing test**

An `src/app/features/image-optimizer/services/metadata-reader.service.dom.spec.ts` anhängen. Die Datei hat bereits Hilfsmittel, um eine Datei mit EXIF nachzubauen — diese werden benutzt. Fehlen sie, wird das Segment aus Task 2 verwendet:

```ts
it('liest das Aufnahmedatum als rohen Wert mit', async () => {
  // Roh, nicht als formatierter Text: Der Exportweg braucht ein echtes
  // Date, und aus "17.05.2026, 09:05:03" liesse es sich nur raten.
  const jpeg = withExif(minimalJpeg(), buildDateExif(new Date(2026, 4, 17, 9, 5, 3)));
  const file = new File([jpeg], 'foto.jpg', { type: 'image/jpeg' });

  const metadata = await new MetadataReaderService().read(file);

  expect(metadata.capturedAt?.getFullYear()).toBe(2026);
});

it('liefert ohne Datum in der Datei null', async () => {
  const file = new File([minimalJpeg()], 'foto.jpg', { type: 'image/jpeg' });

  const metadata = await new MetadataReaderService().read(file);

  expect(metadata.capturedAt).toBeNull();
});
```

Dafür importiert die Testdatei:

```ts
import { buildDateExif, withExif } from './exif-writer';
```

und bringt dieselbe `minimalJpeg()`-Hilfsfunktion mit wie in Task 2.

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run --project=dom src/app/features/image-optimizer/services/metadata-reader.service.dom.spec.ts
```

Erwartet: FAIL — `capturedAt` gibt es am Typ `ImageMetadata` nicht.

- [ ] **Step 3: Write the implementation**

In `src/app/features/image-optimizer/models/image-metadata.ts` das Feld an `ImageMetadata` anhängen:

```ts
  /**
   * Aufnahmedatum aus der Datei, **roh**. Null, wenn keines darin steht.
   *
   * Bewusst neben `fields`: Dort stehen fertig formatierte Texte fuer die
   * Anzeige. Der Export braucht ein echtes `Date`, und aus
   * "17.05.2026, 09:05:03" liesse es sich nur zurueckraten.
   *
   * Das einzige Metadatum, das die Exportdatei erreicht - siehe
   * `capture-date.ts`.
   */
  readonly capturedAt: Date | null;
```

In `pendingMetadata()` ergänzen:

```ts
    capturedAt: null,
```

In `src/app/features/image-optimizer/services/metadata-reader.service.ts` den Import ergänzen:

```ts
import { readCapturedAt } from './capture-date';
```

und in **beiden** `return`-Zweigen mit `status: 'read'` — dem WebP-Zweig und dem allgemeinen — jeweils ergänzen:

```ts
        capturedAt: readCapturedAt(raw),
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run --project=dom src/app/features/image-optimizer/services/metadata-reader.service.dom.spec.ts
npm run typecheck
```

Erwartet: PASS und Exitcode 0. Meldet `tsc` fehlende `capturedAt`-Felder an anderen Stellen, werden dort `capturedAt: null` ergänzt — jedes selbst gebaute `ImageMetadata`-Objekt in Tests braucht es.

- [ ] **Step 5: Commit**

```bash
git add src/app/features/image-optimizer/models/image-metadata.ts src/app/features/image-optimizer/services/metadata-reader.service.ts src/app/features/image-optimizer/services/metadata-reader.service.dom.spec.ts
git commit -m "feat(image-opt): carry the raw capture date on the metadata model

fields holds strings formatted for the screen. The export path needs a real
Date, and guessing one back out of \"17.05.2026, 09:05:03\" would be a parser
nobody wants to own. Both read paths fill it, including the WebP branch."
```

---

### Task 4: Datum in die fertige Exportdatei schreiben

**Files:**

- Modify: `src/app/features/image-optimizer/services/image-export.service.ts`
- Create: `src/app/features/image-optimizer/services/image-export.service.dom.spec.ts`
- Modify: `src/app/features/image-optimizer/image-optimizer.component.ts`
- Modify: `src/app/features/image-optimizer/components/metadata-panel/metadata-panel.component.html`

**Interfaces:**

- Consumes: `buildDateExif`, `withExif` aus Task 2; `ImageMetadata.capturedAt` aus Task 3.
- Produces: `ImageExportService.create(image, crop, platform, look, capturedAt)` — **fünfter Parameter neu**, `Date | null`.

**Die Reihenfolge ist der Kern dieser Aufgabe.** Übersteigt die gerenderte
Datei `maxFileSizeMB`, kodiert `browser-image-compression` sie ein zweites Mal
neu und wirft jedes Segment weg. Das EXIF muss danach kommen.

- [ ] **Step 1: Write the failing test**

**Wichtig zur Umgebung:** jsdom hat **keine Zeichenfläche**. `getContext('2d')`
liefert dort `null`, und `toBlob` gibt es gar nicht — `renderImage()` würde also
mit „Der Browser stellt keine Zeichenfläche bereit." abbrechen. Ein Test, der
ein echtes Bild rendert, ist hier nicht möglich (siehe `image-renderer.dom.spec.ts`,
das aus demselben Grund mit einem Attrappen-Kontext arbeitet).

Das trifft sich gut, denn worum es hier geht, ist gar nicht das Rendern,
sondern die **Reihenfolge**: Wird das EXIF-Segment nach dem Verkleinern
gesetzt? Rendern und Verkleinern werden deshalb durch Attrappen ersetzt, die je
eine unterscheidbare Bytefolge liefern. Am Ergebnis lässt sich dann ablesen,
worauf das Segment gesetzt wurde.

Neue Datei `src/app/features/image-optimizer/services/image-export.service.dom.spec.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { platformById, PlatformProfile } from '../models/platform-profile';

/**
 * Zwei unterscheidbare JPEG-Geruesten. Am letzten Byte vor `FFD9` laesst sich
 * ablesen, welches der beiden am Ende in der Datei steht - und damit, ob das
 * EXIF-Segment vor oder nach dem Verkleinern gesetzt wurde.
 */
const RENDERED = new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0x00, 0x02, 0x11, 0xaa, 0xff, 0xd9]);
const COMPRESSED = new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0x00, 0x02, 0x11, 0xbb, 0xff, 0xd9]);

// `planOutput` bleibt echt - es ist eine reine Rechnung und wird gebraucht.
// Nur `renderImage` wird ersetzt, weil es eine Zeichenflaeche braucht.
vi.mock('./image-renderer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./image-renderer')>();
  return {
    ...actual,
    renderImage: vi.fn(async () => new Blob([RENDERED], { type: 'image/jpeg' })),
  };
});

vi.mock('browser-image-compression', () => ({
  default: vi.fn(async () => new Blob([COMPRESSED], { type: 'image/jpeg' })),
}));

const { ImageExportService } = await import('./image-export.service');
const { NEUTRAL_LOOK } = await import('./image-renderer');

/** Die Bildquelle wird nie benutzt, weil `renderImage` ersetzt ist. */
const source = {} as HTMLImageElement;
const crop = { x: 0, y: 0, width: 800, height: 800 };
const taken = new Date(2026, 4, 17, 9, 5, 3);

async function bytes(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer());
}

/** Ob unmittelbar hinter dem Dateianfang ein APP1-Segment steht. */
function hasExif(data: Uint8Array): boolean {
  return data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff && data[3] === 0xe1;
}

/** Das Kennbyte aus dem Bilddatenstrom: 0xaa = gerendert, 0xbb = verkleinert. */
function marker(data: Uint8Array): number {
  return data[data.length - 3];
}

describe('Plattformfassung erzeugen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('setzt das Aufnahmedatum in die fertige Datei', async () => {
    const result = await new ImageExportService().create(
      source,
      crop,
      platformById('vinted'),
      NEUTRAL_LOOK,
      taken,
    );

    expect(hasExif(await bytes(result))).toBe(true);
  });

  it('laesst die Datei ohne Datum unveraendert', async () => {
    // Es wird nie ein Datum erfunden.
    const result = await new ImageExportService().create(
      source,
      crop,
      platformById('vinted'),
      NEUTRAL_LOOK,
      null,
    );

    expect(await bytes(result)).toEqual(RENDERED);
  });

  it('verkleinert gar nicht erst, wenn die Plattform keine Grenze nennt', async () => {
    // Vinted nennt keine Grenze - dann darf die Komprimierung nicht laufen.
    const compression = (await import('browser-image-compression')).default;

    const result = await new ImageExportService().create(
      source,
      crop,
      platformById('vinted'),
      NEUTRAL_LOOK,
      taken,
    );

    expect(compression).not.toHaveBeenCalled();
    expect(marker(await bytes(result))).toBe(0xaa);
  });

  it('setzt das Segment NACH dem Verkleinern, nicht davor', async () => {
    // Der entscheidende Punkt dieser Aufgabe: browser-image-compression
    // kodiert neu und wuerde ein vorher gesetztes Segment wegwerfen. Das
    // Kennbyte 0xbb beweist, dass die verkleinerte Fassung ausgeliefert wird,
    // und das APP1 davor, dass sie das Datum trotzdem traegt.
    const tiny: PlatformProfile = { ...platformById('ebay'), maxFileSizeMB: 0.000001 };

    const result = await new ImageExportService().create(source, crop, tiny, NEUTRAL_LOOK, taken);
    const data = await bytes(result);

    expect(marker(data)).toBe(0xbb);
    expect(hasExif(data)).toBe(true);
  });
});
```

Die Attrappen stehen vor dem Import des Dienstes und der Dienst wird deshalb
per `await import(...)` geholt: `vi.mock` wird zwar nach oben gezogen, aber ein
gewöhnlicher `import` des Dienstes würde `image-renderer` vor der Attrappe
laden.

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run --project=dom src/app/features/image-optimizer/services/image-export.service.dom.spec.ts
```

Erwartet: FAIL — `create` nimmt noch keinen fünften Parameter, und die erzeugte Datei trägt kein Segment.

- [ ] **Step 3: Write the implementation**

`src/app/features/image-optimizer/services/image-export.service.ts` vollständig ersetzen:

```ts
import { Injectable } from '@angular/core';
import imageCompression from 'browser-image-compression';
import { PlatformProfile, Rect } from '../models/platform-profile';
import { NEUTRAL_LOOK, planOutput, renderImage } from './image-renderer';
import { Look } from './adjustments';
import { buildDateExif, withExif } from './exif-writer';

@Injectable({
  providedIn: 'root',
})
export class ImageExportService {
  /**
   * Erzeugt die Plattformfassung eines Bildes.
   *
   * Es wird ausschliesslich geschnitten und skaliert - nie aufgefuellt. eBay
   * verbietet hinzugefuegte Raender, und ein Rand um ein Produktfoto sieht
   * ohnehin nach Amateur aus.
   *
   * `capturedAt` ist das einzige Metadatum, das die Datei erreicht. Ist es
   * null, bleibt die Datei ohne EXIF - es wird nie ein Datum erfunden.
   */
  async create(
    image: HTMLImageElement,
    crop: Rect,
    platform: PlatformProfile,
    look: Look = NEUTRAL_LOOK,
    capturedAt: Date | null = null,
  ): Promise<Blob> {
    const plan = planOutput(crop, platform);
    const raw = await renderImage(image, plan, 0.92, look);
    const sized = await this.withinLimit(raw, plan, platform);

    return this.withCaptureDate(sized, capturedAt);
  }

  /** Verkleinert nur, wenn die Plattform eine Grenze nennt und sie ueberschritten ist. */
  private async withinLimit(
    raw: Blob,
    plan: { readonly width: number; readonly height: number },
    platform: PlatformProfile,
  ): Promise<Blob> {
    if (platform.maxFileSizeMB === null) return raw;
    if (raw.size <= platform.maxFileSizeMB * 1024 * 1024) return raw;

    return imageCompression(new File([raw], 'export.jpg', { type: 'image/jpeg' }), {
      maxSizeMB: platform.maxFileSizeMB,
      maxWidthOrHeight: Math.max(plan.width, plan.height),
      useWebWorker: true,
    });
  }

  /**
   * Der **letzte** Schritt, und das ist keine Geschmacksfrage: Ueberschreitet
   * eine Datei die Groessengrenze, kodiert `browser-image-compression` sie neu
   * und wirft dabei jedes Segment weg. Vor dem Verkleinern gesetzt waere das
   * Datum in genau den Faellen verschwunden, in denen niemand nachsieht.
   */
  private async withCaptureDate(blob: Blob, capturedAt: Date | null): Promise<Blob> {
    if (!capturedAt) return blob;

    const data = new Uint8Array(await blob.arrayBuffer());

    return new Blob([withExif(data, buildDateExif(capturedAt))], { type: 'image/jpeg' });
  }
}
```

In `src/app/features/image-optimizer/image-optimizer.component.ts` reicht
`exportImages()` das Datum durch:

```ts
            data: await this.imageExport.create(
              element,
              crop,
              p,
              toLook(image.adjustments),
              image.metadata.capturedAt,
            ),
```

In `src/app/features/image-optimizer/components/metadata-panel/metadata-panel.component.html`
wird der Schlusshinweis richtiggestellt. Der Absatz beginnt heute mit „Diese
Angaben werden beim Export entfernt." und behauptet, die Dateien enthielten
weder EXIF noch XMP. Beides stimmt nicht mehr:

```html
<p class="mt-3 border-t border-fb-border pt-3 text-[10px] leading-relaxed text-fb-text-muted">
  <span class="font-semibold text-fb-text-secondary"
    >Beim Export bleibt nur das Aufnahmedatum erhalten.</span
  >
  Standort, Kamera und Gerät, Urheber, Software und Herkunftsnachweis werden entfernt. Das Datum
  bleibt, damit sich die Dateien in deinem eigenen Archiv nach Aufnahmezeit sortieren lassen. @if
  (hasAiSignal()) { Unsichtbare Wasserzeichen im Bild selbst bleiben erhalten – sie lassen sich
  durch Zuschneiden oder Neuspeichern nicht entfernen. }
</p>
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run --project=dom src/app/features/image-optimizer/services/image-export.service.dom.spec.ts
npx vitest run src/app/features/image-optimizer/
npm run typecheck
```

Erwartet: alle PASS, Typprüfung Exitcode 0.

- [ ] **Step 5: Commit**

```bash
git add src/app/features/image-optimizer/services/image-export.service.ts src/app/features/image-optimizer/services/image-export.service.dom.spec.ts src/app/features/image-optimizer/image-optimizer.component.ts src/app/features/image-optimizer/components/metadata-panel/metadata-panel.component.html
git commit -m "feat(image-opt): keep the capture date in the exported file

Order matters and is not a matter of taste: when a file exceeds the platform
size limit, browser-image-compression re-encodes it and drops every segment.
Setting EXIF before that step would have lost the date in exactly the cases
nobody checks - the large files. A test pins the order using a profile with an
absurdly small limit.

The metadata panel claimed the exports carry neither EXIF nor XMP. That is no
longer true, and a privacy promise that has quietly stopped holding is worse
than none, so the wording now names what stays and what goes."
```

---

### Task 5: Ersten freien Ordnernamen finden

**Files:**

- Create: `src/app/features/image-optimizer/services/free-folder-name.ts`
- Create: `src/app/features/image-optimizer/services/free-folder-name.spec.ts`

**Interfaces:**

- Consumes: nichts.
- Produces:
  - `interface DirectoryLookup { getDirectoryHandle(name: string): Promise<unknown> }`
  - `freeFolderName(parent: DirectoryLookup, wanted: string): Promise<string>`

Die eigene schmale Schnittstelle statt `FileSystemDirectoryHandle` hat einen
Grund: Sie lässt sich im Node-Test mit einem einfachen Objekt nachbauen, und
`FileSystemDirectoryHandle` ist ein Browsertyp.

- [ ] **Step 1: Write the failing tests**

Neue Datei `src/app/features/image-optimizer/services/free-folder-name.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { freeFolderName, DirectoryLookup } from './free-folder-name';

/**
 * Baut ein Verzeichnis nach, in dem die genannten Namen belegt sind. Die
 * echte Schnittstelle wirft `NotFoundError`, wenn es den Ordner nicht gibt.
 */
function directory(taken: readonly string[]): DirectoryLookup {
  return {
    getDirectoryHandle(name: string): Promise<unknown> {
      if (taken.includes(name)) return Promise.resolve({});
      const error = new Error('not found');
      error.name = 'NotFoundError';
      return Promise.reject(error);
    },
  };
}

describe('Ersten freien Ordnernamen finden', () => {
  it('nimmt den Wunschnamen, wenn er frei ist', async () => {
    expect(await freeFolderName(directory([]), 'macbook-air')).toBe('macbook-air');
  });

  it('zaehlt bei belegtem Namen ab zwei', async () => {
    // Wie der Browser beim Herunterladen. "(1)" waere verwirrend: Der erste
    // Ordner traegt ja auch keine Eins.
    expect(await freeFolderName(directory(['macbook-air']), 'macbook-air')).toBe('macbook-air (2)');
  });

  it('zaehlt weiter, solange belegt ist', async () => {
    const taken = ['macbook-air', 'macbook-air (2)', 'macbook-air (3)'];

    expect(await freeFolderName(directory(taken), 'macbook-air')).toBe('macbook-air (4)');
  });

  it('uebergeht eine Luecke nicht', async () => {
    // (2) ist frei, obwohl (3) belegt ist - dann wird (2) genommen.
    expect(await freeFolderName(directory(['macbook-air', 'macbook-air (3)']), 'macbook-air')).toBe(
      'macbook-air (2)',
    );
  });

  it('gibt auf, statt endlos zu zaehlen', async () => {
    const endless: DirectoryLookup = {
      getDirectoryHandle: () => Promise.resolve({}),
    };

    await expect(freeFolderName(endless, 'x')).rejects.toThrow(/freien Ordnernamen/);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run --project=node src/app/features/image-optimizer/services/free-folder-name.spec.ts
```

Erwartet: FAIL — die Datei `./free-folder-name` gibt es nicht.

- [ ] **Step 3: Write the implementation**

Neue Datei `src/app/features/image-optimizer/services/free-folder-name.ts`:

```ts
/**
 * Findet einen Ordnernamen, der noch nicht vergeben ist.
 *
 * Warum das von Hand gebaut wird: Das automatische `(1)` beim Herunterladen
 * kommt vom Browser, nicht von Windows - und beim Schreiben ueber die
 * Verzeichnis-Schnittstelle ist der Browser nicht beteiligt.
 * `getFileHandle(name, { create: true })` oeffnet stillschweigend die
 * vorhandene Datei, und `createWritable()` kuerzt sie beim Oeffnen auf null
 * Byte. Ohne diese Suche waere der Export der einzige Weg, auf dem der
 * Bildoptimierer fremde Dateien zerstoeren koennte.
 *
 * Geprueft wird nur der **obere** Ordner. Ist dessen Name neu, sind alle
 * Plattform-Unterordner und alle Dateien darin zwangslaeufig auch neu.
 */

/** Der schmale Ausschnitt der Verzeichnis-Schnittstelle, den diese Suche braucht. */
export interface DirectoryLookup {
  getDirectoryHandle(name: string): Promise<unknown>;
}

/** Ab hier stimmt etwas anderes nicht, und Weiterzaehlen hilft niemandem. */
const MAX_ATTEMPTS = 999;

/** Gezaehlt wird ab zwei - der erste Ordner traegt ja auch keine Eins. */
export async function freeFolderName(parent: DirectoryLookup, wanted: string): Promise<string> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const name = attempt === 1 ? wanted : `${wanted} (${attempt})`;
    if (!(await exists(parent, name))) return name;
  }

  throw new Error(`Es liess sich kein freien Ordnernamen fuer "${wanted}" finden.`);
}

/**
 * Bewusst **ohne** `create`: Mit `create: true` waere die Pruefung selbst der
 * Vorgang, der den Ordner anlegt, und jeder Name gaelte sofort als belegt.
 */
async function exists(parent: DirectoryLookup, name: string): Promise<boolean> {
  try {
    await parent.getDirectoryHandle(name);
    return true;
  } catch {
    return false;
  }
}
```

Der Satz in der Fehlermeldung ist grammatisch schief; er wird beim Schreiben
zu `Es ließ sich kein freier Ordnername für "…" finden.` gerichtet — der Test
prüft nur auf `freien Ordnernamen`, deshalb wird **auch der Test** auf
`freier Ordnername` angepasst.

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run --project=node src/app/features/image-optimizer/services/free-folder-name.spec.ts
```

Erwartet: PASS, 5 Tests.

- [ ] **Step 5: Commit**

```bash
git add src/app/features/image-optimizer/services/free-folder-name.ts src/app/features/image-optimizer/services/free-folder-name.spec.ts
git commit -m "feat(image-opt): find a free target folder instead of overwriting one

The File System Access API has no safety net of its own. getFileHandle with
create opens an existing file silently and createWritable truncates it to zero
bytes, so writing straight into a chosen name would destroy whatever was there.

Only the top folder is probed: once that name is new, every platform subfolder
and every file below it is new too. Probing without create matters - with it,
the check would be the very act that creates the folder and every name would
read as taken.

The narrow DirectoryLookup interface keeps this a plain node test; the real
handle type is browser-only."
```

---

### Task 6: In den Ordner schreiben

**Files:**

- Create: `src/app/features/image-optimizer/services/directory-export.service.ts`
- Create: `src/app/features/image-optimizer/services/directory-export.dom.spec.ts`

**Interfaces:**

- Consumes: `freeFolderName`, `DirectoryLookup` aus Task 5.
- Produces:
  - `interface ExportEntry { readonly folder: string; readonly file: string; readonly data: Blob }`
  - `canWriteDirectory(): boolean`
  - `class DirectoryExportService` mit
    `write(entries: readonly ExportEntry[], rootName: string, onProgress: (done: number, total: number) => void): Promise<WriteResult>`
  - `type WriteResult = { readonly outcome: 'written'; readonly folder: string } | { readonly outcome: 'cancelled' }`

`write` gibt den **tatsächlich benutzten** Ordnernamen zurück, nicht nur ein
Gelungen. Griff der Zählsuffix, liegt das Ergebnis woanders als erwartet — und
genau dann muss die Erfolgsmeldung den richtigen Ort nennen können.

- [ ] **Step 1: Write the failing test**

Neue Datei `src/app/features/image-optimizer/services/directory-export.dom.spec.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { canWriteDirectory, DirectoryExportService } from './directory-export.service';

/** Ein Verzeichnis im Speicher, das mitschreibt, was hineingeschrieben wurde. */
function fakeDirectory(existing: readonly string[] = []) {
  const written = new Map<string, number>();
  const created: string[] = [];

  function makeHandle(path: string) {
    return {
      async getDirectoryHandle(name: string, options?: { create?: boolean }) {
        const full = path ? `${path}/${name}` : name;
        if (!options?.create && !existing.includes(full) && !created.includes(full)) {
          const error = new Error('not found');
          error.name = 'NotFoundError';
          throw error;
        }
        if (options?.create) created.push(full);
        return makeHandle(full);
      },
      async getFileHandle(name: string) {
        const full = `${path}/${name}`;
        return {
          async createWritable() {
            return {
              async write(data: Blob) {
                written.set(full, data.size);
              },
              async close() {},
            };
          },
        };
      },
    };
  }

  return { root: makeHandle(''), written, created };
}

function entry(folder: string, file: string): { folder: string; file: string; data: Blob } {
  return { folder, file, data: new Blob(['x'], { type: 'image/jpeg' }) };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Kann dieser Browser in einen Ordner schreiben', () => {
  it('erkennt einen Browser ohne die Funktion', () => {
    vi.stubGlobal('showDirectoryPicker', undefined);

    expect(canWriteDirectory()).toBe(false);
  });

  it('erkennt einen Browser mit der Funktion', () => {
    vi.stubGlobal('showDirectoryPicker', () => Promise.resolve({}));

    expect(canWriteDirectory()).toBe(true);
  });
});

describe('In einen Ordner schreiben', () => {
  it('legt je Plattform einen Unterordner an und schreibt hinein', async () => {
    const target = fakeDirectory();
    vi.stubGlobal('showDirectoryPicker', () => Promise.resolve(target.root));

    const result = await new DirectoryExportService().write(
      [entry('eBay', 'a-01.jpg'), entry('Vinted', 'a-01.jpg')],
      'a',
      () => {},
    );

    expect(result.outcome).toBe('written');
    expect([...target.written.keys()].sort()).toEqual(['a/Vinted/a-01.jpg', 'a/eBay/a-01.jpg']);
  });

  it('weicht auf einen freien Namen aus, statt zu ueberschreiben', async () => {
    const target = fakeDirectory(['a']);
    vi.stubGlobal('showDirectoryPicker', () => Promise.resolve(target.root));

    const result = await new DirectoryExportService().write(
      [entry('eBay', 'a-01.jpg')],
      'a',
      () => {},
    );

    expect([...target.written.keys()]).toEqual(['a (2)/eBay/a-01.jpg']);
    // Der gemeldete Name muss der benutzte sein - sonst schickt die
    // Erfolgsmeldung den Nutzer in den falschen Ordner.
    expect(result).toEqual({ outcome: 'written', folder: 'a (2)' });
  });

  it('meldet den Fortschritt je geschriebener Datei', async () => {
    const target = fakeDirectory();
    vi.stubGlobal('showDirectoryPicker', () => Promise.resolve(target.root));
    const steps: string[] = [];

    await new DirectoryExportService().write(
      [entry('eBay', 'a-01.jpg'), entry('eBay', 'a-02.jpg')],
      'a',
      (done, total) => steps.push(`${done}/${total}`),
    );

    expect(steps).toEqual(['1/2', '2/2']);
  });

  it('meldet einen Abbruch als abgebrochen, nicht als Fehler', async () => {
    // Wer den Dialog schliesst, hat nichts falsch gemacht - dafuer darf
    // keine Fehlermeldung erscheinen.
    const abort = new Error('abgebrochen');
    abort.name = 'AbortError';
    vi.stubGlobal('showDirectoryPicker', () => Promise.reject(abort));

    const result = await new DirectoryExportService().write(
      [entry('eBay', 'a.jpg')],
      'a',
      () => {},
    );

    expect(result.outcome).toBe('cancelled');
  });

  it('reicht einen echten Fehler nach aussen durch', async () => {
    vi.stubGlobal('showDirectoryPicker', () => Promise.reject(new Error('Platte voll')));

    await expect(
      new DirectoryExportService().write([entry('eBay', 'a.jpg')], 'a', () => {}),
    ).rejects.toThrow('Platte voll');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run --project=dom src/app/features/image-optimizer/services/directory-export.dom.spec.ts
```

Erwartet: FAIL — die Datei `./directory-export.service` gibt es nicht.

- [ ] **Step 3: Write the implementation**

Neue Datei `src/app/features/image-optimizer/services/directory-export.service.ts`:

```ts
import { Injectable } from '@angular/core';
import { freeFolderName } from './free-folder-name';

/** Was beim Schreiben herausgekommen ist. */
export type WriteResult =
  { readonly outcome: 'written'; readonly folder: string } | { readonly outcome: 'cancelled' };

/** Eine fertige Datei mit ihrem Plattformordner. */
export interface ExportEntry {
  readonly folder: string;
  readonly file: string;
  readonly data: Blob;
}

interface DirectoryPickerOptions {
  readonly mode?: 'read' | 'readwrite';
}

type DirectoryPicker = (options?: DirectoryPickerOptions) => Promise<FileSystemDirectoryHandle>;

function picker(): DirectoryPicker | null {
  const candidate = (globalThis as { showDirectoryPicker?: unknown }).showDirectoryPicker;

  return typeof candidate === 'function' ? (candidate as DirectoryPicker) : null;
}

/**
 * Ob dieser Browser direkt in einen Ordner schreiben kann.
 *
 * Chrome und Edge koennen es, Firefox und Safari nicht, Android gar nicht.
 * Wo es fehlt, faellt der Aufrufer auf das ZIP zurueck.
 */
export function canWriteDirectory(): boolean {
  return picker() !== null;
}

@Injectable({ providedIn: 'root' })
export class DirectoryExportService {
  /**
   * Fragt nach einem Zielordner und schreibt die Dateien hinein.
   *
   * Angelegt wird `<rootName>` und darin je ein Ordner pro Plattform. Ist
   * `<rootName>` schon vergeben, wird gezaehlt - es wird nie eine vorhandene
   * Datei ueberschrieben.
   *
   * `'cancelled'` heisst: Der Nutzer hat den Dialog geschlossen. Das ist kein
   * Fehler und darf keine Meldung ausloesen. Alles andere fliegt weiter nach
   * aussen, damit ein voller Datentraeger nicht als Abbruch durchgeht.
   *
   * Zurueck kommt der **tatsaechlich benutzte** Ordnername. Den gewuenschten
   * zu melden waere eine kleine Luege genau dann, wenn es darauf ankommt -
   * naemlich wenn der Zaehlsuffix gegriffen hat.
   */
  async write(
    entries: readonly ExportEntry[],
    rootName: string,
    onProgress: (done: number, total: number) => void,
  ): Promise<WriteResult> {
    const open = picker();
    if (!open) throw new Error('Dieser Browser kann nicht direkt in einen Ordner schreiben.');

    let target: FileSystemDirectoryHandle;
    try {
      target = await open({ mode: 'readwrite' });
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'AbortError') return { outcome: 'cancelled' };
      throw error;
    }

    const folder = await freeFolderName(target, rootName);
    const root = await target.getDirectoryHandle(folder, { create: true });

    // Je Plattform nur einmal anlegen; bei zwoelf Bildern waeren es sonst
    // zwoelf Anfragen fuer denselben Ordner.
    const folders = new Map<string, FileSystemDirectoryHandle>();

    let done = 0;
    for (const entry of entries) {
      let folder = folders.get(entry.folder);
      if (!folder) {
        folder = await root.getDirectoryHandle(entry.folder, { create: true });
        folders.set(entry.folder, folder);
      }

      const handle = await folder.getFileHandle(entry.file, { create: true });
      const stream = await handle.createWritable();
      await stream.write(entry.data);
      await stream.close();

      done++;
      onProgress(done, entries.length);
    }

    return { outcome: 'written', folder };
  }
}
```

Meldet `tsc`, dass `FileSystemDirectoryHandle` unbekannt ist, wird oben in der
Datei ergänzt — die Typen stehen in `lib.dom`, aber nicht in jeder Fassung:

```ts
declare global {
  interface FileSystemDirectoryHandle {
    getDirectoryHandle(
      name: string,
      options?: { create?: boolean },
    ): Promise<FileSystemDirectoryHandle>;
    getFileHandle(name: string, options?: { create?: boolean }): Promise<FileSystemFileHandle>;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run --project=dom src/app/features/image-optimizer/services/directory-export.dom.spec.ts
npm run typecheck
```

Erwartet: PASS und Exitcode 0.

- [ ] **Step 5: Commit**

```bash
git add src/app/features/image-optimizer/services/directory-export.service.ts src/app/features/image-optimizer/services/directory-export.dom.spec.ts
git commit -m "feat(image-opt): write exports straight into a chosen folder

A browser cannot download a folder, which is the only reason the ZIP ever
existed. The directory picker can, so the unpacking step disappears for the
browsers that support it.

Closing the picker returns 'cancelled' rather than throwing: the seller who
changes their mind has done nothing wrong and must not see an error. Every
other failure is rethrown, so a full disk cannot pass for a cancellation.

Platform folders are created once and cached - twelve images across three
platforms would otherwise ask for the same three folders thirty-six times."
```

---

### Task 7: Ordner oder ZIP wählen und den Fortschritt zeigen

**Files:**

- Modify: `src/app/features/image-optimizer/components/export-bar/export-bar.component.ts`
- Modify: `src/app/features/image-optimizer/components/export-bar/export-bar.component.html`
- Modify: `src/app/features/image-optimizer/image-optimizer.component.ts`
- Test: `src/app/features/image-optimizer/image-optimizer.component.angular.spec.ts`

**Interfaces:**

- Consumes: `canWriteDirectory`, `DirectoryExportService`, `ExportEntry` aus Task 6; `effectiveBaseName`, `archiveName`, `exportFileName` aus Plan 1.
- Produces: `ExportStatus` um `{ kind: 'progress'; done: number; total: number }` erweitert.

- [ ] **Step 1: Write the failing test**

An `src/app/features/image-optimizer/image-optimizer.component.angular.spec.ts` anhängen:

```ts
describe('ImageOptimizerComponent – Exportfortschritt', () => {
  beforeAll(() => TestBed.resetTestingModule());

  function createComponent(): ImageOptimizerComponent {
    return TestBed.runInInjectionContext(() => new ImageOptimizerComponent());
  }

  it('zeigt waehrend des Exports, wie weit er ist', () => {
    const component = createComponent();

    component.reportExportProgress(3, 12);

    const status = component.exportStatus();
    expect(status.kind).toBe('progress');
    expect(status.title).toContain('3');
    expect(status.title).toContain('12');
  });

  it('zeigt nach dem Ende wieder den Bereitschaftstext', () => {
    // Bliebe der Fortschritt stehen, saehe ein fertiger Export wie ein
    // haengengebliebener aus.
    const component = createComponent();
    component.togglePlatform('ebay');
    component.reportExportProgress(12, 12);

    component.reportExportProgress(null, null);

    expect(component.exportStatus().kind).not.toBe('progress');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run --project=angular src/app/features/image-optimizer/image-optimizer.component.angular.spec.ts
```

Erwartet: FAIL — `reportExportProgress` gibt es nicht.

- [ ] **Step 3: Write the implementation**

In `src/app/features/image-optimizer/components/export-bar/export-bar.component.ts` den Typ erweitern:

```ts
export type ExportStatus =
  | { readonly kind: 'ready' | 'error'; readonly title: string; readonly detail: string | null }
  | { readonly kind: 'progress'; readonly title: string; readonly detail: string | null };
```

Damit bleibt die Vorlage unverändert lesbar (`status().title`, `status().detail`).
In `export-bar.component.html` bekommt der Fortschrittsfall einen eigenen Ton und
`aria-live="polite"` — die Meldung ändert sich, ohne dass der Fokus wandert:

```html
<p [attr.aria-live]="status().kind === 'progress' ? 'polite' : null">{{ status().title }}</p>
```

In `src/app/features/image-optimizer/image-optimizer.component.ts`:

```ts
import {
  canWriteDirectory,
  DirectoryExportService,
  ExportEntry,
} from './services/directory-export.service';
```

Neues Signal und ein Melder:

```ts
  private readonly directoryExport = inject(DirectoryExportService);

  /** Wie viele Dateien geschrieben sind, waehrend ein Export laeuft. */
  readonly exportProgress = signal<{ done: number; total: number } | null>(null);

  /** Meldet den Fortschritt; `null` beendet die Anzeige wieder. */
  reportExportProgress(done: number | null, total: number | null): void {
    this.exportProgress.set(done === null || total === null ? null : { done, total });
  }
```

In `exportStatus()` **vor** allen anderen Fällen:

```ts
const progress = this.exportProgress();
if (progress) {
  return {
    kind: 'progress',
    title: `Bild ${progress.done} von ${progress.total}`,
    detail: null,
  };
}
```

`exportImages()` wählt den Weg. Der bestehende `try`-Block wird ab dem Sammeln
der Einträge so ergänzt:

```ts
const entries: ExportEntry[] = [];
// ... die bestehende Schleife fuellt entries wie bisher ...

if (canWriteDirectory()) {
  this.reportExportProgress(0, entries.length);
  const result = await this.directoryExport.write(entries, name, (done, total) =>
    this.reportExportProgress(done, total),
  );
  // Abbruch ist kein Fehler: keine Meldung, kein ZIP als Ersatz.
  if (result.outcome === 'cancelled') return;
  this.toast.success('Bilder wurden gespeichert.', `Ordner „${result.folder}".`);
} else {
  const archive = await this.zipExport.pack(entries);
  this.download(archive, archiveName(name));
  this.toast.success('Bilder wurden exportiert.');
}
```

Im `finally` wird die Anzeige zurückgesetzt:

```ts
    } finally {
      this.reportExportProgress(null, null);
      this.isBusy.set(false);
    }
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/app/features/image-optimizer/
npm run typecheck
```

Erwartet: alle PASS, Exitcode 0.

- [ ] **Step 5: Commit**

```bash
git add src/app/features/image-optimizer/components/export-bar/ src/app/features/image-optimizer/image-optimizer.component.ts src/app/features/image-optimizer/image-optimizer.component.angular.spec.ts
git commit -m "feat(image-opt): pick folder or ZIP and show export progress

Twelve images across three platforms are thirty-six render passes with no sign
of life on screen, which reads as a hang. The bar now counts them, announced
politely so the message does not steal focus.

The success toast names the folder write() actually used, which is the one case
where the wanted name would mislead - when the counting suffix kicked in and the
seller needs to know where the files really went."
```

---

### Task 8: Gesamtprüfung, Protokoll, PR

**Files:**

- Modify: `docs/AI-CHANGELOG.md`

- [ ] **Step 1: Vollständige Prüfung fahren**

```bash
npm run verify > /tmp/verify-2.log 2>&1; echo "Exitcode: $?"
```

Erwartet: `Exitcode: 0`. Nicht durch eine Pipe messen.

- [ ] **Step 2: Bündelgröße vergleichen**

Im Bauprotokoll die Zeile zu `image-optimizer-component` suchen und mit dem
Stand vor diesem Plan vergleichen:

```bash
grep -i "image-optimizer" /tmp/verify-2.log
```

Der EXIF-Schreiber und die Ordnerausgabe sind eigener Quelltext ohne neue
Abhängigkeit; ein Wachstum über etwa 5 kB roh wäre erklärungsbedürftig und
gehört ins Protokoll.

- [ ] **Step 3: Im Browser gegenprüfen**

In Chrome oder Edge:

1. Zwei Fotos mit Aufnahmedatum laden, alle drei Plattformen wählen.
2. Exportieren, einen Zielordner wählen. Der Ordnerbaum muss stimmen, die Leiste muss mitzählen.
3. **Denselben Export wiederholen.** Es muss ein zweiter Ordner mit ` (2)` entstehen, der erste darf sich nicht verändert haben — Änderungsdatum der alten Dateien prüfen.
4. Eine Exportdatei in den Windows-Eigenschaften öffnen: Unter „Details" muss ein Aufnahmedatum stehen, aber **kein** Kameramodell, **kein** Ort und **keine** Software.
5. Den Dialog einmal abbrechen: Es darf keine Fehlermeldung erscheinen und kein ZIP entstehen.

- [ ] **Step 4: Changelog-Eintrag schreiben**

Oben in `docs/AI-CHANGELOG.md`. Absätze **Auftrag/Ergebnis**, **Ursache**,
**Betroffen**, **Geprüft** — mit den echten Messwerten aus Schritt 2 und 3.
Die eingeschränkte Aufhebung der Paket-2-Entscheidung ausdrücklich nennen.
Abschließen mit `---`.

```bash
npx prettier --write docs/AI-CHANGELOG.md
```

- [ ] **Step 5: Commit, Push, PR**

```bash
git add docs/AI-CHANGELOG.md
git commit -m "docs(image-opt): record the folder export and the kept capture date"
git push -u origin feat/image-optimizer-export
gh pr create --base master --title "feat(image-opt): export into real folders and keep the capture date" --body "..."
```

Der Body nennt das **Warum**: kein Entpacken mehr, nichts wird überschrieben
(mit der Begründung, warum die Schnittstelle das nicht selbst tut), und die
eingeschränkte Aufhebung der Metadaten-Entscheidung. Dazu, was tatsächlich
geprüft wurde. Nach grünen Prüfungen per Merge-Commit veröffentlichen.

---

## Nicht in diesem Plan

- **Ordnerwahl merken.** `FileSystemDirectoryHandle` ließe sich in IndexedDB ablegen und wiederverwenden. Das ändert aber, wohin Dateien geschrieben werden, ohne dass der Nutzer es nochmal sieht — das gehört gesondert entschieden.
- **Weitere Metadatenfelder.** Blende, ISO und Brennweite wurden erwogen und verworfen: mehr Angriffsfläche für Rückschlüsse, kein erkennbarer Nutzen.
- **Alles zur Oberfläche** — Plan 3.
