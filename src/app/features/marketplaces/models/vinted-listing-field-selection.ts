import {
  parseVintedListingCategoryFields,
  type VintedListingCategoryFields,
  type VintedListingChoice,
} from './vinted-listing-category-fields';
import {
  emptyVintedListingContent,
  parseVintedListingContent,
  type VintedListingContent,
} from './vinted-listing-content';

const fieldKeys = {
  size: ['sizeId', 'sizeLabel'],
  condition: ['conditionId', 'conditionLabel'],
  color: ['colorIds', 'colorLabels'],
  material: ['materialIds', 'materialLabels'],
  package: ['packageSizeId'],
} as const;
export type VintedListingSelectionField = keyof typeof fieldKeys;
type SelectionKey = (typeof fieldKeys)[VintedListingSelectionField][number];
export type VintedListingFieldValues = Pick<VintedListingContent, SelectionKey>;
export interface VintedListingFieldSelection {
  readonly categoryId: number;
  readonly fields: readonly VintedListingSelectionField[];
  readonly values: VintedListingFieldValues;
  readonly packageLabel: string;
}
export type VintedListingFieldIdentifiers = Pick<
  VintedListingContent,
  'sizeId' | 'conditionId' | 'colorIds' | 'materialIds' | 'packageSizeId'
>;
function invalid(): never {
  throw new Error(
    'Die Vinted-Auswahl passt nicht mehr zu diesem Entwurf. Lade die Angaben erneut.',
  );
}
function choose(choices: readonly VintedListingChoice[], id: number): VintedListingChoice {
  return choices.find((choice) => choice.id === id && !choice.disabled) ?? invalid();
}
function chooseMany(
  choices: readonly VintedListingChoice[],
  ids: readonly number[],
  maximum: number,
): readonly VintedListingChoice[] {
  if (ids.length > maximum || new Set(ids).size !== ids.length) return invalid();
  return ids.map((id) => choose(choices, id));
}
/** Nur vorhandene Felder und tatsächlich angebotene Kennungen werden übernommen. */
export function buildVintedListingFieldSelection(
  schema: VintedListingCategoryFields,
  identifiers: VintedListingFieldIdentifiers,
): VintedListingFieldSelection {
  const parsed = parseVintedListingCategoryFields(schema, schema.categoryId);
  const values: {
    -readonly [Key in keyof VintedListingFieldValues]: VintedListingFieldValues[Key];
  } = {
    sizeId: null,
    sizeLabel: '',
    conditionId: null,
    conditionLabel: '',
    colorIds: [],
    colorLabels: [],
    materialIds: [],
    materialLabels: [],
    packageSizeId: null,
  };
  const fields: VintedListingSelectionField[] = [];
  let packageLabel = '';
  for (const snapshot of parsed.fields) {
    const { field, choices } = snapshot;
    if (field === 'category' || field === 'brand') continue;
    fields.push(field);
    switch (field) {
      case 'size': {
        const choice = identifiers.sizeId === null ? null : choose(choices, identifiers.sizeId);
        values.sizeId = choice?.id ?? null;
        values.sizeLabel = choice?.label ?? '';
        break;
      }
      case 'condition': {
        const choice =
          identifiers.conditionId === null ? null : choose(choices, identifiers.conditionId);
        values.conditionId = choice?.id ?? null;
        values.conditionLabel = choice?.label ?? '';
        break;
      }
      case 'color': {
        const chosen = chooseMany(choices, identifiers.colorIds, 2);
        values.colorIds = chosen.map((choice) => choice.id!);
        values.colorLabels = chosen.map((choice) => choice.label);
        break;
      }
      case 'material': {
        const chosen = chooseMany(choices, identifiers.materialIds, 3);
        values.materialIds = chosen.map((choice) => choice.id!);
        values.materialLabels = chosen.map((choice) => choice.label);
        break;
      }
      case 'package': {
        const choice =
          identifiers.packageSizeId === null ? null : choose(choices, identifiers.packageSizeId);
        values.packageSizeId = choice?.id ?? null;
        packageLabel = choice?.label ?? '';
        break;
      }
    }
  }
  return { categoryId: parsed.categoryId, fields, values, packageLabel };
}
export function applyVintedListingFieldSelection(
  content: VintedListingContent,
  selection: VintedListingFieldSelection,
): VintedListingContent {
  if (
    selection.categoryId !== content.categoryId ||
    !Number.isSafeInteger(selection.categoryId) ||
    selection.categoryId <= 0 ||
    new Set(selection.fields).size !== selection.fields.length ||
    selection.fields.some((field) => !Object.hasOwn(fieldKeys, field))
  )
    return invalid();
  const allowed = Object.values(fieldKeys).flat();
  if (Object.keys(selection.values).some((key) => !allowed.some((value) => value === key)))
    return invalid();
  const parsed = parseVintedListingContent({ ...emptyVintedListingContent(), ...selection.values });
  if (
    (parsed.sizeId !== null && !parsed.sizeLabel) ||
    (parsed.conditionId !== null && !parsed.conditionLabel) ||
    parsed.colorIds.length !== parsed.colorLabels.length ||
    parsed.colorIds.length > 2 ||
    parsed.materialIds.length !== parsed.materialLabels.length ||
    parsed.materialIds.length > 3
  )
    return invalid();
  const patch = Object.fromEntries(
    selection.fields.flatMap((field) => fieldKeys[field].map((key) => [key, parsed[key]])),
  );
  return parseVintedListingContent({ ...content, ...patch });
}
