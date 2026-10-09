import type { VintedListingContent } from '../../../../../supabase/functions/_shared/marketplace-listing-contracts';
export type { VintedListingContent } from '../../../../../supabase/functions/_shared/marketplace-listing-contracts';

export type VintedListingTemplateFields = Partial<VintedListingContent>;
export type VintedListingContentField = keyof VintedListingContent;

export function emptyVintedListingContent(): VintedListingContent {
  return {
    title: '',
    description: '',
    priceCents: null,
    currency: 'EUR',
    categoryId: null,
    categoryLabel: '',
    brandId: null,
    brandLabel: '',
    sizeId: null,
    sizeLabel: '',
    conditionId: null,
    conditionLabel: '',
    colorIds: [],
    colorLabels: [],
    materialIds: [],
    materialLabels: [],
    packageSizeId: null,
    attributes: {},
  };
}

function invalidContent(): never {
  throw new Error('Die gespeicherten Inseratangaben sind ungültig.');
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalidContent();
  return value as Record<string, unknown>;
}

function text(value: unknown): string {
  if (
    typeof value !== 'string' ||
    value.length > 20_000 ||
    Array.from(value).some((character) => {
      const code = character.charCodeAt(0);
      return code === 127 || (code < 32 && code !== 9 && code !== 10 && code !== 13);
    })
  )
    return invalidContent();
  return value;
}

function identifier(value: unknown): number | null {
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0)
    return invalidContent();
  return value;
}

function identifiers(value: unknown): readonly number[] {
  if (!Array.isArray(value) || value.length > 100) return invalidContent();
  const result = value.map((entry) => identifier(entry) ?? invalidContent());
  if (new Set(result).size !== result.length) return invalidContent();
  return result;
}

function texts(value: unknown): readonly string[] {
  if (!Array.isArray(value) || value.length > 100) return invalidContent();
  return value.map(text);
}

export function parseVintedListingContent(value: unknown): VintedListingContent {
  const input = object(value);
  const defaults = emptyVintedListingContent();
  if (Object.keys(input).some((key) => !Object.hasOwn(defaults, key))) return invalidContent();
  const source = { ...defaults, ...input };
  const price = source.priceCents;
  if (price !== null && (typeof price !== 'number' || !Number.isSafeInteger(price) || price < 0))
    return invalidContent();
  if (source.currency !== 'EUR') return invalidContent();
  const attributes = object(source.attributes);
  if (Object.keys(attributes).length > 100) return invalidContent();
  for (const key of Object.keys(attributes)) {
    if (
      !/^[a-zA-Z][a-zA-Z0-9_]{0,99}$/.test(key) ||
      ['constructor', 'prototype', '__proto__'].includes(key)
    )
      return invalidContent();
  }
  return {
    title: text(source.title),
    description: text(source.description),
    priceCents: price,
    currency: 'EUR',
    categoryId: identifier(source.categoryId),
    categoryLabel: text(source.categoryLabel),
    brandId: identifier(source.brandId),
    brandLabel: text(source.brandLabel),
    sizeId: identifier(source.sizeId),
    sizeLabel: text(source.sizeLabel),
    conditionId: identifier(source.conditionId),
    conditionLabel: text(source.conditionLabel),
    colorIds: identifiers(source.colorIds),
    colorLabels: texts(source.colorLabels),
    materialIds: identifiers(source.materialIds),
    materialLabels: texts(source.materialLabels),
    packageSizeId: identifier(source.packageSizeId),
    attributes: Object.fromEntries(
      Object.entries(attributes).map(([key, entry]) => [key, text(entry)]),
    ),
  };
}

/** Centbeträge entstehen aus Dezimalziffern, nicht aus gerundeter Gleitkomma-Multiplikation. */
export function parseVintedListingPrice(value: string): number | null {
  const normalized = value.trim();
  if (!normalized) return null;
  if (!/^\d+(?:[,.]\d{1,2})?$/.test(normalized))
    throw new Error(
      'Bitte einen gültigen Verkaufspreis mit höchstens zwei Nachkommastellen eingeben.',
    );
  const [euros, decimals = ''] = normalized.split(/[,.]/);
  const cents = Number(euros) * 100 + Number(decimals.padEnd(2, '0'));
  if (!Number.isSafeInteger(cents)) throw new Error('Der Verkaufspreis ist zu groß.');
  return cents;
}

function variables(content: VintedListingContent): Readonly<Record<string, string>> {
  return {
    brand: content.brandLabel,
    size: content.sizeLabel,
    category: content.categoryLabel,
    condition: content.conditionLabel,
    color: content.colorLabels.join(' / '),
    material: content.materialLabels.join(' / '),
    price:
      content.priceCents === null ? '' : (content.priceCents / 100).toFixed(2).replace('.', ','),
  };
}

export function missingVintedListingVariables(content: VintedListingContent): readonly string[] {
  const values = variables(content);
  const missing = new Set<string>();
  for (const match of `${content.title}\n${content.description}`.matchAll(/\{\s*([^{}]+?)\s*\}/g)) {
    const key = match[1].trim().toLowerCase();
    if (!Object.hasOwn(values, key) || !values[key]) missing.add(key);
  }
  return [...missing];
}

export function applyVintedListingTemplate(
  content: VintedListingContent,
  fields: VintedListingTemplateFields,
): {
  readonly content: VintedListingContent;
  readonly changedFields: readonly VintedListingContentField[];
} {
  // Merkmale aus einer anderen Kategorie sind keine gültigen Anbieterkennungen.
  // Lesbare Angaben bleiben als Eingabehilfe erhalten; explizite Vorlagenwerte gewinnen.
  const categoryChanged =
    Object.hasOwn(fields, 'categoryId') && fields.categoryId !== content.categoryId;
  const staleReferences: Record<string, unknown> = {};
  const defaults = emptyVintedListingContent();
  for (const [identifier, label] of [
    ['brandId', 'brandLabel'],
    ['sizeId', 'sizeLabel'],
    ['conditionId', 'conditionLabel'],
    ['colorIds', 'colorLabels'],
    ['materialIds', 'materialLabels'],
  ] as const) {
    if (
      Object.hasOwn(fields, label) &&
      !Object.hasOwn(fields, identifier) &&
      JSON.stringify(fields[label]) !== JSON.stringify(content[label])
    )
      staleReferences[identifier] = defaults[identifier];
    if (
      Object.hasOwn(fields, identifier) &&
      !Object.hasOwn(fields, label) &&
      JSON.stringify(fields[identifier]) !== JSON.stringify(content[identifier])
    )
      staleReferences[label] = defaults[label];
  }
  const merged = parseVintedListingContent({
    ...content,
    ...(categoryChanged
      ? {
          brandId: null,
          sizeId: null,
          conditionId: null,
          colorIds: [],
          materialIds: [],
          packageSizeId: null,
          attributes: {},
        }
      : {}),
    ...staleReferences,
    ...fields,
  });
  const values = variables(merged);
  const resolve = (value: string) =>
    value.replace(/\{\s*([^{}]+?)\s*\}/g, (match, key: string) => {
      const normalized = key.trim().toLowerCase();
      return Object.hasOwn(values, normalized) && values[normalized] ? values[normalized] : match;
    });
  const next = {
    ...merged,
    title: Object.hasOwn(fields, 'title') ? resolve(merged.title) : content.title,
    description: Object.hasOwn(fields, 'description')
      ? resolve(merged.description)
      : content.description,
  };
  const changedFields = (Object.keys(content) as VintedListingContentField[]).filter(
    (key) => JSON.stringify(content[key]) !== JSON.stringify(next[key]),
  );
  return { content: next, changedFields };
}
