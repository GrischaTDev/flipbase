import { readFileSync } from 'node:fs';
import postcss, { Root } from 'postcss';
import { describe, expect, it } from 'vitest';

const stylesUrl = new URL('../../../../styles/', import.meta.url);
const theme = postcss.parse(readFileSync(new URL('flipbase-theme.css', stylesUrl), 'utf8'));
const shell = postcss.parse(readFileSync(new URL('flipbase-shell.css', stylesUrl), 'utf8'));

function declaration(sheet: Root, selector: string, property: string): string {
  let value: string | undefined;
  sheet.walkRules(selector, (rule) => {
    if (rule.parent?.type !== 'root') return;
    rule.walkDecls(property, (entry) => {
      value = entry.value;
    });
  });
  if (!value || !/^#[0-9a-f]{6}$/u.test(value)) throw new Error(`${property} fehlt in ${selector}`);
  return value;
}

function contrast(foreground: string, background: string): number {
  const luminance = (color: string) => {
    const [red, green, blue] = [1, 3, 5]
      .map((offset) => Number.parseInt(color.slice(offset, offset + 2), 16) / 255)
      .map((channel) =>
        channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
      );
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  };
  const first = luminance(foreground);
  const second = luminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

describe('Platzhalter der gemeinsamen Auswahl', () => {
  it.each([
    { scheme: 'hell', themeSelector: ':root', shellSelector: 'html:not(.dark) app-shell.fb-admin' },
    { scheme: 'dunkel', themeSelector: 'html.dark', shellSelector: 'html.dark app-shell.fb-admin' },
  ])('bleibt im Schema $scheme ruhend und beim Überfahren lesbar', (mode) => {
    const muted = declaration(shell, mode.shellSelector, '--fb-text-muted');
    const secondary = declaration(shell, mode.shellSelector, '--fb-text-secondary');
    const control = declaration(theme, mode.themeSelector, '--fb-control-bg');
    const hover = declaration(theme, mode.themeSelector, '--fb-control-hover');

    // Ruhend gedämpft, beim Überfahren in der zweiten Textfarbe (siehe Template):
    // Das gedämpfte Grau erreicht dunkel auf der Hover-Fläche nur 3,94:1.
    expect(contrast(muted, control)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(secondary, hover)).toBeGreaterThanOrEqual(4.5);
  });
});
