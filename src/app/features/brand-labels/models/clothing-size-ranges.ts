import type { GuideAudience, GuideRow, GuideTable, MeasureRange } from './clothing-size-guide';

const reviewedAt = '2026-10-09';
const formatRange = ({ min, max }: MeasureRange): string =>
  `${min.toLocaleString('de-DE', { maximumFractionDigits: 1 })}–${max.toLocaleString('de-DE', { maximumFractionDigits: 1 })}`;
interface JeansSizeGroup {
  size: string;
  minimumWaist: number;
  maximumWaist: number;
  european: readonly number[];
  british?: readonly number[];
  american?: readonly string[];
}

// Die halbe Inch-Stufe bildet einen gerundeten Labelbereich, keine zugesicherte Kleidungsabmessung.
function calculateWaistRange(group: JeansSizeGroup, divisor = 1): MeasureRange {
  return {
    min: Math.round((((group.minimumWaist - 0.5) * 2.54) / divisor) * 10) / 10,
    max: Math.round((((group.maximumWaist + 0.5) * 2.54) / divisor) * 10) / 10,
  };
}
function createJeansGuide(audience: GuideAudience, groups: readonly JeansSizeGroup[]): GuideTable {
  const rows: GuideRow[] = groups.map((group) => {
    const waistFlat = calculateWaistRange(group, 2);
    const waist = { min: waistFlat.min * 2, max: waistFlat.max * 2 };
    const inches = Array.from(
      { length: group.maximumWaist - group.minimumWaist + 1 },
      (_, index) => group.minimumWaist + index,
    );
    const countryRange = (sizes: readonly (number | string)[]): string =>
      sizes.length ? (sizes.length === 1 ? String(sizes[0]) : `${sizes[0]}–${sizes.at(-1)}`) : '—';
    const jeansRange = `W${group.minimumWaist}–W${group.maximumWaist}`;
    return {
      id: `${audience}-${group.size}`,
      cells: [
        group.size,
        countryRange(group.european),
        audience === 'men' ? jeansRange : countryRange(group.british ?? []),
        audience === 'men' ? jeansRange : countryRange(group.american ?? []),
        jeansRange,
        `≈ ${formatRange(waistFlat)}`,
        `≈ ${formatRange(waist)}`,
      ],
      labels: [
        group.size,
        ...inches.flatMap((waist) => [`W${waist}`, String(waist)]),
        ...(audience === 'men' ? inches.flatMap((waist) => [`UK${waist}`, `US${waist}`]) : []),
        ...group.european.flatMap((size) => [String(size), `EU${size}`, `DE${size}`]),
        ...(group.british ?? []).flatMap((size) => [String(size), `UK${size}`]),
        ...(group.american ?? []).flatMap((size) => [size, `US${size}`]),
      ],
      measurements: { waistFlat },
    };
  });
  return {
    id: `general-${audience}-trousers`,
    brand: 'Allgemeine Größen',
    audience,
    category: 'trousers',
    kind: 'orientation',
    title:
      audience === 'women'
        ? 'Damenhosen: Größen und Bund-Richtbereiche'
        : 'Herrenhosen: Größen und Bund-Richtbereiche',
    columns: [
      'Größe',
      'EU/DE ≈',
      audience === 'men' ? 'UK Jeans (Inch)' : 'UK ≈',
      audience === 'men' ? 'US Jeans (Inch)' : 'US ≈',
      'Jeans W',
      'Bund flach (cm) ≈',
      'Bundumfang (cm) ≈',
    ],
    rows,
    notes:
      'W-Gruppen in cm übertragen, an den Grenzen um eine halbe Inch-Stufe erweitert. EU/UK/US sind ungefähre Gegenstellungen; ein Strich bedeutet fehlende Zuordnung. Die Bundbereiche sind redaktionelle Schätzwerte für die Verkaufsgröße.',
    sourceTitle: 'Grundlage: Levi’s Alpha-/Jeansgrößen; Ländervergleiche Next und bonprix',
    sourceUrl: 'https://www.levi.com/GB/en_GB/info/sizechart',
    sources: [
      { title: 'Next – internationale Größen', url: 'https://www.next.co.uk/sizeguide' },
      {
        title: 'bonprix – Konfektionsgrößen',
        url: 'https://www.bonprix.de/service/beratung/groessentabellen/',
      },
      {
        title: 'ASOS – internationale Damengrößen',
        url: 'https://www.asos.com/discover/size-charts/women/jeans-trousers-leggings/',
      },
    ],
    reviewedAt,
  };
}

export const CLOTHING_SIZE_RANGES: readonly GuideTable[] = [
  createJeansGuide('women', [
    { size: 'XXS', minimumWaist: 23, maximumWaist: 24, european: [] },
    {
      size: 'XS',
      minimumWaist: 25,
      maximumWaist: 26,
      european: [32, 34],
      british: [4, 6],
      american: ['0', '2'],
    },
    {
      size: 'S',
      minimumWaist: 27,
      maximumWaist: 28,
      european: [36, 38],
      british: [8, 10],
      american: ['4', '6'],
    },
    {
      size: 'M',
      minimumWaist: 29,
      maximumWaist: 30,
      european: [40, 42],
      british: [12, 14],
      american: ['8', '10'],
    },
    {
      size: 'L',
      minimumWaist: 31,
      maximumWaist: 32,
      european: [44, 46],
      british: [16, 18],
      american: ['12', '14'],
    },
    {
      size: 'XL',
      minimumWaist: 33,
      maximumWaist: 34,
      european: [48, 50],
      british: [20, 22],
      american: ['16', '18'],
    },
    {
      size: 'XXL',
      minimumWaist: 35,
      maximumWaist: 36,
      european: [52, 54],
      british: [24, 26],
      american: ['20', '22'],
    },
  ]),
  createJeansGuide('men', [
    { size: 'XXS', minimumWaist: 24, maximumWaist: 25, european: [] },
    { size: 'XS', minimumWaist: 26, maximumWaist: 28, european: [] },
    { size: 'S', minimumWaist: 29, maximumWaist: 31, european: [44, 46] },
    { size: 'M', minimumWaist: 32, maximumWaist: 34, european: [48, 50] },
    { size: 'L', minimumWaist: 35, maximumWaist: 37, european: [52, 54] },
    { size: 'XL', minimumWaist: 38, maximumWaist: 41, european: [56, 58] },
    { size: 'XXL', minimumWaist: 42, maximumWaist: 45, european: [60, 62] },
  ]),
  {
    id: 'general-unisex-tops',
    brand: 'Allgemeine Größen',
    audience: 'unisex',
    category: 'tops',
    kind: 'orientation',
    title: 'T-Shirts: typische Brustweiten bei normaler Unisex-Passform',
    columns: ['Größe', 'Brustweite flach (cm) ≈', 'Brustumfang der Ware (cm) ≈'],
    rows: [
      ['XS', 40.64, 47.5],
      ['S', 45.72, 49.5],
      ['M', 50.8, 53.5],
      ['L', 55.88, 56.5],
      ['XL', 59.5, 60.96],
      ['XXL', 63.5, 66.04],
    ].map(([size, minimum, maximum]) => {
      const chestFlat = {
        min: Math.round(Number(minimum) * 10) / 10,
        max: Math.round(Number(maximum) * 10) / 10,
      };
      return {
        id: `tops-${size}`,
        cells: [
          String(size),
          `≈ ${formatRange(chestFlat)}`,
          `≈ ${formatRange({ min: chestFlat.min * 2, max: chestFlat.max * 2 })}`,
        ],
        labels: [String(size)],
        measurements: { chestFlat },
      };
    }),
    notes:
      'Zusammengefasste Spanne aus zwei üblichen T-Shirt-Größenreihen, keine universelle Norm. Bei Slim Fit, Oversize, taillierten Damenoberteilen oder gefütterten Jacken ist dieser Richtbereich nicht übertragbar. Brust quer unter den Armöffnungen messen.',
    sourceTitle: 'Grundlage: Gildan Größentabelle (Herstellerkatalog, S. 22)',
    sourceUrl:
      'https://pimcore-cdn.gildanprod.com/assets/Pim/document/2025-Gildan-USA-Style-and-Color-Guide-EN.pdf',
    sources: [
      {
        title: 'Stanley/Stella – Größentabelle (S. 3)',
        url: 'https://res.cloudinary.com/www-stanleystella-com/image/upload/v1633603833/Product%20Content/Product%20Sheets/en_GB/STTU169.pdf',
      },
    ],
    reviewedAt,
  },
];
