import '@angular/compiler';
import { signal } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Purchase } from '../../../../core/models/flipbase.models';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { PurchaseDetailComponent } from './purchase-detail.component';

const einkauf: Purchase = {
  id: '33333333-3333-4333-8333-333333333333',
  workspace_id: '11111111-1111-4111-8111-111111111111',
  type: 'mystery_pack',
  title: 'Mystery Box',
  purchase_date: '2026-08-24',
  purchase_price: 31.98,
  shipping_cost: 0,
  source_id: null,
  supplier_id: null,
  cost_allocation_mode: 'even',
  created_at: '2026-08-24T10:00:00.000Z',
};

function erstelleKomponente(
  ergebnis: { data: null; error: Error | null } = {
    data: null,
    error: null,
  },
) {
  const toast = new ToastService();
  const addItemToPurchase = vi.fn(async () => ergebnis);
  const purchaseService = {
    selectedPurchase: signal<Purchase | null>(einkauf),
    addItemToPurchase,
    redistributeCosts: vi.fn(async () => ({ error: null as Error | null })),
    updateCostAllocationMode: vi.fn(async () => ({ error: null as Error | null })),
    updatePurchaseTracking: vi.fn(async () => ({
      data: einkauf as Purchase | null,
      error: null as Error | null,
    })),
    markPurchaseDeliveredAndSyncItems: vi.fn(async () => ({
      updatedCount: 1,
      error: null as Error | null,
    })),
  };
  const komponente = Object.create(PurchaseDetailComponent.prototype) as PurchaseDetailComponent;

  Object.assign(komponente, {
    purchaseService,
    itemForm: new FormGroup({
      title: new FormControl('Neuer Artikel', {
        nonNullable: true,
        validators: [Validators.required, Validators.minLength(2)],
      }),
      condition: new FormControl<'used'>('used', { nonNullable: true }),
      expected_value: new FormControl<number | null>(20),
    }),
    selectedImageFile: signal<File | null>(null),
    selectedImageDataUrl: signal<string | null>(null),
    isAddingItem: signal(true),
    isAllocatorOpen: signal(true),
    isApplyingAllocation: signal(false),
    allocatorMode: signal<'even' | 'value_weighted'>('even'),
    editableExpectedValues: signal<Record<string, number>>({ 'item-1': 20 }),
    isEditingTracking: signal(true),
    trackingNumberDraft: signal('00340434161094000001'),
    trackingCarrierDraft: signal<'dhl' | null>('dhl'),
    isMarkingDelivered: signal(false),
    mediaService: { uploadItemMedia: vi.fn() },
    logger: { warn: vi.fn() },
    toast,
    syncStatus: { fehler: signal([]) },
  });

  return {
    komponente,
    toast,
    addItemToPurchase,
    purchaseService,
  };
}

describe('PurchaseDetailComponent – Rückmeldung beim Artikelanlegen', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('behält Formular und Eingaben bei einem Speicherfehler geöffnet', async () => {
    const { komponente, toast } = erstelleKomponente({
      data: null,
      error: new Error('Speichern fehlgeschlagen'),
    });

    await komponente.onAddItem();

    expect(komponente.isAddingItem()).toBe(true);
    expect(komponente.itemForm.controls.title.value).toBe('Neuer Artikel');
    expect(toast.toasts()[0]).toMatchObject({
      type: 'error',
      title: 'Artikel konnte nicht gespeichert werden.',
      description: 'Speichern fehlgeschlagen',
      persistent: true,
    });
  });

  it('schließt das Formular erst nach erfolgreichem Anlegen und bestätigt die Aktion', async () => {
    const { komponente, toast } = erstelleKomponente({ data: null, error: null });

    await komponente.onAddItem();

    expect(komponente.isAddingItem()).toBe(false);
    expect(komponente.itemForm.controls.title.value).toBe('');
    expect(toast.toasts()[0]).toMatchObject({
      type: 'success',
      title: 'Artikel wurde angelegt.',
    });
  });

  it('schließt die Kostenverteilung erst nach Erfolg und bestätigt beide Verteilaktionen', async () => {
    const verteilen = erstelleKomponente();
    await verteilen.komponente.applyAllocations();
    expect(verteilen.komponente.isAllocatorOpen()).toBe(false);
    expect(verteilen.toast.toasts()[0].title).toBe('Kosten wurden verteilt.');

    const modus = erstelleKomponente();
    await modus.komponente.setAllocationMode('value_weighted');
    expect(modus.toast.toasts()[0].title).toBe('Verteilmethode wurde geändert.');
  });

  it('behält die Kostenverteilung bei einem zentral gemeldeten Fehler geöffnet', async () => {
    const { komponente, toast, purchaseService } = erstelleKomponente();
    const error = new Error('Kostenverteilung fehlgeschlagen: Keine Berechtigung.');
    purchaseService.redistributeCosts.mockResolvedValue({ error });
    Object.assign(komponente, {
      syncStatus: {
        fehler: signal([
          {
            id: 1,
            vorgang: 'Kostenverteilung',
            meldung: 'Keine Berechtigung.',
            zeitpunkt: '2026-08-24T10:00:00.000Z',
          },
        ]),
      },
    });

    await komponente.applyAllocations();

    expect(komponente.isApplyingAllocation()).toBe(false);
    expect(komponente.isAllocatorOpen()).toBe(true);
    expect(toast.toasts()).toEqual([]);
  });

  it('schließt die Tracking-Bearbeitung erst nach Erfolg', async () => {
    const erfolg = erstelleKomponente();
    await erfolg.komponente.saveTracking();
    expect(erfolg.komponente.isEditingTracking()).toBe(false);
    expect(erfolg.toast.toasts()[0].title).toBe('Sendungsverfolgung wurde gespeichert.');

    const fehler = erstelleKomponente();
    fehler.purchaseService.updatePurchaseTracking.mockResolvedValue({
      data: null,
      error: new Error('Einkauf nicht gefunden'),
    });
    await fehler.komponente.saveTracking();
    expect(fehler.komponente.isEditingTracking()).toBe(true);
    expect(fehler.toast.toasts()[0]).toMatchObject({
      type: 'error',
      title: 'Sendungsverfolgung konnte nicht gespeichert werden.',
      persistent: true,
    });
  });

  it('behält die Tracking-Bearbeitung bei einer geworfenen Ausnahme geöffnet', async () => {
    const { komponente, toast, purchaseService } = erstelleKomponente();
    purchaseService.updatePurchaseTracking.mockRejectedValue(new Error('Dienst nicht erreichbar'));

    await komponente.saveTracking();

    expect(komponente.isEditingTracking()).toBe(true);
    expect(toast.toasts()[0]).toMatchObject({
      type: 'error',
      title: 'Sendungsverfolgung konnte nicht gespeichert werden.',
      description: 'Dienst nicht erreichbar',
      persistent: true,
    });
  });

  it('bestätigt das Zustellen nur nach vollständig erfolgreichem Service-Aufruf', async () => {
    const erfolg = erstelleKomponente();
    await erfolg.komponente.markDeliveredAndSync();
    expect(erfolg.komponente.isMarkingDelivered()).toBe(false);
    expect(erfolg.toast.toasts()[0].title).toBe('Einkauf wurde als zugestellt markiert.');

    const fehler = erstelleKomponente();
    fehler.purchaseService.markPurchaseDeliveredAndSyncItems.mockResolvedValue({
      updatedCount: 0,
      error: new Error('Einkauf nicht gefunden'),
    });
    await fehler.komponente.markDeliveredAndSync();
    expect(fehler.toast.toasts()[0]).toMatchObject({
      type: 'error',
      title: 'Einkauf konnte nicht als zugestellt markiert werden.',
      persistent: true,
    });
  });
});
