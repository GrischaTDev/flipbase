import type {
  VintedListingCategoryFields,
  VintedListingChoiceSnapshot,
  VintedListingContent,
} from '../../../../../supabase/functions/_shared/marketplace-listing-contracts';
import { validVintedListingBrand } from './vinted-listing-brand-selection';

const marker = 'flipbaseListingForm';
const packages = ['Klein', 'Mittel', 'Groß'];
const colors = [
  'Schwarz',
  'Braun',
  'Grau',
  'Beige',
  'Rosa',
  'Lila',
  'Rot',
  'Gelb',
  'Blau',
  'Grün',
  'Orange',
  'Weiß',
  'Silber',
  'Gold',
  'Mehrfarbig',
  'Khaki',
  'Türkis',
  'Creme',
  'Apricot',
  'Koralle',
  'Bordeaux',
  'Marineblau',
];
const materials = [
  'Baumwolle',
  'Leder',
  'Kunstleder',
  'Wildleder',
  'Polyester',
  'Wolle',
  'Leinen',
  'Denim',
  'Seide',
  'Kunststoff',
  'Metall',
  'Viskose',
  'Nylon',
  'Elasthan',
  'Gummi',
  'Textil',
  'Mesh',
  'Canvas',
  'Kaschmir',
  'Acryl',
  'Polyamid',
  'Synthetik',
];
type RealField = 'size' | 'condition' | 'color' | 'material';
const range = (start: number, end: number, step = 1) =>
  Array.from({ length: Math.round((end - start) / step) + 1 }, (_, index) =>
    String(start + index * step).replace('.', ','),
  );

/** Eigene Auswahlkennungen; sie sind ausdrücklich keine Vinted-Kennungen. */
export function flipbaseVintedListingFields(
  categoryId: number,
  categoryPath: string,
  brand?: Pick<VintedListingContent, 'brandId' | 'brandLabel'> &
    Partial<
      Pick<VintedListingContent, 'attributes' | 'sizeLabel' | 'colorLabels' | 'materialLabels'>
    >,
  stored?: VintedListingCategoryFields | null,
): VintedListingCategoryFields {
  // Bei Vinted gelesene Auswahlwerte dieser Kategorie haben Vorrang vor den eigenen Listen.
  const real = stored?.categoryId === categoryId ? stored : null;
  const realField = (name: RealField): VintedListingChoiceSnapshot | null => {
    const found = real?.fields.find((entry) => entry.field === name);
    return found
      ? { ...found, choices: found.choices.map((choice) => ({ ...choice, selected: false })) }
      : null;
  };
  // Ein unbestätigter Markenname bleibt im Entwurf, darf aber keine ungültige Auswahl erzeugen.
  const selectedBrand = brand && validVintedListingBrand(brand) ? brand : null;
  const path = categoryPath.toLocaleLowerCase('de');
  const children = /kinder|baby|mädchen|jungen/.test(path);
  const shoes =
    !/handschuhe/.test(path) && /schuhe|sneaker|stiefel|sandalen|pantoffeln|pumps/.test(path);
  // Vinted nennt oft nur das letzte Kategorieglied, zum Beispiel „Skinny Jeans“.
  const jeans = /jeans/.test(path);
  const clothing =
    jeans ||
    /kleidung|jacken|hosen|kleider|röcke|shirts|pullover|blusen|hemden|mäntel|unterwäsche|bademode|anzüge|overalls|kostüme/.test(
      path,
    );
  const sizes = shoes
    ? range(children ? 16 : 32, children ? 40 : 50, 0.5)
    : /mützen|hüte|kappen/.test(path)
      ? ['Einheitsgröße', ...range(children ? 35 : 50, 66)]
      : /handschuhe/.test(path)
        ? ['XS', 'S', 'M', 'L', 'XL', ...range(4, 12, 0.5)]
        : /gürtel/.test(path)
          ? ['XS', 'S', 'M', 'L', 'XL', ...range(50, 150, 5)]
          : /\bbhs?\b|büstenhalter/.test(path)
            ? range(60, 120, 5).flatMap((band) =>
                ['AA', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K'].map(
                  (cup) => band + cup,
                ),
              )
            : children && clothing
              ? [
                  ...range(44, 176, 6),
                  ...range(50, 170, 12).map((size) => `${size}/${Number(size) + 6}`),
                ]
              : clothing
                ? [
                    'XXXS',
                    'XXS',
                    'XS',
                    'S',
                    'M',
                    'L',
                    'XL',
                    'XXL',
                    'XXXL',
                    '4XL',
                    '5XL',
                    '6XL',
                    ...range(30, 70, 2),
                    // Bundweiten wie „W32“ führt Vinted bei Jeans als eigene Größen.
                    ...(jeans ? range(23, 48).map((width) => `W${width}`) : []),
                  ]
                : [];
  // Einzelne ältere Entwürfe enthalten nur den Blattnamen.
  if (!sizes.length && /bomber|jacke|hose|kleid|shirt|pullover/.test(path))
    sizes.push('XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL');
  // Gespeicherte Angaben echter Inserate (z. B. „W32“) sind nicht vollständig in den eigenen
  // Listen enthalten. Sie bleiben gültig; Vinted ordnet sie erst beim Veröffentlichen zu.
  const kept: Partial<Record<VintedListingChoiceSnapshot['field'], readonly string[]>> = {
    // Kombinierte Angaben wie „M / L“ bleiben offen, statt eine von beiden Größen zu raten.
    size:
      brand?.sizeLabel?.trim() && !brand.sizeLabel.includes('/') ? [brand.sizeLabel.trim()] : [],
    color: brand?.colorLabels ?? [],
    material: brand?.materialLabels ?? [],
  };
  const field = (
    name: VintedListingChoiceSnapshot['field'],
    known: readonly string[],
  ): VintedListingChoiceSnapshot => ({
    field: name,
    sizeGroupId: name === 'size' ? 1 : null,
    choices: [
      ...known,
      ...(kept[name] ?? []).filter((label) => label.trim() && !known.includes(label)),
    ].map((label, index) => ({
      id: index + 1,
      label,
      selected: false,
      disabled: false,
      sizeGroupId: name === 'size' ? 1 : null,
    })),
  });
  return {
    categoryId,
    fields: [
      ...(/modeaccessoires/.test(path) || brand?.attributes?.['accessory_department']
        ? [
            {
              field: 'accessory_department' as const,
              sizeGroupId: null,
              choices: [
                { id: 576, label: 'Damen' },
                { id: 575, label: 'Herren' },
                { id: 573, label: 'Mädchen' },
                { id: 572, label: 'Jungs' },
              ].map((choice) => ({
                ...choice,
                selected: String(choice.id) === brand?.attributes?.['accessory_department'],
                disabled: false,
                sizeGroupId: null,
              })),
            },
          ]
        : []),
      // Mit echten Werten fehlen Felder, die Vinted für diese Kategorie nicht anbietet.
      ...(real
        ? [
            realField('size'),
            realField('condition'),
            realField('color'),
            realField('material'),
          ].filter((entry) => entry !== null)
        : [
            ...(sizes.length ? [field('size', sizes)] : []),
            field('condition', [
              'Neu mit Etikett',
              'Neu ohne Etikett',
              'Sehr gut',
              'Gut',
              'Zufriedenstellend',
            ]),
            field('color', colors),
            field('material', materials),
          ]),
      field('package', packages),
      {
        field: 'brand',
        sizeGroupId: null,
        choices: [
          {
            id: selectedBrand?.brandId ?? null,
            label: selectedBrand?.brandLabel ?? 'Keine Marke',
            selected: false,
            disabled: false,
            sizeGroupId: null,
          },
        ],
      },
    ],
    unknownFields: [],
    acceptedPhotoMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    titleMaxLength: 100,
    descriptionMaxLength: 2000,
    aiPhoto: false,
    bump: false,
  };
}

/** Erhält Texte alter Entwürfe, ersetzt ihre Anbieterkennungen aber durch eigene Auswahlkennungen. */
export function prepareFlipbaseVintedListingContent(
  content: VintedListingContent,
  stored?: VintedListingCategoryFields | null,
): VintedListingContent {
  if (content.categoryId === null) return content;
  const schema = flipbaseVintedListingFields(
    content.categoryId,
    content.categoryLabel,
    content,
    stored,
  );
  const id = (field: string, label: string) =>
    schema.fields
      .find((entry) => entry.field === field)
      ?.choices.find((choice) => choice.label === label)?.id ?? null;
  const allSizes = schema.fields.find((field) => field.field === 'size')?.choices ?? [];
  // Zuerst nur die eigene Liste auswerten, damit „M / 38 / 10“ weiterhin als „M“ gilt.
  const known = flipbaseVintedListingFields(
    content.categoryId,
    content.categoryLabel,
    { ...content, sizeLabel: '' },
    stored,
  ).fields.find((field) => field.field === 'size')?.choices.length;
  const sizes = allSizes.slice(0, known ?? 0);
  const normalizeSize = (label: string) =>
    label
      .trim()
      .toLocaleLowerCase('de')
      .replace(/^eu\s*/, '')
      .replace('.', ',');
  const exact = sizes.find(
    (choice) => normalizeSize(choice.label) === normalizeSize(content.sizeLabel),
  );
  const parts = content.sizeLabel.split('/').map(normalizeSize);
  const matching = sizes.filter((choice) => parts.includes(normalizeSize(choice.label)));
  // Eine kombinierte Konfektionsangabe wie „M / 38 / 10“ enthält die ausdrückliche Buchstabengröße.
  // Zwei unterschiedliche Buchstabengrößen oder Zahlenbereiche werden nicht geraten.
  const letters = matching.filter((choice) => /^\d*[a-z]+$/i.test(choice.label));
  const size =
    exact ??
    (letters.length === 1
      ? letters[0]
      : allSizes.find((choice) => choice.label === content.sizeLabel.trim()));
  return {
    ...content,
    sizeId: size?.id ?? null,
    sizeLabel: size?.label ?? content.sizeLabel,
    conditionId: id('condition', content.conditionLabel),
    colorIds: content.colorLabels.flatMap((label) => {
      const value = id('color', label);
      return value === null ? [] : [value];
    }),
    materialIds: content.materialLabels.flatMap((label) => {
      const value = id('material', label);
      return value === null ? [] : [value];
    }),
    attributes: { ...content.attributes, [marker]: '1' },
  };
}

/** Nur die interne Formularversion aus der fachlichen Prüfung entfernen. */
export function flipbaseVintedListingReviewContent(
  content: VintedListingContent,
  stored?: VintedListingCategoryFields | null,
): VintedListingContent {
  const local = prepareFlipbaseVintedListingContent(content, stored);
  return {
    ...local,
    attributes: Object.fromEntries(
      Object.entries(local.attributes).filter(([key]) => key !== marker),
    ),
  };
}
