import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('CatalogComponent table presentation', () => {
  it('zeigt Kategorie und Marke in eigenen Spalten und entfernt den Webshop-Status', async () => {
    const template = await readFile(
      resolve(process.cwd(), 'src/app/features/catalog/catalog.component.html'),
      'utf8',
    );

    expect(template).toContain("@case ('category')");
    expect(template).toContain("@case ('brand')");
    expect(template).toContain("product.category || 'Unbekannt'");
    expect(template).toContain("product.brand || 'Unbekannt'");
    expect(template).not.toContain("@case ('store')");
    expect(template).not.toContain('Öffentlich');
    expect(template).not.toContain('Nur intern');
    expect(template).not.toContain('Im Webshop');
  });
});
