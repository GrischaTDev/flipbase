import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SupabaseService } from '../../../core/services/supabase.service';
import { VintedCategoryService } from './vinted-category.service';

function clientStub(overrides: Record<string, unknown>) {
  return { client: overrides } as unknown as SupabaseService;
}

describe('VintedCategoryService', () => {
  let service: VintedCategoryService;

  const configure = (supabase: SupabaseService): void => {
    TestBed.configureTestingModule({
      providers: [VintedCategoryService, { provide: SupabaseService, useValue: supabase }],
    });
    service = TestBed.inject(VintedCategoryService);
  };

  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  /**
   * Baut die Kette from().select().eq().order().order().range() nach.
   * `range` ist der abschliessende, wartbare Aufruf und liefert der Reihe nach
   * die uebergebenen Seiten.
   */
  function pagedClient(pages: readonly Record<string, unknown>[][]) {
    const range = vi.fn(async (_from: number, _to: number) => ({
      data: pages[range.mock.calls.length - 1] ?? [],
      error: null,
    }));
    const orderById = vi.fn(() => ({ range }));
    const orderByPath = vi.fn(() => ({ order: orderById }));
    const eq = vi.fn(() => ({ order: orderByPath }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));

    return { from, select, eq, orderByPath, orderById, range };
  }

  function leaf(id: number, path: string): Record<string, unknown> {
    return { id, parent_id: 16, title: path.split(' > ').at(-1), path };
  }

  it('liefert nur Blattkategorien, nach Pfad sortiert', async () => {
    const chain = pagedClient([[leaf(1049, 'Damen > Schuhe > Stiefel')], []]);
    configure(clientStub({ from: chain.from }));

    const categories = await service.listLeaves();

    expect(chain.from).toHaveBeenCalledWith('vinted_categories');
    expect(chain.eq).toHaveBeenCalledWith('is_leaf', true);
    expect(chain.orderByPath).toHaveBeenCalledWith('path', { ascending: true });
    // `path` ist nicht eindeutig. Ohne einen eindeutigen zweiten Schluessel
    // darf die Datenbank gleich benannte Zeilen zwischen zwei Seiten
    // unterschiedlich anordnen - dann taucht eine doppelt auf und eine fehlt.
    expect(chain.orderById).toHaveBeenCalledWith('id', { ascending: true });
    expect(categories).toEqual([
      { id: 1049, parentId: 16, title: 'Stiefel', path: 'Damen > Schuhe > Stiefel' },
    ]);
  });

  // PostgREST kuerzt jede Antwort auf max_rows (1000) - ohne Fehler. Bei rund
  // 2500 Blattkategorien fehlte dem Waehler stillschweigend mehr als die
  // Haelfte des Baums. Dieser Test liefert bewusst mehr als eine Seite: Ohne
  // die Blaetterschleife bliebe es bei der ersten Anfrage, und die Eintraege
  // der zweiten Seite fehlten im Ergebnis.
  it('holt alle Seiten und nicht nur die erste', async () => {
    const chain = pagedClient([
      [leaf(1, 'A > Eins'), leaf(2, 'A > Zwei')],
      [leaf(3, 'B > Drei')],
      [],
    ]);
    configure(clientStub({ from: chain.from }));

    const categories = await service.listLeaves();

    expect(categories.map((category) => category.id)).toEqual([1, 2, 3]);

    // Der Versatz waechst um die tatsaechlich gelieferte Zeilenzahl, und
    // abgebrochen wird erst bei der leeren Seite - nicht schon bei einer
    // Seite, die kleiner ausfaellt als angefragt.
    expect(chain.range.mock.calls).toEqual([
      [0, 999],
      [2, 1001],
      [3, 1002],
    ]);
  });

  it('meldet einen Datenbankfehler als Fehler weiter', async () => {
    const chain = pagedClient([]);
    chain.range.mockResolvedValue({ data: null, error: { message: 'keine Rechte' } });
    configure(clientStub({ from: chain.from }));

    await expect(service.listLeaves()).rejects.toThrow('keine Rechte');
  });

  // Ein Fehler auf einer spaeteren Seite darf nicht in einer halben Liste
  // enden: Eine stillschweigend unvollstaendige Liste ist genau der Befund,
  // den das Blaettern behebt.
  it('bricht ab, wenn eine spaetere Seite scheitert', async () => {
    const chain = pagedClient([]);
    chain.range
      .mockResolvedValueOnce({ data: [leaf(1, 'A > Eins')], error: null })
      .mockResolvedValueOnce({ data: null, error: { message: 'Zeitueberschreitung' } });
    configure(clientStub({ from: chain.from }));

    await expect(service.listLeaves()).rejects.toThrow('Zeitueberschreitung');
    expect(chain.range).toHaveBeenCalledTimes(2);
  });

  it('liest den Auffrischungsstand', async () => {
    const single = vi.fn(async () => ({
      data: {
        refreshed_at: '2026-09-06T12:00:00+00:00',
        requested_at: null,
        last_attempt_at: '2026-09-06T12:00:00+00:00',
        category_count: 2920,
        last_error: null,
      },
      error: null,
    }));
    const eq = vi.fn(() => ({ single }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));
    configure(clientStub({ from }));

    const status = await service.readStatus();

    // Nicht nur die Umwandlung pruefen: Ohne diese drei Zusicherungen bliebe
    // der Test auch dann gruen, wenn die falsche Tabelle abgefragt, eine
    // Spalte vergessen oder der Filter auf die einzige Zeile weggelassen
    // wuerde - die Attrappe antwortet ja unabhaengig davon.
    expect(from).toHaveBeenCalledWith('vinted_category_syncs');
    expect(select).toHaveBeenCalledWith(
      'refreshed_at, requested_at, last_attempt_at, category_count, last_error',
    );
    expect(eq).toHaveBeenCalledWith('id', 1);

    expect(status.categoryCount).toBe(2920);
    expect(status.refreshedAt).toBe('2026-09-06T12:00:00+00:00');
    expect(status.lastError).toBeNull();
  });

  it('fordert eine Auffrischung an, indem es nur requested_at setzt', async () => {
    const eq = vi.fn(async () => ({ error: null }));
    const update = vi.fn((_payload: Record<string, unknown>) => ({ eq }));
    const from = vi.fn(() => ({ update }));
    configure(clientStub({ from }));

    await service.requestRefresh();

    expect(from).toHaveBeenCalledWith('vinted_category_syncs');
    // Genau ein Feld: Auf allen anderen Spalten hat ein angemeldetes Konto
    // kein Schreibrecht, die Datenbank wuerde den Aufruf ablehnen.
    expect(Object.keys(update.mock.calls[0][0])).toEqual(['requested_at']);
    expect(eq).toHaveBeenCalledWith('id', 1);
  });

  it('meldet einen abgelehnten Auffrischungswunsch als Fehler weiter', async () => {
    const eq = vi.fn(async () => ({ error: { message: 'keine Rechte' } }));
    configure(clientStub({ from: vi.fn(() => ({ update: vi.fn(() => ({ eq })) })) }));

    await expect(service.requestRefresh()).rejects.toThrow('keine Rechte');
  });
});
