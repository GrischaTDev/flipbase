import { CLOTHING_SIZE_RANGES } from './clothing-size-ranges';
import { CLOTHING_CHILDREN_SIZES } from './clothing-children-sizes';
import {
  decodeSizeLabel,
  type GuideCategory,
  type GuideRow,
  type GuideTable,
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

export const CLOTHING_SIZE_TABLES: readonly GuideTable[] = [
  ...CLOTHING_SIZE_RANGES,
  ...CLOTHING_CHILDREN_SIZES,
  {
    id: 'bonprix-women-lengths',
    brand: 'bonprix',
    category: 'trousers',
    audience: 'women',
    kind: 'length-reference',
    title: 'Damenhosen: Kurz, Normal und Lang',
    columns: ['Längenreihe', 'Innenbein-Richtwert (cm)', 'Außenbeinlänge'],
    rows: labelRows('bonprix-women-length', [
      ['Kurz / Petite', '≈ 75', 'Am Stück messen'],
      ['Regulär', '≈ 81', 'Am Stück messen'],
      ['Lang', '≈ 88', 'Am Stück messen'],
    ]),
    notes:
      'Längenorientierung laut bonprix, keine markenübergreifende Norm und keine feste Länge pro XS/S/M. Die Außenbeinlänge hängt zusätzlich von Bundhöhe und Schnitt ab; sie lässt sich nicht mit einer festen Zugabe aus dem Innenbein berechnen.',
    sourceTitle: 'bonprix – Damen-Spezialgrößen',
    sourceUrl: 'https://www.bonprix.de/service/beratung/groessentabellen/',
    sources: [
      {
        title: 'UNIQLO – Innenbeinlänge messen',
        url: 'https://faq-us.uniqlo.com/articles/en_US/Knowledge/How-to-Measure-Inseam/',
      },
      {
        title: 'Marks Commercial – Außenbeinlänge einschließlich Bund messen',
        url: 'https://www.markscommercial.com/content/files/Purchase%20Guides/2024.25%20MC%20SIZING%20GUIDE.pdf',
      },
    ],
    reviewedAt,
  },
  {
    id: 'bonprix-men-lengths',
    brand: 'bonprix',
    category: 'trousers',
    audience: 'men',
    kind: 'length-reference',
    title: 'Herrenhosen: Innenbein bei Normalgrößen',
    columns: ['Größenreihe', 'Innenbein-Richtwert (cm)', 'Außenbeinlänge'],
    rows: labelRows('bonprix-men-length', [['EU 44–78 / S–6XL', '80–82', 'Am Stück messen']]),
    notes:
      'bonprix nennt für seine Normalgrößen eine Hosen-Innenbeinlänge von 80–82 cm. Das ist eine Herstellerreferenz, keine allgemeine Längengarantie. Die Weitengröße bestimmt nicht automatisch die Beinlänge.',
    sourceTitle: 'bonprix – Herren-Normalgrößen',
    sourceUrl: 'https://www.bonprix.de/service/beratung/groessentabellen/',
    reviewedAt,
  },
  nextWomenTable('trousers'),
  nextWomenTable('tops'),
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
    kind: 'length-reference',
    title: 'Herren: untersetzte und schlanke Größen',
    columns: ['Reihe', 'Größe', 'Jeanslabel', 'Innenbein-Richtwert (cm)'],
    rows: labelRows('bonprix-special', [
      ['Untersetzt', '24', '34/30'],
      ['Untersetzt', '25', '36/30'],
      ['Untersetzt', '26', '38/32'],
      ['Untersetzt', '27', '40/32'],
      ['Untersetzt', '28', '42/32'],
      ['Untersetzt', '29', '44/32'],
      ['Untersetzt', '30', '46/32'],
      ['Untersetzt', '31', '—'],
      ['Untersetzt', '32', '—'],
      ['Untersetzt', '33', '—'],
      ['Untersetzt', '34', '—'],
      ['Schlank', '90', '30/34'],
      ['Schlank', '94', '32/34'],
      ['Schlank', '98', '33/34'],
      ['Schlank', '102', '34/36'],
      ['Schlank', '106', '36/36'],
      ['Schlank', '110', '38/36'],
      ['Schlank', '114', '40/36'],
    ]).map((row) => {
      const size = Number(row.cells[1]);
      const minimum = row.cells[0] === 'Untersetzt' ? 75 + size - 24 : 85 + (size - 90) / 4;
      return { ...row, cells: [...row.cells, `${minimum}–${minimum + 2}`] };
    }),
    notes:
      'Separates Größensystem: 24 ist hier weder EU-Damen 24 noch automatisch W24. Innenbein-Richtwerte aus der bonprix-Größenberatung, keine zugesicherten Fertigmaße aller Hosen. Keine universelle Verdopplungsregel für andere Marken oder Jahrzehnte.',
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
    kind: 'conversion',
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
        measurements: { inseam: { min: length * 2.54, max: length * 2.54 } },
      };
    }),
    notes:
      '29 × 31½ liest Du als nominelle Bundzahl 29 und Innenbein 31,5 Inch (= 80,01 cm). L35 = 88,9 cm. Außenbeinlänge ist nicht aus L ableitbar; R/Regular hat keine markenübergreifend feste Länge.',
    sourceTitle: 'Levi’s – How to Measure Jeans',
    sourceUrl: 'https://www.levi.com/GB/en_GB/blog/article/how-to-measure-jeans',
    reviewedAt,
  },
];
