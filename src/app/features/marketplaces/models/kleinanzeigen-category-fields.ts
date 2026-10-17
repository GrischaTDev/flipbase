import type { KleinanzeigenProviderSchema } from '../../../../../supabase/functions/_shared/kleinanzeigen-form-contracts';
export function retainKleinanzeigenCategoryFields(
  values: Readonly<Record<string, string>>,
  schema: KleinanzeigenProviderSchema,
  hints: Readonly<Record<string, string>> = {},
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const field of schema.fields) {
    const value = values[field.key];
    if (
      value &&
      value.length <= 200 &&
      (field.kind === 'search' || field.choices.some((choice) => choice.value === value))
    )
      result[field.key] = value;
  }
  const normalize = (value: string) =>
    value
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/gu, '')
      .toLocaleLowerCase('de-DE')
      .replace(/[^a-z0-9]/gu, '');
  const names: Readonly<Record<string, readonly string[]>> = {
    brand: ['brand', 'marke'],
    size: ['size', 'groesse', 'grosse'],
    condition: ['condition', 'zustand'],
    material: ['material'],
    color: ['color', 'colour', 'farbe'],
  };
  for (const field of schema.fields) {
    if (result[field.key]) continue;
    const semantic = Object.entries(names).find(
      ([, aliases]) =>
        aliases.includes(normalize(field.label)) ||
        aliases.includes(normalize(field.key.split('.').at(-1) ?? '')),
    )?.[0];
    if (!semantic) continue;
    const candidate = Object.entries(hints).find(([key]) =>
      names[semantic].includes(normalize(key)),
    )?.[1];
    if (!candidate || candidate.length > 200) continue;
    if (field.kind === 'search') result[field.key] = candidate;
    else {
      const matches = field.choices.filter(
        (choice) =>
          normalize(choice.label) === normalize(candidate) ||
          normalize(choice.value) === normalize(candidate),
      );
      if (matches.length === 1) result[field.key] = matches[0].value;
    }
  }
  const group = values['ad-shipping-package-size'];
  const offered = schema.shipping.groups.find((candidate) => candidate.value === group);
  let selected: unknown;
  try {
    selected = JSON.parse(values['ad-shipping-options'] ?? 'null');
  } catch {
    selected = null;
  }
  if (
    offered &&
    Array.isArray(selected) &&
    selected.length > 0 &&
    selected.length <= 20 &&
    new Set(selected).size === selected.length &&
    selected.every(
      (method) =>
        typeof method === 'string' && offered.choices.some((choice) => choice.value === method),
    )
  ) {
    result['ad-shipping-package-size'] = group;
    result['ad-shipping-options'] = JSON.stringify(selected);
  }
  return result;
}
