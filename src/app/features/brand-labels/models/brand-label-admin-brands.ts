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
    | { readonly kind: 'brand'; readonly input: { readonly name: string; readonly slug: string; readonly aliases: readonly string[] } }
    | { readonly kind: 'line'; readonly input: { readonly brandId: number; readonly name: string } }
  );
export type LabelBrandEditResult =
  | { readonly kind: 'brand'; readonly value: LabelAdminBrandRecord }
  | { readonly kind: 'line'; readonly value: LabelAdminLine };
export type LabelBrandAdminRpc = 'list_label_admin_brands' | 'save_label_brand' | 'save_label_brand_line';
export type LabelBrandAdminTransport = (
  name: LabelBrandAdminRpc,
  args: Readonly<Record<string, unknown>>,
) => PromiseLike<{ data: unknown; error: unknown }>;
export class LabelBrandAdminError extends Error {
  constructor(readonly code: 'forbidden' | 'unavailable' | 'conflict' | 'validation' | 'network') {
    super('Die Markenpflege konnte nicht bestätigt werden.');
    this.name = 'LabelBrandAdminError';
  }
}
// Zunächst absichtlich ohne Verhalten: Die neuen Vertragsprüfungen müssen fehlschlagen.
export function readLabelAdminBrands(_value: unknown): readonly LabelAdminBrand[] {
  throw new Error('Noch nicht implementiert');
}
export function prepareLabelBrandEdit(_value: unknown): LabelBrandEdit {
  throw new Error('Noch nicht implementiert');
}
export async function loadLabelAdminBrands(_transport: LabelBrandAdminTransport): Promise<readonly LabelAdminBrand[]> {
  throw new Error('Noch nicht implementiert');
}
export async function executeLabelBrandEdit(_transport: LabelBrandAdminTransport, _command: LabelBrandEdit): Promise<LabelBrandEditResult> {
  throw new Error('Noch nicht implementiert');
}
