import '@angular/compiler';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('ShellComponent', () => {
  it('rendert eindeutige Druckhaken für alle Teile des Admin-Rahmens', () => {
    const shell = new DOMParser().parseFromString(
      readFileSync('src/app/layout/shell/shell.component.html', 'utf8'),
      'text/html',
    ).body;
    for (const hook of [
      '[data-shell-sidebar]',
      '[data-shell-content]',
      '[data-shell-header]',
      '[data-shell-main]',
      '[data-shell-bottom-nav]',
    ]) {
      expect(shell.querySelector(hook)).not.toBeNull();
    }
  });
});
