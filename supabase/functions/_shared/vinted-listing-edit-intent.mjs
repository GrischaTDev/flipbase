import {
  applyVintedListingEdit,
  packageSizeLabel,
  vintedListingBrandValue,
  vintedListingEditSelection,
  vintedListingPriceCents,
  vintedListingPriceText,
  withVintedListingBrand,
} from './vinted-listing-edit-form.mjs';
import { parseVintedListingReadPriceCents } from './vinted-listing-edit-form.mjs';

/** Grundfelder eines unvollständigen Entwurfs werden erst im Ausführungsbrowser frisch gelesen. */
export function resolveVintedListingBasicEditIntent(intent, fresh) {
  const priceCents = parseVintedListingReadPriceCents(fresh.price);
  return {
    title: intent.fields.title === intent.initialFields?.title ? fresh.title : intent.fields.title,
    description:
      intent.fields.description === intent.initialFields?.description
        ? fresh.description
        : intent.fields.description,
    price:
      intent.fields.price === intent.initialFields?.price && priceCents !== null
        ? vintedListingPriceText(priceCents)
        : intent.fields.price,
  };
}
/** Vergleichsform einer Größenbezeichnung, etwa „EU 38“ wie „38“. */
const normalizeSize = (text) =>
  text
    .trim()
    .normalize('NFC')
    .toLocaleLowerCase('de')
    .replace(/^eu\s*/, '')
    .replace('.', ',');
/**
 * Ob zwei Größenangaben dieselbe Größe meinen. Ältere Inserate führen kombinierte Angaben wie
 * „M / 38 / 10“, das Vinted-Formular zeigt dafür eine Größe wie „M“.
 */
function sameSize(left, right) {
  const parts = (label) => label.split('/').map(normalizeSize).filter(Boolean);
  const a = normalizeSize(left);
  const b = normalizeSize(right);
  return a === b || parts(left).includes(b) || parts(right).includes(a);
}
function sameSizes(left, right) {
  return (
    left.length === right.length && left.every((label, index) => sameSize(label, right[index]))
  );
}
/**
 * Ordnet eine gespeicherte Größe ohne Kennung einer Katalog-Größe zu. Ältere Inserate führen
 * kombinierte Angaben wie „M / 38 / 10“; eine enthaltene Buchstabengröße ist dann eindeutig.
 */
export function catalogSizeForLabel(choices, label) {
  if (!label.trim()) return null;
  const exact = choices.filter((choice) => normalizeSize(choice.label) === normalizeSize(label));
  if (exact.length === 1) return exact[0].id;
  const parts = label.split('/').map(normalizeSize).filter(Boolean);
  if (parts.length < 2) return null;
  const matching = choices.filter((choice) => parts.includes(normalizeSize(choice.label)));
  const letters = matching.filter((choice) => /^\d*[a-z]+$/i.test(choice.label.trim()));
  const found = letters.length === 1 ? letters : matching.length === 1 ? matching : [];
  return found[0]?.id ?? null;
}
const unreadable = (field) =>
  new Error(
    `${fieldNames[field]} konnte bei Vinted gerade nicht gelesen werden. Es wurde nichts gespeichert. Versuche es bitte erneut.`,
  );
const fieldNames = {
  accessory_department: 'Die Zielgruppe',
  brand: 'Die Marke',
  size: 'Die Größe',
  condition: 'Der Zustand',
  package: 'Die Paketgröße',
  color: 'Die Farbe',
  material: 'Das Material',
};
const conflict = () =>
  new Error(
    'Das Inserat wurde inzwischen bei Vinted geändert. Aktualisiere die Daten vor dem erneuten Speichern.',
  );
/** Übernimmt nur geänderte Felder und übersetzt eigene Auswahlen in die frisch gelesenen Anbieterwerte. */
export function applyStoredVintedListingEdit(stored, live, fields) {
  if (stored.content.categoryId !== live.content.categoryId) throw conflict();
  const before = vintedListingEditSelection(stored);
  // Eine per Suche gewählte Marke fehlt in Vinteds Formularauswahl; der Worker sucht sie beim Speichern.
  const searchedBrand =
    fields.brand && fields.brand !== before.brand
      ? stored.schema.fields
          .find((group) => group.field === 'brand')
          ?.choices.find(
            (choice) => vintedListingBrandValue({ brandId: choice.id }) === fields.brand,
          )
      : undefined;
  const current = searchedBrand
    ? withVintedListingBrand(live, {
        brandId: searchedBrand.id,
        brandLabel: searchedBrand.label,
      })
    : live;
  const selection = { ...vintedListingEditSelection(current) };
  const labels = (snapshot, field, identifiers) =>
    identifiers.map((identifier) => {
      const choice = snapshot.schema.fields
        .find((group) => group.field === field)
        ?.choices.find(
          (option) => (option.id === null ? 'none' : String(option.id)) === identifier,
        );
      if (!choice) throw new Error('Die Auswahl ist nicht mehr verfügbar.');
      return field === 'package' ? packageSizeLabel(choice.label) : choice.label;
    });
  const equal = (left, right) =>
    left.length === right.length && left.every((label) => right.includes(label));
  for (const field of [
    'accessory_department',
    'brand',
    'size',
    'condition',
    'package',
    'color',
    'material',
  ]) {
    const multiple = field === 'color' || field === 'material';
    if (field === 'accessory_department' && fields[field] === undefined) continue;
    const previous = before[field] ?? '';
    const desiredField = fields[field] ?? '';
    const previousLabels = labels(
      stored,
      field,
      typeof previous === 'string' ? (previous ? [previous] : []) : previous,
    );
    const desiredLabels = multiple
      ? desiredField.split(' · ').filter(Boolean)
      : labels(stored, field, desiredField ? [desiredField] : []);
    if (equal(previousLabels, desiredLabels)) continue;
    // Fehlt das Feld im frisch gelesenen Formular ganz, ist das keine Änderung bei Vinted.
    if (previousLabels.length > 0 && !current.schema.fields.some((group) => group.field === field))
      throw unreadable(field);
    const fresh = selection[field] ?? '';
    const freshLabels = labels(
      current,
      field,
      typeof fresh === 'string' ? (fresh ? [fresh] : []) : fresh,
    );
    if (
      !(field === 'accessory_department' && previousLabels.length === 0) &&
      !(field === 'size'
        ? sameSizes(previousLabels, freshLabels)
        : equal(previousLabels, freshLabels))
    )
      throw conflict();
    const identifiers = desiredLabels.map((label, index) => {
      const options = current.schema.fields.find((group) => group.field === field)?.choices;
      // Katalogwerte tragen Vinteds Kennung; bei gleicher Kennung und Bezeichnung ist die Wahl eindeutig,
      // auch wenn mehrere Größengruppen dieselbe Bezeichnung führen.
      const sameId = multiple
        ? undefined
        : options?.find(
            (option) =>
              (option.id === null ? 'none' : String(option.id)) === desiredField &&
              normalizeSize(option.label) === normalizeSize(label) &&
              index === 0 &&
              (!option.disabled || option.selected),
          );
      if (sameId) return sameId.id === null ? 'none' : String(sameId.id);
      const choices = options?.filter(
        (option) =>
          (field === 'size'
            ? normalizeSize(option.label) === normalizeSize(label) ||
              option.label.split('/').some((part) => normalizeSize(part) === normalizeSize(label))
            : field === 'brand' && searchedBrand
              ? option.id === searchedBrand.id
              : (field === 'package' ? packageSizeLabel(option.label) : option.label) === label) &&
          (!option.disabled || option.selected),
      );
      const choice = choices?.length === 1 ? choices[0] : undefined;
      if (!choice) throw new Error('Diese Auswahl ist bei Vinted nicht eindeutig verfügbar.');
      return choice.id === null ? 'none' : String(choice.id);
    });
    if (multiple) selection[field] = identifiers;
    else selection[field] = identifiers[0] ?? '';
  }
  const text = {
    title: current.content.title,
    description: current.content.description,
    price: vintedListingPriceText(current.content.priceCents ?? 0),
  };
  for (const field of ['title', 'description']) {
    if (fields[field] === stored.content[field]) continue;
    if (current.content[field] !== stored.content[field]) throw conflict();
    text[field] = fields[field];
  }
  if (vintedListingPriceCents(fields.price) !== stored.content.priceCents) {
    if (current.content.priceCents !== stored.content.priceCents) throw conflict();
    text.price = fields.price;
  }
  return applyVintedListingEdit(current, text, selection);
}
/** Liest und schreibt innerhalb derselben Kontoaktion; unberührte Anbieterwerte bleiben erhalten. */
export function resolveVintedListingEditIntent(intent, live) {
  const { base, fields, initialFields, categoryEdit, extras } = intent;
  if (!base || !initialFields) throw new Error('Lade das Inserat erneut.');
  let content;
  if (categoryEdit && categoryEdit.content.categoryId !== base.content.categoryId) {
    const merged = applyStoredVintedListingEdit(base, live, {
      ...initialFields,
      title: fields.title,
      description: fields.description,
      price: fields.price,
    });
    const multiple = (field) =>
      fields[field]
        .split(' · ')
        .filter(Boolean)
        .map((label) => {
          const options =
            categoryEdit.schema.fields
              .find((entry) => entry.field === field)
              ?.choices.filter(
                (choice) => choice.label === label && (!choice.disabled || choice.selected),
              ) ?? [];
          if (options.length !== 1) throw new Error('Die Auswahl ist nicht eindeutig.');
          return options[0].id === null ? 'none' : String(options[0].id);
        });
    content = applyVintedListingEdit(
      { ...live, ...categoryEdit },
      {
        title: merged.title,
        description: merged.description,
        price: vintedListingPriceText(merged.priceCents ?? 0),
      },
      { ...fields, color: multiple('color'), material: multiple('material') },
    );
  } else {
    content = applyStoredVintedListingEdit(base, live, fields);
  }
  if (extras?.categoryId === content.categoryId) {
    const attributes = { ...content.attributes };
    for (const [key, value] of Object.entries(extras.values)) {
      if (value) attributes[key] = value;
      else delete attributes[key];
    }
    content = { ...content, attributes };
  }
  return { base: live.content, content, photos: intent.photos };
}
