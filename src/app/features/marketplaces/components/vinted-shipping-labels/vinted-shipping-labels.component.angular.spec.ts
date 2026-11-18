import { LOCALE_ID, signal } from '@angular/core';
import { registerLocaleData } from '@angular/common';
import localeDe from '@angular/common/locales/de';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { prepareMarketplaceRendering } from '../../../../../../e2e/support/marketplace-rendering';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { DataTableComponent } from '../../../../shared/components/data-table/data-table.component';
import type { VintedShippingLabel } from '../../models/vinted-shipping-label';
import { MarketplaceAccountStore } from '../../services/marketplace-account.store';
import { VintedShippingLabelStore } from '../../services/vinted-shipping-label.store';
import { VintedShippingLabelsComponent } from './vinted-shipping-labels.component';

const scope = { workspaceId: 'workspace-1', connectionId: 'connection-1' };
const label = (overrides: Partial<VintedShippingLabel> = {}): VintedShippingLabel => ({
  id: '7',
  ...scope,
  transactionId: '24052549356',
  shipmentId: '51458635363',
  conversationId: '500969788562',
  title: 'Carhartt WIP Teddy-Fleecejacke',
  carrierName: 'DPD Shop2Shop',
  labelType: 'printable',
  storagePath: 'workspace-1/connection-1/24052549356.pdf',
  mimeType: 'application/pdf',
  requestedByFlipbase: true,
  fetchedAt: '2026-11-13T10:00:00Z',
  ...overrides,
});
const params = new BehaviorSubject(convertToParamMap({}));
const labels = signal<readonly VintedShippingLabel[]>([]);
const selected = signal<Record<string, string> | null>(null);
const load = vi.fn();
const open = vi.fn();
const download = vi.fn();
let reset: (() => void) | undefined;

beforeAll(async () => {
  registerLocaleData(localeDe);
  reset = await prepareMarketplaceRendering([
    { type: ButtonComponent, path: 'src/app/shared/components/button/button.component.ts' },
    {
      type: DataTableComponent,
      path: 'src/app/shared/components/data-table/data-table.component.ts',
    },
    {
      type: VintedShippingLabelsComponent,
      path: 'src/app/features/marketplaces/components/vinted-shipping-labels/vinted-shipping-labels.component.ts',
    },
  ]);
});
afterAll(() => reset?.());
beforeEach(async () => {
  TestBed.resetTestingModule();
  labels.set([]);
  params.next(convertToParamMap({}));
  selected.set({ ...scope, executionMode: 'cloud' });
  for (const mock of [load, open, download]) mock.mockReset();
  await TestBed.configureTestingModule({
    imports: [VintedShippingLabelsComponent],
    providers: [
      provideRouter([]),
      {
        provide: ActivatedRoute,
        useValue: { queryParamMap: params, snapshot: { queryParamMap: params.value } },
      },
      { provide: LOCALE_ID, useValue: 'de' },
      { provide: MarketplaceAccountStore, useValue: { selectedConnection: selected } },
      {
        provide: VintedShippingLabelStore,
        useValue: {
          labels,
          loading: signal(false),
          loadError: signal(null),
          load,
          open,
          download,
        },
      },
    ],
  }).compileComponents();
});

it('listet die Versandscheine des Cloud-Kontos mit Versanddienst und Art', () => {
  labels.set([
    label(),
    label({
      id: '8',
      transactionId: '1',
      title: 'Schal',
      labelType: 'digital',
      carrierName: 'DHL',
    }),
  ]);
  const fixture = TestBed.createComponent(VintedShippingLabelsComponent);
  fixture.detectChanges();
  const element = fixture.nativeElement as HTMLElement;
  expect(load).toHaveBeenCalledWith(scope);
  const rows = [...element.querySelectorAll('tbody tr')];
  expect(rows).toHaveLength(2);
  expect(rows[0]?.textContent).toContain('DPD Shop2Shop');
  expect(rows[0]?.textContent).toContain('Druckfertig');
  expect(rows[0]?.textContent).toContain('Druck-PDF öffnen');
  expect(rows[1]?.textContent).toContain('QR-Code öffnen');
  expect(rows[1]?.querySelector('button[aria-label="QR-Code herunterladen"]')).not.toBeNull();
});

it('markiert bei einem Direktlink genau den gespeicherten Schein und fokussiert ihn', () => {
  const scroll = vi.fn();
  const prototype = HTMLElement.prototype;
  const original = Object.getOwnPropertyDescriptor(prototype, 'scrollIntoView');
  Object.defineProperty(prototype, 'scrollIntoView', { configurable: true, value: scroll });
  try {
    params.next(convertToParamMap({ labelId: '9' }));
    labels.set([label(), label({ id: '9', title: 'DHL-Schal', labelType: 'digital' })]);
    const fixture = TestBed.createComponent(VintedShippingLabelsComponent);
    fixture.detectChanges();
    TestBed.tick();
    const element = fixture.nativeElement as HTMLElement;
    const marked = element.querySelectorAll('tr[aria-current="true"]');
    expect(marked).toHaveLength(1);
    expect(marked[0].textContent).toContain('DHL-Schal');
    expect(document.activeElement).toBe(marked[0]);
    expect(scroll).toHaveBeenCalledOnce();
  } finally {
    if (original) Object.defineProperty(prototype, 'scrollIntoView', original);
    else Reflect.deleteProperty(prototype, 'scrollIntoView');
  }
});

it('öffnet und lädt einen Versandschein aus der Liste', async () => {
  labels.set([label()]);
  const fixture = TestBed.createComponent(VintedShippingLabelsComponent);
  fixture.detectChanges();
  const element = fixture.nativeElement as HTMLElement;
  [...element.querySelectorAll('button')]
    .find((button) => button.textContent?.includes('Druck-PDF öffnen'))
    ?.click();
  (
    element.querySelector('button[aria-label="Versandschein herunterladen"]') as HTMLButtonElement
  ).click();
  await fixture.whenStable();
  expect(open).toHaveBeenCalledWith(labels()[0]);
  expect(download).toHaveBeenCalledWith(labels()[0]);
});

it('lädt für lokale Konten keine Versandscheine', () => {
  selected.set({ ...scope, executionMode: 'local' });
  const fixture = TestBed.createComponent(VintedShippingLabelsComponent);
  fixture.detectChanges();
  expect(load).not.toHaveBeenCalled();
  expect((fixture.nativeElement as HTMLElement).textContent).toContain('Cloud-Konten');
});
