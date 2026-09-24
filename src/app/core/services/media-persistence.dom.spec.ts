import '@angular/compiler';
import { Injector, runInInjectionContext } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import { MediaService } from './media.service';
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
  const syncStatus = new SyncStatusService();
  const injector = Injector.create({
    providers: [
      { provide: SupabaseService, useValue: { client } },
      { provide: SyncStatusService, useValue: syncStatus },
    ],
  });

  return {
    dienst: runInInjectionContext(injector, () => new MediaService()),
    syncStatus,
  };
}

function erstelleFilterQuery<T>(antwort: T, filter: [string, string][] = []) {
  const query = {
    eq(spalte: string, wert: string) {
      filter.push([spalte, wert]);
      return query;
    },
    maybeSingle: async () => antwort,
    then<TResult1 = T, TResult2 = never>(
      onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ): Promise<TResult1 | TResult2> {
      return Promise.resolve(antwort).then(onfulfilled, onrejected);
    },
  };
  return query;
}

describe('MediaService – bestätigte lokale Zustandsänderungen', () => {
  it('verwendet beim Cloud-Löschen nur den kanonischen Pfad und begrenzt Lesen und Löschen auf den Artikel', async () => {
    const leseFilter: [string, string][] = [];
    const loeschFilter: [string, string][] = [];
    const remove = vi.fn(async () => ({ data: null, error: null }));
    const leseQuery = erstelleFilterQuery(
      { data: { storage_path: 'artikel-1/kanonisch.jpg' }, error: null },
      leseFilter,
    );
    const loeschQuery = erstelleFilterQuery({ error: null, count: 1 }, loeschFilter);
    const client = {
      storage: { from: () => ({ remove }) },
      from: () => ({
        select: () => leseQuery,
        delete: () => loeschQuery,
      }),
    };
    const { dienst } = injiziereDienst(client);

    const ergebnis = await dienst.deleteMedia('artikel-1', 'medium-1');

    expect(ergebnis.error).toBeNull();
    expect(leseFilter).toEqual([
      ['id', 'medium-1'],
      ['inventory_item_id', 'artikel-1'],
    ]);
    expect(remove).toHaveBeenCalledWith(['artikel-1/kanonisch.jpg']);
    expect(loeschFilter).toEqual([
      ['id', 'medium-1'],
      ['inventory_item_id', 'artikel-1'],
    ]);
  });

  it('entfernt lokale Medien erst nach erfolgreichem Löschen im Backend', async () => {
    const leseQuery = erstelleFilterQuery({
      data: { storage_path: 'artikel-1/bild.jpg' },
      error: null,
    });
    const loeschQuery = erstelleFilterQuery({
      error: { code: '42501', message: 'denied' },
      count: null,
    });
    const client = {
      storage: {
        from: () => ({ remove: vi.fn(async () => ({ data: null, error: null })) }),
      },
      from: () => ({ select: () => leseQuery, delete: () => loeschQuery }),
    };
    const { dienst, syncStatus } = injiziereDienst(client);

    const ergebnis = await dienst.deleteMedia('artikel-1', 'medium-1');

    expect(ergebnis.error).toBeInstanceOf(Error);
    expect(syncStatus.fehler()).toHaveLength(1);
  });

  it('ändert das lokale Hauptbild nicht, wenn schon das Zurücksetzen fehlschlägt', async () => {
    const zweitesUpdate = vi.fn();
    const leseQuery = erstelleFilterQuery({ data: { id: 'medium-1' }, error: null });
    const client = {
      from: () => ({
        select: () => leseQuery,
        update(payload: { is_primary: boolean }) {
          if (payload.is_primary) {
            zweitesUpdate();
            return erstelleFilterQuery({ error: null, count: 1 });
          }
          return erstelleFilterQuery({ error: { code: '42501', message: 'denied' } });
        },
      }),
    };
    const { dienst, syncStatus } = injiziereDienst(client);

    const ergebnis = await dienst.setPrimary('artikel-1', 'medium-1');

    expect(ergebnis.error).toBeInstanceOf(Error);
    expect(zweitesUpdate).not.toHaveBeenCalled();
    expect(syncStatus.fehler()).toHaveLength(1);
  });

  it('behandelt ein nicht gefundenes Zielmedium beim Hauptbildwechsel als Fehler', async () => {
    const update = vi.fn();
    const client = {
      from: () => ({
        select: () => erstelleFilterQuery({ data: null, error: null }),
        update,
      }),
    };
    const { dienst, syncStatus } = injiziereDienst(client);

    const ergebnis = await dienst.setPrimary('artikel-1', 'medium-fehlt');

    expect(ergebnis.error).toBeInstanceOf(Error);
    expect(update).not.toHaveBeenCalled();
    expect(syncStatus.fehler()).toHaveLength(1);
  });

  it('behandelt ein nicht gefundenes Medium beim Löschen als Fehler', async () => {
    const remove = vi.fn(async () => ({ data: null, error: null }));
    const loeschen = vi.fn();
    const client = {
      storage: {
        from: () => ({ remove }),
      },
      from: () => ({
        select: () => erstelleFilterQuery({ data: null, error: null }),
        delete: loeschen,
      }),
    };
    const { dienst, syncStatus } = injiziereDienst(client);

    const ergebnis = await dienst.deleteMedia('artikel-1', 'medium-fehlt');

    expect(ergebnis.error).toBeInstanceOf(Error);
    expect(remove).not.toHaveBeenCalled();
    expect(loeschen).not.toHaveBeenCalled();
    expect(syncStatus.fehler()).toHaveLength(1);
  });

  it('begrenzt den Hauptbildwechsel beim Lesen und Schreiben auf den Artikel', async () => {
    const leseFilter: [string, string][] = [];
    const resetFilter: [string, string][] = [];
    const zielFilter: [string, string][] = [];
    const client = {
      from: () => ({
        select: () => erstelleFilterQuery({ data: { id: 'medium-1' }, error: null }, leseFilter),
        update(payload: { is_primary: boolean }) {
          return payload.is_primary
            ? erstelleFilterQuery({ error: null, count: 1 }, zielFilter)
            : erstelleFilterQuery({ error: null }, resetFilter);
        },
      }),
    };
    const { dienst } = injiziereDienst(client);

    const ergebnis = await dienst.setPrimary('artikel-1', 'medium-1');

    expect(ergebnis.error).toBeNull();
    expect(leseFilter).toEqual([
      ['id', 'medium-1'],
      ['inventory_item_id', 'artikel-1'],
    ]);
    expect(resetFilter).toEqual([['inventory_item_id', 'artikel-1']]);
    expect(zielFilter).toEqual([
      ['id', 'medium-1'],
      ['inventory_item_id', 'artikel-1'],
    ]);
  });

  it('bricht einen primären Upload ab, wenn das bisherige Hauptbild nicht zurückgesetzt wird', async () => {
    const insert = vi.fn(() => ({
      select: () => ({ single: async () => ({ data: gespeichertesMedium, error: null }) }),
    }));
    const remove = vi.fn(async () => ({ error: null }));
    const client = {
      storage: {
        from: () => ({ upload: async () => ({ data: null, error: null }), remove }),
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
    expect(remove).toHaveBeenCalledWith([expect.stringMatching(/^artikel-1\/.*bild\.jpg$/)]);
    expect(syncStatus.fehler()).toHaveLength(1);
  });

  it('entfernt einen Upload, wenn der Bildeintrag wegen einer gleichzeitigen Löschung scheitert', async () => {
    const remove = vi.fn(async () => ({ error: null }));
    const client = {
      storage: { from: () => ({ upload: async () => ({ error: null }), remove }) },
      from: () => ({
        insert: () => ({
          select: () => ({
            single: async () => ({
              data: null,
              error: { code: '23503', message: 'Artikel gelöscht' },
            }),
          }),
        }),
      }),
    };
    const { dienst } = injiziereDienst(client);
    const ergebnis = await dienst.uploadItemMedia(
      'artikel-1',
      new File(['bild'], 'bild.jpg', { type: 'image/jpeg' }),
    );
    expect(ergebnis.error?.message).toContain('verknüpfter Datensatz');
    expect(remove).toHaveBeenCalledWith([expect.stringMatching(/^artikel-1\/.*bild\.jpg$/)]);
  });
});

describe('MediaService – abrufbare Bildadressen für die Browser-Erweiterung', () => {
  it('signiert Speicherpfade und reicht vollständige Adressen unverändert durch', async () => {
    const createSignedUrls = vi.fn(async (paths: string[]) => ({
      data: paths.map((path) => ({ path, signedUrl: `https://signed.test/${path}`, error: null })),
      error: null,
    }));
    const { dienst } = injiziereDienst({ storage: { from: () => ({ createSignedUrls }) } });

    const urls = await dienst.resolveMediaUrls([
      'artikel-1/a.jpg',
      'https://cdn.test/b.jpg',
      'data:image/png;base64,AA==',
    ]);

    expect(urls).toEqual({
      'artikel-1/a.jpg': 'https://signed.test/artikel-1/a.jpg',
      'https://cdn.test/b.jpg': 'https://cdn.test/b.jpg',
      'data:image/png;base64,AA==': 'data:image/png;base64,AA==',
    });
    expect(createSignedUrls).toHaveBeenCalledWith(['artikel-1/a.jpg'], expect.any(Number));
  });

  it('lässt nicht signierbare Pfade weg, statt den rohen Speicherpfad zu liefern', async () => {
    const createSignedUrls = vi.fn(async () => ({
      data: [{ path: 'artikel-1/fehlt.jpg', signedUrl: '', error: 'Object not found' }],
      error: null,
    }));
    const { dienst } = injiziereDienst({ storage: { from: () => ({ createSignedUrls }) } });

    const urls = await dienst.resolveMediaUrls(['artikel-1/fehlt.jpg']);

    expect(urls).toEqual({});
  });

  it('liefert bei einem Speicherfehler eine leere Zuordnung', async () => {
    const createSignedUrls = vi.fn(async () => ({
      data: null,
      error: new Error('offline'),
    }));
    const { dienst } = injiziereDienst({ storage: { from: () => ({ createSignedUrls }) } });

    await expect(dienst.resolveMediaUrls(['artikel-1/a.jpg'])).resolves.toEqual({});
  });
});
