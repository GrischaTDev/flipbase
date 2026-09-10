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
