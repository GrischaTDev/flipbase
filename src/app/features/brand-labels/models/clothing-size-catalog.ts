import {
  decodeSizeLabel,
  type GuideCategory,
  type GuideRow,
  type GuideTable,
  type MeasureKey,
  type MeasureRange,
} from './clothing-size-guide';

const reviewedAt = '2026-10-09';
const formatCentimeters = (centimeters: number): string =>
  centimeters.toLocaleString('de-DE', { maximumFractionDigits: 2 });
const inchRange = (minimum: number, maximum = minimum, divisor = 1): MeasureRange => ({
  min: Math.round((minimum * 254) / divisor) / 100,
  max: Math.round((maximum * 254) / divisor) / 100,
});
function formatRange(range: MeasureRange): string {
  return range.min === range.max
    ? formatCentimeters(range.min)
    : `${formatCentimeters(range.min)}–${formatCentimeters(range.max)}`;
}
function labelRows(prefix: string, entries: readonly (readonly string[])[]): GuideRow[] {
  return entries.map((cells, index) => ({
    id: `${prefix}-${index}`,
    cells,
    labels: cells.flatMap((cell) => {
      const decoded = cell.includes('/') ? decodeSizeLabel(cell) : null;
      return [
        ...cell.split(/\s*\/\s*/),
        ...(/^W\d/.test(cell) ? [cell.slice(1)] : []),
        ...(decoded?.waistCm != null
          ? [`W${Math.round((decoded.waistCm / 2.54) * 100) / 100}`]
          : []),
        ...(decoded?.inseamCm != null
          ? [`L${Math.round((decoded.inseamCm / 2.54) * 100) / 100}`]
          : []),
      ];
    }),
  }));
}
function garmentRows(
  prefix: string,
  sizes: readonly string[],
  keys: readonly MeasureKey[],
  ranges: readonly (readonly MeasureRange[])[],
): GuideRow[] {
  return sizes.map((size, index) => {
    const dimensions = ranges[index] ?? [];
    return {
      id: `${prefix}-${size}`,
      cells: [size, ...dimensions.map(formatRange)],
      labels: [size, size.split(' ')[0] ?? size, ...(prefix === 'iron-heart' ? [`W${size}`] : [])],
      measurements: Object.fromEntries(
        keys.flatMap((key, dimensionIndex) => {
          const range = dimensions[dimensionIndex];
          return range ? [[key, range]] : [];
        }),
      ),
    };
  });
}
const nextWomenSizes = [
  ['34', '6', '2', 'XS'],
  ['36', '8', '4', 'S'],
  ['38', '10', '6', 'S'],
  ['40', '12', '8', 'M'],
  ['42', '14', '10', 'M'],
  ['44', '16', '12', 'L'],
  ['46', '18', '14', 'L'],
  ['48', '20', '16', 'XL'],
  ['50', '22', '18', 'XL'],
  ['52', '24', '20', 'XXL'],
  ['54', '26', '22', 'XXL'],
  ['56', '28', '24', 'XXL'],
] as const;
function nextWomenTable(category: GuideCategory): GuideTable {
  return {
    id: `next-women-${category}`,
    brand: 'Next',
    category,
    audience: 'women',
    kind: 'conversion',
    title:
      category === 'trousers'
        ? 'Damenhosen: EU/DE, UK, US und Buchstaben'
        : 'Damenoberteile: EU/DE, UK, US und Buchstaben',
    columns: ['EU/DE', 'UK', 'US', 'Buchstaben'],
    rows: labelRows(`next-${category}`, nextWomenSizes),
    notes:
      'Aktueller Größenvergleich von Next. Andere Marken und Vintage können abweichen; EU 36 / UK 8 / US 4 wird hier als S geführt. Keine Kleidungsmaßbereiche.',
    sourceTitle: 'Next – International Size Conversion',
    sourceUrl: 'https://www.next.co.uk/sizeguide',
    reviewedAt,
  };
}
const ironHeartSizes = [
  '28',
  '29',
  '30',
  '31',
  '32',
  '33',
  '34',
  '35',
  '36',
  '38',
  '40',
  '42',
  '44',
];
const ironHeartWaists = [28.4, 29.2, 30.4, 31.1, 32.5, 33.4, 33.9, 35, 36.1, 38, 40, 41.8, 43.7];
const ironHeartRises = [9.5, 9.8, 10.4, 10.5, 10.6, 10.8, 11.1, 11.3, 11.4, 11.7, 12, 12.2, 12.4];
const cottonMillDimensions = [
  [inchRange(26, 26, 2), inchRange(30.5), inchRange(41), inchRange(12)],
  [inchRange(27, 27, 2), inchRange(31.5), inchRange(42.5), inchRange(12)],
  [inchRange(29, 29, 2), inchRange(32), inchRange(43.5), inchRange(12)],
  [inchRange(32, 32, 2), inchRange(32.5), inchRange(44), inchRange(13)],
  [inchRange(34, 34, 2), inchRange(33), inchRange(45), inchRange(14)],
  [inchRange(36, 36, 2), inchRange(33.5), inchRange(46.5), inchRange(15)],
  [inchRange(41, 43, 2), inchRange(32, 33.5), inchRange(45, 47), inchRange(16)],
];

export const CLOTHING_SIZE_TABLES: readonly GuideTable[] = [
  nextWomenTable('trousers'),
  nextWomenTable('tops'),
  {
    id: 'port-co-tshirt',
    brand: 'Port & Co',
    category: 'tops',
    audience: 'men',
    kind: 'garment',
    title: 'PC54C T-Shirt: flache Brustweite und Rückenlänge',
    columns: ['Größe', 'Brustweite flach (cm)', 'Rückenlänge (cm)'],
    rows: garmentRows(
      'port-co',
      ['S', 'M', 'L', 'XL', '2XL', '3XL', '4XL'],
      ['chestFlat', 'backLength'],
      [18, 20, 22, 24, 26, 28, 30].map((chest, index) => [inchRange(chest), inchRange(28 + index)]),
    ),
    notes:
      'Tatsächliche Maße des klassischen PC54C, keine allgemeinen Buchstabengrenzen. Die Einheit wird aus der US-Inch-Messkonvention der Quelle abgeleitet und mit 2,54 in cm umgerechnet; die Tabelle benennt sie nicht separat. Brust flach 2,54 cm unter dem Armloch messen; Rücken vom höchsten Schulterpunkt zum hinteren Saum. Körpermaße derselben Quelle werden nicht verglichen.',
    sourceTitle: 'SanMar / Port & Co – PC54C Product Measurements',
    sourceUrl: 'https://www.sanmar.com/p/7061/specSheetMeasurements',
    reviewedAt,
  },
  {
    id: 'iron-heart-jeans',
    brand: 'Iron Heart',
    category: 'trousers',
    audience: 'men',
    kind: 'garment',
    title: 'Jeans IH-666S-142: gemessener Bund und Innenbein',
    columns: ['Jeanslabel', 'Bund flach (cm)', 'Innenbein (cm)', 'Leibhöhe vorne (cm)'],
    rows: garmentRows(
      'iron-heart',
      ironHeartSizes,
      ['waistFlat', 'inseam', 'frontRise'],
      ironHeartSizes.map((size, index) => [
        inchRange(ironHeartWaists[index] ?? 0, ironHeartWaists[index] ?? 0, 2),
        inchRange(Number(size) >= 40 ? 36 : 35),
        inchRange(ironHeartRises[index] ?? 0),
      ]),
    ),
    notes:
      'Tatsächliche Maße dieses Slim-Straight-Modells, Inch in cm umgerechnet; Bundumfang halbiert. Kein allgemeiner XS–XL-Schlüssel. Getragene Jeans können sich weiten, gekürzte Beine abweichen. Außenbein- und Hüftmaße sind nicht belegt und erzeugen keinen vollständigen Treffer.',
    sourceTitle: 'Iron Heart – IH-666S-142, Size Guide',
    sourceUrl: 'https://ironheart.co.uk/collections/slim-straight-cut/products/ih-666s-142',
    reviewedAt,
  },
  {
    id: 'lands-end-yoga',
    brand: 'Lands’ End',
    category: 'trousers',
    audience: 'women',
    kind: 'garment',
    title: 'Active Crop Yoga Pants: Größen XS bis XL am Kleidungsstück',
    columns: [
      'Größe / US',
      'Bund entspannt, flach (cm)',
      'Hüfte flach (cm)',
      'Innenbein (cm)',
      'Leibhöhe vorne (cm)',
    ],
    rows: garmentRows(
      'lands-end',
      ['XS (2–4)', 'S (6–8)', 'M (10–12)', 'L (14–16)', 'XL (18)'],
      ['waistFlat', 'hipFlat', 'inseam', 'frontRise'],
      [
        [26, 35.5, 9.125],
        [28, 37.5, 9.625],
        [30.5, 40, 10.25],
        [34, 43, 11],
        [36, 45, 11.375],
      ].map(([waist, hip, rise]) => [
        inchRange(waist ?? 0, waist ?? 0, 2),
        inchRange(hip ?? 0, hip ?? 0, 2),
        inchRange(24),
        inchRange(rise ?? 0),
      ]),
    ),
    notes:
      'Belegte Kleidungsmaße der Regular-Ausführung dieses elastischen, verkürzten Yoga-Modells. Bund entspannt messen; keine Jeans- oder Universalgrenzen. Die Körpermaßzeile der Quelle wird bewusst nicht zur Maßsuche verwendet. Leibhöhe ohne Zwickel.',
    sourceTitle: 'Lands’ End – Item Dimensions 509417',
    sourceUrl: 'https://www.landsend.com/garment_measurements/509417_core_pdp_spec.pdf',
    reviewedAt,
  },
  {
    id: 'cottonmill-sweatpants',
    brand: 'CottonMill',
    category: 'trousers',
    audience: 'unisex',
    kind: 'garment',
    title: 'B090 Sweatpants: Bund, Innen- und Außenbeinlänge',
    columns: [
      'Größe',
      'Bund entspannt, flach (cm)',
      'Innenbein (cm)',
      'Außenbein (cm)',
      'Leibhöhe vorne (cm)',
    ],
    rows: garmentRows(
      'cottonmill',
      ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'],
      ['waistFlat', 'inseam', 'outseam', 'frontRise'],
      cottonMillDimensions,
    ),
    notes:
      'Großzügig geschnittene Unisex-Jogginghose mit Gummibund. Gemessene Originalmaße, keine Richtwerte für Jeans. Bundumfang entspannt halbiert. Nur XXXL hat in der Quelle ausdrücklich Maßbereiche; bei Einzelmaßen kommt der gewählte Suchspielraum hinzu.',
    sourceTitle: 'CottonMill – B090 Actual Garment Measurements',
    sourceUrl: 'https://www.cottonmill.com/thick-100-all-cotton-cuffed-sweatpants-for-men/',
    reviewedAt,
  },
  {
    id: 'asos-men-jackets',
    brand: 'ASOS',
    category: 'tops',
    audience: 'men',
    kind: 'conversion',
    title: 'Herrensakkos und Jacken: EU, UK/US, Buchstaben',
    columns: ['EU', 'UK / US', 'Buchstaben'],
    rows: labelRows('asos-jackets', [
      ['44', '34', 'XXS'],
      ['46', '36', 'XS'],
      ['48', '38', 'S'],
      ['50', '40', 'M'],
      ['52', '42', 'L'],
      ['54', '44', 'XL'],
      ['56', '46', 'XXL'],
    ]),
    notes:
      'ASOS-Vergleich für Tailored Jackets. UK/US-Zahlen sind Jackengrößen und dürfen nicht als Hosen-Inch gelesen werden. Buchstabengrößen und Passformen bleiben markenabhängig.',
    sourceTitle: 'ASOS – Men’s Size Guide',
    sourceUrl: 'https://www.asos.com/discover/size-charts/men/',
    reviewedAt,
  },
  {
    id: 'bonprix-men-trousers',
    brand: 'bonprix',
    category: 'trousers',
    audience: 'men',
    kind: 'conversion',
    title: 'Herren-Normalgrößen: auch EU 64 bis 78',
    columns: ['EU/DE', 'Buchstaben', 'Jeanslabel laut bonprix'],
    rows: labelRows('bonprix-normal', [
      ['44', 'S', '30/32'],
      ['46', 'S', '31/32'],
      ['48', 'M', '33/32'],
      ['50', 'M', '34/32'],
      ['52', 'L', '36/32'],
      ['54', 'L', '38/32'],
      ['56', 'XL', '40/32'],
      ['58', 'XL', '42/32'],
      ['60', 'XXL', '44/32'],
      ['62', 'XXL', '46/32'],
      ['64', '3XL', '48/32'],
      ['66', '3XL', '—'],
      ['68', '4XL', '—'],
      ['70', '4XL', '—'],
      ['72', '5XL', '—'],
      ['74', '5XL', '—'],
      ['76', '6XL', '—'],
      ['78', '6XL', '—'],
    ]),
    notes:
      'Herstellerbezogene Gegenüberstellung, keine allgemeine Formel von EU zu W. Große Zahlen wie 64 und 68 gehören hier zur normalen Herrenreihe. Jeansangaben sind Labels, keine gemessene Bundweite.',
    sourceTitle: 'bonprix – Größentabellen Herren',
    sourceUrl: 'https://www.bonprix.de/service/beratung/groessentabellen/',
    reviewedAt,
  },
  {
    id: 'bonprix-special',
    brand: 'bonprix',
    category: 'trousers',
    audience: 'men',
    kind: 'special',
    title: 'Herren: untersetzte und schlanke Größen',
    columns: ['Reihe', 'Größe', 'Jeanslabel'],
    rows: labelRows('bonprix-special', [
      ['Untersetzt', '24', '34/30'],
      ['Untersetzt', '25', '36/30'],
      ['Untersetzt', '26', '38/32'],
      ['Untersetzt', '27', '40/32'],
      ['Untersetzt', '28', '42/32'],
      ['Untersetzt', '29', '44/32'],
      ['Untersetzt', '30', '46/32'],
      ['Schlank', '90', '30/34'],
      ['Schlank', '94', '32/34'],
      ['Schlank', '98', '33/34'],
      ['Schlank', '102', '34/36'],
      ['Schlank', '106', '36/36'],
      ['Schlank', '110', '38/36'],
      ['Schlank', '114', '40/36'],
    ]),
    notes:
      'Separates Größensystem: 24 ist hier weder EU-Damen 24 noch automatisch W24. Gegenüberstellung nach bonprix; keine universelle Verdopplungsregel für andere Marken oder Jahrzehnte.',
    sourceTitle: 'bonprix – Untersetzte und schlanke Herrengrößen',
    sourceUrl: 'https://www.bonprix.de/service/beratung/groessentabellen/',
    reviewedAt,
  },
  {
    id: 'silver-women',
    brand: 'Silver Jeans',
    category: 'trousers',
    audience: 'women',
    kind: 'body',
    title: 'Silver Damenjeans: Jeanszahl und US-Dressgröße',
    columns: ['Jeanslabel', 'US Dress', 'Taille Körper (cm)', 'Hüfte Körper (cm)'],
    rows: labelRows(
      'silver',
      [
        [22, '00', 23, 24, 32, 33],
        [23, '00/0', 24, 25, 33, 34],
        [24, '0', 25, 26, 34, 35],
        [25, '2', 26, 27, 35, 36],
        [26, '2/4', 27, 28, 36, 37],
        [27, '4', 28, 29, 37, 38],
        [28, '6', 29, 30, 38, 39],
        [29, '6/8', 30, 31, 39, 40],
        [30, '8', 31, 32, 40, 41],
        [31, '10', 32, 33, 41, 42],
        [32, '12', 33, 34, 42, 43],
        [33, '12/14', 34, 35.5, 43, 44],
        [34, '14', 35.5, 37, 44, 46],
        [36, '16', 37, 38.5, 46, 48],
      ].map(([size, dress, waistMin, waistMax, hipMin, hipMax]) => [
        `W${size}`,
        String(dress),
        formatRange(inchRange(Number(waistMin), Number(waistMax))),
        formatRange(inchRange(Number(hipMin), Number(hipMax))),
      ]),
    ),
    notes:
      'Körpermaße aus der aktuellen Silver-Tabelle, keine Maße der fertigen Jeans. W29 entspricht hier US 6/8; die natürliche Taille ist nicht einfach 29 Inch. L35 bedeutet nominell 88,9 cm Innenbein. Produktionsland Mexiko bestimmt kein eigenes Größensystem.',
    sourceTitle: 'Silver Jeans – Women’s Jeans Size Chart',
    sourceUrl: 'https://www.silverjeans.com/size-charts.html',
    reviewedAt,
  },
  {
    id: 'refuge-women',
    brand: 'Refuge / Charlotte Russe',
    category: 'trousers',
    audience: 'women',
    kind: 'body',
    title: 'Refuge-Kontext: ungerade US-Damenjeanszahlen',
    columns: ['Labelzahl', 'Taille Körper (cm)', 'Hüfte Körper (cm)'],
    rows: labelRows(
      'refuge',
      [
        [0, 24, 34.5],
        [1, 25, 35.5],
        [3, 26, 36.5],
        [5, 27, 37.5],
        [7, 28, 38.5],
        [9, 29, 39.5],
        [11, 30, 40.5],
        [13, 31, 41.5],
        [15, 33, 43.5],
      ].map(([size, waist, hip]) => [
        String(size),
        formatCentimeters(Number(waist) * 2.54),
        formatCentimeters(Number(hip) * 2.54),
      ]),
    ).map((row) => ({ ...row, labels: [...row.labels, `${row.cells[0]}R`] })),
    notes:
      'Aktuelle Denim-Tabelle von Charlotte Russe als Marken-Kontext für Refuge, keine verifizierte historische Tabelle Deiner Hose. Bei 3R ist die 3 ein Vergleichspunkt; R und die konkrete Vintage-Zuordnung bleiben ungeklärt. Diese Körpermaße werden nicht auf gemessene Ware angewendet.',
    sourceTitle: 'Charlotte Russe – Size Guide, Denim',
    sourceUrl: 'https://charlotterusse.com/pages/size-guide',
    reviewedAt,
  },
  {
    id: 'levis-plus',
    brand: 'Levi’s',
    category: 'trousers',
    audience: 'women',
    kind: 'special',
    title: 'US-Damen-Plusgrößen: 16W bis 26W',
    columns: ['US Plus', 'Levi’s Jeansgröße'],
    rows: labelRows('levis-plus', [
      ['16W', '34'],
      ['18W', '36'],
      ['20W', '38'],
      ['22W', '40'],
      ['24W', '42'],
      ['26W', '44'],
    ]),
    notes:
      'Das W steht hier hinter der Zahl und kennzeichnet die Damen-Plusreihe. 16W ist nicht W16. Herstellervergleich von Levi’s; kein belegter universeller EU- oder Buchstabenschlüssel.',
    sourceTitle: 'Levi’s – Women’s Plus Size Guide',
    sourceUrl: 'https://www.levi.com/US/en_US/info/sizeguide',
    reviewedAt,
  },
  {
    id: 'nominal-waist',
    brand: 'Inch / W-L',
    category: 'trousers',
    audience: 'unisex',
    kind: 'length',
    title: 'W22 bis W60: nominelle Inch-Zahl in Zentimeter',
    columns: ['W-Label', 'Nomineller Umfang (cm)'],
    rows: Array.from({ length: 39 }, (_, index) => {
      const waist = index + 22;
      return {
        id: `waist-${waist}`,
        cells: [`W${waist}`, formatCentimeters(waist * 2.54)],
        labels: [`W${waist}`, String(waist)],
      };
    }),
    notes:
      'Reine Einheitenumrechnung: 1 Inch = 2,54 cm. Der nominelle W-Umfang ist weder eine gemessene Bundweite noch ein allgemeiner Körperumfang. Keine automatische EU-/XS-Zuordnung oder Maßtreffer.',
    sourceTitle: 'Levi’s – How to Measure Jeans',
    sourceUrl: 'https://www.levi.com/GB/en_GB/blog/article/how-to-measure-jeans',
    reviewedAt,
  },
  {
    id: 'nominal-length',
    brand: 'Inch / W-L',
    category: 'trousers',
    audience: 'unisex',
    kind: 'length',
    title: 'L24 bis L40: Innenbeinlabel, auch halbe Inch',
    columns: ['L-Label', 'Nominelles Innenbein (cm)'],
    rows: Array.from({ length: 33 }, (_, index) => {
      const length = index / 2 + 24;
      return {
        id: `length-${length}`,
        cells: [`L${String(length).replace('.5', '½')}`, formatCentimeters(length * 2.54)],
        labels: [`L${length}`, String(length)],
      };
    }),
    notes:
      '29 × 31½ liest Du als nominelle Bundzahl 29 und Innenbein 31,5 Inch (= 80,01 cm). L35 = 88,9 cm. Außenbeinlänge ist nicht aus L ableitbar; R/Regular hat keine markenübergreifend feste Länge.',
    sourceTitle: 'Levi’s – How to Measure Jeans',
    sourceUrl: 'https://www.levi.com/GB/en_GB/blog/article/how-to-measure-jeans',
    reviewedAt,
  },
];
