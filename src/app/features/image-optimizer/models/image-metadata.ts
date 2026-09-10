import { MetadataField } from '../services/metadata-fields';

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
  /**
   * Bleibt neben `fields` ein eigenes Feld: Der Aufnahmeort ist der einzige
   * Eintrag mit einer Folge fuer den Nutzer - er landet sonst mit der eigenen
   * Adresse in einer oeffentlichen Anzeige. Deshalb wird er hervorgehoben und
   * traegt den Hinweis in der Bilderliste.
   */
  readonly gps: { readonly latitude: number; readonly longitude: number } | null;
  /**
   * **Alles**, was in der Datei steht - nicht eine Auswahl davon. Wer wissen
   * will, was er da hochlaedt, will die ganze Liste sehen und nicht das, was
   * jemand anderes fuer wichtig hielt.
   */
  readonly fields: readonly MetadataField[];
  readonly ai: AiProvenance;
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
}

export function pendingMetadata(): ImageMetadata {
  return {
    status: 'pending',
    gps: null,
    fields: [],
    ai: { contentCredential: 'unchecked', declaredSource: null },
    capturedAt: null,
  };
}

/** Ob ueberhaupt etwas gefunden wurde - fuer die Formulierung in der Anzeige. */
export function hasAnyMetadata(metadata: ImageMetadata): boolean {
  return (
    metadata.gps !== null ||
    metadata.fields.length > 0 ||
    metadata.ai.contentCredential === 'present'
  );
}
