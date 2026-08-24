import '@angular/compiler';
import { Injector, runInInjectionContext } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import { MediaService } from './media.service';
import { MockDataStoreService } from './mock-data-store.service';
import { SupabaseService } from './supabase.service';
import { SyncStatusService } from './sync-status.service';

function injiziereDienst(client: unknown) {
  const mockStore = new MockDataStoreService();
  mockStore.isDemoMode.set(false);
  const syncStatus = new SyncStatusService();
  const injector = Injector.create({
    providers: [
      { provide: SupabaseService, useValue: { client } },
      { provide: MockDataStoreService, useValue: mockStore },
      { provide: SyncStatusService, useValue: syncStatus },
    ],
  });

  return {
    dienst: runInInjectionContext(injector, () => new MediaService()),
    mockStore,
    syncStatus,
  };
}

describe('MediaService – bestätigte lokale Zustandsänderungen', () => {
  it('entfernt lokale Medien erst nach erfolgreichem Löschen im Backend', async () => {
    const client = {
      storage: {
        from: () => ({ remove: vi.fn(async () => ({ data: null, error: null })) }),
      },
      from: () => ({
        delete: () => ({
          eq: async () => ({ error: { code: '42501', message: 'denied' } }),
        }),
      }),
    };
    const { dienst, mockStore, syncStatus } = injiziereDienst(client);
    const lokalLoeschen = vi.spyOn(mockStore, 'deleteItemMedia');

    const ergebnis = await dienst.deleteMedia('artikel-1', 'medium-1', 'artikel/bild.jpg');

    expect(ergebnis.error).toBeInstanceOf(Error);
    expect(lokalLoeschen).not.toHaveBeenCalled();
    expect(syncStatus.fehler()).toHaveLength(1);
  });

  it('ändert das lokale Hauptbild nicht, wenn schon das Zurücksetzen fehlschlägt', async () => {
    const zweitesUpdate = vi.fn();
    const client = {
      from: () => ({
        update(payload: { is_primary: boolean }) {
          if (payload.is_primary) {
            zweitesUpdate();
            return { eq: async () => ({ error: null }) };
          }
          return {
            eq: async () => ({ error: { code: '42501', message: 'denied' } }),
          };
        },
      }),
    };
    const { dienst, mockStore, syncStatus } = injiziereDienst(client);
    const lokalFestlegen = vi.spyOn(mockStore, 'setItemMediaPrimary');

    const ergebnis = await dienst.setPrimary('artikel-1', 'medium-1');

    expect(ergebnis.error).toBeInstanceOf(Error);
    expect(zweitesUpdate).not.toHaveBeenCalled();
    expect(lokalFestlegen).not.toHaveBeenCalled();
    expect(syncStatus.fehler()).toHaveLength(1);
  });
});
