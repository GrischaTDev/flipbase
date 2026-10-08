/** Globale Referenzdaten, keine Kopien oder Rechte eines Nutzer-Workspaces. */
export type LabelId = number;
export type LabelKind = 'neck-label' | 'care-size-label';
export type LabelEvidenceLevel = 'well-supported' | 'partially-supported' | 'undated';
export type LabelRevisionState = 'draft' | 'review' | 'published' | 'discarded';
export type LabelErrorCode =
  | 'unauthorized'
  | 'forbidden'
  | 'unavailable'
  | 'conflict'
  | 'validation'
  | 'upload-failed'
  | 'processing-failed'
  | 'network';

export interface LabelSource {
  readonly id: string;
  readonly title: string;
  readonly publisher: string;
  readonly url: string;
  readonly accessedAt: string | null;
  readonly locator: string;
}

export interface LabelInterval {
  readonly startYear: number | null;
  readonly endYear: number | null;
  readonly sourceIds: readonly string[];
}

export interface LabelCheckHint {
  readonly text: string;
  readonly sourceIds: readonly string[];
}

export interface LabelContentV1 {
  readonly title: string;
  readonly aliases: readonly string[];
  readonly brandLineId: LabelId | null;
  /** Diese Bezeichnungen werden später bei Veröffentlichung vom Server gesetzt. */
  readonly brandName: string;
  readonly brandLineName: string | null;
  readonly kinds: readonly LabelKind[];
  readonly timeSummary: string;
  readonly evidenceLevel: LabelEvidenceLevel;
  readonly intervals: readonly LabelInterval[];
  readonly features: readonly string[];
  readonly checkHints: readonly LabelCheckHint[];
  readonly limitations: readonly string[];
  readonly relatedReferenceIds: readonly LabelId[];
  readonly sources: readonly LabelSource[];
  readonly reviewedAt: string | null;
}

/** Nur die Zuordnung; Speicherpfad, Freigabe und Verarbeitungsstatus sind Serverdaten. */
export interface LabelImageAssignment {
  readonly assetId: LabelId;
  readonly position: number;
  readonly caption: string;
  readonly alt: string;
  readonly referenceItem: string;
}

export interface LabelDraftInput {
  readonly content: LabelContentV1;
  readonly images: readonly LabelImageAssignment[];
}

export interface LabelDraft {
  readonly referenceId: LabelId;
  readonly revisionId: LabelId;
  readonly version: number;
  readonly state: LabelRevisionState;
  readonly input: LabelDraftInput;
}

export interface LabelReadFilter {
  readonly brandSlug: string | null;
  readonly query: string;
  readonly decade: number | 'unknown' | null;
  readonly kind: LabelKind | null;
}

export interface LabelAvailability {
  readonly visible: boolean;
  readonly operator: boolean;
}

export interface LabelCard {
  readonly referenceId: LabelId;
  readonly revisionId: LabelId;
  readonly brandSlug: string;
  readonly labelSlug: string;
  readonly title: string;
  readonly timeSummary: string;
  readonly shortFeature: string;
  readonly coverAssetId: LabelId;
}

export interface LabelPage {
  readonly items: readonly LabelCard[];
  readonly hasMore: boolean;
  readonly catalogVersion: string;
}
