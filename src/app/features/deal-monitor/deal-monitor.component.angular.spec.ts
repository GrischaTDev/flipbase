import '@angular/compiler';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../core/services/auth.service';
import { PageLayoutService } from '../../core/services/page-layout.service';
import { SupabaseService } from '../../core/services/supabase.service';
import { WorkspaceService } from '../../core/services/workspace.service';
import { ConfirmDialogService } from '../../shared/components/confirm-dialog/confirm-dialog.service';
import { VintedBrandSearchService } from '../../core/services/vinted-brand-search.service';
import { VintedCategoryService } from '../../core/services/vinted-category.service';
import { DealMonitorComponent } from './deal-monitor.component';
import { PersonalFeed } from './models/deal-monitor.model';
import { DealMonitorService } from './services/deal-monitor.service';

const pausedFeed: PersonalFeed = {
  id: 'feed-1',
  workspace_id: 'workspace-1',
  title: 'Ralph Lauren',
  catalog_id: null,
  brand: 'Ralph Lauren',
  brand_id: 88,
  search_text: null,
  price_from: null,
  price_to: 20,
  condition: null,
  audience: null,
  sizes: [],
  is_active: false,
  started_at: null,
};

describe('Persönliche Vinted-Feeds', () => {
  const workspace = signal<{ id: string } | null>(null);
  const currentUser = signal({ id: 'user-1' });
  const widescreen = signal(false);
  const api = {
    personalFeeds: vi.fn(),
    save: vi.fn(),
    setActive: vi.fn(),
    delete: vi.fn(),
  };
  const confirm = vi.fn();
  let page: DealMonitorComponent;

  beforeEach(() => {
    vi.resetAllMocks();
    localStorage.clear();
    workspace.set({ id: 'workspace-1' });
    currentUser.set({ id: 'user-1' });
    widescreen.set(false);
    TestBed.configureTestingModule({
      providers: [
        DealMonitorComponent,
        { provide: AuthService, useValue: { currentUser } },
        { provide: WorkspaceService, useValue: { currentWorkspace: workspace } },
        { provide: PageLayoutService, useValue: { widescreen } },
        { provide: DealMonitorService, useValue: api },
        { provide: ConfirmDialogService, useValue: { frage: confirm } },
      ],
    });
    TestBed.overrideComponent(DealMonitorComponent, { set: { template: '', imports: [] } });
    page = TestBed.inject(DealMonitorComponent);
  });

  afterEach(() => TestBed.resetTestingModule());

  it('startet leer und wählt einen neu gespeicherten gestoppten Feed aus', async () => {
    api.personalFeeds.mockResolvedValueOnce([]);
    TestBed.tick();
    await Promise.resolve();
    expect(page.selectedFeed()).toBeUndefined();

    page.openEditor();
    api.save.mockResolvedValue(pausedFeed.id);
    api.personalFeeds.mockResolvedValueOnce([pausedFeed]);
    const { workspace_id, is_active, started_at, ...draft } = pausedFeed;
    await page.save({ ...draft, id: null });

    expect(api.save).toHaveBeenCalledWith(workspace_id, { ...draft, id: null });
    expect(page.editorOpen()).toBe(false);
    expect(page.selectedFeed()).toEqual({ ...pausedFeed, is_active, started_at });
  });

  it('startet und stoppt den ausgewählten Feed serverseitig', async () => {
    api.personalFeeds.mockResolvedValueOnce([pausedFeed]);
    TestBed.tick();
    await Promise.resolve();
    const running = { ...pausedFeed, is_active: true, started_at: '2026-11-22T21:31:00Z' };
    api.personalFeeds.mockResolvedValueOnce([running]).mockResolvedValueOnce([pausedFeed]);

    await page.toggle(pausedFeed);
    expect(page.selectedFeed()).toEqual(running);
    await page.toggle(running);

    expect(api.setActive.mock.calls).toEqual([
      ['workspace-1', pausedFeed.id, true],
      ['workspace-1', pausedFeed.id, false],
    ]);
    expect(page.selectedFeed()).toEqual(pausedFeed);
  });

  it('löscht nur einen bestätigten eigenen Feed', async () => {
    api.personalFeeds.mockResolvedValueOnce([pausedFeed]);
    TestBed.tick();
    await Promise.resolve();
    confirm.mockResolvedValueOnce(false).mockResolvedValueOnce(true);

    await page.remove(pausedFeed);
    expect(api.delete).not.toHaveBeenCalled();
    api.personalFeeds.mockResolvedValueOnce([]);
    localStorage.setItem(
      'flipbase:vinted-feed:live-filters:workspace-1:feed-1',
      JSON.stringify({ query: 'Polo', sizes: ['m'], minPrice: 10, maxPrice: null }),
    );
    await page.remove(pausedFeed);
    expect(api.delete).toHaveBeenCalledOnce();
    expect(api.delete).toHaveBeenCalledWith('workspace-1', pausedFeed.id);
    expect(page.selectedFeed()).toBeUndefined();
    expect(localStorage.getItem('flipbase:vinted-feed:live-filters:workspace-1:feed-1')).toBeNull();
  });

  it('verwirft die verspätete Feed-Liste des vorherigen Arbeitsbereichs', async () => {
    let finish!: (value: PersonalFeed[]) => void;
    api.personalFeeds
      .mockImplementationOnce(
        () =>
          new Promise<PersonalFeed[]>((resolve) => {
            finish = resolve;
          }),
      )
      .mockResolvedValueOnce([]);
    TestBed.tick();
    workspace.set({ id: 'workspace-2' });
    TestBed.tick();
    finish([pausedFeed]);
    await Promise.resolve();
    expect(page.feeds()).toEqual([]);
  });

  it('lädt die persönlichen Feeds bei einem Benutzerwechsel im gleichen Arbeitsbereich neu', async () => {
    api.personalFeeds.mockResolvedValueOnce([pausedFeed]).mockResolvedValueOnce([]);
    TestBed.tick();
    await Promise.resolve();
    expect(page.selectedFeed()).toEqual(pausedFeed);
    currentUser.set({ id: 'user-2' });
    TestBed.tick();
    await Promise.resolve();
    expect(api.personalFeeds).toHaveBeenCalledTimes(2);
    expect(page.selectedFeed()).toBeUndefined();
  });

  it('merkt sich den zuletzt gewählten Feed und behält die Spaltenansicht auch beim Pausieren stabil', async () => {
    const second: PersonalFeed = {
      ...pausedFeed,
      id: 'feed-2',
      title: 'Test 1',
      is_active: true,
      started_at: '2026-11-23T22:00:00Z',
    };
    const firstActive: PersonalFeed = {
      ...pausedFeed,
      is_active: true,
      started_at: '2026-11-23T22:00:00Z',
    };
    localStorage.setItem('flipbase:vinted-feed:selected:workspace-1', 'feed-2');
    api.personalFeeds.mockResolvedValueOnce([firstActive, second]);
    widescreen.set(true);
    TestBed.tick();
    await Promise.resolve();
    expect(page.selectedFeed()?.id).toBe('feed-2');
    expect(page.showColumns()).toBe(true);

    // Beim Pausieren eines Feeds bleibt die Nebeneinander-Ansicht erhalten.
    api.personalFeeds.mockResolvedValueOnce([pausedFeed, second]);
    await page.toggle(firstActive);
    expect(page.showColumns()).toBe(true);

    page.selectFeed(firstActive);
    expect(localStorage.getItem('flipbase:vinted-feed:selected:workspace-1')).toBe('feed-1');
  });

  it('markiert Feeds mit geänderter oder entfernter Vinted-Kategorie als prüfbedürftig', async () => {
    const outdated: PersonalFeed = { ...pausedFeed, id: 'feed-old', catalog_id: 999999 };
    const valid: PersonalFeed = { ...pausedFeed, id: 'feed-ok', catalog_id: 2050 };
    api.personalFeeds.mockResolvedValueOnce([outdated, valid]);
    Object.assign(api, {
      categories: vi
        .fn()
        .mockResolvedValue([
          { id: 2050, parentId: 5, title: 'Kleidung', path: 'Herren > Kleidung' },
        ]),
    });
    TestBed.tick();
    await Promise.resolve();
    await Promise.resolve();
    expect(page.hasOutdatedCategory(outdated)).toBe(true);
    expect(page.hasOutdatedCategory(valid)).toBe(false);
    expect(page.feedBadges(valid)).toContain('Herren > Kleidung');
  });
});

describe('Live-Abruf eines persönlichen Feeds', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('übergibt beim inkrementellen Abruf alle Parameter der aktuellen RPC-Signatur', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { items: [] }, error: null });
    TestBed.configureTestingModule({
      providers: [
        { provide: SupabaseService, useValue: { client: { rpc } } },
        { provide: VintedBrandSearchService, useValue: {} },
        { provide: VintedCategoryService, useValue: {} },
      ],
    });
    const afterTime = '2026-11-22T21:30:00.000Z';
    await TestBed.inject(DealMonitorService).feed({
      workspace: 'workspace-1',
      watchlist: 'feed-1',
      afterTime,
    });
    expect(rpc).toHaveBeenCalledWith('sniper_feed_search', {
      p_workspace_id: 'workspace-1',
      p_watchlist_id: 'feed-1',
      p_brand: null,
      p_size: null,
      p_min_price: null,
      p_max_price: null,
      p_before_time: null,
      p_before_id: null,
      p_limit: 100,
      p_title_query: '',
      p_catalog_id: null,
      p_audience: null,
      p_sizes: [],
      p_query_id: null,
      p_after_time: afterTime,
    });
  });
});
