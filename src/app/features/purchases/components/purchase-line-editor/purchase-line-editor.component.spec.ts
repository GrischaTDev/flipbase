import '@angular/compiler';
import { computed, signal } from '@angular/core';
import { FormArray } from '@angular/forms';
import { describe, expect, it, vi } from 'vitest';
import { CatalogProduct } from '../../../../core/models/flipbase.models';
import { PurchaseLineEditorComponent } from './purchase-line-editor.component';

function erstelleEditor() {
  const linesChanged = { emit: vi.fn() };
  const editor = Object.create(
    PurchaseLineEditorComponent.prototype,
  ) as PurchaseLineEditorComponent;
  Object.assign(editor, {
    lineRows: new FormArray([]),
    linesChanged,
  });
  return { editor, linesChanged };
}

describe('PurchaseLineEditorComponent', () => {
  it('lädt beim frischen Einstieg den persistierten Artikelstamm des aktiven Workspace', async () => {
    const { editor } = erstelleEditor();
    const products = signal<CatalogProduct[]>([]);
    const persistedProduct: CatalogProduct = {
      id: 'catalog-led',
      workspace_id: 'workspace-1',
      title: 'LED-Lampe',
      tracking_mode: 'quantity',
      is_public_store: false,
    };
    const loadProducts = vi.fn(async (workspaceId: string) => {
      if (workspaceId === persistedProduct.workspace_id) products.set([persistedProduct]);
    });
    Object.assign(editor, {
      catalogService: {
        products,
        isLoading: signal(false),
        loadError: signal<Error | null>(null),
        loadProducts,
      },
      workspaceService: {
        currentWorkspace: signal({ id: persistedProduct.workspace_id }),
      },
      catalogContextError: signal<string | null>(null),
      quantityProducts: computed(() =>
        products().filter((product) => product.tracking_mode === 'quantity'),
      ),
    });

    (editor as unknown as { ngOnInit(): void }).ngOnInit();

    await vi.waitFor(() =>
      expect(loadProducts).toHaveBeenCalledWith(persistedProduct.workspace_id),
    );
    expect(editor.quantityProducts()).toEqual([persistedProduct]);
  });

  it('berechnet die Positionssumme einer Mengenposition aus Menge und EK je Stück', () => {
    const { editor } = erstelleEditor();
    editor.addQuantityLine();

    const row = editor.lineRows.at(0);
    row.patchValue({ orderedQuantity: 5, unitPurchasePrice: 4.99 });
    editor.recalculate(0, 'unitPurchasePrice');

    expect(row.controls.lineTotal.value).toBe(24.95);
  });

  it('berechnet EK je Stück aus der Positionssumme ohne mehr als zwei Nachkommastellen', () => {
    const { editor } = erstelleEditor();
    editor.addQuantityLine();

    const row = editor.lineRows.at(0);
    row.patchValue({ orderedQuantity: 5, lineTotal: 29.95 });
    editor.recalculate(0, 'lineTotal');

    expect(row.controls.unitPurchasePrice.value).toBe(5.99);
  });

  it('erzeugt für Einzelstücke eine individuelle Position mit Menge eins', () => {
    const { editor } = erstelleEditor();

    editor.addIndividualLine();

    expect(editor.lineRows.at(0).getRawValue()).toMatchObject({
      lineKind: 'individual',
      orderedQuantity: 1,
    });
  });

  it('meldet eine geänderte Einzelpositionsbezeichnung an das Elternformular', () => {
    const { editor, linesChanged } = erstelleEditor();
    editor.addIndividualLine();
    linesChanged.emit.mockClear();

    editor.updateTitleSnapshot(0, 'Mystery-Fundstück');

    expect(linesChanged.emit).toHaveBeenCalledWith([
      expect.objectContaining({ titleSnapshot: 'Mystery-Fundstück' }),
    ]);
  });
});
