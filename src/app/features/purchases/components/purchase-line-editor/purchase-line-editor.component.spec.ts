import '@angular/compiler';
import { ɵresolveComponentResources, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormArray } from '@angular/forms';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { readFile } from 'node:fs/promises';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { CatalogProduct, Workspace } from '../../../../core/models/flipbase.models';
import { CatalogService } from '../../../../core/services/catalog.service';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import { PurchaseLineEditorComponent } from './purchase-line-editor.component';

TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
beforeAll(async () => {
  await ɵresolveComponentResources((url) => readFile(new URL(url, import.meta.url), 'utf8'));
});

const workspaceOne: Workspace = {
  id: 'workspace-1',
  name: 'Workspace 1',
  currency: 'EUR',
  min_roi_percent: 30,
  min_profit_amount: 15,
};
const workspaceTwo: Workspace = { ...workspaceOne, id: 'workspace-2', name: 'Workspace 2' };
const ledProduct: CatalogProduct = {
  id: 'catalog-led',
  workspace_id: workspaceOne.id,
  title: 'LED-Lampe',
  tracking_mode: 'quantity',
  is_public_store: false,
};

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
  it('lädt nach verspätetem Workspace und bei Wechsel jeden aktuellen Artikelstamm genau einmal', async () => {
    TestBed.resetTestingModule();
    const products = signal<CatalogProduct[]>([]);
    const isLoading = signal(false);
    const loadError = signal<Error | null>(null);
    const loadedWorkspaceId = signal<string | null>(null);
    const currentWorkspace = signal<Workspace | null>(null);
    const loadProducts = vi.fn(async (workspaceId: string) => {
      isLoading.set(true);
      products.set(
        workspaceId === workspaceOne.id
          ? [ledProduct]
          : [{ ...ledProduct, id: 'catalog-chair', workspace_id: workspaceTwo.id, title: 'Stuhl' }],
      );
      loadedWorkspaceId.set(workspaceId);
      isLoading.set(false);
    });
    const fixture = TestBed.configureTestingModule({
      imports: [PurchaseLineEditorComponent],
      providers: [
        {
          provide: CatalogService,
          useValue: {
            products,
            isLoading,
            loadError,
            loadedWorkspaceId,
            loadProducts,
            createProduct: vi.fn(),
          },
        },
        { provide: WorkspaceService, useValue: { currentWorkspace } },
      ],
    }).createComponent(PurchaseLineEditorComponent);
    fixture.detectChanges();
    expect(loadProducts).not.toHaveBeenCalled();

    currentWorkspace.set(workspaceOne);
    fixture.detectChanges();
    await vi.waitFor(() => expect(loadProducts).toHaveBeenCalledWith(workspaceOne.id));
    expect(fixture.componentInstance.quantityProducts()).toEqual([ledProduct]);

    currentWorkspace.set(workspaceTwo);
    fixture.detectChanges();
    await vi.waitFor(() => expect(loadProducts).toHaveBeenCalledWith(workspaceTwo.id));
    expect(loadProducts.mock.calls.map(([workspaceId]) => workspaceId)).toEqual([
      workspaceOne.id,
      workspaceTwo.id,
    ]);
    expect(fixture.componentInstance.quantityProducts().map((product) => product.title)).toEqual([
      'Stuhl',
    ]);
  });

  it('sperrt nach fehlgeschlagenem Laden fremde gecachte Workspace-Produkte', async () => {
    TestBed.resetTestingModule();
    const products = signal<CatalogProduct[]>([
      { ...ledProduct, workspace_id: workspaceTwo.id, title: 'Fremde LED-Lampe' },
    ]);
    const loadError = signal<Error | null>(null);
    const fixture = TestBed.configureTestingModule({
      imports: [PurchaseLineEditorComponent],
      providers: [
        {
          provide: CatalogService,
          useValue: {
            products,
            isLoading: signal(false),
            loadError,
            loadedWorkspaceId: signal<string | null>(workspaceTwo.id),
            loadProducts: vi.fn(async () => loadError.set(new Error('Katalog nicht erreichbar'))),
            createProduct: vi.fn(),
          },
        },
        {
          provide: WorkspaceService,
          useValue: { currentWorkspace: signal<Workspace | null>(workspaceOne) },
        },
      ],
    }).createComponent(PurchaseLineEditorComponent);
    fixture.detectChanges();
    await vi.waitFor(() => expect(loadError()).not.toBeNull());
    expect(fixture.componentInstance.catalogSelectionDisabled()).toBe(true);
    expect(fixture.componentInstance.quantityProducts()).toEqual([]);
    expect(fixture.componentInstance.catalogLoadError()).toContain('Katalog nicht erreichbar');
  });

  it('wiederholt einen fehlgeschlagenen Katalogabruf erst nach explizitem Retry', async () => {
    TestBed.resetTestingModule();
    const isLoading = signal(false);
    const loadError = signal<Error | null>(null);
    const loadProducts = vi.fn(async () => {
      // Der echte Dienst kann seinen Ladezustand synchron prüfen. Dieser Read
      // darf nicht versehentlich zur Abhängigkeit des Komponenten-Effects werden.
      void isLoading();
      if (loadProducts.mock.calls.length > 3) return;
      isLoading.set(true);
      await Promise.resolve();
      loadError.set(new Error('Katalog nicht erreichbar'));
      isLoading.set(false);
    });
    const fixture = TestBed.configureTestingModule({
      imports: [PurchaseLineEditorComponent],
      providers: [
        {
          provide: CatalogService,
          useValue: {
            products: signal<CatalogProduct[]>([]),
            isLoading,
            loadError,
            loadedWorkspaceId: signal<string | null>(null),
            loadProducts,
            createProduct: vi.fn(),
          },
        },
        {
          provide: WorkspaceService,
          useValue: { currentWorkspace: signal<Workspace | null>(workspaceOne) },
        },
      ],
    }).createComponent(PurchaseLineEditorComponent);

    fixture.detectChanges();
    await vi.waitFor(() => expect(fixture.componentInstance.catalogLoadError()).not.toBeNull());
    await Promise.resolve();
    fixture.detectChanges();
    expect(loadProducts).toHaveBeenCalledTimes(1);

    await fixture.componentInstance.loadCatalogProducts(true);
    expect(loadProducts).toHaveBeenCalledTimes(2);
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
