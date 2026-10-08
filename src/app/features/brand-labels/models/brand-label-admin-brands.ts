import { LABEL_LIMITS } from './brand-label-limits';
import {
  readLabelArray,
  readLabelId,
  readLabelObject,
  readLabelText,
} from './brand-label-validation';

export interface LabelAdminLine {
  readonly id: number;
  readonly brandId: number;
  readonly name: string;
  readonly version: number;
  readonly archived: boolean;
}
export interface LabelAdminBrandRecord {
  readonly id: number;
  readonly name: string;
  readonly slug: string;
  readonly aliases: readonly string[];
  readonly version: number;
  readonly archived: boolean;
}
export interface LabelAdminBrand extends LabelAdminBrandRecord {
  readonly lines: readonly LabelAdminLine[];
}
interface LabelBrandEditBase {
  readonly id: number | null;
  readonly expectedVersion: number | null;
  readonly requestId: string;
}
export type LabelBrandEdit = LabelBrandEditBase &
  (
    | {
        readonly kind: 'brand';
        readonly input: {
          readonly name: string;
          readonly slug: string;
          readonly aliases: readonly string[];
        };
      }
    | { readonly kind: 'line'; readonly input: { readonly brandId: number; readonly name: string } }
  );
export type LabelBrandEditResult =
  | { readonly kind: 'brand'; readonly value: LabelAdminBrandRecord }
  | { readonly kind: 'line'; readonly value: LabelAdminLine };
export type LabelBrandAdminRpc =
  | 'list_label_admin_brands'
  | 'save_label_brand'
  | 'save_label_brand_line'
  | 'set_label_brand_archive';
export type LabelBrandAdminTransport = (
  name: LabelBrandAdminRpc,
  args: Readonly<Record<string, unknown>>,
) => PromiseLike<{ data: unknown; error: unknown }>;

type AdminErrorCode = 'forbidden' | 'unavailable' | 'conflict' | 'validation' | 'network';
const messages: Record<AdminErrorCode, string> = {
  forbidden: 'Du darfst die Referenzmarken nicht bearbeiten.',
  unavailable: 'Die Markenpflege ist noch nicht verfügbar. Bitte lade die Seite erneut.',
  conflict: 'Der Eintrag wurde inzwischen geändert. Deine Eingaben bleiben erhalten.',
  validation: 'Bitte prüfe Namen, Kurzbezeichnung und Alternativnamen.',
  network: 'Die Speicherung ist nicht bestätigt. Wiederhole nur den ursprünglichen Auftrag.',
};
export class LabelBrandAdminError extends Error {
  constructor(readonly code: AdminErrorCode) {
    super(messages[code]);
    this.name = 'LabelBrandAdminError';
  }
}
function name(value: unknown, maximum: number, path: string): string {
  const result = readLabelText(value, maximum, path);
  if (!result.trim()) throw new LabelBrandAdminError('validation');
  return result;
}
function slug(value: unknown): string {
  const result = readLabelText(value, 80, 'brand.slug');
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(result)) throw new LabelBrandAdminError('validation');
  return result;
}
function archived(value: unknown): boolean {
  if (typeof value !== 'boolean') throw new LabelBrandAdminError('validation');
  return value;
}
function aliases(value: unknown): readonly string[] {
  return readLabelArray(value, 20, 'brand.aliases').map((entry) =>
    readLabelText(entry, 80, 'brand.aliases'),
  );
}
function brandRecord(row: Record<string, unknown>): LabelAdminBrandRecord {
  return {
    id: readLabelId(row['id'], 'brand.id'),
    name: name(row['name'], 160, 'brand.name'),
    slug: slug(row['slug']),
    aliases: aliases(row['aliases']),
    version: readLabelId(row['version'], 'brand.version'),
    archived: archived(row['archived']),
  };
}
function lineRecord(value: unknown): LabelAdminLine {
  const row = readLabelObject(value, ['id', 'brandId', 'name', 'version', 'archived'], 'line');
  return {
    id: readLabelId(row['id'], 'line.id'),
    brandId: readLabelId(row['brandId'], 'line.brandId'),
    name: name(row['name'], 160, 'line.name'),
    version: readLabelId(row['version'], 'line.version'),
    archived: archived(row['archived']),
  };
}
export function readLabelAdminBrands(value: unknown): readonly LabelAdminBrand[] {
  const brands = new Set<number>();
  const lines = new Set<number>();
  return readLabelArray(value, 10000, 'brands').map((value) => {
    const row = readLabelObject(
      value,
      ['id', 'name', 'slug', 'aliases', 'version', 'archived', 'lines'],
      'brand',
    );
    const brand = brandRecord(row);
    if (brands.has(brand.id)) throw new LabelBrandAdminError('validation');
    brands.add(brand.id);
    return {
      ...brand,
      lines: readLabelArray(row['lines'], 10000, 'brand.lines').map((value) => {
        const line = lineRecord(value);
        if (line.brandId !== brand.id || lines.has(line.id)) {
          throw new LabelBrandAdminError('validation');
        }
        lines.add(line.id);
        return line;
      }),
    };
  });
}
export function prepareLabelBrandEdit(value: unknown): LabelBrandEdit {
  try {
    const row = readLabelObject(
      value,
      ['kind', 'id', 'expectedVersion', 'requestId', 'input'],
      'command',
    );
    const id = row['id'] === null ? null : readLabelId(row['id'], 'command.id');
    const version =
      row['expectedVersion'] === null
        ? null
        : readLabelId(row['expectedVersion'], 'command.expectedVersion');
    if (
      (id === null) !== (version === null) ||
      (version !== null && version >= LABEL_LIMITS.maxId)
    ) {
      throw new LabelBrandAdminError('validation');
    }
    const requestId = readLabelText(row['requestId'], 36, 'command.requestId');
    if (!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(requestId)) {
      throw new LabelBrandAdminError('validation');
    }
    const base = { id, expectedVersion: version, requestId: requestId.toLowerCase() };
    if (row['kind'] === 'brand') {
      const input = readLabelObject(row['input'], ['name', 'slug', 'aliases'], 'brand');
      return Object.freeze({
        ...base,
        kind: 'brand',
        input: Object.freeze({
          name: name(input['name'], 160, 'brand.name'),
          slug: slug(input['slug']),
          aliases: Object.freeze(aliases(input['aliases'])),
        }),
      });
    }
    if (row['kind'] === 'line') {
      const input = readLabelObject(row['input'], ['brandId', 'name'], 'line');
      return Object.freeze({
        ...base,
        kind: 'line',
        input: Object.freeze({
          brandId: readLabelId(input['brandId'], 'line.brandId'),
          name: name(input['name'], 160, 'line.name'),
        }),
      });
    }
    throw new LabelBrandAdminError('validation');
  } catch {
    throw new LabelBrandAdminError('validation');
  }
}
function field(value: unknown, key: string): unknown {
  if (value === null || typeof value !== 'object') return undefined;
  const property = Object.getOwnPropertyDescriptor(value, key);
  return property && 'value' in property ? property.value : undefined;
}
function errorCode(error: unknown): AdminErrorCode {
  const code = field(error, 'code');
  if (code === '42501' || field(error, 'status') === 403) return 'forbidden';
  if (['PGRST202', 'PGRST301', 'PGRST302', 'P0002'].includes(String(code))) return 'unavailable';
  if (code === 'P0001' && field(error, 'details') === 'label_version_conflict') return 'conflict';
  if (code === '22023' || code === '23505') return 'validation';
  return 'network';
}
async function call(
  transport: LabelBrandAdminTransport,
  rpc: LabelBrandAdminRpc,
  args: Record<string, unknown>,
): Promise<unknown> {
  let response: unknown;
  try {
    response = await transport(rpc, args);
  } catch {
    throw new LabelBrandAdminError('network');
  }
  const error = field(response, 'error');
  if (error !== null) throw new LabelBrandAdminError(errorCode(error));
  return field(response, 'data');
}
export async function loadLabelAdminBrands(
  transport: LabelBrandAdminTransport,
): Promise<readonly LabelAdminBrand[]> {
  const data = await call(transport, 'list_label_admin_brands', {});
  try {
    return readLabelAdminBrands(data);
  } catch {
    throw new LabelBrandAdminError('network');
  }
}
export async function executeLabelBrandEdit(
  transport: LabelBrandAdminTransport,
  command: LabelBrandEdit,
): Promise<LabelBrandEditResult> {
  const checked = prepareLabelBrandEdit(command);
  const data = await call(
    transport,
    checked.kind === 'brand' ? 'save_label_brand' : 'save_label_brand_line',
    {
      p_id: checked.id,
      p_expected_version: checked.expectedVersion,
      p_input: checked.input,
      p_request_id: checked.requestId,
    },
  );
  try {
    const result =
      checked.kind === 'brand'
        ? brandRecord(
            readLabelObject(
              data,
              ['id', 'name', 'slug', 'aliases', 'version', 'archived'],
              'brand',
            ),
          )
        : lineRecord(data);
    if (
      (checked.id !== null && checked.id !== result.id) ||
      result.version !== (checked.expectedVersion ?? 0) + 1 ||
      result.name !== checked.input.name ||
      result.archived
    ) {
      throw new LabelBrandAdminError('network');
    }
    if (checked.kind === 'brand' && 'slug' in result) {
      if (
        checked.input.slug !== result.slug ||
        JSON.stringify(checked.input.aliases) !== JSON.stringify(result.aliases)
      ) {
        throw new LabelBrandAdminError('network');
      }
      return { kind: 'brand', value: result };
    }
    if (
      checked.kind === 'line' &&
      'brandId' in result &&
      result.brandId === checked.input.brandId
    ) {
      return { kind: 'line', value: result };
    }
    throw new LabelBrandAdminError('network');
  } catch {
    throw new LabelBrandAdminError('network');
  }
}
export interface LabelBrandArchiveCommand {
  readonly kind: 'brand' | 'line';
  readonly id: number;
  readonly expectedVersion: number;
  readonly archived: boolean;
  readonly requestId: string;
}
export function prepareLabelBrandArchive(
  value: LabelBrandArchiveCommand,
): LabelBrandArchiveCommand {
  const row = readLabelObject(
    value,
    ['kind', 'id', 'expectedVersion', 'archived', 'requestId'],
    'archive',
  );
  if (row['kind'] !== 'brand' && row['kind'] !== 'line')
    throw new LabelBrandAdminError('validation');
  if (
    typeof row['archived'] !== 'boolean' ||
    typeof row['requestId'] !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(row['requestId'])
  )
    throw new LabelBrandAdminError('validation');
  return Object.freeze({
    kind: row['kind'],
    id: readLabelId(row['id'], 'archive.id'),
    expectedVersion: readLabelId(row['expectedVersion'], 'archive.version'),
    archived: row['archived'],
    requestId: row['requestId'],
  });
}
export async function executeLabelBrandArchive(
  transport: LabelBrandAdminTransport,
  value: LabelBrandArchiveCommand,
): Promise<number> {
  const command = prepareLabelBrandArchive(value);
  const result = await call(transport, 'set_label_brand_archive', {
    p_id: command.id,
    p_expected_version: command.expectedVersion,
    p_archived: command.archived,
    p_line: command.kind === 'line',
    p_request_id: command.requestId,
  });
  try {
    const row = readLabelObject(result, ['version'], 'archiveReceipt');
    const version = readLabelId(row['version'], 'archiveReceipt.version');
    if (version !== command.expectedVersion + 1) throw new Error('Invalid version');
    return version;
  } catch {
    throw new LabelBrandAdminError('network');
  }
}
