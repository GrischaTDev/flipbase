import {
  readLabelArray,
  readLabelDate,
  readLabelId,
  readLabelObject,
  readLabelSourceUrl,
  readLabelText,
} from './brand-label-validation';

export interface SizeReferenceContent {
  readonly title: string;
  readonly category: 'trousers' | 'tops' | 'shoes' | 'other';
  readonly audience: 'women' | 'men' | 'unisex' | 'children';
  readonly measurement: 'body' | 'garment';
  readonly notes: string;
  readonly sourceTitle: string;
  readonly sourceUrl: string;
  readonly reviewedAt: string | null;
  readonly columns: readonly string[];
  readonly rows: readonly (readonly string[])[];
}
export interface SizeReference {
  readonly id: number;
  readonly version: number;
  readonly brandId: number | null;
  readonly brandName: string | null;
  readonly archived: boolean;
  readonly published: boolean;
  readonly hasDraftChanges: boolean;
  readonly content: SizeReferenceContent;
}

function choice<T extends string>(entry: unknown, options: readonly T[]): T {
  const selected = options.find((option) => option === entry);
  if (!selected) throw new Error('Bitte prüfe Kategorie, Zielgruppe und Maßart.');
  return selected;
}

export function readSizeContent(value: unknown): SizeReferenceContent {
  const content = readLabelObject(
    value,
    [
      'title',
      'category',
      'audience',
      'measurement',
      'notes',
      'sourceTitle',
      'sourceUrl',
      'reviewedAt',
      'columns',
      'rows',
    ],
    'sizes',
  );
  const columns = readLabelArray(content['columns'], 12, 'sizes.columns').map((column) =>
    readLabelText(column, 80, 'sizes.column'),
  );
  if (
    !columns.length ||
    columns.some((column) => !column.trim()) ||
    new Set(columns).size !== columns.length
  )
    throw new Error('Bitte gib bis zu zwölf unterschiedliche Spaltenüberschriften an.');
  const rows = readLabelArray(content['rows'], 100, 'sizes.rows').map((entry) => {
    const cells = readLabelArray(entry, 12, 'sizes.row').map((cell) =>
      readLabelText(cell, 160, 'sizes.cell'),
    );
    if (cells.length !== columns.length)
      throw new Error('Jede Zeile muss genau einen Wert je Spalte enthalten.');
    return cells;
  });
  const title = readLabelText(content['title'], 160, 'sizes.title');
  if (!title.trim()) throw new Error('Bitte gib einen Titel an.');
  return {
    title,
    category: choice(content['category'], ['trousers', 'tops', 'shoes', 'other']),
    audience: choice(content['audience'], ['women', 'men', 'unisex', 'children']),
    measurement: choice(content['measurement'], ['body', 'garment']),
    notes: readLabelText(content['notes'], 4000, 'sizes.notes'),
    sourceTitle: readLabelText(content['sourceTitle'], 160, 'sizes.sourceTitle'),
    sourceUrl: readLabelSourceUrl(content['sourceUrl'], 'sizes.sourceUrl'),
    reviewedAt: readLabelDate(content['reviewedAt'], 'sizes.reviewedAt'),
    columns,
    rows,
  };
}

export function parseSizeTable(columnsText: string, rowsText: string) {
  const split = (line: string) =>
    line.split(line.includes('\t') ? '\t' : ';').map((cell) => cell.trim());
  return {
    columns: split(columnsText),
    rows: rowsText
      .split(/\r?\n/)
      .filter((line) => line.trim())
      .map(split),
  };
}

export function readSizeReferences(value: unknown): readonly SizeReference[] {
  const seen = new Set<number>();
  return readLabelArray(value, 10000, 'sizes').map((entry) => {
    const reference = readLabelObject(
      entry,
      [
        'id',
        'version',
        'brandId',
        'brandName',
        'archived',
        'published',
        'hasDraftChanges',
        'content',
      ],
      'reference',
    );
    const id = readLabelId(reference['id'], 'reference.id');
    if (
      seen.has(id) ||
      typeof reference['archived'] !== 'boolean' ||
      typeof reference['published'] !== 'boolean' ||
      typeof reference['hasDraftChanges'] !== 'boolean'
    )
      throw new Error('Die Größenreferenzen konnten nicht geladen werden.');
    seen.add(id);
    return {
      id,
      version: readLabelId(reference['version'], 'reference.version'),
      brandId:
        reference['brandId'] === null
          ? null
          : readLabelId(reference['brandId'], 'reference.brandId'),
      brandName:
        reference['brandName'] === null
          ? null
          : readLabelText(reference['brandName'], 160, 'reference.brandName'),
      archived: reference['archived'],
      published: reference['published'],
      hasDraftChanges: reference['hasDraftChanges'],
      content: readSizeContent(reference['content']),
    };
  });
}
