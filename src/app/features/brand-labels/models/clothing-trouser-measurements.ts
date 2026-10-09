import type { MeasureRange } from './clothing-size-guide';

type TrouserMeasurement = 'inseam' | 'outseam' | 'frontRise';
type SizeMeasurements = Partial<Record<TrouserMeasurement, MeasureRange>>;
type MeasurementSample = readonly [
  size: string,
  inseam: number | null,
  outseam: number,
  frontRise: number,
];

// Stichproben aus Hersteller-Kleidungsmaßtabellen, keine Größen- oder Vintage-Norm.
const womenSamples: readonly MeasurementSample[] = [
  // Untouched World: Elle.
  ['XS', 78.2, 105.5, 30.3],
  ['S', 78.2, 106.2, 31.2],
  ['M', 78.2, 107, 32.1],
  ['L', 78.2, 107.7, 33],
  ['XL', 78.2, 108.5, 33.9],
  // Untouched World: Julia.
  ['XS', 78, 106.5, 26],
  ['S', 78, 107, 26.5],
  ['M', 78, 108, 27.5],
  ['L', 78, 109, 28.5],
  ['XL', 78, 109.5, 29],
  // Kowtow: Twist.
  ['XXS', 76.1, 109.4, 31.3],
  ['XS', 76.2, 110, 31.9],
  ['S', 76.3, 110.6, 32.5],
  ['M', 76.4, 111.2, 33.1],
  ['L', 76.5, 111.8, 33.7],
  ['XL', 76.4, 112.4, 34.6],
  ['XXL', 76.3, 113, 35.5],
];

export const TROUSER_MEASUREMENT_SOURCES = {
  women: [
    {
      title: 'Untouched World – Elle: Kleidungsmaße',
      url: 'https://www.untouchedworld.com/products/elle-pant-black-600212',
    },
    {
      title: 'Untouched World – Julia: Kleidungsmaße',
      url: 'https://www.untouchedworld.com/products/julia-pant-liberty-blue-600230',
    },
    {
      title: 'Kowtow – Twist: Kleidungsmaßtabelle',
      url: 'https://nz.kowtowclothing.com/products/twist-jeans-indigo-denim',
    },
  ],
  men: [
    {
      title: 'Untouched World – Terra: Kleidungsmaße',
      url: 'https://www.untouchedworld.com/en-uk/products/terra-pant-flax-9597c',
    },
    {
      title: 'Kowtow – Theo: Kleidungsmaßtabelle',
      url: 'https://au.kowtowclothing.com/products/theo-pant-driftwood',
    },
    {
      title: 'ORTC – Straight Denim/Twill: Kleidungsmaße',
      url: 'https://ortc.co/products/straight-twill-pant-stone',
    },
    {
      title: 'ORTC – Jackson Chino: Kleidungsmaße',
      url: 'https://ortc.com.au/pages/mens-jackson-chino-size-chart',
    },
  ],
};

const menSamples: readonly MeasurementSample[] = [
  // Untouched World: Terra.
  ['S', 79.9, 106.5, 24.7],
  ['M', 79.9, 107.5, 25.8],
  ['L', 79.9, 108.5, 27],
  ['XL', 79.9, 109.5, 28.1],
  ['XXL', 79.9, 110.5, 29.3],
  // Kowtow: Theo.
  ['S', 76.3, 111, 35.9],
  ['M', 76.3, 111.5, 36.5],
  ['L', 76.3, 112, 37.1],
  ['XL', 76.4, 112.5, 37.9],
  // ORTC: gemeinsame Größenreihe für Straight Denim und Twill, einmal gezählt.
  ['XS', null, 103, 27.5],
  ['S', null, 105, 28.5],
  ['M', null, 107, 29.5],
  ['L', null, 109, 30.5],
  ['XL', null, 111, 31.5],
  ['XXL', null, 113, 32.5],
  // ORTC: Jackson Chino. Keine Innenbeinmaße veröffentlicht.
  ['XS', null, 101, 27.5],
  ['S', null, 103, 28.5],
  ['M', null, 105, 29.5],
  ['L', null, 107, 30.5],
  ['XL', null, 109, 31.5],
  ['XXL', null, 111, 32.5],
];

export function collectTrouserMeasurementRanges(
  audience: 'women' | 'men',
  size: string,
): SizeMeasurements {
  const samples = (audience === 'women' ? womenSamples : menSamples).filter(
    (sample) => sample[0] === size,
  );
  const ranges: SizeMeasurements = {};
  for (const [index, key] of (['inseam', 'outseam', 'frontRise'] as const).entries()) {
    const measurements = samples.flatMap((sample) => {
      const measurement = sample[index + 1];
      return typeof measurement === 'number' ? [measurement] : [];
    });
    if (measurements.length) {
      ranges[key] = {
        min: Math.min(...measurements),
        max: Math.max(...measurements),
      };
    }
  }
  return ranges;
}
