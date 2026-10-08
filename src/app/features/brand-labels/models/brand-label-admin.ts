import type { LabelDraft } from './brand-label.models';
import { validateLabelDraftInput } from './brand-label-draft';
import {
  readLabelArray,
  readLabelId,
  readLabelObject,
  readLabelText,
} from './brand-label-validation';
export type LabelAdminState = 'all' | 'draft' | 'review' | 'published' | 'unpublished' | 'archived';
export interface LabelAdminFilter {
  readonly brandId: number | null;
  readonly state: LabelAdminState;
  readonly search: string;
}
export interface LabelAdminReference {
  readonly referenceId: number;
  readonly slug: string | null;
  readonly brandId: number;
  readonly brandName: string;
  readonly brandSlug: string;
  readonly brandArchived: boolean;
  readonly version: number;
  readonly archived: boolean;
  readonly draft: LabelDraft | null;
  readonly publication: LabelDraft | null;
}
export interface LabelAdminRow extends Omit<LabelAdminReference, 'draft' | 'publication'> {
  readonly title: string;
  readonly state: LabelAdminState;
  readonly draftRevisionId: number | null;
  readonly draftVersion: number | null;
  readonly publishedRevisionId: number | null;
}
export interface LabelAdminPage {
  readonly rows: readonly LabelAdminRow[];
  readonly hasMore: boolean;
  readonly nextOffset: number | null;
}
export type LabelAdminCommand =
  | Readonly<{ action: 'create'; brandId: number; requestId: string }>
  | Readonly<{ action: 'edit'; referenceId: number; requestId: string }>
  | Readonly<{
      action: 'archive' | 'restore';
      referenceId: number;
      expectedVersion: number;
      requestId: string;
    }>;
const boolean = (value: unknown): boolean => {
  if (typeof value !== 'boolean') throw new Error('Invalid boolean');
  return value;
};
const nullableId = (value: unknown): number | null =>
  value === null ? null : readLabelId(value, 'id');
export function readAdminDraft(value: unknown): LabelDraft | null {
  if (value === null) return null;
  const row = readLabelObject(
    value,
    ['referenceId', 'revisionId', 'version', 'state', 'input'],
    'draft',
  );
  const state = row['state'];
  if (state !== 'draft' && state !== 'review' && state !== 'published' && state !== 'discarded')
    throw new Error('Invalid state');
  return {
    referenceId: readLabelId(row['referenceId'], 'referenceId'),
    revisionId: readLabelId(row['revisionId'], 'revisionId'),
    version: readLabelId(row['version'], 'version'),
    state,
    input: validateLabelDraftInput(row['input']),
  };
}
function base(row: Record<string, unknown>) {
  return {
    referenceId: readLabelId(row['referenceId'], 'referenceId'),
    slug: row['slug'] === null ? null : readLabelText(row['slug'], 160, 'slug'),
    brandId: readLabelId(row['brandId'], 'brandId'),
    brandName: readLabelText(row['brandName'], 160, 'brandName'),
    brandSlug: readLabelText(row['brandSlug'], 80, 'brandSlug'),
    brandArchived: boolean(row['brandArchived']),
    version: readLabelId(row['version'], 'version'),
    archived: boolean(row['archived']),
  };
}
const baseKeys = [
  'referenceId',
  'slug',
  'brandId',
  'brandName',
  'brandSlug',
  'brandArchived',
  'version',
  'archived',
];
export function readAdminReference(value: unknown): LabelAdminReference | null {
  if (value === null) return null;
  const row = readLabelObject(value, [...baseKeys, 'draft', 'publication'], 'reference');
  const reference = {
    ...base(row),
    draft: readAdminDraft(row['draft']),
    publication: readAdminDraft(row['publication']),
  };
  if (
    (reference.draft && !['draft', 'review'].includes(reference.draft.state)) ||
    (reference.publication && reference.publication.state !== 'published') ||
    (reference.draft && reference.draft.referenceId !== reference.referenceId) ||
    (reference.publication && reference.publication.referenceId !== reference.referenceId)
  )
    throw new Error('Invalid reference');
  return reference;
}
export function readAdminPage(value: unknown): LabelAdminPage {
  const page = readLabelObject(value, ['rows', 'hasMore', 'nextOffset'], 'page');
  const rows = readLabelArray(page['rows'], 24, 'rows').map((value): LabelAdminRow => {
    const row = readLabelObject(
      value,
      [...baseKeys, 'title', 'state', 'draftRevisionId', 'draftVersion', 'publishedRevisionId'],
      'row',
    );
    const state = row['state'];
    if (
      state !== 'draft' &&
      state !== 'review' &&
      state !== 'published' &&
      state !== 'unpublished' &&
      state !== 'archived'
    )
      throw new Error('Invalid state');
    return {
      ...base(row),
      title: readLabelText(row['title'], 160, 'title'),
      state,
      draftRevisionId: nullableId(row['draftRevisionId']),
      draftVersion: nullableId(row['draftVersion']),
      publishedRevisionId: nullableId(row['publishedRevisionId']),
    };
  });
  const hasMore = boolean(page['hasMore']);
  const nextOffset = nullableId(page['nextOffset']);
  if (
    hasMore !== (nextOffset !== null) ||
    (nextOffset !== null && nextOffset % 24 !== 0) ||
    new Set(rows.map((row) => row.referenceId)).size !== rows.length
  )
    throw new Error('Invalid page');
  return { rows, hasMore, nextOffset };
}
export function prepareAdminCommand(command: LabelAdminCommand): LabelAdminCommand {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(command.requestId))
    throw new Error('Invalid request');
  readLabelId(command.action === 'create' ? command.brandId : command.referenceId, 'id');
  if (command.action === 'archive' || command.action === 'restore')
    readLabelId(command.expectedVersion, 'version');
  return Object.freeze({ ...command });
}
export interface LabelReaderCommand {
  readonly action: 'reader';
  readonly enabled: boolean;
  readonly requestId: string;
}
export function prepareReaderCommand(enabled: boolean, requestId: string): LabelReaderCommand {
  if (
    typeof enabled !== 'boolean' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId)
  )
    throw new Error('Invalid reader command');
  return Object.freeze({ action: 'reader', enabled, requestId });
}
export function readReaderReceipt(value: unknown, command: LabelReaderCommand): boolean {
  const row = readLabelObject(value, ['visible', 'operator', 'readerEnabled'], 'readerReceipt');
  if (
    row['visible'] !== true ||
    row['operator'] !== true ||
    row['readerEnabled'] !== command.enabled
  )
    throw new Error('Invalid reader receipt');
  return command.enabled;
}
