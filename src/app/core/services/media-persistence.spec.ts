import '@angular/compiler';
import { Injector, runInInjectionContext } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import { MediaService } from './media.service';
import { MockDataStoreService } from './mock-data-store.service';
import { SupabaseService } from './supabase.service';
import { SyncStatusService } from './sync-status.service';

const gespeichertesMedium = {
  id: '33333333-3333-4333-8333-333333333333',
  inventory_item_id: 'artikel-1',
  storage_path: 'artikel-1/bild.jpg',
  is_primary: true,
  file_name: 'bild.jpg',
  file_size: 4,
  mime_type: 'image/jpeg',
  created_at: '2026-08-24T10:01:00.000Z',
};

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

  it('behandelt ein nicht gefundenes Zielmedium beim Hauptbildwechsel als Fehler', async () => {
    const client = {
      from: () => ({
        update(payload: { is_primary: boolean }, optionen?: { count?: string }) {
          return {
            eq: async () => ({
              error: null,
              count: payload.is_primary && optionen?.count === 'exact' ? 0 : undefined,
            }),
          };
        },
      }),
    };
    const { dienst, mockStore, syncStatus } = injiziereDienst(client);
    const lokalFestlegen = vi.spyOn(mockStore, 'setItemMediaPrimary');

    const ergebnis = await dienst.setPrimary('artikel-1', 'medium-fehlt');

    expect(ergebnis.error).toBeInstanceOf(Error);
    expect(lokalFestlegen).not.toHaveBeenCalled();
    expect(syncStatus.fehler()).toHaveLength(1);
  });

  it('behandelt ein nicht gefundenes Medium beim Löschen als Fehler', async () => {
    const client = {
      storage: {
        from: () => ({ remove: async () => ({ data: null, error: null }) }),
      },
      from: () => ({
        delete: (optionen?: { count?: string }) => ({
          eq: async () => ({
            error: null,
            count: optionen?.count === 'exact' ? 0 : undefined,
          }),
        }),
      }),
    };
    const { dienst, mockStore, syncStatus } = injiziereDienst(client);
    const lokalLoeschen = vi.spyOn(mockStore, 'deleteItemMedia');

    const ergebnis = await dienst.deleteMedia('artikel-1', 'medium-fehlt', 'artikel-1/bild.jpg');

    expect(ergebnis.error).toBeInstanceOf(Error);
    expect(lokalLoeschen).not.toHaveBeenCalled();
    expect(syncStatus.fehler()).toHaveLength(1);
  });

  it('bricht einen primären Upload ab, wenn das bisherige Hauptbild nicht zurückgesetzt wird', async () => {
    const insert = vi.fn(() => ({
      select: () => ({ single: async () => ({ data: gespeichertesMedium, error: null }) }),
    }));
    const client = {
      storage: {
        from: () => ({ upload: async () => ({ data: null, error: null }) }),
      },
      from: () => ({
        update: () => ({
          eq: async () => ({ error: { code: '42501', message: 'denied' } }),
        }),
        insert,
      }),
    };
    const { dienst, syncStatus } = injiziereDienst(client);

    const ergebnis = await dienst.uploadItemMedia(
      'artikel-1',
      new File(['bild'], 'bild.jpg', { type: 'image/jpeg' }),
      true,
    );

    expect(ergebnis.error).toBeInstanceOf(Error);
    expect(insert).not.toHaveBeenCalled();
    expect(syncStatus.fehler()).toHaveLength(1);
  });
});
