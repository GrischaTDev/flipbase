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

  it('erkennt JPEG am Dateinamen, wenn der Browser keinen Typ meldet', async () => {
    parseMock.mockResolvedValue({});
    const untyped = new File([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], 'foto.jpeg', { type: '' });

    const result = await reader.read(untyped);

    expect(result.status).toBe('read');
    expect(parseMock).toHaveBeenCalled();
  });
});
