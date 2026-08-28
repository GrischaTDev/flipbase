/**
 * `read` heisst: nachgesehen. Sind dann alle Felder leer, enthaelt die Datei
 * nachweislich nichts. `failed` heisst: konnte nicht nachsehen. Das sind fuer
 * den Nutzer zwei verschiedene Aussagen und duerfen nie zusammenfallen.
 */
export type MetadataStatus = 'pending' | 'read' | 'unsupported' | 'failed';

export interface AiProvenance {
  /** Ein C2PA-Nachweis liegt vor. Nur festgestellt, nicht geprueft. */
  readonly contentCredential: boolean;
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
    ai: { contentCredential: false, declaredSource: null },
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
    metadata.ai.contentCredential ||
    metadata.ai.declaredSource !== null
  );
}
