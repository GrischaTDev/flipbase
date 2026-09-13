import '@angular/compiler';
import { ElementRef, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { InventoryItem, PurchaseLine } from '../../../../core/models/flipbase.models';
import { MutationResult } from '../../../../core/models/mutation-result.model';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.service';
import { PurchasePackageService } from '../../services/purchase-package.service';
import { PackageContentDialogComponent } from './package-content-dialog.component';

const line: PurchaseLine = {
  id: 'pack',
  workspace_id: 'w',
  purchase_id: 'p',
  is_package: true,
  title_snapshot: 'Mystery Pack',
  line_kind: 'individual',
  ordered_quantity: 1,
  received_quantity: 1,
  unit_purchase_price: 100,
  line_total: 100,
};

function createDialog() {
  const capture = vi.fn(async (): Promise<MutationResult<InventoryItem[]>> => ({
    data: [],
    error: null,
    reportedBySyncStatus: false,
  }));
  const frage = vi.fn(async () => false);
  TestBed.configureTestingModule({
    providers: [
      { provide: PurchasePackageService, useValue: { capture } },
      { provide: ConfirmDialogService, useValue: { frage } },
      { provide: ElementRef, useValue: new ElementRef(document.createElement('div')) },
    ],
  });
  const dialog = TestBed.runInInjectionContext(() => new PackageContentDialogComponent());
  Object.assign(dialog, { line: signal(line) });
  const saved = vi.fn();
  const closed = vi.fn();
  dialog.saved.subscribe(saved);
  dialog.closed.subscribe(closed);
  return { dialog, capture, frage, saved, closed };
}

afterEach(() => TestBed.resetTestingModule());

describe('Paketinhalt erfassen', () => {
  it('verlangt eine Bezeichnung, aber keinen erfundenen Einkaufspreis', async () => {
    const { dialog, capture, saved } = createDialog();
    await dialog.save();
    expect(capture).not.toHaveBeenCalled();
    dialog.rows.at(0).controls.title.setValue(' Adidas Samba 42 ');
    await dialog.save();
    expect(capture).toHaveBeenCalledWith(
      'pack',
      [{ title: 'Adidas Samba 42', condition: 'used', description: null }],
      expect.any(String),
    );
    expect(saved).toHaveBeenCalledOnce();
  });

  it('behält Eingaben bei Fehlern und verwendet bei Wiederholung dieselbe Anfragekennung', async () => {
    const { dialog, capture, saved } = createDialog();
    dialog.rows.at(0).controls.title.setValue('Adidas');
    capture.mockResolvedValueOnce({
      data: null,
      error: new Error('Verbindung unterbrochen'),
      reportedBySyncStatus: true,
    });
    await dialog.save();
    expect(dialog.error()).toBe('Verbindung unterbrochen');
    expect(saved).not.toHaveBeenCalled();
    expect(dialog.rows.at(0).controls.title.value).toBe('Adidas');
    await dialog.save();
    expect(capture.mock.calls[0]).toEqual(capture.mock.calls[1]);
    expect(saved).toHaveBeenCalledOnce();
  });

  it('lässt einen zweiten Speichervorgang und Schließen während des Speicherns nicht zu', async () => {
    const { dialog, capture, closed } = createDialog();
    let finish!: (value: MutationResult<InventoryItem[]>) => void;
    capture.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    dialog.rows.at(0).controls.title.setValue('Adidas');
    const firstSave = dialog.save();
    await dialog.save();
    await dialog.close();
    expect(capture).toHaveBeenCalledOnce();
    expect(closed).not.toHaveBeenCalled();
    finish({ data: [], error: null, reportedBySyncStatus: false });
    await firstSave;
  });

  it('behält die Eingaben nach abgelehntem Verwerfen', async () => {
    const { dialog, frage, closed } = createDialog();
    dialog.rows.at(0).controls.title.setValue('Adidas');
    await dialog.close();
    expect(frage).toHaveBeenCalledOnce();
    expect(closed).not.toHaveBeenCalled();
    expect(dialog.rows.at(0).controls.title.value).toBe('Adidas');
  });
});
