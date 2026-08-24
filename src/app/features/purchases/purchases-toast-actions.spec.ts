import '@angular/compiler';
import { signal } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastService } from '../../shared/components/toast/toast.service';
import { PurchasesComponent } from './purchases.component';

function erstelleKomponente() {
  const toast = new ToastService();
  const offlineSyncService = {
    cashWallet: signal({ locationName: 'Flohmarkt', startCash: 100 }),
    recordRapidPurchase: vi.fn(() => ({
      title: 'Konsole',
      purchase_price: 20,
    })),
    startCashSession: vi.fn(),
    syncToCloud: vi.fn(async (): Promise<{ syncedCount: number; error: Error | null }> => ({
      syncedCount: 1,
      error: null,
    })),
    deletePendingEntry: vi.fn(),
  };
  const komponente = Object.create(PurchasesComponent.prototype) as PurchasesComponent;

  Object.assign(komponente, {
    toast,
    offlineSyncService,
    isEditingWallet: signal(true),
    rapidForm: new FormGroup({
      title: new FormControl('Konsole', {
        nonNullable: true,
        validators: [Validators.required],
      }),
      purchasePrice: new FormControl(20, {
        nonNullable: true,
        validators: [Validators.required, Validators.min(0.5)],
      }),
      estimatedResalePrice: new FormControl(45, {
        nonNullable: true,
        validators: [Validators.required, Validators.min(1)],
      }),
      locationName: new FormControl('Flohmarkt', { nonNullable: true }),
      condition: new FormControl('Gebraucht', { nonNullable: true }),
      notes: new FormControl('Fund', { nonNullable: true }),
    }),
    walletConfigForm: new FormGroup({
      startCash: new FormControl(150, { nonNullable: true }),
      locationName: new FormControl('Flohmarkt', { nonNullable: true }),
    }),
  });

  return { komponente, toast, offlineSyncService };
}

describe('PurchasesComponent – Offline-Aktionsmeldungen', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('ersetzt das lokale Schnellerfassungs-Signal durch einen Erfolgstoast', () => {
    const { komponente, toast } = erstelleKomponente();

    komponente.onSubmitRapidPurchase();

    expect(komponente.rapidForm.controls.title.value).toBe('');
    expect(toast.toasts()[0]).toMatchObject({
      type: 'success',
      title: 'Einkauf wurde lokal vorgemerkt.',
    });
  });

  it('behält die Schnellerfassung bei einem synchronen Fehler unverändert', () => {
    const { komponente, toast, offlineSyncService } = erstelleKomponente();
    offlineSyncService.recordRapidPurchase.mockImplementation(() => {
      throw new Error('Lokaler Speicher ist nicht verfügbar');
    });

    komponente.onSubmitRapidPurchase();

    expect(komponente.rapidForm.controls.title.value).toBe('Konsole');
    expect(toast.toasts()[0]).toMatchObject({
      type: 'error',
      title: 'Einkauf konnte nicht lokal vorgemerkt werden.',
      persistent: true,
    });
  });

  it('bestätigt Wallet-Konfiguration, Sync und Entfernen eines vorgemerkten Einkaufs', async () => {
    const wallet = erstelleKomponente();
    wallet.komponente.onSaveWalletConfig();
    expect(wallet.komponente.isEditingWallet()).toBe(false);
    expect(wallet.toast.toasts()[0].title).toBe('Wallet-Konfiguration wurde gespeichert.');

    const sync = erstelleKomponente();
    await sync.komponente.onSyncNow();
    expect(sync.toast.toasts()[0].title).toBe('Offline-Daten wurden synchronisiert.');

    const loeschen = erstelleKomponente();
    loeschen.komponente.onDeletePending('pending-1');
    expect(loeschen.toast.toasts()[0].title).toBe('Vorgemerkter Einkauf wurde entfernt.');
  });

  it('meldet geworfene Offline-Fehler persistent und verändert den lokalen Dialogzustand nicht', async () => {
    const wallet = erstelleKomponente();
    wallet.offlineSyncService.startCashSession.mockImplementation(() => {
      throw new Error('Speichern fehlgeschlagen');
    });
    wallet.komponente.onSaveWalletConfig();
    expect(wallet.komponente.isEditingWallet()).toBe(true);
    expect(wallet.toast.toasts()[0]).toMatchObject({
      type: 'error',
      title: 'Wallet-Konfiguration konnte nicht gespeichert werden.',
      persistent: true,
    });

    const sync = erstelleKomponente();
    sync.offlineSyncService.syncToCloud.mockRejectedValue(new Error('Sync fehlgeschlagen'));
    await sync.komponente.onSyncNow();
    expect(sync.toast.toasts()[0]).toMatchObject({
      type: 'error',
      title: 'Offline-Daten konnten nicht synchronisiert werden.',
      persistent: true,
    });
  });

  it('meldet nach einem aufgelösten Sync-Fehler keinen falschen Erfolg', async () => {
    const sync = erstelleKomponente();
    sync.offlineSyncService.syncToCloud.mockResolvedValue({
      syncedCount: 0,
      error: new Error('Speichern des Einkaufs fehlgeschlagen'),
    });

    await sync.komponente.onSyncNow();

    expect(sync.toast.toasts()).toEqual([]);
  });
});
