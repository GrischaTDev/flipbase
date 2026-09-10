import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Telefon-Länderauswahl', () => {
  it('verwendet die Oberflächenfarben auch im dunklen Verwaltungsdesign', () => {
    const css = readFileSync('src/styles.css', 'utf8');

    expect(css).toContain('--iti-country-selector-bg: var(--fb-bg-surface)');
    expect(css).toContain('--iti-border-color: var(--fb-border)');
    expect(css).toContain('.iti__search-input');
  });
});
