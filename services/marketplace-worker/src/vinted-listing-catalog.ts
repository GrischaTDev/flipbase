/**
 * Wandelt Vinteds Verkaufsformular-Antworten in den Aufbau des lokalen Katalogs um
 * (supabase/schemas/540_vinted_listing_catalog.sql). Geprüft wird streng: Ein unerwarteter
 * Aufbau wird abgelehnt, statt geratene Werte zu speichern.
 */

export interface VintedListingCatalogNode {
  readonly id: number;
  readonly parentId: number | null;
  readonly title: string;
  readonly fullTitle: string;
  readonly path: string;
  readonly position: number;
  readonly isLeaf: boolean;
  readonly restrictedToStatusId: number | null;
}

export interface VintedListingCatalogChoice {
  readonly id: number;
  readonly title: string;
}

export interface VintedListingCatalogSizeGroup {
  readonly id: number;
  readonly title: string;
  readonly sizes: readonly VintedListingCatalogChoice[];
}

export interface VintedListingCatalogField {
  readonly code: string;
  readonly position: number;
  readonly required: boolean | null;
  readonly selectionType: 'single' | 'multi' | null;
  readonly limit: number | null;
  readonly display: string | null;
  /** Feldtitel wie bei Vinted, etwa „Rocklänge“; fehlt bei Feldern ohne Konfiguration. */
  readonly title?: string;
  readonly sizeGroups?: readonly VintedListingCatalogSizeGroup[];
  readonly options?: readonly VintedListingCatalogChoice[];
}

export interface VintedListingCatalogColor extends VintedListingCatalogChoice {
  readonly hex: string;
  readonly code: string;
}

export interface VintedListingCatalogCategoryFields {
  readonly categoryId: number;
  readonly fields: readonly VintedListingCatalogField[];
}

/** Ergebnis eines Katalogabrufs; Baum und Farben fehlen, wenn sie nicht fällig waren. */
export interface VintedListingCatalogRead {
  readonly observedAt: string;
  readonly tree?: readonly VintedListingCatalogNode[];
  readonly colors?: readonly VintedListingCatalogColor[];
  readonly categories: readonly VintedListingCatalogCategoryFields[];
}

export class VintedListingCatalogFormatError extends Error {
  constructor() {
    super('Der Vinted-Katalog hat einen unerwarteten Aufbau.');
  }
}

const invalid = (): never => {
  throw new VintedListingCatalogFormatError();
};
const positive = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && value <= 2147483647;
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : invalid();
const label = (value: unknown, max = 200): string => {
  if (typeof value !== 'string') return invalid();
  const text = value.trim();
  const control = [...text].some((character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127;
  });
  return text && text.length <= max && !control ? text : invalid();
};

/** Verkaufsbaum aus `GET /api/v2/item_upload/catalogs`. */
export function parseVintedListingCatalogTree(input: unknown): VintedListingCatalogNode[] {
  const nodes: VintedListingCatalogNode[] = [];
  const seen = new Set<number>();
  const visit = (catalogs: unknown, parentId: number | null, names: string[]): void => {
    if (!Array.isArray(catalogs) || names.length >= 30) invalid();
    (catalogs as unknown[]).forEach((value, position) => {
      const catalog = record(value);
      const id = catalog['id'];
      if (!positive(id) || seen.has(id) || nodes.length >= 10000) invalid();
      seen.add(id as number);
      const title = label(catalog['title']);
      const children = catalog['catalogs'];
      if (!Array.isArray(children)) invalid();
      const restricted = catalog['restricted_to_status_id'];
      nodes.push({
        id: id as number,
        parentId,
        title,
        fullTitle:
          catalog['full_title'] === undefined || catalog['full_title'] === null
            ? title
            : label(catalog['full_title'], 300),
        // Wie bei Vinted: der Pfad der Elternkategorien, bei Hauptkategorien leer.
        path: names.join(' > '),
        position,
        isLeaf: (children as unknown[]).length === 0,
        restrictedToStatusId:
          restricted === null || restricted === undefined
            ? null
            : positive(restricted)
              ? restricted
              : invalid(),
      });
      visit(children, id as number, [...names, title]);
    });
  };
  visit(record(input)['catalogs'], null, []);
  if (!nodes.length) invalid();
  return nodes;
}

const choice = (value: unknown): VintedListingCatalogChoice => {
  const option = record(value);
  return positive(option['id']) ? { id: option['id'], title: label(option['title']) } : invalid();
};

/** Werte einer Auswahl; Vinted fasst sie teils in Gruppen wie „Zustand“ zusammen. */
const flatChoices = (options: unknown[]): VintedListingCatalogChoice[] =>
  options.flatMap((value) => {
    const option = record(value);
    return option['type'] === 'group'
      ? Array.isArray(option['options'])
        ? (option['options'] as unknown[]).map(choice)
        : invalid()
      : [choice(option)];
  });

/** Felder einer Kategorie aus `POST /api/v2/item_upload/attributes`. */
export function parseVintedListingCategoryAttributes(input: unknown): VintedListingCatalogField[] {
  const attributes = record(input)['attributes'];
  if (!Array.isArray(attributes) || attributes.length > 50) invalid();
  const codes = new Set<string>();
  return (attributes as unknown[]).map((value, position) => {
    const attribute = record(value);
    const code = attribute['code'];
    if (typeof code !== 'string' || !/^[a-z][a-z0-9_]{0,39}$/.test(code) || codes.has(code))
      return invalid();
    codes.add(code);
    const configuration = attribute['configuration'];
    // Marke und Farbe liefert Vinted ohne Konfiguration über eigene Abrufe.
    if (configuration === null || configuration === undefined) {
      if (code === 'size') return invalid();
      return { code, position, required: null, selectionType: null, limit: null, display: null };
    }
    const config = record(configuration);
    const selectionType = config['selection_type'];
    const limit = config['selection_limit'];
    const required = config['required'];
    const display = config['display_type'];
    const options = config['options'];
    const title = config['title'];
    if (
      (selectionType !== null && selectionType !== 'single' && selectionType !== 'multi') ||
      (limit !== null && (!positive(limit) || limit > 100)) ||
      (required !== null && typeof required !== 'boolean') ||
      (display !== null && (typeof display !== 'string' || display.length > 40)) ||
      !Array.isArray(options) ||
      options.length > 1000
    )
      return invalid();
    const base = {
      code,
      position,
      required: required as boolean | null,
      selectionType: selectionType as 'single' | 'multi' | null,
      limit: limit as number | null,
      display: (display as string | null) || null,
      ...(typeof title === 'string' && title.trim() ? { title: label(title) } : {}),
    };
    if (code !== 'size') return { ...base, options: flatChoices(options as unknown[]) };
    const groups = (options as unknown[]).map((group): VintedListingCatalogSizeGroup => {
      const entry = record(group);
      if (entry['type'] !== 'group' || !positive(entry['id']) || !Array.isArray(entry['options']))
        return invalid();
      const sizes = (entry['options'] as unknown[]).map(choice);
      if (!sizes.length || sizes.length > 500) invalid();
      return { id: entry['id'], title: label(entry['title']), sizes };
    });
    if (!groups.length || groups.length > 30) invalid();
    return { ...base, sizeGroups: groups };
  });
}

/** Farben aus `GET /api/v2/item_upload/colors` in Vinteds Reihenfolge. */
export function parseVintedListingColors(input: unknown): VintedListingCatalogColor[] {
  const colors = record(input)['colors'];
  if (!Array.isArray(colors) || !colors.length || colors.length > 1000) invalid();
  const seen = new Set<number>();
  return (colors as unknown[])
    .map((value) => {
      const color = record(value);
      const { id, title } = choice(color);
      if (seen.has(id)) invalid();
      seen.add(id);
      const hex = color['hex'];
      const code = color['code'];
      const order = color['order'];
      if (
        typeof hex !== 'string' ||
        !/^([0-9A-Fa-f]{6})?$/.test(hex) ||
        typeof code !== 'string' ||
        code.length > 40 ||
        typeof order !== 'number'
      )
        invalid();
      return { id, title, hex: hex as string, code: code as string, order: order as number };
    })
    .sort((left, right) => left.order - right.order)
    .map(({ order: _order, ...color }) => color);
}

/** Prüft ein Ergebnis an der Grenze zwischen Browserprozess und Hauptprozess erneut. */
export function parseVintedListingCatalogRead(input: unknown): VintedListingCatalogRead {
  const value = record(input);
  if (
    Object.keys(value).some((key) => !['observedAt', 'tree', 'colors', 'categories'].includes(key))
  )
    invalid();
  const observedAt = value['observedAt'];
  if (typeof observedAt !== 'string' || !Number.isFinite(Date.parse(observedAt))) invalid();
  const categories = value['categories'];
  if (!Array.isArray(categories) || categories.length > 500) invalid();
  const tree =
    value['tree'] === undefined
      ? undefined
      : parseVintedListingCatalogTree({ catalogs: rebuild(value['tree']) });
  const colors =
    value['colors'] === undefined
      ? undefined
      : parseVintedListingColors({
          colors: (Array.isArray(value['colors']) ? value['colors'] : invalid()).map(
            (color, order) => ({ ...record(color), order }),
          ),
        });
  return {
    observedAt: observedAt as string,
    ...(tree ? { tree } : {}),
    ...(colors ? { colors } : {}),
    categories: (categories as unknown[]).map((entry) => {
      const item = record(entry);
      if (!positive(item['categoryId']) || !Array.isArray(item['fields'])) return invalid();
      return {
        categoryId: item['categoryId'],
        fields: parseVintedListingCategoryAttributes({
          attributes: (item['fields'] as unknown[]).map(toAttribute),
        }),
      };
    }),
  };
}

/** Baut aus der flachen Liste wieder Vinteds Baum, damit dieselbe Prüfung greift. */
function rebuild(input: unknown): unknown[] {
  if (!Array.isArray(input) || !input.length || input.length > 10000) return invalid();
  const children = new Map<number | null, Record<string, unknown>[]>();
  for (const value of input) {
    const node = record(value);
    const parentId = node['parentId'];
    if (parentId !== null && !positive(parentId)) invalid();
    const list = children.get(parentId as number | null) ?? [];
    list.push(node);
    children.set(parentId as number | null, list);
  }
  let count = 0;
  const build = (parentId: number | null, depth: number): unknown[] => {
    if (depth > 30) invalid();
    return (children.get(parentId) ?? [])
      .sort((left, right) => Number(left['position']) - Number(right['position']))
      .map((node) => {
        count++;
        return {
          id: node['id'],
          title: node['title'],
          full_title: node['fullTitle'],
          restricted_to_status_id: node['restrictedToStatusId'],
          catalogs: positive(node['id']) ? build(node['id'], depth + 1) : invalid(),
        };
      });
  };
  const roots = build(null, 0);
  if (count !== input.length) invalid();
  return roots;
}

/** Gegenstück zu parseVintedListingCategoryAttributes für die erneute Prüfung. */
function toAttribute(value: unknown): unknown {
  const field = record(value);
  if (field['selectionType'] === null && field['sizeGroups'] === undefined && !field['options'])
    return { code: field['code'], configuration: null };
  return {
    code: field['code'],
    configuration: {
      required: field['required'],
      selection_type: field['selectionType'],
      selection_limit: field['limit'],
      display_type: field['display'],
      title: field['title'],
      options:
        field['sizeGroups'] !== undefined
          ? (Array.isArray(field['sizeGroups']) ? field['sizeGroups'] : invalid()).map((group) => ({
              ...record(group),
              type: 'group',
              options: record(group)['sizes'],
            }))
          : (field['options'] ?? invalid()),
    },
  };
}
