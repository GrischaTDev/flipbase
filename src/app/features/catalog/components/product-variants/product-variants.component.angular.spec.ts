import '@angular/compiler';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { CatalogProduct } from '../../../../core/models/flipbase.models';
import { ProductVariantsComponent } from './product-variants.component';

describe('Varianten-Dialog', () => {
  it('zeigt eine bereits angelegte Variante auch nach einem Bildfehler beim Schließen', () => {
    const variant: CatalogProduct = {
      id: 'variant-1',
      workspace_id: 'workspace-1',
      title: 'Schuh',
      tracking_mode: 'quantity',
      is_public_store: false,
    };
    TestBed.configureTestingModule({});
    const component = TestBed.runInInjectionContext(() => new ProductVariantsComponent());
    const created = vi.fn();
    component.created.subscribe(created);
    component.dialogOpen.set(true);
    component.onVariantSaved(variant);

    component.closeDialog();

    expect(created).toHaveBeenCalledExactlyOnceWith(variant);
    expect(component.dialogOpen()).toBe(false);
  });
});
