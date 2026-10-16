import type { KleinanzeigenProviderSchema } from '../../../../../supabase/functions/_shared/kleinanzeigen-form-contracts';
export function retainKleinanzeigenCategoryFields(
  values: Readonly<Record<string, string>>,
  schema: KleinanzeigenProviderSchema,
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
