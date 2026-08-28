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
