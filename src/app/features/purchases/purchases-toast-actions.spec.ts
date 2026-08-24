import '@angular/compiler';
import { signal } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastService } from '../../shared/components/toast/toast.service';
import { PurchasesComponent } from './purchases.component';

interface OfflineProblem {
  readonly kind: 'additional_costs' | 'inventory_item' | 'activity_log';
  readonly error: Error;
  readonly reportedBySyncStatus: boolean;
}

interface OfflineAntwort {
  readonly syncedCount: number;
  readonly error: Error | null;
  readonly reportedBySyncStatus: boolean;
  readonly problems: readonly OfflineProblem[];
}

function erstelleKomponente() {
  const toast = new ToastService();
  const offlineSyncService = {
    cashWallet: signal({ locationName: 'Flohmarkt', startCash: 100 }),
    recordRapidPurchase: vi.fn(() => ({
      title: 'Konsole',
      purchase_price: 20,
    })),
    startCashSession: vi.fn(),
    syncToCloud: vi.fn(async (): Promise<OfflineAntwort> => ({
      syncedCount: 1,
      error: null,
      reportedBySyncStatus: false,
      problems: [],
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

  it('meldet einen aufgelösten Sync-Fehler ohne SyncStatus persistent', async () => {
    const sync = erstelleKomponente();
    sync.offlineSyncService.syncToCloud.mockResolvedValue({
      syncedCount: 0,
      error: new Error('Speichern des Einkaufs fehlgeschlagen'),
      reportedBySyncStatus: false,
      problems: [],
    });

    await sync.komponente.onSyncNow();

    expect(sync.toast.toasts()[0]).toMatchObject({
      type: 'error',
      title: 'Offline-Daten konnten nicht synchronisiert werden.',
      description: 'Speichern des Einkaufs fehlgeschlagen',
      persistent: true,
    });
  });

  it('dedupliziert einen aufgelösten, bereits zentral gemeldeten Sync-Fehler', async () => {
    const sync = erstelleKomponente();
    sync.offlineSyncService.syncToCloud.mockResolvedValue({
      syncedCount: 0,
      error: new Error('Speichern des Einkaufs fehlgeschlagen'),
      reportedBySyncStatus: true,
      problems: [],
    });

    await sync.komponente.onSyncNow();

    expect(sync.toast.toasts()).toEqual([]);
  });

  it('meldet verarbeitete Offline-Einkäufe mit Teilproblemen als Warnung', async () => {
    const sync = erstelleKomponente();
    sync.offlineSyncService.syncToCloud.mockResolvedValue({
      syncedCount: 1,
      error: null,
      reportedBySyncStatus: false,
      problems: [
        {
          kind: 'activity_log',
          error: new Error('Aktivitätsprotokoll unvollständig'),
          reportedBySyncStatus: false,
        },
      ],
    });

    await sync.komponente.onSyncNow();

    expect(sync.toast.toasts()[0]).toMatchObject({
      type: 'warning',
      title: 'Offline-Daten wurden mit Einschränkungen synchronisiert.',
      description: expect.stringContaining('Aktivitätsprotokoll'),
    });
  });

  it('dedupliziert zentral gemeldete Teilprobleme beim Offline-Sync', async () => {
    const sync = erstelleKomponente();
    sync.offlineSyncService.syncToCloud.mockResolvedValue({
      syncedCount: 1,
      error: null,
      reportedBySyncStatus: true,
      problems: [
        {
          kind: 'activity_log',
          error: new Error('Aktivitätsprotokoll unvollständig'),
          reportedBySyncStatus: true,
        },
      ],
    });

    await sync.komponente.onSyncNow();

    expect(sync.toast.toasts()).toEqual([]);
  });
});
