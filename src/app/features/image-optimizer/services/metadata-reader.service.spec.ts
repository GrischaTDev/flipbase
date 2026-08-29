import { describe, it, expect, vi, beforeEach } from 'vitest';

const parseMock = vi.fn();
vi.mock('exifr', () => ({ default: { parse: (...args: unknown[]) => parseMock(...args) } }));

import { MetadataReaderService } from './metadata-reader.service';
import { ImageMetadata } from '../models/image-metadata';

/** Wert eines Eintrags aus der vollstaendigen Liste. */
const feld = (result: ImageMetadata, key: string) =>
  result.fields.find((entry) => entry.key === key)?.value ?? null;

const ascii = (text: string) => [...text].map((c) => c.charCodeAt(0));

function fileOf(bytes: number[], name: string, type = ''): File {
  return new File([new Uint8Array(bytes)], name, { type });
}

const JPEG = [
  0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0xff, 0xd9,
];
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Minimales PNG mit optionalem C2PA-Chunk (Pruefsumme wird nicht geprueft). */
function pngBytes(withCredential = false): number[] {
  const chunk = (name: string, data: number[]) => {
    const size = data.length;
    return [
      (size >> 24) & 0xff,
      (size >> 16) & 0xff,
      (size >> 8) & 0xff,
      size & 0xff,
      ...ascii(name),
      ...data,
      0,
      0,
      0,
      0,
    ];
  };
  return [
    ...PNG_SIGNATURE,
    ...chunk('IHDR', new Array(13).fill(0)),
    ...(withCredential ? chunk('caBX', ascii('jumbfc2pa')) : []),
    ...chunk('IEND', []),
  ];
}

/** Minimales JPEG mit einem APP11-Segment, das eine c2pa-Kennung traegt. */
function jpegWithCredential(): number[] {
  const payload = ascii('....jumbjumdc2pa\0');
  const length = payload.length + 2;
  return [
    0xff,
    0xd8,
    0xff,
    0xe0,
    0x00,
    0x02,
    0xff,
    0xeb,
    (length >> 8) & 0xff,
    length & 0xff,
    ...payload,
    0xff,
    0xd9,
  ];
}

function webpBytes(chunks: { name: string; data: number[] }[]): number[] {
  const body = [
    ...ascii('WEBP'),
    ...chunks.flatMap(({ name, data }) => {
      const size = data.length;
      return [
        ...ascii(name),
        size & 0xff,
        (size >> 8) & 0xff,
        (size >> 16) & 0xff,
        (size >> 24) & 0xff,
        ...data,
        ...(size % 2 ? [0] : []),
      ];
    }),
  ];
  const size = body.length;
  return [
    ...ascii('RIFF'),
    size & 0xff,
    (size >> 8) & 0xff,
    (size >> 16) & 0xff,
    (size >> 24) & 0xff,
    ...body,
  ];
}

/** ISOBMFF-Kopf, wie ihn eine iPhone-Aufnahme traegt. */
function heicBytes(): number[] {
  const body = [...ascii('heic'), 0, 0, 0, 0, ...ascii('mif1'), ...ascii('heic')];
  const length = 8 + body.length;
  return [
    (length >> 24) & 0xff,
    (length >> 16) & 0xff,
    (length >> 8) & 0xff,
    length & 0xff,
    ...ascii('ftyp'),
    ...body,
  ];
}

describe('Metadaten lesen', () => {
  let reader: MetadataReaderService;

  beforeEach(() => {
    parseMock.mockReset();
    reader = new MetadataReaderService();
  });

  it('uebersetzt GPS, Kamera und Datum', async () => {
    parseMock.mockResolvedValue({
      // Rohe Tags plus die von exifr daraus abgeleiteten latitude/longitude -
      // genau die Form, die die Bibliothek bei { gps: true } tatsaechlich liefert.
      GPSLatitude: [52, 30, 0],
      GPSLatitudeRef: 'N',
      GPSLongitude: [13, 24, 0],
      GPSLongitudeRef: 'E',
      latitude: 52.5,
      longitude: 13.4,
      Make: 'Apple',
      Model: 'iPhone 15',
      DateTimeOriginal: new Date('2026-05-01T10:00:00Z'),
      Software: 'iOS 19',
    });

    const result = await reader.read(fileOf(JPEG, 'foto.jpg', 'image/jpeg'));

    expect(result.status).toBe('read');
    expect(result.gps).toEqual({ latitude: 52.5, longitude: 13.4 });
    expect(feld(result, 'Make')).toBe('Apple');
    expect(feld(result, 'Model')).toBe('iPhone 15');
    expect(feld(result, 'DateTimeOriginal')).toMatch(/1\.5\.2026/);
    expect(feld(result, 'Software')).toBe('iOS 19');
  });

  // Der eigentliche Punkt: Es wird nichts mehr weggeworfen. Frueher blieben
  // von jeder Datei nur fuenf handverlesene Felder uebrig.
  it('reicht jeden Eintrag durch, auch die frueher verworfenen', async () => {
    parseMock.mockResolvedValue({
      Make: 'Apple',
      ISO: 400,
      LensModel: 'Weitwinkel',
      Byline: 'Grischa',
      CopyrightNotice: '(c) 2026',
      Keywords: 'sneaker',
    });

    const result = await reader.read(fileOf(JPEG, 'foto.jpg', 'image/jpeg'));

    expect(result.fields.map((entry) => entry.key).sort()).toEqual([
      'Byline',
      'CopyrightNotice',
      'ISO',
      'Keywords',
      'LensModel',
      'Make',
    ]);
  });

  it('meldet read mit leeren Feldern, wenn die Datei nichts enthaelt', async () => {
    parseMock.mockResolvedValue({});

    const result = await reader.read(fileOf(JPEG, 'foto.jpg', 'image/jpeg'));

    expect(result.status).toBe('read');
    expect(result.gps).toBeNull();
    expect(result.fields).toEqual([]);
  });

  it('verschluckt jeden Fehler und meldet failed', async () => {
    parseMock.mockRejectedValue(new Error('kaputt'));

    const result = await reader.read(fileOf(JPEG, 'foto.jpg', 'image/jpeg'));

    expect(result.status).toBe('failed');
    expect(result.gps).toBeNull();
  });

  it('erkennt eine erklaerte KI-Herkunft aus XMP', async () => {
    // exifr liefert das XMP-Feld als DigitalSourceType (grosses D).
    parseMock.mockResolvedValue({ DigitalSourceType: 'trainedAlgorithmicMedia' });

    const result = await reader.read(fileOf(JPEG, 'foto.jpg', 'image/jpeg'));

    expect(result.ai.declaredSource).toBe('trainedAlgorithmicMedia');
  });

  it('meldet read mit leeren Feldern, wenn exifr nur errors liefert', async () => {
    // So sieht die Antwort aus, wenn exifr eine Datei ohne brauchbare
    // Metadaten anschaut: kein echtes Feld, nur { errors: [...] }. Das ist
    // "geprueft und leer", kein Fehlschlag.
    parseMock.mockResolvedValue({ errors: [{}] });

    const result = await reader.read(fileOf(JPEG, 'foto.jpg', 'image/jpeg'));

    expect(result.status).toBe('read');
    expect(result.gps).toBeNull();
    // `errors` ist exifrs Fehlerkanal und darf nicht als Eintrag auftauchen.
    expect(result.fields).toEqual([]);
    expect(result.ai.declaredSource).toBeNull();
  });

  it('meldet einen fehlenden GPS-Teilwert als kein GPS', async () => {
    parseMock.mockResolvedValue({ latitude: 52.5 });

    const result = await reader.read(fileOf(JPEG, 'foto.jpg', 'image/jpeg'));

    expect(result.gps).toBeNull();
  });
});

describe('Format erkennen statt Dateiendung glauben', () => {
  let reader: MetadataReaderService;

  beforeEach(() => {
    parseMock.mockReset();
    parseMock.mockResolvedValue({});
    reader = new MetadataReaderService();
  });

  it('liest ein JPEG ohne Typ und ohne passende Endung', async () => {
    const result = await reader.read(fileOf(JPEG, 'unbenannt', ''));

    expect(result.status).toBe('read');
  });

  // Aus WhatsApp oder von Screenshots gespeicherte Dateien heissen gern ".jpg"
  // und sind in Wahrheit PNG. Frueher wurde nach Endung entschieden - dann
  // haette exifr eine PNG-Datei als JPEG angeboten bekommen.
  it('behandelt eine als .jpg benannte PNG-Datei als PNG', async () => {
    const result = await reader.read(fileOf(pngBytes(), 'screenshot.jpg', 'image/jpeg'));

    expect(result.status).toBe('read');
    expect(result.ai.contentCredential).toBe('absent');
  });

  it('liest PNG, WebP, HEIC und TIFF statt sie abzulehnen', async () => {
    const formate: [string, number[]][] = [
      ['PNG', pngBytes()],
      ['WebP', webpBytes([{ name: 'VP8L', data: [1, 2, 3, 4] }])],
      ['HEIC', heicBytes()],
      ['TIFF', [0x49, 0x49, 0x2a, 0x00, 8, 0, 0, 0]],
    ];

    for (const [name, bytes] of formate) {
      const result = await reader.read(fileOf(bytes, `datei-${name}`));
      expect(result.status, name).toBe('read');
    }
  });

  it('lehnt ein Format ab, aus dem nichts zu holen waere', async () => {
    const gif = fileOf([...ascii('GIF89a'), 0, 0, 0, 0], 'bild.gif', 'image/gif');

    const result = await reader.read(gif);

    expect(result.status).toBe('unsupported');
    expect(parseMock).not.toHaveBeenCalled();
  });
});

describe('WebP eigenstaendig auswerten', () => {
  let reader: MetadataReaderService;

  beforeEach(() => {
    parseMock.mockReset();
    parseMock.mockResolvedValue({});
    reader = new MetadataReaderService();
  });

  const tiffBlock = [0x49, 0x49, 0x2a, 0x00, 8, 0, 0, 0];

  // exifr kann WebP nicht - gemessen, sie quittiert es mit "Unknown file
  // format". Uebergeben wird deshalb der herausgeloeste TIFF-Block, nicht die
  // Datei.
  it('reicht den EXIF-Block an exifr weiter, nicht die Datei', async () => {
    parseMock.mockResolvedValue({ Make: 'WebPKamera' });
    const file = fileOf(
      webpBytes([
        { name: 'VP8L', data: [1, 2, 3, 4] },
        { name: 'EXIF', data: tiffBlock },
      ]),
      'bild.webp',
      'image/webp',
    );

    const result = await reader.read(file);

    expect(feld(result, 'Make')).toBe('WebPKamera');
    const uebergeben = parseMock.mock.calls[0][0] as Uint8Array;
    expect(uebergeben).toBeInstanceOf(Uint8Array);
    expect([...uebergeben]).toEqual(tiffBlock);
  });

  it('ruft exifr gar nicht, wenn kein EXIF-Chunk da ist', async () => {
    const file = fileOf(webpBytes([{ name: 'VP8L', data: [1, 2] }]), 'bild.webp');

    const result = await reader.read(file);

    expect(result.status).toBe('read');
    expect(parseMock).not.toHaveBeenCalled();
  });

  it('liest die erklaerte Herkunft aus dem XMP-Chunk', async () => {
    const xmp = '<x Iptc4xmpExt:DigitalSourceType="trainedAlgorithmicMedia"/>';
    const file = fileOf(webpBytes([{ name: 'XMP ', data: ascii(xmp) }]), 'bild.webp', 'image/webp');

    const result = await reader.read(file);

    expect(result.ai.declaredSource).toBe('trainedAlgorithmicMedia');
    // Sie kommt aus dem XMP-Chunk und nicht von exifr - sie muss trotzdem in
    // der Liste stehen, sonst fehlte sie dort als einziges Feld.
    expect(feld(result, 'DigitalSourceType')).toBe('trainedAlgorithmicMedia');
  });

  it('erkennt den C2PA-Chunk', async () => {
    const mit = fileOf(webpBytes([{ name: 'C2PA', data: ascii('jumbf') }]), 'a.webp');
    const ohne = fileOf(webpBytes([{ name: 'VP8L', data: [1, 2] }]), 'b.webp');

    expect((await reader.read(mit)).ai.contentCredential).toBe('present');
    expect((await reader.read(ohne)).ai.contentCredential).toBe('absent');
  });
});

describe('Herkunftsnachweis: gefunden, nicht gefunden, nicht nachgesehen', () => {
  let reader: MetadataReaderService;

  beforeEach(() => {
    parseMock.mockReset();
    parseMock.mockResolvedValue({});
    reader = new MetadataReaderService();
  });

  it('meldet present, wenn ein JPEG einen Nachweis traegt', async () => {
    const result = await reader.read(fileOf(jpegWithCredential(), 'ki.jpg', 'image/jpeg'));

    expect(result.ai.contentCredential).toBe('present');
  });

  it('meldet absent, wenn ein JPEG keinen traegt', async () => {
    const result = await reader.read(fileOf(JPEG, 'foto.jpg', 'image/jpeg'));

    expect(result.ai.contentCredential).toBe('absent');
  });

  it('meldet present, wenn ein PNG einen caBX-Chunk traegt', async () => {
    const result = await reader.read(fileOf(pngBytes(true), 'ki.png', 'image/png'));

    expect(result.ai.contentCredential).toBe('present');
  });

  // Bei HEIC und TIFF liegt der Nachweis in Strukturen, die hier bewusst
  // nicht ausgewertet werden. "Nicht gefunden" waere eine Behauptung ueber
  // etwas, wonach niemand gesehen hat.
  it('meldet unchecked, wo nicht nachgesehen wird', async () => {
    const heic = await reader.read(fileOf(heicBytes(), 'foto.heic', 'image/heic'));
    const tiff = await reader.read(fileOf([0x4d, 0x4d, 0x00, 0x2a, 0, 0, 0, 8], 'scan.tif'));

    expect(heic.ai.contentCredential).toBe('unchecked');
    expect(tiff.ai.contentCredential).toBe('unchecked');
  });

  it('zaehlt unchecked nicht als gefundene Angabe', async () => {
    const result = await reader.read(fileOf(heicBytes(), 'foto.heic'));

    expect(result.status).toBe('read');
    expect(result.fields).toEqual([]);
    expect(result.ai.contentCredential).toBe('unchecked');
  });
});
