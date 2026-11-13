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
import { VintedShippingLabelStore } from '../../services/vinted-shipping-label.store';
import type { VintedShippingLabel } from '../../models/vinted-shipping-label';
import { VintedShippingLabelActionsComponent } from '../vinted-shipping-label-actions/vinted-shipping-label-actions.component';
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
const labelList = signal<readonly VintedShippingLabel[]>([]);
const requestLabel = vi.fn();
const openLabel = vi.fn();
const downloadLabel = vi.fn();
const loadLabels = vi.fn();
const selected = signal<{
  workspaceId: string;
  connectionId: string;
  executionMode: string;
} | null>(null);
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
      type: VintedShippingLabelActionsComponent,
      path: 'src/app/features/marketplaces/components/vinted-shipping-label-actions/vinted-shipping-label-actions.component.ts',
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
  labelList.set([]);
  selected.set(null);
  for (const mock of [requestLabel, openLabel, downloadLabel, loadLabels]) mock.mockReset();
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
          selectedConnection: selected,
        },
      },
      {
        provide: VintedShippingLabelStore,
        useValue: {
          byTransaction: () => new Map(labelList().map((label) => [label.transactionId, label])),
          requesting: signal(new Set<string>()),
          notices: signal(new Map<string, string>()),
          load: loadLabels,
          ensureLoaded: loadLabels,
          request: requestLabel,
          open: openLabel,
          download: downloadLabel,
        },
      },
    ],
  }).compileComponents();
});

it('zeigt einen stornierten Paketverkauf kompakt mit echtem Gesamtpreis und gebundenem Chat', () => {
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
  expect(element.textContent).toContain('40,00');
  expect(element.querySelector('details')).toBeNull();
  expect(element.textContent).not.toContain('Verkaufsdetails');
  expect(element.textContent).not.toContain('21.10.2026');
  expect(element.querySelector('a')?.getAttribute('href')).toContain('connectionId=connection-1');
  expect(element.querySelector('a')?.getAttribute('href')).toContain(
    'conversationId=conversation-1',
  );
});

it('entfernt bestätigte Wiederaufnahmen aus den Verkäufen und behält Stornierungen', () => {
  current.set(
    makeSnapshot([
      { title: 'Aktueller Verkauf', saleState: 'sold' },
      { title: 'Stornierter Verkauf', saleState: 'cancelled' },
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
  expect(element.textContent).toContain('Stornierter Verkauf');
  expect(element.textContent).not.toContain('Historisches Paket');
  expect(element.textContent).not.toContain('wieder eingestellt');
});

it('erhält beim Ausblenden einer ganzen Teilseite den Nachladeweg ohne falschen Leerzustand', () => {
  current.set(makeSnapshot([{ title: 'Wiederaufnahme', saleState: 'relisted' }], 'next'));
  const fixture = TestBed.createComponent(VintedSalesComponent);
  fixture.detectChanges();
  const element = fixture.nativeElement as HTMLElement;
  expect(element.querySelector('article')).toBeNull();
  expect(element.textContent).not.toContain('Noch keine bestätigten Verkäufe gespeichert');
  expect(element.textContent).toContain('Weitere Verkäufe laden');
});

it('zeigt nach Wiederaufnahme aller geladenen Vorgänge ohne Folgeseite den Leerzustand', () => {
  current.set(makeSnapshot([{ title: 'Wiederaufnahme', saleState: 'relisted' }]));
  const fixture = TestBed.createComponent(VintedSalesComponent);
  fixture.detectChanges();
  expect(fixture.nativeElement.querySelector('article')).toBeNull();
  expect(fixture.nativeElement.textContent).toContain(
    'Noch keine bestätigten Verkäufe gespeichert',
  );
});

it('entfernt eine geladene Stornierung nach bestätigter Wiederaufnahme ohne Datenlöschung', () => {
  current.set(makeSnapshot([{ title: 'Jacke', saleState: 'cancelled' }]));
  const fixture = TestBed.createComponent(VintedSalesComponent);
  fixture.detectChanges();
  expect(fixture.nativeElement.querySelector('article')).not.toBeNull();
  current.set(makeSnapshot([{ title: 'Jacke', saleState: 'relisted' }]));
  fixture.detectChanges();
  expect(fixture.nativeElement.querySelector('article')).toBeNull();
  expect(current().sales.items).toHaveLength(1);
});

it('zeigt unbekannte Paketzuordnung und Preise ehrlich und lädt die nächste Seite', () => {
  current.set(
    makeSnapshot([{ saleState: 'sold', itemCount: 6, itemIds: ['41'], price: null }], 'next'),
  );
  const fixture = TestBed.createComponent(VintedSalesComponent);
  fixture.detectChanges();
  const element = fixture.nativeElement as HTMLElement;
  expect(element.textContent).toContain('Paket mit 6 Artikeln');
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

it('bietet bei einem frischen Verkauf das Anfordern des Versandscheins mit Frist an', () => {
  selected.set({ ...scope, executionMode: 'cloud' });
  current.set(
    makeSnapshot([
      {
        externalId: '24052549356',
        title: 'Carhartt WIP Teddy-Fleecejacke',
        saleState: 'sold',
        shippingLabelAction: 'order',
        shippingDeadline: '16 Nov. 10:00',
      },
    ]),
  );
  const fixture = TestBed.createComponent(VintedSalesComponent);
  fixture.detectChanges();
  const element = fixture.nativeElement as HTMLElement;
  expect(loadLabels).toHaveBeenCalledWith(scope);
  const actions = element.querySelector('[data-shipping-label-actions]');
  expect(actions?.textContent).toContain('Verschicken bis 16 Nov. 10:00');
  const button = [...(actions?.querySelectorAll('button') ?? [])].find((candidate) =>
    candidate.textContent?.includes('Versandschein anfordern'),
  );
  button?.click();
  expect(requestLabel).toHaveBeenCalledWith(expect.objectContaining({ id: 'sale-0' }));
});

it('öffnet und lädt einen gespeicherten Versandschein statt erneut anzufordern', async () => {
  const label: VintedShippingLabel = {
    id: '7',
    workspaceId: scope.workspaceId,
    connectionId: scope.connectionId,
    transactionId: '24052549356',
    conversationId: '500969788562',
    title: 'Carhartt WIP Teddy-Fleecejacke',
    carrierName: 'DPD Shop2Shop',
    labelType: 'printable',
    storagePath: 'workspace-1/connection-1/24052549356.pdf',
    mimeType: 'application/pdf',
    requestedByFlipbase: true,
    fetchedAt: '2026-11-13T10:00:00Z',
  };
  labelList.set([label]);
  current.set(
    makeSnapshot([
      { externalId: '24052549356', saleState: 'sold', shippingLabelAction: 'available' },
    ]),
  );
  const fixture = TestBed.createComponent(VintedSalesComponent);
  fixture.detectChanges();
  const element = fixture.nativeElement as HTMLElement;
  expect(element.textContent).not.toContain('Versandschein anfordern');
  expect(element.textContent).not.toContain('Versandschein abholen');
  const open = [...element.querySelectorAll('button')].find((button) =>
    button.textContent?.includes('Versandschein öffnen'),
  );
  open?.click();
  await fixture.whenStable();
  expect(openLabel).toHaveBeenCalledWith(label);
  (
    element.querySelector('button[aria-label="Versandschein herunterladen"]') as HTMLButtonElement
  )?.click();
  await fixture.whenStable();
  expect(downloadLabel).toHaveBeenCalledWith(label);
});

it('zeigt für stornierte Verkäufe keine Versandschein-Aktionen', () => {
  current.set(
    makeSnapshot([{ externalId: '1', saleState: 'cancelled', shippingLabelAction: 'order' }]),
  );
  const fixture = TestBed.createComponent(VintedSalesComponent);
  fixture.detectChanges();
  expect(
    (fixture.nativeElement as HTMLElement).querySelector('[data-shipping-label-actions]'),
  ).toBeNull();
});
