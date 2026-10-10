/** Synthetischer Iststand eines eigenen Inserats; Werte entsprechen der beobachteten Bearbeitungsmaske. */
export function listingCurrentContentFixture() {
  const choice = (id: number | null, label: string, selected: boolean, disabled = false) => ({
    id,
    label,
    selected,
    disabled,
    sizeGroupId: null,
  });
  return {
    externalId: '98765',
    externalAccountId: '123',
    content: {
      title: 'Meine Schuhe',
      description: 'Sehr gut erhalten.',
      priceCents: 2050,
      currency: 'EUR' as const,
      categoryId: 2738,
      categoryLabel: 'Fußballschuhe',
      brandId: 254956,
      brandLabel: 'Jako',
      sizeId: 607,
      sizeLabel: '38',
      conditionId: 2,
      conditionLabel: 'Sehr gut',
      colorIds: [1, 2],
      colorLabels: ['Blau', 'Gelb'],
      materialIds: [149],
      materialLabels: ['Acryl'],
      packageSizeId: 2,
      attributes: {},
    },
    aiPhoto: true,
    bump: false,
    photoUrls: [
      'https://images1.vinted.net/tc/fixtureA/f800/1788288106.webp',
      'https://images2.vinted.net/t/fixtureB/800x600/1788288107.webp',
    ],
    schema: {
      categoryId: 2738,
      fields: [
        {
          field: 'brand' as const,
          sizeGroupId: null,
          choices: [choice(254956, 'Jako', true), choice(1, 'Gesperrte Marke', false, true)],
        },
        {
          field: 'size' as const,
          sizeGroupId: 31,
          choices: [{ id: 607, label: '38', selected: true, disabled: false, sizeGroupId: 31 }],
        },
        { field: 'condition' as const, sizeGroupId: null, choices: [choice(2, 'Sehr gut', true)] },
        {
          field: 'color' as const,
          sizeGroupId: null,
          choices: [choice(1, 'Blau', true), choice(2, 'Gelb', true), choice(3, 'Rot', false)],
        },
        { field: 'material' as const, sizeGroupId: null, choices: [choice(149, 'Acryl', true)] },
        { field: 'package' as const, sizeGroupId: null, choices: [choice(2, 'Mittel', true)] },
      ],
      unknownFields: [],
      acceptedPhotoMimeTypes: ['image/jpeg', 'image/png'],
      titleMaxLength: null,
      descriptionMaxLength: null,
      aiPhoto: true,
      bump: false,
    },
  };
}
