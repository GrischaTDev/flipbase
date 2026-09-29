import '@angular/compiler';
import { signal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import { SaleCreateModalComponent } from './sale-create-modal.component';
import { SaleCreateComponent } from '../../pages/sale-create/sale-create.component';

function createStockSubject() {
  const currentWorkspace = signal<{ id: string } | null>({ id: 'workspace-1' });
  const stockService = {
    loadPositions: vi.fn(async (_workspaceId: string): Promise<void> => undefined),
    loadError: signal<Error | null>(null),
  };
  const component = Object.create(SaleCreateModalComponent.prototype) as SaleCreateModalComponent;
  const updateQuantityValidator = vi.fn();
  Object.assign(component, {
    workspaceService: { currentWorkspace },
    stockService,
    stockLoadRequestId: 0,
    isLoadingStock: signal(false),
    stockLoadError: signal<string | null>(null),
    isSubmitting: signal(false),
    isPersisted: signal(false),
    lines: { controls: [{ id: 'line-1' }] },
    updateQuantityValidator,
  });
  return { component, currentWorkspace, stockService, updateQuantityValidator };
}

describe('Verkaufserfassung: Bestand laden', () => {
  it('lädt den Mengenbestand ohne vorherigen Besuch der Artikelansicht', async () => {
    const { component, stockService, updateQuantityValidator } = createStockSubject();

    await component.loadStockPositions();

    expect(stockService.loadPositions).toHaveBeenCalledWith('workspace-1');
    expect(updateQuantityValidator).toHaveBeenCalledWith({ id: 'line-1' });
    expect(component.isLoadingStock()).toBe(false);
    expect(component.stockLoadError()).toBeNull();
  });

  it('sperrt Speichern während des Ladens und nach einem Ladefehler', async () => {
    const { component, stockService } = createStockSubject();
    let finish!: () => void;
    stockService.loadPositions.mockImplementation(
      () => new Promise<void>((resolve) => (finish = resolve)),
    );
    const pending = component.loadStockPositions();
    expect(component.isLoadingStock()).toBe(true);
    expect(component.canSave()).toBe(false);
    stockService.loadError.set(new Error('Bestand nicht erreichbar'));
    finish();
    await pending;

    expect(component.stockLoadError()).toBe('Bestand nicht erreichbar');
    expect(component.canSave()).toBe(false);
  });

  it('setzt einen Bestandsfehler nach erfolgreichem Wiederholen zurück', async () => {
    const { component, stockService } = createStockSubject();
    stockService.loadError.set(new Error('Verbindung unterbrochen'));
    await component.loadStockPositions();
    stockService.loadError.set(null);
    await component.loadStockPositions();

    expect(stockService.loadPositions).toHaveBeenCalledTimes(2);
    expect(component.stockLoadError()).toBeNull();
    expect(component.canSave()).toBe(true);
  });

  it('beendet den Ladezustand auch bei einer geworfenen Ausnahme', async () => {
    const { component, stockService } = createStockSubject();
    stockService.loadPositions.mockRejectedValue(new Error('Netzwerkfehler'));

    await component.loadStockPositions();

    expect(component.stockLoadError()).toBe('Netzwerkfehler');
    expect(component.isLoadingStock()).toBe(false);
  });

  it('ignoriert verspätete Fehler nach einem Workspace-Wechsel', async () => {
    const { component, currentWorkspace, stockService } = createStockSubject();
    let fail!: (error: Error) => void;
    stockService.loadPositions.mockImplementationOnce(
      () => new Promise<void>((_resolve, reject) => (fail = reject)),
    );
    const first = component.loadStockPositions();
    currentWorkspace.set({ id: 'workspace-2' });
    await component.loadStockPositions();
    fail(new Error('Verspätete Antwort'));
    await first;

    expect(component.stockLoadError()).toBeNull();
    expect(component.isLoadingStock()).toBe(false);
  });

  it('fragt ohne Workspace keinen Bestand an', async () => {
    const { component, currentWorkspace, stockService } = createStockSubject();
    currentWorkspace.set(null);

    await component.loadStockPositions();

    expect(stockService.loadPositions).not.toHaveBeenCalled();
  });
});

describe('Verkaufserfassung: Aktionen im Seitenkopf', () => {
  it('reicht die Aktion an das bestehende Verkaufsformular weiter', () => {
    const onSubmit = vi.fn(async () => undefined);
    const page = Object.create(SaleCreateComponent.prototype) as SaleCreateComponent;
    Object.assign(page, { entryForm: () => ({ onSubmit, canSave: () => true }) });

    expect(page.canSave()).toBe(true);
    page.save();

    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it('bleibt vor der ersten Darstellung des Formulars gesperrt', () => {
    const page = Object.create(SaleCreateComponent.prototype) as SaleCreateComponent;
    Object.assign(page, { entryForm: () => undefined });

    expect(page.canSave()).toBe(false);
    expect(() => page.save()).not.toThrow();
  });

  it('ignoriert erneutes Abschicken während eines laufenden Speichervorgangs', async () => {
    const component = Object.create(SaleCreateModalComponent.prototype) as SaleCreateModalComponent;
    const recordSale = vi.fn();
    Object.assign(component, {
      isSubmitting: signal(true),
      isPersisted: signal(false),
      salesService: { recordSale },
    });

    await component.onSubmit();

    expect(recordSale).not.toHaveBeenCalled();
  });
});
