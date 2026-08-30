import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('globaler Cursorvertrag', () => {
  const css = readFileSync('src/styles.css', 'utf8').replace(/\s+/g, ' ').replaceAll("'", '"');
  const cursorContract = css.slice(
    css.indexOf('/* interaction-cursors:start */'),
    css.indexOf('/* interaction-cursors:end */'),
  );

  it('kennzeichnet ausschließlich aktive native Aktionen mit einem Pointer', () => {
    expect(cursorContract).toContain('button:not(:disabled):not([aria-disabled="true"])');
    expect(cursorContract).toContain('a[href]:not([aria-disabled="true"])');
    expect(cursorContract).toContain('select:not(:disabled):not([aria-disabled="true"])');

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
      expect(cursorContract).toMatch(
        new RegExp(`input[^}]+\\[type=['\"]${type}['\"]\\][^}]+cursor:\\s*pointer`, 's'),
      );
    }

    for (const type of ['text', 'date', 'email', 'number']) {
      expect(cursorContract).not.toMatch(
        new RegExp(`input[^}]+\\[type=['\"]${type}['\"]\\][^}]+cursor:\\s*pointer`, 's'),
      );
    }

    expect(cursorContract).not.toMatch(/\[tabindex\][^{]*\{[^}]*cursor:\s*pointer/s);
    expect(cursorContract).not.toMatch(/textarea[^{]*\{[^}]*cursor:\s*pointer/s);
  });

  it('kennzeichnet deaktivierte native und ARIA-Aktionen als nicht verfügbar', () => {
    expect(cursorContract).toMatch(/:disabled[^}]+cursor:\s*not-allowed/s);
    expect(cursorContract).toMatch(
      /:where\(button, input, select, textarea\)\[aria-disabled="true"\][^}]+cursor:\s*not-allowed/s,
    );
    expect(cursorContract).toMatch(/\[aria-disabled=['\"]true['\"]\][^}]+cursor:\s*not-allowed/s);
  });

  it('umschließt ausschließlich die dedizierten Cursor-Layer', () => {
    expect(cursorContract).toContain('@layer base');
    expect(cursorContract).toContain('@layer utilities');
    expect(cursorContract).not.toContain('.fb-skip-link');
    expect(cursorContract).not.toContain('::-webkit-scrollbar');
    expect(cursorContract).not.toContain('pointer-events: none');
    expect(cursorContract).not.toContain('!important');
  });
});
