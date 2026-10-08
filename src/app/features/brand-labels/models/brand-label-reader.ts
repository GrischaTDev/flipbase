import type {
  LabelAvailability,
  LabelCard,
  LabelContentV1,
  LabelImageAssignment,
  LabelPage,
} from './brand-label.models';
import { validateLabelDraftInput } from './brand-label-draft';
import {
  LabelValidationError,
  readLabelArray,
  readLabelId,
  readLabelObject,
  readLabelText,
} from './brand-label-validation';

export interface LabelReaderImage extends LabelImageAssignment {
  readonly attribution: string;
}
export interface LabelDetail extends LabelCard {
  readonly content: LabelContentV1;
  readonly images: readonly LabelReaderImage[];
}

const CARD_KEYS = [
  'referenceId',
  'revisionId',
  'brandSlug',
  'labelSlug',
  'title',
  'timeSummary',
  'shortFeature',
  'coverAssetId',
] as const;

function assert(value: boolean, path: string): void {
  if (!value) throw new LabelValidationError('invalid-value', path);
}
function slug(value: unknown, path: string): string {
  const text = readLabelText(value, 80, path);
  assert(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(text), path);
  return text;
}
function card(row: Record<string, unknown>): LabelCard {
  const title = readLabelText(row['title'], 160, 'card.title');
  assert(title.trim().length > 0, 'card.title');
  return {
    referenceId: readLabelId(row['referenceId'], 'card.referenceId'),
    revisionId: readLabelId(row['revisionId'], 'card.revisionId'),
    brandSlug: slug(row['brandSlug'], 'card.brandSlug'),
    labelSlug: slug(row['labelSlug'], 'card.labelSlug'),
    title,
    timeSummary: readLabelText(row['timeSummary'], 4000, 'card.timeSummary'),
    shortFeature: readLabelText(row['shortFeature'], 4000, 'card.shortFeature'),
    coverAssetId: readLabelId(row['coverAssetId'], 'card.coverAssetId'),
  };
}

/** Keine Texte oder Pfade ungeprüft aus unbekannten RPC-Antworten darstellen. */
export function readLabelAvailability(value: unknown): LabelAvailability {
  const row = readLabelObject(value, ['visible', 'operator'], 'availability');
  assert(
    typeof row['visible'] === 'boolean' && typeof row['operator'] === 'boolean',
    'availability',
  );
  return { visible: row['visible'] === true, operator: row['operator'] === true };
}
export function readLabelPage(value: unknown): LabelPage {
  const row = readLabelObject(value, ['items', 'hasMore', 'catalogVersion'], 'page');
  const items = readLabelArray(row['items'], 24, 'page.items').map((entry) =>
    card(readLabelObject(entry, CARD_KEYS, 'card')),
  );
  assert(new Set(items.map((item) => item.referenceId)).size === items.length, 'page.items');
  assert(typeof row['hasMore'] === 'boolean', 'page.hasMore');
  assert(row['hasMore'] !== true || items.length === 24, 'page.hasMore');
  const catalogVersion = readLabelText(row['catalogVersion'], 40, 'page.catalogVersion');
  assert(/^\d+$/.test(catalogVersion), 'page.catalogVersion');
  return { items, hasMore: row['hasMore'] === true, catalogVersion };
}
export function readLabelDetail(value: unknown): LabelDetail | null {
  if (value === null) return null;
  const row = readLabelObject(value, [...CARD_KEYS, 'content', 'images'], 'detail');
  const header = card(row);
  const images = readLabelArray(row['images'], 24, 'detail.images').map((entry) => {
    const image = readLabelObject(
      entry,
      ['assetId', 'position', 'caption', 'alt', 'referenceItem', 'attribution'],
      'image',
    );
    return {
      assetId: image['assetId'],
      position: image['position'],
      caption: image['caption'],
      alt: image['alt'],
      referenceItem: image['referenceItem'],
      attribution: readLabelText(image['attribution'], 4000, 'image.attribution'),
    };
  });
  const input = validateLabelDraftInput({
    content: row['content'],
    images: images.map(({ attribution: _attribution, ...image }) => image),
  });
  assert(header.title === input.content.title, 'detail.title');
  assert(header.coverAssetId === input.images[0]?.assetId, 'detail.coverAssetId');
  return {
    ...header,
    content: input.content,
    images: input.images.map((image, index) => ({
      ...image,
      attribution: images[index].attribution,
    })),
  };
}
