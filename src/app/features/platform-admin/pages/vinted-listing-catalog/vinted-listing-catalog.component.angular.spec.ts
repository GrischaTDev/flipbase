import { TestBed } from '@angular/core/testing';
import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest';
import { prepareMarketplaceRendering } from '../../../../../../e2e/support/marketplace-rendering';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { CardComponent } from '../../../../shared/components/card/card.component';
import { PageHeaderComponent } from '../../../../shared/components/page-header/page-header.component';
import {
  parseVintedListingCatalogStatus,
  vintedListingCatalogCurrentPercent,
  type VintedListingCatalogStatus,
} from '../../models/vinted-listing-catalog-status';
import { VintedListingCatalogAdminService } from '../../services/vinted-listing-catalog-admin.service';
import { VintedListingCatalogComponent } from './vinted-listing-catalog.component';

const ready: VintedListingCatalogStatus = {
  categories: 2874,
  leaves: 2462,
  leavesWithFields: 2462,
  leavesDue: 0,
  treeObservedAt: '2026-11-06T15:02:04Z',
  oldestFieldsObservedAt: '2026-11-06T15:02:04Z',
  refreshRequestedAt: null,
};

let restore: (() => void) | undefined;
beforeAll(async () => {
  const shared = 'src/app/shared/components/';
  restore = await prepareMarketplaceRendering([
    { type: PageHeaderComponent, path: shared + 'page-header/page-header.component.ts' },
    { type: CardComponent, path: shared + 'card/card.component.ts' },
    { type: ButtonComponent, path: shared + 'button/button.component.ts' },
    {
      type: VintedListingCatalogComponent,
      path: 'src/app/features/platform-admin/pages/vinted-listing-catalog/vinted-listing-catalog.component.ts',
    },
  ]);
});
afterAll(() => restore?.());
afterEach(() => TestBed.resetTestingModule());

function setup(status: VintedListingCatalogStatus) {
  const api = {
    status: vi.fn(async () => status),
    requestRefresh: vi.fn(async () => undefined),
  };
  TestBed.configureTestingModule({
    providers: [{ provide: VintedListingCatalogAdminService, useValue: api }],
  });
  const fixture = TestBed.createComponent(VintedListingCatalogComponent);
  return { fixture, api };
}

it('prüft den Katalogstand streng und berechnet die Aktualität', () => {
  expect(parseVintedListingCatalogStatus({ ...ready })).toEqual(ready);
  expect(() => parseVintedListingCatalogStatus({ ...ready, leaves: -1 })).toThrow();
  expect(() => parseVintedListingCatalogStatus({ ...ready, leavesWithFields: 3000 })).toThrow();
  expect(vintedListingCatalogCurrentPercent({ ...ready, leavesDue: 1231 })).toBe(50);
});

it('zeigt Umfang und Aktualität und fordert das Neu-Einlesen an', async () => {
  const { fixture, api } = setup(ready);
  await fixture.whenStable();
  fixture.detectChanges();
  const element = fixture.nativeElement as HTMLElement;
  expect(element.textContent).toContain('Vinted-Katalog');
  expect(element.textContent).toContain('100 % aktuell');
  expect(element.textContent).toMatch(/2[.,]462 \/ 2[.,]462/);
  await fixture.componentInstance.requestRefresh();
  expect(api.requestRefresh).toHaveBeenCalledTimes(1);
  expect(api.status).toHaveBeenCalledTimes(2);
});

it('zeigt einen laufenden Auftrag und sperrt dann den Knopf', async () => {
  const { fixture } = setup({
    ...ready,
    leavesDue: 462,
    refreshRequestedAt: '2026-11-06T18:00:00Z',
  });
  await fixture.whenStable();
  fixture.detectChanges();
  const element = fixture.nativeElement as HTMLElement;
  expect(fixture.componentInstance.refreshRunning()).toBe(true);
  expect(element.textContent).toContain('läuft mit den nächsten Kontoabgleichen');
  expect(element.textContent).toMatch(/2[.,]000 von 2[.,]462/);
});
