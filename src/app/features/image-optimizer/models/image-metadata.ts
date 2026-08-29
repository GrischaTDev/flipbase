/**
 * `read` heisst: nachgesehen. Sind dann alle Felder leer, enthaelt die Datei
 * nachweislich nichts. `failed` heisst: konnte nicht nachsehen. Das sind fuer
 * den Nutzer zwei verschiedene Aussagen und duerfen nie zusammenfallen.
 */
export type MetadataStatus = 'pending' | 'read' | 'unsupported' | 'failed';

/**
 * `present` und `absent` sind Aussagen, `unchecked` ist das Eingestaendnis,
 * nicht nachgesehen zu haben.
 *
 * Der Nachweis liegt je Containerformat woanders: bei JPEG in einem
 * APP11-Segment, bei PNG in einem `caBX`-Chunk, bei WebP in einem
 * `C2PA`-Chunk. Fuer HEIC/AVIF und TIFF ist er hier **nicht** implementiert -
 * dort steckt er in ISOBMFF-Boxen bzw. einem TIFF-Tag, und ohne echte
 * Beispieldateien waere jede Umsetzung geraten. In diesen Faellen sagt die
 * Anzeige, dass nicht nachgesehen wurde, statt "nichts gefunden" zu melden.
 */
export type ContentCredentialState = 'present' | 'absent' | 'unchecked';

export interface AiProvenance {
  /** Ein C2PA-Nachweis liegt vor. Nur festgestellt, nicht geprueft. */
  readonly contentCredential: ContentCredentialState;
  /** XMP `digitalSourceType`, etwa `trainedAlgorithmicMedia`. */
  readonly declaredSource: string | null;
}

export interface ImageMetadata {
  readonly status: MetadataStatus;
  readonly gps: { readonly latitude: number; readonly longitude: number } | null;
  readonly cameraMake: string | null;
  readonly cameraModel: string | null;
  /** ISO 8601, oder null. */
  readonly capturedAt: string | null;
  readonly software: string | null;
  readonly ai: AiProvenance;
}

export function pendingMetadata(): ImageMetadata {
  return {
    status: 'pending',
    gps: null,
    cameraMake: null,
    cameraModel: null,
    capturedAt: null,
    software: null,
    ai: { contentCredential: 'unchecked', declaredSource: null },
  };
}

/** Ob ueberhaupt etwas gefunden wurde - fuer die Formulierung in der Anzeige. */
export function hasAnyMetadata(metadata: ImageMetadata): boolean {
  return (
    metadata.gps !== null ||
    metadata.cameraMake !== null ||
    metadata.cameraModel !== null ||
    metadata.capturedAt !== null ||
    metadata.software !== null ||
    metadata.ai.contentCredential === 'present' ||
    metadata.ai.declaredSource !== null
  );
}
