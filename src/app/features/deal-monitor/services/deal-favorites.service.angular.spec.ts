import '@angular/compiler';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../../core/services/auth.service';
import { SupabaseService } from '../../../core/services/supabase.service';
import { WorkspaceService } from '../../../core/services/workspace.service';
import { FeedItem } from '../models/deal-monitor.model';
import { DealFavoritesService } from './deal-favorites.service';

const item = (id = '101'): FeedItem => ({
  id: `94000000-0000-4000-8000-${id.padStart(12, '0')}`,
  title: `Vintage Nike ${id}`,
  url: `https://www.vinted.de/items/${id}-jacke`,
  image_urls: [],
  item_price: 20,
  total_price: 22,
  currency: 'EUR',
  brand: 'Nike',
  size: 'L',
  condition: 'Gut',
  is_hidden: false,
  first_seen_at: '2026-01-01T12:00:00Z',
  catalog_id: null,
  category_path: null,
  reference_price: null,
  reference_scope: null,
  discount_percent: null,
  watchlist_title: null,
});
const settle = async () => {
  TestBed.flushEffects();
  for (let i = 0; i < 12; i++) await Promise.resolve();
};

describe('Persönliche Account-Favoriten', () => {
  const user = signal<{ id: string } | null>({ id: 'user-a' });
  const workspace = signal<{ id: string } | null>({ id: 'workspace-a' });
  let remote: FeedItem[];
  let rpc: ReturnType<typeof vi.fn>;
  let service: DealFavoritesService;
  beforeEach(() => {
    TestBed.resetTestingModule();
    localStorage.clear();
    remote = [];
    user.set({ id: 'user-a' });
    workspace.set({ id: 'workspace-a' });
    rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
      if (name === 'sniper_favorites_page')
        return { data: { items: [...remote], next_cursor: null }, error: null };
      if (name === 'save_sniper_favorite') remote.push(args['p_item'] as FeedItem);
      if (name === 'remove_sniper_favorite')
        remote = remote.filter((row) => !row.url.includes(`/items/${args['p_external_id']}-`));
      if (name === 'clear_sniper_favorites') remote = [];
      if (name === 'import_sniper_favorites') {
        remote.push(...(args['p_items'] as FeedItem[]));
        return { data: 1, error: null };
      }
      return { data: true, error: null };
    });
    TestBed.configureTestingModule({
      providers: [
        DealFavoritesService,
        { provide: AuthService, useValue: { currentUser: user } },
        { provide: WorkspaceService, useValue: { currentWorkspace: workspace } },
        { provide: SupabaseService, useValue: { client: { rpc } } },
      ],
    });
    service = TestBed.inject(DealFavoritesService);
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  it('lädt alte Favoriten aus dem Account statt aus dem Browser', async () => {
    remote = [item()];
    await settle();
    expect(service.favorites()).toEqual(remote);
    expect(rpc).toHaveBeenCalledWith(
      'sniper_favorites_page',
      expect.objectContaining({ p_expected_user_id: 'user-a', p_workspace_id: 'workspace-a' }),
    );
  });
  it('bestätigt Hinzufügen und Entfernen auf dem Server', async () => {
    await settle();
    await service.add(item());
    expect(service.count()).toBe(1);
    expect(localStorage.getItem('flipbase_vinted_favorites_workspace-a')).toBeNull();
    await service.toggle(item());
    expect(service.count()).toBe(0);
    expect(rpc).toHaveBeenCalledWith(
      'remove_sniper_favorite',
      expect.objectContaining({ p_external_id: '101' }),
    );
  });
  it('erkennt denselben Vinted-Artikel auch nach einer neuen Feed-Kennung', async () => {
    remote = [item()];
    await settle();
    expect(service.isFavorite({ ...item(), id: item('202').id })).toBe(true);
  });
  it('täuscht bei fehlgeschlagenem Speichern keine Favorisierung vor', async () => {
    await settle();
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'offline' } });
    expect(await service.add(item())).toBe(false);
    expect(service.count()).toBe(0);
    expect(service.error()).toBeTruthy();
  });
  it('behält den Favoriten bei fehlgeschlagenem Entfernen', async () => {
    remote = [item()];
    await settle();
    rpc.mockRejectedValueOnce(new Error('offline'));
    expect(await service.remove(item().id)).toBe(false);
    expect(service.count()).toBe(1);
  });
  it('verhindert doppelte gleichzeitige Schreibvorgänge', async () => {
    await settle();
    let finish!: (result: unknown) => void;
    rpc.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const pending = service.add(item());
    await service.add(item());
    expect(rpc.mock.calls.filter((call) => call[0] === 'save_sniper_favorite')).toHaveLength(1);
    expect(service.count()).toBe(0);
    finish({ data: true, error: null });
    await pending;
    expect(service.count()).toBe(1);
  });
  it('entfernt alte Accountdaten sofort und ignoriert eine verspätete Schreibantwort', async () => {
    await settle();
    let finish!: (result: unknown) => void;
    rpc.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const pending = service.add(item());
    user.set({ id: 'user-b' });
    await settle();
    finish({ data: true, error: null });
    await pending;
    expect(service.count()).toBe(0);
  });
  it('verwirft eine verspätete Ladeantwort nach Workspacewechsel', async () => {
    let finish!: (result: unknown) => void;
    rpc.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    await settle();
    workspace.set({ id: 'workspace-b' });
    await settle();
    finish({ data: { items: [item()], next_cursor: null }, error: null });
    await settle();
    expect(service.count()).toBe(0);
  });
  it('fragt ohne Anmeldung keinen Favoritenbestand ab', async () => {
    user.set(null);
    await settle();
    expect(rpc).not.toHaveBeenCalled();
    expect(await service.add(item())).toBe(false);
  });
  it('lädt alle Seiten ohne 500er-Verdrängung', async () => {
    const rows = Array.from({ length: 501 }, (_, i) => item(String(1000 + i)));
    rpc
      .mockResolvedValueOnce({
        data: { items: rows.slice(0, 200), next_cursor: { time: '2026-01-01T00:00:00Z', id: 'a' } },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          items: rows.slice(200, 400),
          next_cursor: { time: '2026-01-01T00:00:00Z', id: 'b' },
        },
        error: null,
      })
      .mockResolvedValueOnce({ data: { items: rows.slice(400), next_cursor: null }, error: null });
    await settle();
    expect(service.count()).toBe(501);
  });
  it('schützt vor einer endlosen Wiederholung derselben Seite', async () => {
    rpc.mockResolvedValue({
      data: { items: [item()], next_cursor: { time: '2026-01-01T00:00:00Z', id: 'a' } },
      error: null,
    });
    await settle();
    expect(service.error()).toBeTruthy();
    expect(rpc.mock.calls.length).toBeLessThan(4);
  });
  it('übernimmt lokale Favoriten nur nach ausdrücklichem Import', async () => {
    const key = 'flipbase_vinted_favorites_workspace-a';
    localStorage.setItem(key, JSON.stringify([item()]));
    await settle();
    expect(service.count()).toBe(0);
    expect(service.legacyCount()).toBe(1);
    expect(rpc.mock.calls.filter((call) => call[0] === 'import_sniper_favorites')).toHaveLength(0);
    expect(await service.importLegacy()).toBe(true);
    expect(service.count()).toBe(1);
    expect(localStorage.getItem(key)).toBeNull();
  });
  it('behält die lokale Quelle nach Importfehlern', async () => {
    const key = 'flipbase_vinted_favorites_workspace-a';
    const raw = JSON.stringify([item()]);
    localStorage.setItem(key, raw);
    await settle();
    rpc.mockRejectedValueOnce(new Error('offline'));
    expect(await service.importLegacy()).toBe(false);
    expect(localStorage.getItem(key)).toBe(raw);
  });
  it('holt Änderungen vom Tablet beim erneuten Öffnen des Fensters', async () => {
    await settle();
    remote = [item()];
    window.dispatchEvent(new Event('focus'));
    await settle();
    expect(service.count()).toBe(1);
  });
  it('leert nur nach Serverbestätigung und verwirft danach alte Ladeantworten', async () => {
    remote = [item()];
    await settle();
    expect(await service.clear()).toBe(true);
    expect(service.count()).toBe(0);
    expect(rpc).toHaveBeenCalledWith(
      'clear_sniper_favorites',
      expect.objectContaining({ p_expected_user_id: 'user-a' }),
    );
  });
});
