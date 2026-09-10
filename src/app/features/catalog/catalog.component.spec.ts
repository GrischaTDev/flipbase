import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('CatalogComponent', () => {
  it('verwendet den gemeinsamen Dialog zum Erstellen von Artikeln', () => {
    const template = readFileSync('src/app/features/catalog/catalog.component.html', 'utf8');

    expect(template).toContain('<app-catalog-product-dialog');
    expect(template).not.toContain('formControlName="trackingMode"');
  });
});
