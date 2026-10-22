import '@angular/compiler';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { SupabaseService } from '../../../core/services/supabase.service';
import { MarketplaceApiService } from './marketplace-api.service';

const scope = {
  workspaceId: '48000000-0000-4000-8000-000000000011',
  connectionId: '48000000-0000-4000-8000-000000000021',
};
describe('Vollständige Vinted-Listenquelle der Übersicht', () => {
  afterEach(() => TestBed.resetTestingModule());
  function service(size: number) {
    const filters: { head: boolean; values: [string, string][] }[] = [];
    const rows = Array.from({ length: size }, (_, index) => ({
      id: '48000000-0000-4000-8000-' + String(index + 100).padStart(12, '0'),
      external_id: String(index + 1),
      sort_at: '2026-10-15T10:00:00Z',
      body: {
        title: 'Jacke',
        price: 12.34,
        currency: 'EUR',
        isClosed: false,
        isReserved: index === 0,
        publicationState: index === 0 ? 'reserved' : 'active',
        occurredAt: null,
        publicationAge: { value: 2, unit: 'day', observedAt: '2026-10-15T10:00:00Z' },
      },
    }));
    const from = () => {
      const log = { head: false, values: [] as [string, string][] };
      filters.push(log);
      const query = {
        select: (_columns: string, options?: { head?: boolean }) => {
          log.head = options?.head === true;
          return query;
        },
        eq: (key: string, value: string) => {
          log.values.push([key, value]);
          return query;
        },
        ilike: (key: string, value: string) => {
          log.values.push([key, value]);
          return query;
        },
        order: () => query,
        limit: (limit: number) => {
          log.values.push(['limit', String(limit)]);
          return query;
        },
        or: () => query,
        then: (
          resolve: (value: { data: typeof rows | null; count: number; error: null }) => unknown,
          reject?: (error: unknown) => unknown,
        ) =>
          Promise.resolve({ data: log.head ? null : rows, count: 123, error: null }).then(
            resolve,
            reject,
          ),
      };
      return query;
    };
    TestBed.configureTestingModule({
      providers: [
        MarketplaceApiService,
        { provide: SupabaseService, useValue: { client: { from } } },
      ],
    });
    return { api: TestBed.inject(MarketplaceApiService), filters };
  }
  it('liefert externe IDs, Reservierungsstatus und die Gesamtzahl der gesamten Quelle', async () => {
    const { api, filters } = service(2);
    const page = await api.readOverviewPublications(scope, {
      state: 'all',
      search: '_%',
      limit: 25,
    });
    expect(page.total).toBe(123);
    expect(page.items[0].reference.externalId).toBe('1');
    expect(page.items[0].state).toBe('reserved');
    expect(page.items[0].publishedAt).toBeNull();
    expect(page.items[0].publicationAge).toEqual({
      value: 2,
      unit: 'day',
      observedAt: '2026-10-15T10:00:00Z',
    });
    for (const query of filters)
      expect(query.values).toContainEqual(['workspace_id', scope.workspaceId]);
    expect(
      filters.every((query) =>
        query.values.some(([key, value]) => key === 'body->>title' && value === '%\\_\\%%'),
      ),
    ).toBe(true);
  });
  it('erkennt das Ende einer genau vollen Seite ohne eine zusätzliche leere Seite', async () => {
    const { api, filters } = service(25);
    const page = await api.readOverviewPublications(scope, { state: 'all', search: '', limit: 25 });
    expect(page.nextCursor).toBeNull();
    expect(filters.find((query) => !query.head)?.values).toContainEqual(['limit', '26']);
  });
  it.each(['active', 'reserved', 'draft', 'hidden', 'ended', 'unknown'] as const)(
    'filtert Seite und Gesamtzahl gemeinsam nach dem belegten Veröffentlichungsstatus %s',
    async (state) => {
      const { api, filters } = service(0);
      await api.readOverviewPublications(scope, { state, search: '', limit: 25 });
      expect(filters).toHaveLength(2);
      for (const query of filters) {
        expect(query.values).toContainEqual(['body->>publicationState', state]);
        expect(
          query.values.some(
            ([field]) => field === 'body->>isClosed' || field === 'body->>isReserved',
          ),
        ).toBe(false);
        expect(query.values).toContainEqual(['workspace_id', scope.workspaceId]);
        expect(query.values).toContainEqual(['connection_id', scope.connectionId]);
      }
    },
  );
  it('nutzt den zusätzlichen Eintrag nur zur Erkennung einer Folgeseite', async () => {
    const { api } = service(26);
    const page = await api.readOverviewPublications(scope, { state: 'all', search: '', limit: 25 });
    expect(page.items).toHaveLength(25);
    expect(page.nextCursor).not.toBeNull();
  });
  it('unterstützt erlaubte Seiten bis zu 100 Einträgen ohne eine Teilmenge zu verwerfen', async () => {
    const { api } = service(70);
    const page = await api.readOverviewPublications(scope, {
      state: 'all',
      search: '',
      limit: 100,
    });
    expect(page.items).toHaveLength(70);
    expect(page.total).toBe(123);
  });
});
