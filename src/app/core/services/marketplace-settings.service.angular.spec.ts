import '@angular/compiler';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MarketplaceSettingsService } from './marketplace-settings.service';
import { SupabaseService } from './supabase.service';

const enabled = { vinted: true, ebay: true, kleinanzeigen: true };
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => (resolve = done));
  return { promise, resolve };
}
function database() {
  const rows = new Map<string, typeof enabled>();
  const reads: Promise<{ data: typeof enabled | null; error: { message: string } | null }>[] = [];
  let saveError: { message: string } | null = null;
  const upsert = vi.fn(
    async (
      value: typeof enabled & { user_id: string; workspace_id: string },
      options?: { ignoreDuplicates?: boolean },
    ) => {
      if (saveError) return { error: saveError };
      const key = value.user_id + ':' + value.workspace_id;
      if (!options?.ignoreDuplicates || !rows.has(key))
        rows.set(key, {
          vinted: value.vinted,
          ebay: value.ebay,
          kleinanzeigen: value.kleinanzeigen,
        });
      return { error: null };
    },
  );
  let activeUser = '';
  const from = vi.fn(() => {
    const filters: Record<string, string> = {};
    const query = {
      select: () => query,
      eq: (key: string, value: string) => {
        filters[key] = value;
        if (key === 'user_id') activeUser = value;
        return query;
      },
      maybeSingle: () =>
        reads.shift() ??
        Promise.resolve({
          data: rows.get(filters['user_id'] + ':' + filters['workspace_id']) ?? null,
          error: null,
        }),
      upsert,
    };
    return query;
  });
  const rpc = vi.fn(
    async (
      _name: string,
      input: {
        p_workspace_id: string;
        p_vinted: boolean;
        p_ebay: boolean;
        p_kleinanzeigen: boolean;
        p_only_if_absent: boolean;
      },
    ) => {
      const userId = activeUser;
      const result = await upsert(
        {
          user_id: userId,
          workspace_id: input.p_workspace_id,
          vinted: input.p_vinted,
          ebay: input.p_ebay,
          kleinanzeigen: input.p_kleinanzeigen,
        },
        { ignoreDuplicates: input.p_only_if_absent },
      );
      return { ...result, data: rows.get(userId + ':' + input.p_workspace_id) ?? null };
    },
  );
  return {
    rows,
    reads,
    from,
    rpc,
    upsert,
    failSave: () => {
      saveError = { message: 'offline' };
    },
  };
}

describe('Persönliche Marktplatzauswahl', () => {
  let db: ReturnType<typeof database>;
  beforeEach(() => {
    db = database();
    TestBed.configureTestingModule({
      providers: [
        MarketplaceSettingsService,
        { provide: SupabaseService, useValue: { client: { from: db.from, rpc: db.rpc } } },
      ],
    });
  });
  afterEach(() => TestBed.resetTestingModule());

  it('lädt nach einem Abruffehler denselben persönlichen Kontext erneut', async () => {
    db.reads.push(Promise.resolve({ data: null, error: { message: 'offline' } }));
    const service = TestBed.inject(MarketplaceSettingsService);
    await service.load('user-a', 'workspace-a');
    expect(service.error()).not.toBeNull();
    expect(service.ready()).toBe(false);
    db.rows.set('user-a:workspace-a', { ...enabled, ebay: false });
    await service.retryLoad();
    expect(service.ready()).toBe(true);
    expect(service.error()).toBeNull();
    expect(service.settings().ebay).toBe(false);
  });

  it('übernimmt Serverwerte statt fremder Browserwerte', async () => {
    localStorage.setItem(
      'flipbase_marketplace_settings',
      JSON.stringify({ ...enabled, ebay: false }),
    );
    db.rows.set('user-a:workspace-a', { ...enabled, vinted: false });
    const service = TestBed.inject(MarketplaceSettingsService);
    await service.load('user-a', 'workspace-a');
    expect(service.settings()).toEqual({ ...enabled, vinted: false });
    expect(service.ready()).toBe(true);
  });

  it('übernimmt alte Browserwerte einmal und hält Nutzer sowie Workspaces getrennt', async () => {
    localStorage.setItem(
      'flipbase_marketplace_settings',
      JSON.stringify({ ...enabled, ebay: false }),
    );
    const service = TestBed.inject(MarketplaceSettingsService);
    await service.load('user-a', 'workspace-a');
    expect(service.isEbayEnabled()).toBe(false);
    await service.load('user-b', 'workspace-a');
    expect(service.settings()).toEqual(enabled);
    await service.load('user-a', 'workspace-b');
    expect(service.settings()).toEqual(enabled);
    await service.load('user-a', 'workspace-a');
    expect(service.isEbayEnabled()).toBe(false);
  });

  it('verwirft verspätete Antworten nach einem Kontextwechsel', async () => {
    const old = deferred<{ data: typeof enabled | null; error: null }>();
    db.reads.push(old.promise);
    const service = TestBed.inject(MarketplaceSettingsService);
    const request = service.load('user-a', 'workspace-a');
    await service.load('user-b', 'workspace-b');
    old.resolve({ data: { ...enabled, kleinanzeigen: false }, error: null });
    await request;
    expect(service.settings()).toEqual(enabled);
  });

  it('stellt bei fehlgeschlagenem Speichern den bestätigten Zustand wieder her', async () => {
    const service = TestBed.inject(MarketplaceSettingsService);
    await service.load('user-a', 'workspace-a');
    db.failSave();
    await service.setMarketplaceEnabled('vinted', false);
    expect(service.isVintedEnabled()).toBe(true);
    expect(service.error()).toBeTruthy();
    expect(service.saving()).toBe(false);
  });

  it('leert den Kontobezug beim Abmelden und schreibt ohne Kontext nichts', async () => {
    const service = TestBed.inject(MarketplaceSettingsService);
    db.rows.set('user-a:workspace-a', { ...enabled, vinted: false });
    await service.load('user-a', 'workspace-a');
    service.reset();
    await service.setMarketplaceEnabled('ebay', false);
    expect(service.settings()).toEqual(enabled);
    expect(service.ready()).toBe(false);
    expect(db.upsert).not.toHaveBeenCalled();
  });

  it('zeigt einen Ladefehler statt alte Werte als gespeichert auszugeben', async () => {
    db.reads.push(Promise.resolve({ data: null, error: { message: 'offline' } }));
    const service = TestBed.inject(MarketplaceSettingsService);
    await service.load('user-a', 'workspace-a');
    expect(service.ready()).toBe(false);
    expect(service.error()).toBeTruthy();
    expect(db.upsert).not.toHaveBeenCalled();
  });
});
