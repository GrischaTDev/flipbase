import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { prepareMarketplaceRendering } from '../../../../../../e2e/support/marketplace-rendering';
import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { CustomSearchInputComponent } from '../../../../shared/components/custom-search-input/custom-search-input.component';
import { DataTableComponent } from '../../../../shared/components/data-table/data-table.component';
import { ProductThumbnailComponent } from '../../../../shared/components/product-thumbnail/product-thumbnail.component';
import { TableColumnMenuComponent } from '../../../../shared/components/table-column-menu/table-column-menu.component';
import type { VintedStatisticsTopItem } from '../../models/vinted-statistics-overview';
import { VintedTopListingsComponent } from './vinted-top-listings.component';

const base: VintedStatisticsTopItem = {
  id: '1',
  connectionId: 'account-a',
  accountName: 'Konto A',
  entryId: 'entry-a',
  title: 'Jacke',
  imageUrl: 'https://images.example.test/a.jpg',
  price: 25,
  currency: 'EUR',
  removedAt: null,
  views: 50,
  favorites: 2,
  totalViews: 155,
  totalFavorites: 18,
};
const items: VintedStatisticsTopItem[] = [
  base,
  {
    ...base,
    id: '2',
    accountName: 'Konto B',
    connectionId: 'account-b',
    entryId: null,
    title: 'Sehr langer Titel '.repeat(20).trim(),
    imageUrl: null,
    price: null,
    removedAt: '2026-10-09T08:00:00Z',
    views: 20,
    favorites: 9,
    totalViews: null,
    totalFavorites: null,
  },
];

describe('VintedTopListingsComponent', () => {
  let fixture: ComponentFixture<VintedTopListingsComponent>;
  let resetBindings: (() => void) | undefined;
  const host = () => fixture.nativeElement as HTMLElement;
  const rows = () => [...host().querySelectorAll('tbody tr')];
  const shared = 'src/app/shared/components';

  beforeAll(async () => {
    resetBindings = await prepareMarketplaceRendering([
      {
        type: VintedTopListingsComponent,
        path: 'src/app/features/marketplaces/components/vinted-statistics/vinted-top-listings.component.ts',
      },
      { type: DataTableComponent, path: `${shared}/data-table/data-table.component.ts` },
      { type: ButtonComponent, path: `${shared}/button/button.component.ts` },
      { type: BadgeComponent, path: `${shared}/badge/badge.component.ts` },
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
    await TestBed.configureTestingModule({
      imports: [VintedTopListingsComponent],
      providers: [provideRouter([])],
    }).compileComponents();
    fixture = TestBed.createComponent(VintedTopListingsComponent);
    fixture.componentRef.setInput('items', items);
    fixture.detectChanges();
  });

  it('sortiert zuerst nach Aufrufen und auf Wunsch nach Favoriten', () => {
    expect(rows()[0].textContent).toContain('Jacke');
    const favorites = host().querySelector<HTMLButtonElement>('[data-sort="favorites"] button')!;
    expect(favorites.getAttribute('aria-pressed')).toBe('false');
    favorites.click();
    fixture.detectChanges();
    expect(rows()[0].textContent).toContain('Sehr langer Titel');
    expect(favorites.getAttribute('aria-pressed')).toBe('true');
  });

  it('verlinkt vorhandene Inserate und kennzeichnet verschwundene', () => {
    const link = rows()[0].querySelector('a');
    expect(link?.getAttribute('href')).toBe('/marketplaces/vinted/listings/account-a/entry-a');
    expect(rows()[1].querySelector('a')).toBeNull();
    expect(rows()[1].textContent).toContain('Nicht mehr online');
    expect(rows()[0].textContent).not.toContain('Nicht mehr online');
  });

  it('zeigt fehlenden Preis und fehlende Gesamtwerte lesbar an und kürzt lange Titel', () => {
    expect(rows()[1].textContent).toContain('Preis unbekannt');
    expect(rows()[1].textContent).toContain('—');
    expect(
      rows()[1].querySelector('[data-top-listing-title]')?.classList.contains('truncate'),
    ).toBe(true);
  });

  it('zeigt die Kontospalte nur bei allen Konten', () => {
    expect(host().textContent).not.toContain('Konto B');
    fixture.componentRef.setInput('showAccount', true);
    fixture.detectChanges();
    expect(
      [...host().querySelectorAll('thead th')].map((cell) => cell.textContent?.trim()),
    ).toContain('Konto');
    expect(rows()[1].textContent).toContain('Konto B');
  });

  it('erklärt eine leere Liste', () => {
    fixture.componentRef.setInput('items', []);
    fixture.detectChanges();
    expect(host().textContent).toContain('Noch keine Bestenliste');
    expect(host().querySelector('table')).toBeNull();
  });
});
