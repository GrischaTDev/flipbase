import { LOCALE_ID, signal } from '@angular/core';
import { registerLocaleData } from '@angular/common';
import localeDe from '@angular/common/locales/de';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { prepareMarketplaceRendering } from '../../../../../../e2e/support/marketplace-rendering';
import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { CardComponent } from '../../../../shared/components/card/card.component';
import { ProductThumbnailComponent } from '../../../../shared/components/product-thumbnail/product-thumbnail.component';
import { parseMarketplaceSnapshot } from '../../models/marketplace-response';
import { MarketplaceAccountStore } from '../../services/marketplace-account.store';
import { VintedSalesComponent } from './vinted-sales.component';

const scope = { workspaceId: 'workspace-1', connectionId: 'connection-1' };
const empty = { items: [], total: 0, nextCursor: null };
const makeSnapshot = (items: Record<string, unknown>[] = [], nextCursor: string | null = null) =>
  parseMarketplaceSnapshot(
    {
      ...scope,
      profile: null,
      publications: empty,
      conversations: empty,
      activity: empty,
      sales: {
        items: items.map((item, index) => ({
          ...scope,
          id: `sale-${index}`,
          title: '6 Artikel',
          ...item,
        })),
        total: items.length,
        nextCursor,
      },
    },
    scope,
  );
const current = signal(makeSnapshot());
const unavailable = signal(false);
const loadMore = vi.fn();
let reset: (() => void) | undefined;
beforeAll(async () => {
  registerLocaleData(localeDe);
  reset = await prepareMarketplaceRendering([
    { type: BadgeComponent, path: 'src/app/shared/components/badge/badge.component.ts' },
    { type: ButtonComponent, path: 'src/app/shared/components/button/button.component.ts' },
    { type: CardComponent, path: 'src/app/shared/components/card/card.component.ts' },
    {
      type: ProductThumbnailComponent,
      path: 'src/app/shared/components/product-thumbnail/product-thumbnail.component.ts',
    },
    {
      type: VintedSalesComponent,
      path: 'src/app/features/marketplaces/components/vinted-sales/vinted-sales.component.ts',
    },
  ]);
});
afterAll(() => reset?.());
beforeEach(async () => {
  TestBed.resetTestingModule();
  current.set(makeSnapshot());
  unavailable.set(false);
  loadMore.mockReset();
  await TestBed.configureTestingModule({
    imports: [VintedSalesComponent],
    providers: [
      provideRouter([]),
      { provide: LOCALE_ID, useValue: 'de' },
      {
        provide: MarketplaceAccountStore,
        useValue: {
          snapshot: current,
          localSalesUnavailable: unavailable,
          loadingPage: signal(null),
          loadMore,
        },
      },
    ],
  }).compileComponents();
});

it('zeigt einen stornierten Paketverkauf mit echtem Gesamtpreis, Datum und gebundenem Chat', () => {
  current.set(
    makeSnapshot([
      {
        saleState: 'cancelled',
        price: 40,
        currency: 'EUR',
        occurredAt: '2026-10-21T10:00:00Z',
        itemCount: 6,
        itemIds: ['41', '42', '43', '44', '45', '46'],
        conversationId: 'conversation-1',
      },
    ]),
  );
  const fixture = TestBed.createComponent(VintedSalesComponent);
  fixture.detectChanges();
  const element = fixture.nativeElement as HTMLElement;
  expect(element.querySelector('app-badge')?.textContent).toContain('Storniert');
  expect(element.textContent).toContain('Noch nicht wieder eingestellt');
  expect(element.textContent).toContain('Ursprünglicher Verkaufspreis');
  expect(element.textContent).toContain('40,00');
  expect(element.textContent).toContain('21.10.2026');
  expect(element.querySelector('a')?.getAttribute('href')).toContain('connectionId=connection-1');
  expect(element.querySelector('a')?.getAttribute('href')).toContain(
    'conversationId=conversation-1',
  );
});

it('führt wieder eingestellte Stornierungen getrennt von den aktuellen Verkäufen', () => {
  current.set(
    makeSnapshot([
      { title: 'Aktueller Verkauf', saleState: 'sold' },
      { title: 'Historisches Paket', saleState: 'relisted' },
    ]),
  );
  const fixture = TestBed.createComponent(VintedSalesComponent);
  fixture.detectChanges();
  const element = fixture.nativeElement as HTMLElement;
  expect(element.querySelector('[aria-label="Aktuelle Verkaufsvorgänge"]')?.textContent).toContain(
    'Aktueller Verkauf',
  );
  expect(
    element.querySelector('[aria-label="Aktuelle Verkaufsvorgänge"]')?.textContent,
  ).not.toContain('Historisches Paket');
  expect(
    element.querySelector('[aria-label="Wieder eingestellte Stornierungen"]')?.textContent,
  ).toContain('Historisches Paket');
  expect(element.textContent).toContain('wieder eingestellt');
});

it('zeigt unbekannte Paketzuordnung und Preise ehrlich und lädt die nächste Seite', () => {
  current.set(
    makeSnapshot([{ saleState: 'sold', itemCount: 6, itemIds: ['41'], price: null }], 'next'),
  );
  const fixture = TestBed.createComponent(VintedSalesComponent);
  fixture.detectChanges();
  const element = fixture.nativeElement as HTMLElement;
  expect(element.textContent).toContain('Artikelzuordnung noch unvollständig');
  expect(element.textContent).toContain('Preis unbekannt');
  [...element.querySelectorAll('button')]
    .find((button) => button.textContent?.includes('Weitere Verkäufe'))
    ?.click();
  expect(loadMore).toHaveBeenCalledWith('sale');
});

it('erhält gespeicherte Verkäufe bei nicht angebundener lokaler Quelle', () => {
  unavailable.set(true);
  current.set(makeSnapshot([{ title: 'Gespeicherter Verkauf' }]));
  const fixture = TestBed.createComponent(VintedSalesComponent);
  fixture.detectChanges();
  expect(fixture.nativeElement.textContent).toContain('noch nicht synchronisiert');
  expect(fixture.nativeElement.textContent).toContain('Gespeicherter Verkauf');
});

it('verwendet die Kleiderschrankstruktur mit gekürztem Titel und kompakter Fußzeile', () => {
  current.set(
    makeSnapshot([
      {
        title: 'Sehr langer verkaufter Artikel '.repeat(8),
        brand: 'Jako',
        size: '34',
        saleState: 'completed',
        shipmentStatus: 'Zugestellt',
        conversationId: 'chat',
      },
    ]),
  );
  const fixture = TestBed.createComponent(VintedSalesComponent);
  fixture.detectChanges();
  const element = fixture.nativeElement as HTMLElement;
  expect(element.querySelector('h3')?.classList.contains('truncate')).toBe(true);
  expect(element.querySelector('app-card')?.getAttribute('padding')).toBe('none');
  expect(element.querySelector('[data-sale-details]')?.textContent).toContain('Jako');
  expect(element.querySelector('[data-sale-details]')?.textContent).toContain('Abgeschlossen');
  expect(element.querySelector('[data-sale-footer]')?.textContent).toContain('Zugestellt');
  expect(element.querySelector('[data-sale-footer]')?.textContent).toContain('Chat öffnen');
});
