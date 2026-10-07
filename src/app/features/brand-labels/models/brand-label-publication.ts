import { validateLabelDraftInput } from './brand-label-draft';
import { LABEL_LIMITS } from './brand-label-limits';
import {
  LabelValidationError,
  readLabelArray,
  readLabelDate,
  readLabelId,
  readLabelObject,
  readLabelText,
} from './brand-label-validation';
import type { LabelDraftInput, LabelId, LabelRevisionState } from './brand-label.models';

export type LabelPublicationIssueCode =
  | 'invalid-input'
  | 'invalid-context'
  | 'review-required'
  | 'version-conflict'
  | 'reference-archived'
  | 'brand-unavailable'
  | 'brand-line-unavailable'
  | 'required-text'
  | 'kind-required'
  | 'feature-required'
  | 'review-date-required'
  | 'future-date'
  | 'source-incomplete'
  | 'interval-source-required'
  | 'hint-source-required'
  | 'dating-explanation-required'
  | 'dating-evidence-mismatch'
  | 'image-required'
  | 'image-status-unavailable'
  | 'image-not-processed'
  | 'image-not-approved'
  | 'related-reference-unavailable';
export interface LabelPublicationIssue {
  readonly code: LabelPublicationIssueCode;
  readonly path: string;
}
export interface LabelImagePublicationState {
  readonly assetId: LabelId;
  readonly processingStatus: 'pending' | 'processed' | 'failed';
  readonly permissionStatus: 'pending' | 'approved' | 'revoked';
}
/** Aktuelle Fakten für die Vorschauprüfung, niemals eine Autorisierungsgrundlage. */
export interface LabelPublicationContext {
  readonly referenceId: LabelId;
  readonly referenceBrandId: LabelId;
  readonly referenceArchived: boolean;
  readonly revisionState: LabelRevisionState;
  readonly version: number;
  readonly expectedVersion: number;
  readonly today: string;
  readonly brand: { readonly id: LabelId; readonly name: string; readonly archived: boolean };
  readonly brandLine: {
    readonly id: LabelId;
    readonly brandId: LabelId;
    readonly name: string;
    readonly archived: boolean;
  } | null;
  readonly images: readonly LabelImagePublicationState[];
  readonly visibleRelatedReferenceIds: readonly LabelId[];
}
export class LabelPublicationBlockedError extends Error {
  constructor(readonly issues: readonly LabelPublicationIssue[]) {
    super('label-publication-blocked');
    this.name = 'LabelPublicationBlockedError';
  }
}

function readBoolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') throw new LabelValidationError('invalid-value', path);
  return value;
}

/** Rekonstruktion schützt auch die Vorschau vor widersprüchlichen Metadaten. */
function readContext(value: LabelPublicationContext): LabelPublicationContext {
  const ctx = readLabelObject(
    value,
    [
      'referenceId',
      'referenceBrandId',
      'referenceArchived',
      'revisionState',
      'version',
      'expectedVersion',
      'today',
      'brand',
      'brandLine',
      'images',
      'visibleRelatedReferenceIds',
    ],
    'publication',
  );
  const brand = readLabelObject(ctx['brand'], ['id', 'name', 'archived'], 'publication.brand');
  const line =
    ctx['brandLine'] === null
      ? null
      : readLabelObject(
          ctx['brandLine'],
          ['id', 'brandId', 'name', 'archived'],
          'publication.brandLine',
        );
  const today = readLabelDate(ctx['today'], 'publication.today');
  if (today === null) throw new LabelValidationError('invalid-date', 'publication.today');
  const state = ctx['revisionState'];
  if (state !== 'draft' && state !== 'review' && state !== 'published' && state !== 'discarded') {
    throw new LabelValidationError('invalid-value', 'publication.revisionState');
  }
  return {
    referenceId: readLabelId(ctx['referenceId'], 'publication.referenceId'),
    referenceBrandId: readLabelId(ctx['referenceBrandId'], 'publication.referenceBrandId'),
    referenceArchived: readBoolean(ctx['referenceArchived'], 'publication.referenceArchived'),
    revisionState: state,
    version: readLabelId(ctx['version'], 'publication.version'),
    expectedVersion: readLabelId(ctx['expectedVersion'], 'publication.expectedVersion'),
    today,
    brand: {
      id: readLabelId(brand['id'], 'publication.brand.id'),
      name: readLabelText(brand['name'], LABEL_LIMITS.nameCharacters, 'publication.brand.name'),
      archived: readBoolean(brand['archived'], 'publication.brand.archived'),
    },
    brandLine:
      line === null
        ? null
        : {
            id: readLabelId(line['id'], 'publication.brandLine.id'),
            brandId: readLabelId(line['brandId'], 'publication.brandLine.brandId'),
            name: readLabelText(line['name'], LABEL_LIMITS.nameCharacters, 'publication.brandLine.name'),
            archived: readBoolean(line['archived'], 'publication.brandLine.archived'),
          },
    images: readLabelArray(ctx['images'], LABEL_LIMITS.images, 'publication.images').map(
      (entry, index) => {
        const path = `publication.images[${index}]`;
        const image = readLabelObject(entry, ['assetId', 'processingStatus', 'permissionStatus'], path);
        const processingStatus = image['processingStatus'];
        const permissionStatus = image['permissionStatus'];
        if (
          processingStatus !== 'pending' &&
          processingStatus !== 'processed' &&
          processingStatus !== 'failed'
        ) {
          throw new LabelValidationError('invalid-value', `${path}.processingStatus`);
        }
        if (
          permissionStatus !== 'pending' &&
          permissionStatus !== 'approved' &&
          permissionStatus !== 'revoked'
        ) {
          throw new LabelValidationError('invalid-value', `${path}.permissionStatus`);
        }
        return {
          assetId: readLabelId(image['assetId'], `${path}.assetId`),
          processingStatus,
          permissionStatus,
        };
      },
    ),
    visibleRelatedReferenceIds: readLabelArray(
      ctx['visibleRelatedReferenceIds'],
      LABEL_LIMITS.relatedReferences,
      'publication.visibleRelatedReferenceIds',
    ).map((id, index) => readLabelId(id, `publication.visibleRelatedReferenceIds[${index}]`)),
  };
}

function inspect(draft: LabelDraftInput, ctx: LabelPublicationContext): LabelPublicationIssue[] {
  const issues: LabelPublicationIssue[] = [];
  const add = (code: LabelPublicationIssueCode, path: string): void => {
    issues.push({ code, path });
  };
  const requiredText = (text: string, path: string): void => {
    if (!text.trim()) add('required-text', path);
  };
  const content = draft.content;
  if (ctx.version !== ctx.expectedVersion) add('version-conflict', 'publication.version');
  if (ctx.revisionState !== 'review') add('review-required', 'publication.revisionState');
  if (ctx.referenceArchived) add('reference-archived', 'publication.referenceId');
  if (ctx.brand.archived || ctx.brand.id !== ctx.referenceBrandId || !ctx.brand.name.trim()) {
    add('brand-unavailable', 'publication.brand');
  }
  if (
    content.brandLineId !== null &&
    (ctx.brandLine === null ||
      ctx.brandLine.archived ||
      ctx.brandLine.id !== content.brandLineId ||
      ctx.brandLine.brandId !== ctx.referenceBrandId ||
      !ctx.brandLine.name.trim())
  ) {
    add('brand-line-unavailable', 'content.brandLineId');
  }
  requiredText(content.title, 'content.title');
  requiredText(content.timeSummary, 'content.timeSummary');
  if (!content.kinds.length) add('kind-required', 'content.kinds');
  if (!content.features.length) add('feature-required', 'content.features');
  content.features.forEach((text, index) => requiredText(text, `content.features[${index}]`));
  content.limitations.forEach((text, index) => requiredText(text, `content.limitations[${index}]`));
  if (content.reviewedAt === null) add('review-date-required', 'content.reviewedAt');
  else if (content.reviewedAt > ctx.today) add('future-date', 'content.reviewedAt');

  content.sources.forEach((source, index) => {
    for (const key of ['title', 'url', 'locator'] as const) {
      if (!source[key].trim()) add('source-incomplete', `content.sources[${index}].${key}`);
    }
    if (source.accessedAt === null) add('source-incomplete', `content.sources[${index}].accessedAt`);
    else if (source.accessedAt > ctx.today) add('future-date', `content.sources[${index}].accessedAt`);
  });
  const dated = content.intervals.some(
    (interval) => interval.startYear !== null || interval.endYear !== null,
  );
  if ((content.evidenceLevel === 'undated') === dated) {
    add('dating-evidence-mismatch', 'content.evidenceLevel');
  }
  if (content.evidenceLevel === 'undated' && !content.limitations.some((text) => Boolean(text.trim()))) {
    add('dating-explanation-required', 'content.limitations');
  }
  content.intervals.forEach((interval, index) => {
    if ((interval.startYear !== null || interval.endYear !== null) && !interval.sourceIds.length) {
      add('interval-source-required', `content.intervals[${index}].sourceIds`);
    }
  });
  content.checkHints.forEach((hint, index) => {
    requiredText(hint.text, `content.checkHints[${index}].text`);
    if (!hint.sourceIds.length) add('hint-source-required', `content.checkHints[${index}].sourceIds`);
  });

  if (!draft.images.length) add('image-required', 'images');
  draft.images.forEach((assignment, index) => {
    const path = `images[${index}]`;
    requiredText(assignment.caption, `${path}.caption`);
    requiredText(assignment.alt, `${path}.alt`);
    requiredText(assignment.referenceItem, `${path}.referenceItem`);
    const states = ctx.images.filter((image) => image.assetId === assignment.assetId);
    const image = states[0];
    if (states.length !== 1 || !image) {
      add('image-status-unavailable', path);
      return;
    }
    if (image.processingStatus !== 'processed') add('image-not-processed', path);
    if (image.permissionStatus !== 'approved') add('image-not-approved', path);
  });
  const visible = new Set(ctx.visibleRelatedReferenceIds);
  content.relatedReferenceIds.forEach((id, index) => {
    if (id === ctx.referenceId || !visible.has(id)) {
      add('related-reference-unavailable', `content.relatedReferenceIds[${index}]`);
    }
  });
  return issues;
}

function evaluate(
  value: unknown,
  context: LabelPublicationContext,
): {
  draft: LabelDraftInput | null;
  context: LabelPublicationContext | null;
  issues: readonly LabelPublicationIssue[];
} {
  let draft: LabelDraftInput;
  try {
    draft = validateLabelDraftInput(value);
  } catch (error: unknown) {
    if (!(error instanceof LabelValidationError)) throw error;
    return { draft: null, context: null, issues: [{ code: 'invalid-input', path: error.path }] };
  }
  let checked: LabelPublicationContext;
  try {
    checked = readContext(context);
  } catch (error: unknown) {
    if (!(error instanceof LabelValidationError)) throw error;
    return { draft, context: null, issues: [{ code: 'invalid-context', path: error.path }] };
  }
  // Die eingefrorenen Bezeichnungen verändern die endgültige JSON-Größe.
  // Dieselbe Grenze muss bereits in der Vorprüfung gelten, nicht erst beim Kopieren.
  let snapshot: LabelDraftInput;
  try {
    snapshot = validateLabelDraftInput({
      ...draft,
      content: {
        ...draft.content,
        brandName: checked.brand.name,
        brandLineName: draft.content.brandLineId === null ? null : checked.brandLine?.name ?? null,
      },
    });
  } catch (error: unknown) {
    if (!(error instanceof LabelValidationError)) throw error;
    return { draft: null, context: checked, issues: [{ code: 'invalid-input', path: error.path }] };
  }
  return { draft: snapshot, context: checked, issues: inspect(snapshot, checked) };
}

/**
 * Vorprüfung für die Oberfläche. Keine Authentifizierung und kein Ersatz für
 * erneute Prüfungen innerhalb einer atomaren, serverseitigen Veröffentlichung.
 * Insbesondere sind Bildstatusangaben im Browser niemals ein Lizenznachweis.
 */
export function getLabelPublicationIssues(
  value: unknown,
  context: LabelPublicationContext,
): readonly LabelPublicationIssue[] {
  return evaluate(value, context).issues;
}

/**
 * Erstellt lediglich eine unabhängige Datenkopie für Vorschau/Abgleich. Schreibt
 * nichts in die Datenbank und vergibt weder eine Freigabe noch einen Zeitstempel.
 * Der Server muss Markennamen aus seiner eigenen Datenbank erneut übernehmen.
 */
export function buildLabelPublicationSnapshot(
  value: unknown,
  context: LabelPublicationContext,
): LabelDraftInput {
  const checked = evaluate(value, context);
  if (checked.issues.length || !checked.draft || !checked.context) {
    throw new LabelPublicationBlockedError(checked.issues);
  }
  return checked.draft;
}
