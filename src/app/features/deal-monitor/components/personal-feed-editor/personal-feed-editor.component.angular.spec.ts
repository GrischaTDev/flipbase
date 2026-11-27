import '@angular/compiler';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SupabaseService } from '../../../../core/services/supabase.service';
import { VintedBrandSearchService } from '../../../../core/services/vinted-brand-search.service';
import { VintedCategoryService } from '../../../../core/services/vinted-category.service';
import {
  PersonalFeedEditorComponent,
  UNRECOGNIZED_LINK_BRAND_ERROR,
} from './personal-feed-editor.component';

function createEditor(options: {
  resolveBrand?: ReturnType<typeof vi.fn>;
  sizeRows?: { id: number; title: string }[];
}) {
  const sizeQuery = {
    select: () => ({
      in: vi.fn().mockResolvedValue({ data: options.sizeRows ?? [], error: null }),
    }),
  };
  TestBed.configureTestingModule({
    providers: [
      { provide: SupabaseService, useValue: { client: { from: vi.fn(() => sizeQuery) } } },
      {
        provide: VintedBrandSearchService,
        useValue: { resolveBrand: options.resolveBrand ?? vi.fn().mockResolvedValue(null) },
      },
      {
        provide: VintedCategoryService,
        useValue: { readSnapshot: vi.fn().mockResolvedValue({ categories: [] }) },
      },
    ],
  });
  TestBed.overrideComponent(PersonalFeedEditorComponent, { set: { template: '', imports: [] } });
  const fixture = TestBed.createComponent(PersonalFeedEditorComponent);
  const editor = fixture.componentInstance;
  Object.assign(editor, { workspaceId: signal('workspace-1') });
  fixture.detectChanges();
  return editor;
}

describe('Vinted-Linkimport in einen persönlichen Feed', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('lässt eine unbekannte Marke leer und meldet sie am Markenfeld', async () => {
    const resolveBrand = vi.fn().mockResolvedValue(null);
    const editor = createEditor({ resolveBrand });
    editor.feedLink.setValue('https://www.vinted.de/catalog?brand_ids[]=88&order=newest_first');
    await editor.importLink();

    expect(resolveBrand).toHaveBeenCalledWith(88, 'workspace-1');
    expect(editor.form.controls.brand.value).toBe('');
    expect(editor.brandError()).toBe(UNRECOGNIZED_LINK_BRAND_ERROR);
    expect(editor.linkError()).toBeNull();

    editor.form.controls.brand.setValue('Ralph Lauren');
    expect(editor.brandError()).toBeNull();
  });

  it('übernimmt eine erkannte Marke mit Kennung', async () => {
    const editor = createEditor({
      resolveBrand: vi.fn().mockResolvedValue({ id: 88, name: 'Ralph Lauren' }),
    });
    editor.feedLink.setValue('https://www.vinted.de/catalog?brand_ids[]=88');
    await editor.importLink();
    const saved = vi.fn();
    editor.saved.subscribe(saved);
    editor.form.controls.title.setValue('Ralph Lauren');
    editor.submit();

    expect(editor.brandError()).toBeNull();
    expect(saved).toHaveBeenCalledWith(
      expect.objectContaining({ brand_id: 88, brand: 'Ralph Lauren' }),
    );
  });

  it('bildet Vinted-Größentitel ab und lässt unbekannte Größen aus', async () => {
    const editor = createEditor({
      sizeRows: [
        { id: 207, title: 'M / 38 / 10' },
        { id: 210, title: 'XXXL / 46 / 18' },
        { id: 1226, title: '42' },
      ],
    });
    editor.feedLink.setValue(
      'https://www.vinted.de/catalog?size_ids[]=207&size_ids[]=210&size_ids[]=1226',
    );
    await editor.importLink();

    expect(editor.linkError()).toBeNull();
    expect(editor.linkImported()).toBe(true);
    expect(editor.form.controls.sizes.value).toBe('M · 3XL+');
  });

  it('setzt den Importhinweis bei einer neuen Linkeingabe zurück', async () => {
    const editor = createEditor({});
    editor.feedLink.setValue('https://example.com/catalog');
    await editor.importLink();
    expect(editor.linkError()).not.toBeNull();

    editor.feedLink.setValue('https://www.vinted.de/catalog');
    expect(editor.linkError()).toBeNull();
    expect(editor.linkImported()).toBe(false);
  });

  it('meldet eine falsche Preisspanne am Höchstpreis und speichert nicht', () => {
    const editor = createEditor({});
    const saved = vi.fn();
    editor.saved.subscribe(saved);
    editor.form.patchValue({ title: 'Jacken', price_from: 30, price_to: 10 });
    editor.submit();

    expect(editor.form.hasError('priceRange')).toBe(true);
    expect(saved).not.toHaveBeenCalled();

    editor.form.controls.price_from.setValue(5);
    expect(editor.form.hasError('priceRange')).toBe(false);
  });

  it('verlangt mindestens eine Unterkategorie oder eine Marke', () => {
    const editor = createEditor({});
    const saved = vi.fn();
    editor.saved.subscribe(saved);

    editor.form.patchValue({ title: 'Nur Stichwort', search_text: 'Lederjacke' });
    editor.submit();
    expect(editor.form.hasError('missingSource')).toBe(true);
    expect(saved).not.toHaveBeenCalled();

    // Reine Wurzelkategorie Damen/Herren ohne Marke reicht nicht
    editor.form.controls.catalog_id.setValue('5');
    editor.submit();
    expect(editor.form.hasError('missingSource')).toBe(true);
    expect(saved).not.toHaveBeenCalled();

    // Konkrete Unterkategorie erlaubt das Speichern
    editor.form.controls.catalog_id.setValue('1858');
    expect(editor.form.hasError('missingSource')).toBe(false);
    editor.submit();
    expect(saved).toHaveBeenCalledWith(expect.objectContaining({ catalog_id: 1858 }));
  });
});
