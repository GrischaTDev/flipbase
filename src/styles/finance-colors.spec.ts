import { readFileSync } from 'node:fs';
import postcss from 'postcss';
import { describe, expect, it } from 'vitest';
import { createRevenueChartConfiguration } from '../app/shared/components/revenue-chart/revenue-chart.config';

const theme = postcss.parse(readFileSync(new URL('./flipbase-theme.css', import.meta.url), 'utf8'));
const utilityColors = postcss.parse(
  readFileSync(new URL('../styles.css', import.meta.url), 'utf8'),
);

function declaration(selector: string, property: string): string | undefined {
  let value: string | undefined;
  theme.walkRules(selector, (rule) => {
    if (rule.parent?.type !== 'root') return;
    rule.walkDecls(property, (entry) => {
      value = entry.value;
    });
  });
  return value;
}

function contrast(foreground: string, background: string): number {
  const luminance = (color: string) => {
    const channels = [1, 3, 5].map(
      (offset) => Number.parseInt(color.slice(offset, offset + 2), 16) / 255,
    );
    const [red, green, blue] = channels.map((channel) =>
      channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
    );
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  };
  const first = luminance(foreground);
  const second = luminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

describe('Finanzfarben im Admin', () => {
  it.each([
    { theme: 'light', selector: ':root', background: '#ffffff' },
    { theme: 'dark', selector: 'html.dark', background: '#2b2b2b' },
  ] as const)('teilt im $theme-Theme das Diagrammrot mit dem Admin-Badge', (mode) => {
    const chartRed = createRevenueChartConfiguration([], mode.theme, true).colors[1];
    const badgeRed = declaration(mode.selector, '--fb-color-admin-surface');
    expect(badgeRed).toBe(chartRed);
    expect(contrast(badgeRed ?? '', '#ffffff')).toBeGreaterThanOrEqual(4.5);
  });

  it.each([
    { selector: ':root', background: '#ffffff' },
    { selector: 'html.dark', background: '#2b2b2b' },
  ])('liefert auf $background lesbares Grün und Rot für Finanztabellen', (mode) => {
    const positive = declaration(mode.selector, '--fb-color-finance-positive-text');
    const negative = declaration(mode.selector, '--fb-color-finance-negative-text');
    expect(positive).toMatch(/^#[0-9a-f]{6}$/);
    expect(negative).toMatch(/^#[0-9a-f]{6}$/);
    expect(contrast(positive ?? '', mode.background)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(negative ?? '', mode.background)).toBeGreaterThanOrEqual(4.5);
    const rgb = (color: string) =>
      [1, 3, 5].map((offset) => Number.parseInt(color.slice(offset, offset + 2), 16));
    const [positiveRed, positiveGreen, positiveBlue] = rgb(positive ?? '');
    const [negativeRed, negativeGreen, negativeBlue] = rgb(negative ?? '');
    expect(positiveGreen).toBeGreaterThan(Math.max(positiveRed, positiveBlue));
    expect(negativeRed).toBeGreaterThan(Math.max(negativeGreen, negativeBlue));
  });

  it('stellt die beiden Finanzfarben als Tailwind-Klassen bereit', () => {
    const declarations = new Map<string, string>();
    utilityColors.walkDecls(/^--color-fb-finance-/, (entry) => {
      declarations.set(entry.prop, entry.value);
    });
    expect(declarations.get('--color-fb-finance-positive')).toBe(
      'var(--fb-color-finance-positive-text)',
    );
    expect(declarations.get('--color-fb-finance-negative')).toBe(
      'var(--fb-color-finance-negative-text)',
    );
  });
});
