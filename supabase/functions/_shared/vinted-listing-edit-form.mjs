/** „Keine Marke“ hat bei Vinted keine Kennung und braucht einen eigenen Formularwert. */
const optionValue = (choice) => (choice.id === null ? 'none' : String(choice.id));
function choices(schema, field) {
  return schema.fields.find((entry) => entry.field === field)?.choices ?? [];
}
export function vintedListingEditOptions(schema, field) {
  return choices(schema, field)
    .filter((choice) => !choice.disabled || choice.selected)
    .map((choice) => ({
      value: optionValue(choice),
      label: field === 'package' ? packageSizeLabel(choice.label) : choice.label,
    }));
}
/** Formularwert einer Marke, wie ihn die Auswahl verwendet. */
export function vintedListingBrandValue(brand) {
  return brand.brandId === null ? 'none' : String(brand.brandId);
}
/**
 * Nimmt eine über die Markensuche gewählte Marke in die Auswahl auf. Vinted zeigt im Formular
 * nur die bisherige und vorgeschlagene Marken; die übrigen findet erst die Suche beim Speichern.
 */
export function withVintedListingBrand(snapshot, brand) {
  const choice = {
    id: brand.brandId,
    label: brand.brandLabel,
    selected: false,
    disabled: false,
    sizeGroupId: null,
  };
  const field = snapshot.schema.fields.find((entry) => entry.field === 'brand');
  if (field?.choices.some((entry) => entry.id === brand.brandId && !entry.disabled))
    return snapshot;
  return {
    ...snapshot,
    schema: {
      ...snapshot.schema,
      fields: field
        ? snapshot.schema.fields.map((entry) =>
            entry === field
              ? {
                  ...entry,
                  choices: [...entry.choices.filter((value) => value.id !== brand.brandId), choice],
                }
              : entry,
          )
        : [...snapshot.schema.fields, { field: 'brand', sizeGroupId: null, choices: [choice] }],
    },
  };
}
/**
 * Vinteds Kachel der Paketgröße liefert Hinweis, Name und Beschreibung ohne Trennung, etwa
 * „EmpfohlenMittelFür Artikel, die in einen Schuhkarton passen“. Gezeigt wird nur der Name.
 */
export function packageSizeLabel(label) {
  const names = ['Klein', 'Mittel', 'Groß']
    .map((name) => ({ name, at: label.indexOf(name) }))
    .filter((entry) => entry.at >= 0)
    .sort((left, right) => left.at - right.at);
  return names[0]?.name ?? label;
}
export function vintedListingEditSelection(current) {
  const selected = (field) =>
    choices(current.schema, field)
      .filter((choice) => choice.selected)
      .map(optionValue);
  return {
    accessory_department: selected('accessory_department')[0] ?? '',
    brand: selected('brand')[0] ?? '',
    size: selected('size')[0] ?? '',
    condition: selected('condition')[0] ?? '',
    package: selected('package')[0] ?? '',
    color: selected('color'),
    material: selected('material'),
  };
}
export function vintedListingPriceCents(price) {
  const match = /^(\d{1,6})(?:[,.](\d{1,2}))?$/.exec(price.trim());
  if (!match) return null;
  const cents = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0') || '0');
  return cents > 0 ? cents : null;
}
export function vintedListingPriceText(cents) {
  return Math.floor(cents / 100) + ',' + String(cents % 100).padStart(2, '0');
}
/** Preis aus Vinteds bestehendem Formular, einschließlich Eurozeichen und Tausenderpunkten. */
export function parseVintedListingReadPriceCents(value) {
  if (!value.trim()) return null;
  let normalized = value.replace(/[€\s]/gu, '');
  const invalid = () => new Error('Der vorhandene Vinted-Preis konnte nicht gelesen werden.');
  if (normalized.includes('.') && normalized.includes(',')) {
    if (!/^\d{1,3}(?:\.\d{3})+,\d{1,2}$/.test(normalized)) throw invalid();
    normalized = normalized.replaceAll('.', '');
  }
  const cents = vintedListingPriceCents(normalized);
  if (cents === null) throw invalid();
  return cents;
}
/**
 * Baut die gewünschten Inseratangaben aus Formular und aktueller Vinted-Auswahl. Kennung und
 * Name stammen immer aus derselben Auswahl; unbekannte oder gesperrte Werte werden abgewiesen.
 */
export function applyVintedListingEdit(current, text, selection) {
  const priceCents = vintedListingPriceCents(text.price);
  if (priceCents === null || !text.title.trim() || !text.description.trim())
    throw new Error('Prüfe Titel, Beschreibung und Preis.');
  const pick = (field, values, max) => {
    const available = choices(current.schema, field).filter(
      (choice) => !choice.disabled || choice.selected,
    );
    if (values.length > max || new Set(values).size !== values.length)
      throw new Error('Die Auswahl ist nicht mehr gültig. Lade das Inserat erneut.');
    // Reihenfolge der Vinted-Auswahl beibehalten, nicht die Klickreihenfolge.
    const picked = available.filter((choice) => values.includes(optionValue(choice)));
    if (picked.length !== values.length)
      throw new Error('Die Auswahl ist nicht mehr gültig. Lade das Inserat erneut.');
    return picked;
  };
  const single = (field, value) => (value ? pick(field, [value], 1)[0] : undefined);
  const department =
    selection.accessory_department === undefined
      ? undefined
      : single('accessory_department', selection.accessory_department);
  const brand = single('brand', selection.brand),
    size = single('size', selection.size),
    condition = single('condition', selection.condition),
    packageSize = single('package', selection.package),
    colors = pick('color', selection.color, 2),
    materials = pick('material', selection.material, 3);
  return {
    ...current.content,
    title: text.title.trim(),
    description: text.description,
    priceCents,
    brandId: brand?.id ?? null,
    brandLabel: brand?.label ?? '',
    sizeId: size?.id ?? null,
    sizeLabel: size?.label ?? '',
    conditionId: condition?.id ?? null,
    conditionLabel: condition?.label ?? '',
    colorIds: colors.map((choice) => choice.id),
    colorLabels: colors.map((choice) => choice.label),
    materialIds: materials.map((choice) => choice.id),
    materialLabels: materials.map((choice) => choice.label),
    packageSizeId: packageSize?.id ?? null,
    attributes:
      selection.accessory_department === undefined
        ? current.content.attributes
        : department?.id
          ? {
              accessory_department: String(department.id),
              accessory_department_label: department.label,
            }
          : {},
  };
}
