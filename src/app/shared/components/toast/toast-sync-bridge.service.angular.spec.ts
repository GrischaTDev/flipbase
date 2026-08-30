import '@angular/compiler';
import { TestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SyncStatusService } from '../../../core/services/sync-status.service';
import { ToastService } from './toast.service';
import { ToastSyncBridgeService } from './toast-sync-bridge.service';

beforeAll(() => {
  TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
});

afterAll(() => {
  TestBed.resetTestEnvironment();
});

describe('ToastSyncBridgeService', () => {
  let syncStatus: SyncStatusService;
  let toast: ToastService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [SyncStatusService, ToastService, ToastSyncBridgeService],
    });
    syncStatus = TestBed.inject(SyncStatusService);
    toast = TestBed.inject(ToastService);
    TestBed.inject(ToastSyncBridgeService);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('überführt einen Sync-Fehler genau einmal und verwirft ihn beim Schließen', () => {
    syncStatus.melde('Löschen des Lieferanten', {
      code: '23503',
      message: 'foreign key violation',
    });
    TestBed.flushEffects();
    TestBed.flushEffects();

    expect(toast.toasts()).toHaveLength(1);
    expect(toast.toasts()[0]).toMatchObject({
      type: 'error',
      title: 'Löschen des Lieferanten fehlgeschlagen.',
      description: 'Ein verknüpfter Datensatz fehlt oder wurde gelöscht.',
      persistent: true,
    });

    toast.dismiss(toast.toasts()[0].id);
    TestBed.flushEffects();
    expect(syncStatus.fehler()).toEqual([]);
  });

  it('schließt den zugehörigen Toast, wenn der Sync-Fehler anderweitig verworfen wird', () => {
    syncStatus.melde('Speichern des Einkaufs', { message: 'Zeitüberschreitung' });
    TestBed.flushEffects();
    const syncId = syncStatus.fehler()[0].id;

    syncStatus.verwerfen(syncId);
    TestBed.flushEffects();

    expect(toast.toasts()).toEqual([]);
  });

  it('spiegelt auch mehr als 20 offene Sync-Fehler jeweils genau einmal', () => {
    for (let nummer = 1; nummer <= 21; nummer++) {
      syncStatus.melde(`Vorgang ${nummer}`, { message: `Fehler ${nummer}` });
    }
    TestBed.flushEffects();
    TestBed.flushEffects();

    const titel = toast.toasts().map((eintrag) => eintrag.title);
    expect(syncStatus.fehler()).toHaveLength(21);
    expect(titel).toHaveLength(21);
    expect(new Set(titel).size).toBe(21);
    expect(titel.filter((eintrag) => eintrag === 'Vorgang 1 fehlgeschlagen.')).toHaveLength(1);
    expect(titel.filter((eintrag) => eintrag === 'Vorgang 21 fehlgeschlagen.')).toHaveLength(1);
  });
});
