import type { LabelDraftInput, LabelId, LabelImageAssignment } from './brand-label.models';
import { LABEL_LIMITS } from './brand-label-limits';
import { validateLabelContent } from './brand-label-content';
import {
  LabelValidationError,
  assertLabelJsonSize,
  assertUniqueLabelValues,
  readLabelArray,
  readLabelId,
  readLabelObject,
  readLabelText,
} from './brand-label-validation';

function imageAssignments(value: unknown): LabelImageAssignment[] {
  const images = readLabelArray(value, LABEL_LIMITS.images, 'images').map((entry, index) => {
    const path = `images[${index}]`;
    const image = readLabelObject(
      entry,
      ['assetId', 'position', 'caption', 'alt', 'referenceItem'],
      path,
    );
    if (image['position'] !== index) {
      throw new LabelValidationError('invalid-image-order', `${path}.position`);
    }
    return {
      assetId: readLabelId(image['assetId'], `${path}.assetId`),
      position: index,
      caption: readLabelText(
        image['caption'],
        LABEL_LIMITS.descriptionCharacters,
        `${path}.caption`,
      ),
      alt: readLabelText(image['alt'], LABEL_LIMITS.descriptionCharacters, `${path}.alt`),
      referenceItem: readLabelText(
        image['referenceItem'],
        LABEL_LIMITS.nameCharacters,
        `${path}.referenceItem`,
      ),
    };
  });
  assertUniqueLabelValues(
    images.map((image) => image.assetId),
    'images',
    'duplicate-image',
  );
  return images;
}

/** Strukturelle Eingabeprüfung. Bildverfügbarkeit und Freigaben gehören auf den Server. */
export function validateLabelDraftInput(value: unknown): LabelDraftInput {
  const record = readLabelObject(value, ['content', 'images'], 'draft');
  const result: LabelDraftInput = {
    content: validateLabelContent(record['content']),
    images: imageAssignments(record['images']),
  };
  assertLabelJsonSize(result, 'draft');
  return result;
}

/**
 * Gemeinsamer Sortiervertrag für Ziehen und Verschiebebuttons. Der erste Eintrag
 * ist das Titelbild. Die Funktion bearbeitet weder Ausgangsliste noch Serverdaten.
 */
export function reorderLabelImages(
  images: readonly LabelImageAssignment[],
  orderedAssetIds: readonly LabelId[],
): readonly LabelImageAssignment[] {
  const validated = imageAssignments(images);
  const order = readLabelArray(orderedAssetIds, LABEL_LIMITS.images, 'imageOrder').map(
    (entry, index) => readLabelId(entry, `imageOrder[${index}]`),
  );
  assertUniqueLabelValues(order, 'imageOrder', 'invalid-image-order');
  if (order.length !== validated.length) {
    throw new LabelValidationError('invalid-image-order', 'imageOrder');
  }
  const byId = new Map(validated.map((image) => [image.assetId, image]));
  return order.map((id, position) => {
    const image = byId.get(id);
    if (!image) throw new LabelValidationError('invalid-image-order', 'imageOrder');
    return { ...image, position };
  });
}
