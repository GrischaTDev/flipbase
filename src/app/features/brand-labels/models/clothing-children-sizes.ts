import type { GuideTable, GuideRow } from './clothing-size-guide';

const reviewedAt = '2026-10-09';
type ChildrenSizeEntry = readonly [
  label: string,
  minimumHeight: number,
  maximumHeight: number,
  age: string,
  numeric?: string,
];
function createChildrenRows(prefix: string, entries: readonly ChildrenSizeEntry[]): GuideRow[] {
  return entries.map(([label, min, max, age, numeric]) => ({
    id: `${prefix}-${label}`,
    cells: [label, `${min}–${max}`, age, ...(numeric ? [numeric] : [])],
    labels: [label, ...(numeric ? numeric.split('–') : [])],
    heightRange: { min, max },
  }));
}
function nikeChildrenTable(girls: boolean): GuideTable {
  const prefix = girls ? 'nike-girls' : 'nike-boys';
  return {
    id: prefix,
    brand: 'Nike',
    audience: 'children',
    category: 'clothing',
    kind: 'children',
    title: girls ? 'Nike: Mädchen-Kindergrößen' : 'Nike: Jungen / bisherige Unisex-Kindergrößen',
    columns: ['Kinder-Label', 'Körpergröße (cm)', 'Alter ≈ (Jahre)', 'Nike Zahlenreihe'],
    rows: createChildrenRows(prefix, [
      ['XS', 122, 128, '7–8', '6–7'],
      ['S', 128, 137, '8–10', '8–9'],
      ['M', 137, girls ? 146 : 147, '10–12', '10–12'],
      ['L', girls ? 146 : 147, girls ? 156 : 158, '12–13', '14–16'],
      ['XL', girls ? 156 : 158, girls ? 166 : 170, '13–15', '18–20'],
    ]),
    notes:
      'Kinder-M ist kein Erwachsenen-M. Die cm-Angabe bezeichnet Körpergröße, keine Hosenlänge. YXS/YS/YM/YL/YXL bezeichnet Youth im Nike-Teamkontext. Nike führt inzwischen zusätzlich Kids Fit; alte Jungen-/Mädchengrößen, neue Passformen und regionale Labels nicht gleichsetzen. Alter dient nur der Orientierung.',
    sourceTitle: girls
      ? 'Nike – Girls Clothing Size Chart'
      : 'Nike – Boys / Unisex Clothing Size Chart',
    sourceUrl: girls
      ? 'https://www.nike.com/ch/en/size-fit/girls-clothing'
      : 'https://www.nike.qa/en/size-fit/boys-unisex-clothing.html',
    sources: [
      {
        title: 'Nike – Kids Fit und bisherige Passformen',
        url: 'https://www.nike.com/de/size-fit/kinderbekleidung',
      },
      {
        title: 'Nike – Youth-Teamkatalog',
        url: 'https://niketeam.nike.com/niketeamsports/content/pdf/catalog_thumbs/NTS_Nike_Kids.pdf?cb=20200915',
      },
    ],
    reviewedAt,
  };
}

export const CLOTHING_CHILDREN_SIZES: readonly GuideTable[] = [
  nikeChildrenTable(false),
  nikeChildrenTable(true),
  {
    id: 'adidas-children-eu',
    brand: 'adidas',
    audience: 'children',
    category: 'clothing',
    kind: 'children',
    title: 'adidas: Kinder- und Jugendgrößen als EU-Zahl',
    columns: ['EU-Kinderlabel', 'Körpergröße (cm)', 'Alter ≈ (Jahre)'],
    rows: createChildrenRows('adidas-eu', [
      ['128', 123, 128, '7–8'],
      ['134', 129, 134, '8–9'],
      ['140', 135, 140, '9–10'],
      ['146', 141, 146, '10–11'],
      ['152', 147, 152, '11–12'],
      ['158', 153, 158, '12–13'],
      ['164', 159, 164, '13–14'],
      ['170', 165, 170, '14–15'],
      ['176', 171, 176, '15–16'],
    ]),
    notes:
      'Die Zahl bezieht sich auf Körpergröße und bezeichnet keine Innen- oder Außenbeinlänge. Referenz für Jungen und Mädchen. Ein Kinderlabel wie 152 ist kein Erwachsenen-Konfektionssystem; bei Vintage das vollständige Etikett und die gemessene Ware prüfen.',
    sourceTitle: 'adidas DE – Kinderkleidung',
    sourceUrl: 'https://www.adidas.de/hilfe/size_charts/kids-clothing',
    reviewedAt,
  },
  {
    id: 'adidas-children-us',
    brand: 'adidas',
    audience: 'children',
    category: 'clothing',
    kind: 'children',
    title: 'adidas: US-Jugendgrößen XS bis XL',
    columns: [
      'US-Kinderlabel',
      'Körpergröße (cm)',
      'Alter ≈ (Jahre)',
      'EU-Zahl bei gleichem Größenbereich',
    ],
    rows: createChildrenRows('adidas-us', [
      ['XS', 123, 128, '7–8', '128'],
      ['S', 135, 140, '9–10', '140'],
      ['M', 147, 152, '11–12', '152'],
      ['L', 159, 164, '13–14', '164'],
      ['XL', 171, 176, '15–16', '176'],
    ]),
    notes:
      'US-Alpha-Reihe laut adidas; die EU-Zahl ist anhand desselben Körpergrößenbereichs gegenübergestellt. adidas Kinder-M und Nike Kinder-M haben unterschiedliche Bereiche. Daraus folgt keine identische Passform und kein Nachweis eines historischen Labeldrucks.',
    sourceTitle: 'adidas US – Kids Clothing',
    sourceUrl: 'https://www.adidas.com/us/help/size_charts/kids-clothing',
    reviewedAt,
    sources: [
      {
        title: 'adidas DE – Kinderkleidung',
        url: 'https://www.adidas.de/hilfe/size_charts/kids-clothing',
      },
    ],
  },
  ...(['tops', 'trousers'] as const).map((category): GuideTable => ({
    id: `nike-children-cn-${category}`,
    brand: 'Nike',
    audience: 'children',
    category,
    kind: 'children',
    title:
      category === 'tops'
        ? 'Nike Jungen: regionale CN-Labels für Oberteile'
        : 'Nike Jungen: regionale CN-Labels für Hosen',
    columns: [
      'Kinder-Label',
      'CN-Label',
      'Körpergröße (cm)',
      category === 'tops' ? 'Brust Körper (cm)' : 'Taille Körper (cm)',
    ],
    rows: [
      ['M', 150, category === 'tops' ? 72 : 63],
      ['L', 160, category === 'tops' ? 76 : 66],
      ['XL', 160, category === 'tops' ? 80 : 69],
    ].map(([label, height, circumference]) => ({
      id: `nike-cn-${category}-${label}`,
      cells: [String(label), `${height}/${circumference}`, String(height), String(circumference)],
      labels: [String(label), `${height}/${circumference}`],
      heightRange: { min: Number(height), max: Number(height) },
    })),
    notes:
      'Beispiele aus der offiziellen CN-Reihe. Erste Zahl: Körpergröße; zweite Zahl: Brust bei Oberteilen beziehungsweise Taille bei Hosen. 160 allein unterscheidet hier L und XL nicht. Keine flache Kleidungsweite aus der zweiten Zahl ableiten.',
    sourceTitle: 'Nike Hongkong – CN Clothing Size Chart',
    sourceUrl: 'https://img.nike.com.hk/resources/sizecart/big-kids-clothing-sizing-chart_en.html',
    reviewedAt,
  })),
];
