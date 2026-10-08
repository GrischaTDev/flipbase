import { createEmptyLabelContent } from '../models/brand-label-content';
import type { LabelCard } from '../models/brand-label.models';

/** Synthetische Referenz; wird niemals als Nike-Inhalt ausgeliefert. */
export function readerCard(id = 1): LabelCard {
  return {
    referenceId: id,
    revisionId: id + 100,
    brandSlug: 'testmarke',
    labelSlug: `testetikett-${id}`,
    title: `Testetikett ${id}`,
    timeSummary: 'Zeitraum nicht belegt',
    shortFeature: 'Synthetisches Erkennungsmerkmal',
    coverAssetId: id + 200,
  };
}
export function readerPage(count = 1, catalogVersion = '7') {
  return {
    items: Array.from({ length: count }, (_, index) => readerCard(index + 1)),
    hasMore: count === 24,
    catalogVersion,
  };
}
export function readerDetail() {
  return {
    ...readerCard(),
    content: {
      ...createEmptyLabelContent(),
      title: readerCard().title,
      brandName: 'Testmarke',
      kinds: ['neck-label'] as const,
      timeSummary: 'Zeitraum nicht belegt',
      features: ['Synthetisches Erkennungsmerkmal'],
      limitations: ['Ein Etikett allein bestätigt keine Echtheit.'],
      sources: [
        {
          id: 'source-1',
          title: 'Testquelle',
          publisher: 'Testarchiv',
          url: 'https://example.com/label',
          accessedAt: '2026-10-07',
          locator: 'Testseite 1',
        },
      ],
    },
    images: [
      {
        assetId: 201,
        position: 0,
        caption: 'Testaufnahme',
        alt: 'Synthetisches Etikett',
        referenceItem: 'Testjacke',
        attribution: 'Testfotograf',
      },
    ],
  };
}
