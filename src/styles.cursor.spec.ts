import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('globaler Cursorvertrag', () => {
  const css = readFileSync('src/styles.css', 'utf8').replace(/\s+/g, ' ').replaceAll("'", '"');

  it('kennzeichnet ausschließlich aktive native Aktionen mit einem Pointer', () => {
    expect(css).toContain('button:not(:disabled):not([aria-disabled="true"])');
    expect(css).toContain('a[href]:not([aria-disabled="true"])');
    expect(css).toContain('select:not(:disabled):not([aria-disabled="true"])');

    for (const type of [
      'button',
      'submit',
      'reset',
      'checkbox',
      'radio',
      'file',
      'range',
      'color',
      'image',
    ]) {
      expect(css).toMatch(
        new RegExp(`input[^}]+\\[type=['\"]${type}['\"]\\][^}]+cursor:\\s*pointer`, 's'),
      );
    }

    for (const type of ['text', 'date', 'email', 'number']) {
      expect(css).not.toMatch(
        new RegExp(`input[^}]+\\[type=['\"]${type}['\"]\\][^}]+cursor:\\s*pointer`, 's'),
      );
    }

    expect(css).not.toMatch(/\[tabindex\][^{]*\{[^}]*cursor:\s*pointer/s);
    expect(css).not.toMatch(/textarea[^{]*\{[^}]*cursor:\s*pointer/s);
  });

  it('kennzeichnet deaktivierte native und ARIA-Aktionen als nicht verfügbar', () => {
    expect(css).toMatch(/:disabled[^}]+cursor:\s*not-allowed/s);
    expect(css).toMatch(
      /:where\(button, input, select, textarea\)\[aria-disabled="true"\][^}]+cursor:\s*not-allowed/s,
    );
    expect(css).toMatch(/\[aria-disabled=['\"]true['\"]\][^}]+cursor:\s*not-allowed/s);
  });

  it('überlässt lokale Spezialcursor dem jeweiligen Element', () => {
    const cursorContract = css.slice(
      css.indexOf('/* interaction-cursors:start */'),
      css.indexOf('/* interaction-cursors:end */'),
    );

    expect(cursorContract).not.toContain('pointer-events: none');
    expect(cursorContract).not.toContain('!important');
  });
});
