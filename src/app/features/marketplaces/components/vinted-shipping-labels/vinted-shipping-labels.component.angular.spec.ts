import { LOCALE_ID, signal } from '@angular/core';
import { registerLocaleData } from '@angular/common';
import localeDe from '@angular/common/locales/de';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
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
  selected.set({ ...scope, executionMode: 'cloud' });
  for (const mock of [load, open, download]) mock.mockReset();
  await TestBed.configureTestingModule({
    imports: [VintedShippingLabelsComponent],
    providers: [
      provideRouter([]),
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
  expect(rows[1]?.textContent).toContain('QR-Code');
});

it('öffnet und lädt einen Versandschein aus der Liste', async () => {
  labels.set([label()]);
  const fixture = TestBed.createComponent(VintedShippingLabelsComponent);
  fixture.detectChanges();
  const element = fixture.nativeElement as HTMLElement;
  [...element.querySelectorAll('button')]
    .find((button) => button.textContent?.includes('Öffnen'))
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
