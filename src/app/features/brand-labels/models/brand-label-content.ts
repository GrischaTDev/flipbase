import type {
  LabelCheckHint,
  LabelContentV1,
  LabelEvidenceLevel,
  LabelInterval,
  LabelKind,
  LabelSource,
} from './brand-label.models';
import { LABEL_LIMITS } from './brand-label-limits';
import {
  LabelValidationError,
  assertLabelJsonSize,
  assertUniqueLabelValues,
  readLabelArray,
  readLabelDate,
  readLabelId,
  readLabelObject,
  readLabelSourceUrl,
  readLabelText,
  readLabelYear,
} from './brand-label-validation';

const CONTENT_KEYS = [
  'title',
  'aliases',
  'brandLineId',
  'brandName',
  'brandLineName',
  'kinds',
  'timeSummary',
  'evidenceLevel',
  'intervals',
  'features',
  'checkHints',
  'limitations',
  'relatedReferenceIds',
  'sources',
  'reviewedAt',
] as const;

/** Keine Marke, Datierung oder Echtheitsaussage aus einem leeren Entwurf ableiten. */
export function createEmptyLabelContent(): LabelContentV1 {
  return {
    title: '',
    aliases: [],
    brandLineId: null,
    brandName: '',
    brandLineName: null,
    kinds: [],
    timeSummary: '',
    evidenceLevel: 'undated',
    intervals: [],
    features: [],
    checkHints: [],
    limitations: [],
    relatedReferenceIds: [],
    sources: [],
    reviewedAt: null,
  };
}

function textList(value: unknown, count: number, width: number, path: string): string[] {
  return readLabelArray(value, count, path).map((entry, index) =>
    readLabelText(entry, width, `${path}[${index}]`),
  );
}

function sources(value: unknown): LabelSource[] {
  const result = readLabelArray(value, LABEL_LIMITS.sources, 'content.sources').map(
    (entry, index) => {
      const path = `content.sources[${index}]`;
      const source = readLabelObject(
        entry,
        ['id', 'title', 'publisher', 'url', 'accessedAt', 'locator'],
        path,
      );
      const id = readLabelText(source['id'], LABEL_LIMITS.sourceIdCharacters, `${path}.id`);
      if (!id.trim()) throw new LabelValidationError('invalid-source-id', `${path}.id`);
      return {
        id,
        title: readLabelText(source['title'], LABEL_LIMITS.nameCharacters, `${path}.title`),
        publisher: readLabelText(
          source['publisher'],
          LABEL_LIMITS.nameCharacters,
          `${path}.publisher`,
        ),
        url: readLabelSourceUrl(source['url'], `${path}.url`),
        accessedAt: readLabelDate(source['accessedAt'], `${path}.accessedAt`),
        locator: readLabelText(
          source['locator'],
          LABEL_LIMITS.descriptionCharacters,
          `${path}.locator`,
        ),
      };
    },
  );
  assertUniqueLabelValues(
    result.map((source) => source.id),
    'content.sources',
    'duplicate-source',
  );
  return result;
}

function sourceIds(value: unknown, known: ReadonlySet<string>, path: string): string[] {
  const ids = textList(value, LABEL_LIMITS.sources, LABEL_LIMITS.sourceIdCharacters, path);
  assertUniqueLabelValues(ids, path);
  for (let index = 0; index < ids.length; index += 1) {
    const id = ids[index];
    if (id === undefined || !known.has(id)) {
      throw new LabelValidationError('unknown-source', `${path}[${index}]`);
    }
  }
  return ids;
}

function intervals(value: unknown, known: ReadonlySet<string>): LabelInterval[] {
  return readLabelArray(value, LABEL_LIMITS.intervals, 'content.intervals').map((entry, index) => {
    const path = `content.intervals[${index}]`;
    const item = readLabelObject(entry, ['startYear', 'endYear', 'sourceIds'], path);
    const startYear = readLabelYear(item['startYear'], `${path}.startYear`);
    const endYear = readLabelYear(item['endYear'], `${path}.endYear`);
    if (startYear !== null && endYear !== null && startYear > endYear) {
      throw new LabelValidationError('invalid-interval', path);
    }
    return {
      startYear,
      endYear,
      sourceIds: sourceIds(item['sourceIds'], known, `${path}.sourceIds`),
    };
  });
}

function checkHints(value: unknown, known: ReadonlySet<string>): LabelCheckHint[] {
  return readLabelArray(value, LABEL_LIMITS.checkHints, 'content.checkHints').map(
    (entry, index) => {
      const path = `content.checkHints[${index}]`;
      const hint = readLabelObject(entry, ['text', 'sourceIds'], path);
      return {
        text: readLabelText(hint['text'], LABEL_LIMITS.descriptionCharacters, `${path}.text`),
        sourceIds: sourceIds(hint['sourceIds'], known, `${path}.sourceIds`),
      };
    },
  );
}

function labelKinds(value: unknown): LabelKind[] {
  const result = readLabelArray(value, 2, 'content.kinds').map((entry, index): LabelKind => {
    if (entry !== 'neck-label' && entry !== 'care-size-label') {
      throw new LabelValidationError('invalid-value', `content.kinds[${index}]`);
    }
    return entry;
  });
  assertUniqueLabelValues(result, 'content.kinds');
  return result;
}

function evidenceLevel(value: unknown): LabelEvidenceLevel {
  if (value !== 'well-supported' && value !== 'partially-supported' && value !== 'undated') {
    throw new LabelValidationError('invalid-value', 'content.evidenceLevel');
  }
  return value;
}

/**
 * Prüft ausschließlich den Datenvertrag eines Entwurfs. Diese Funktion vergibt
 * keine Schreibrechte, prüft keine Bildlizenzen und erlaubt keine Veröffentlichung.
 * Sie rekonstruiert das Ergebnis, damit fremde Objektverweise nicht durchrutschen.
 */
export function validateLabelContent(value: unknown): LabelContentV1 {
  const record = readLabelObject(value, CONTENT_KEYS, 'content');
  const validatedSources = sources(record['sources']);
  const knownSources = new Set(validatedSources.map((source) => source.id));
  const relatedReferenceIds = readLabelArray(
    record['relatedReferenceIds'],
    LABEL_LIMITS.relatedReferences,
    'content.relatedReferenceIds',
  ).map((entry, index) => readLabelId(entry, `content.relatedReferenceIds[${index}]`));
  assertUniqueLabelValues(relatedReferenceIds, 'content.relatedReferenceIds');
  const result: LabelContentV1 = {
    title: readLabelText(record['title'], LABEL_LIMITS.nameCharacters, 'content.title'),
    aliases: textList(
      record['aliases'],
      LABEL_LIMITS.aliases,
      LABEL_LIMITS.aliasCharacters,
      'content.aliases',
    ),
    brandLineId:
      record['brandLineId'] === null
        ? null
        : readLabelId(record['brandLineId'], 'content.brandLineId'),
    brandName: readLabelText(record['brandName'], LABEL_LIMITS.nameCharacters, 'content.brandName'),
    brandLineName:
      record['brandLineName'] === null
        ? null
        : readLabelText(
            record['brandLineName'],
            LABEL_LIMITS.nameCharacters,
            'content.brandLineName',
          ),
    kinds: labelKinds(record['kinds']),
    timeSummary: readLabelText(
      record['timeSummary'],
      LABEL_LIMITS.descriptionCharacters,
      'content.timeSummary',
    ),
    evidenceLevel: evidenceLevel(record['evidenceLevel']),
    intervals: intervals(record['intervals'], knownSources),
    features: textList(
      record['features'],
      LABEL_LIMITS.features,
      LABEL_LIMITS.descriptionCharacters,
      'content.features',
    ),
    checkHints: checkHints(record['checkHints'], knownSources),
    limitations: textList(
      record['limitations'],
      LABEL_LIMITS.limitations,
      LABEL_LIMITS.descriptionCharacters,
      'content.limitations',
    ),
    relatedReferenceIds,
    sources: validatedSources,
    reviewedAt: readLabelDate(record['reviewedAt'], 'content.reviewedAt'),
  };
  assertLabelJsonSize(result, 'content');
  return result;
}
