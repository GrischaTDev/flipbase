import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { prepareMarketplaceRendering } from '../../../../../../e2e/support/marketplace-rendering';
import { ThemeService } from '../../../../core/services/theme.service';
import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { CardComponent } from '../../../../shared/components/card/card.component';
import { CustomSearchInputComponent } from '../../../../shared/components/custom-search-input/custom-search-input.component';
import { DataTableComponent } from '../../../../shared/components/data-table/data-table.component';
import { NoticeBannerComponent } from '../../../../shared/components/notice-banner/notice-banner.component';
import { ProductThumbnailComponent } from '../../../../shared/components/product-thumbnail/product-thumbnail.component';
import { TableColumnMenuComponent } from '../../../../shared/components/table-column-menu/table-column-menu.component';
import type { VintedStatisticsOverview } from '../../models/vinted-statistics-overview';
import { MarketplaceAccountStore } from '../../services/marketplace-account.store';
import { VintedStatisticsStore } from '../../services/vinted-statistics.store';
import {
  VINTED_REACH_CHART_LOADER,
  VintedReachChartComponent,
} from './vinted-reach-chart.component';
import { VintedStatisticsComponent } from './vinted-statistics.component';
import { VintedTopListingsComponent } from './vinted-top-listings.component';

const overview: VintedStatisticsOverview = {
  workspaceId: 'workspace-a',
  connectionId: 'account-a',
  range: '7d',
  historyStartsAt: '2026-09-01T10:00:00Z',
  activeCount: 12,
  totals: { views: 1234, favorites: 56 },
  previousTotals: { views: 1000, favorites: 56 },
  buckets: [
    { start: '2026-10-06T22:00:00Z', views: 200, favorites: 6 },
    { start: '2026-10-07T22:00:00Z', views: 1034, favorites: 50 },
  ],
  topItems: [
    {
      id: '1',
      connectionId: 'account-a',
      accountName: 'Konto A',
      entryId: 'entry-a',
      title: 'Jacke',
      imageUrl: null,
      price: 25,
      currency: 'EUR',
      removedAt: null,
      views: 500,
      favorites: 20,
      totalViews: 900,
      totalFavorites: 40,
    },
  ],
};

describe('VintedStatisticsComponent', () => {
  let fixture: ComponentFixture<VintedStatisticsComponent>;
  let resetBindings: (() => void) | undefined;
  const statistics = {
    accountScope: signal<'account' | 'all'>('account'),
    canCombineAccounts: signal(true),
    range: signal<'24h' | '7d' | '30d'>('7d'),
    overview: signal<VintedStatisticsOverview | null>(overview),
    loading: signal(false),
    error: signal<string | null>(null),
    selectAccountScope: vi.fn(),
    selectRange: vi.fn(),
    reload: vi.fn(),
  };
  const account = { canManage: signal(true) };
  const host = () => fixture.nativeElement as HTMLElement;
  const text = () => host().textContent?.replace(/\s+/g, ' ') ?? '';
  const button = (name: string) =>
    [...host().querySelectorAll<HTMLButtonElement>('button')].find(
      (element) => element.textContent?.trim() === name,
    )!;
  const shared = 'src/app/shared/components';
  const feature = 'src/app/features/marketplaces/components/vinted-statistics';

  beforeAll(async () => {
    resetBindings = await prepareMarketplaceRendering([
      { type: VintedStatisticsComponent, path: `${feature}/vinted-statistics.component.ts` },
      { type: VintedReachChartComponent, path: `${feature}/vinted-reach-chart.component.ts` },
      { type: VintedTopListingsComponent, path: `${feature}/vinted-top-listings.component.ts` },
      { type: ButtonComponent, path: `${shared}/button/button.component.ts` },
      { type: CardComponent, path: `${shared}/card/card.component.ts` },
      { type: BadgeComponent, path: `${shared}/badge/badge.component.ts` },
      { type: NoticeBannerComponent, path: `${shared}/notice-banner/notice-banner.component.ts` },
      { type: DataTableComponent, path: `${shared}/data-table/data-table.component.ts` },
      {
        type: ProductThumbnailComponent,
        path: `${shared}/product-thumbnail/product-thumbnail.component.ts`,
      },
      {
        type: CustomSearchInputComponent,
        path: `${shared}/custom-search-input/custom-search-input.component.ts`,
      },
      {
        type: TableColumnMenuComponent,
        path: `${shared}/table-column-menu/table-column-menu.component.ts`,
      },
    ]);
  });
  afterAll(() => resetBindings?.());

  beforeEach(async () => {
    TestBed.resetTestingModule();
    statistics.accountScope.set('account');
    statistics.canCombineAccounts.set(true);
    statistics.range.set('7d');
    statistics.overview.set(overview);
    statistics.loading.set(false);
    statistics.error.set(null);
    account.canManage.set(true);
    vi.clearAllMocks();
    TestBed.configureTestingModule({
      imports: [VintedStatisticsComponent],
      providers: [
        provideRouter([]),
        { provide: MarketplaceAccountStore, useValue: account },
        { provide: ThemeService, useValue: { currentTheme: signal('light') } },
        {
          provide: VINTED_REACH_CHART_LOADER,
          useValue: async () => () => ({
            render: vi.fn().mockResolvedValue(undefined),
            updateOptions: vi.fn().mockResolvedValue(undefined),
            destroy: vi.fn(),
          }),
        },
      ],
    });
    // Der Store wird von der Seite selbst bereitgestellt; overrideProvider greift auch dort.
    TestBed.overrideProvider(VintedStatisticsStore, { useValue: statistics });
    await TestBed.compileComponents();
    fixture = TestBed.createComponent(VintedStatisticsComponent);
    fixture.detectChanges();
  });

  it('zeigt Summen, Vergleich und aktive Inserate', () => {
    expect(text()).toContain('1.234');
    expect(text()).toContain('+23 % gegenüber den 7 Tagen davor');
    expect(text()).toContain('Unverändert gegenüber den 7 Tagen davor');
    expect(text()).toContain('12');
    expect(text()).toContain('Aktive Inserate');
  });

  it('wechselt Konto-Umfang und Zeitraum über gedrückte Tasten', () => {
    expect(button('Dieses Konto').getAttribute('aria-pressed')).toBe('true');
    button('Alle Konten').click();
    expect(statistics.selectAccountScope).toHaveBeenCalledWith('all');
    expect(button('7 Tage').getAttribute('aria-pressed')).toBe('true');
    button('30 Tage').click();
    expect(statistics.selectRange).toHaveBeenCalledWith('30d');
  });

  it('blendet den Konto-Schalter bei nur einem Konto aus', () => {
    statistics.canCombineAccounts.set(false);
    fixture.detectChanges();
    expect(button('Alle Konten')).toBeUndefined();
    expect(button('7 Tage')).toBeDefined();
  });

  it('wechselt das Diagramm zwischen Aufrufen und Favoriten', () => {
    const chart = () => host().querySelector('app-vinted-reach-chart [role="img"]');
    expect(chart()?.getAttribute('aria-label')).toBe('Aufrufe je Zeitabschnitt');
    host().querySelector<HTMLButtonElement>('[data-chart-metric="favorites"] button')!.click();
    fixture.detectChanges();
    expect(chart()?.getAttribute('aria-label')).toBe('Favoriten je Zeitabschnitt');
  });

  it('zeigt die Kontospalte der Bestenliste nur bei allen Konten', () => {
    expect(text()).not.toContain('Konto A');
    statistics.accountScope.set('all');
    fixture.detectChanges();
    expect(text()).toContain('Konto A');
  });

  it('nennt den Beginn der Historie, wenn der Vergleich fehlt', () => {
    statistics.overview.set({
      ...overview,
      previousTotals: null,
      historyStartsAt: '2026-10-05T10:00:00Z',
    });
    fixture.detectChanges();
    expect(text()).toContain('Noch kein Vergleich');
    expect(text()).toContain('Die Messhistorie beginnt am 05.10.2026');
  });

  it('erklärt ein Konto ganz ohne Messungen ohne Beispielzahlen', () => {
    statistics.overview.set({
      ...overview,
      historyStartsAt: null,
      activeCount: 0,
      totals: { views: 0, favorites: 0 },
      previousTotals: null,
      topItems: [],
    });
    fixture.detectChanges();
    expect(text()).toContain('Noch keine Messwerte');
    expect(text()).not.toContain('342');
  });

  it('zeigt Laden und Fehler mit erneutem Versuch', () => {
    statistics.overview.set(null);
    statistics.loading.set(true);
    fixture.detectChanges();
    expect(host().querySelector('[role="status"]')?.textContent).toContain(
      'Statistik wird geladen',
    );
    statistics.loading.set(false);
    statistics.error.set('Die Statistik konnte nicht geladen werden.');
    fixture.detectChanges();
    expect(text()).toContain('Die Statistik konnte nicht geladen werden.');
    button('Erneut versuchen').click();
    expect(statistics.reload).toHaveBeenCalled();
  });

  it('zeigt ohne Verwaltungsrecht nur den Hinweis', () => {
    account.canManage.set(false);
    fixture.detectChanges();
    expect(text()).toContain('Für die Statistik brauchst Du Verwaltungsrechte');
    expect(host().querySelector('app-vinted-reach-chart')).toBeNull();
  });
});
