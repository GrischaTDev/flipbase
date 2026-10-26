import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { afterEach, expect, it, vi } from 'vitest';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import { MarketplaceAccountStore } from '../../services/marketplace-account.store';
import { MarketplaceListingStatisticsStore } from '../../services/marketplace-listing-statistics.store';
import { MarketplaceApiService } from '../../services/marketplace-api.service';
import { createMarketplaceFixtures } from '../../testing/marketplace-fixtures';
import { VintedListingsComponent } from './vinted-listings.component';
import { parseMarketplacePage } from '../../models/marketplace-response';

const [accountA, accountB] = createMarketplaceFixtures().connections;
afterEach(() => TestBed.resetTestingModule());

function setup(connectionId: string) {
  const query = new BehaviorSubject(convertToParamMap({ connectionId }));
  const connections = signal<(typeof accountA)[]>([]);
  const selectedConnection = signal(accountA);
  const loading = signal(true);
  const store = {
    connections,
    canManage: signal(true),
    selectedConnection,
    loading,
    loadingSnapshot: signal(false),
    selectionVersion: signal(1),
    snapshot: signal(null),
    listingMetricChanges: signal({}),
    consumeListingMetricChanges: () => ({}),
    saveListingPrice: vi.fn().mockResolvedValue(undefined),
    async selectConnection(id: string) {
      this.selectionVersion.update((value) => value + 1);
      const account = connections().find((item) => item.connectionId === id);
      if (account) selectedConnection.set(account);
    },
  };
  TestBed.configureTestingModule({
    providers: [
      MarketplaceListingStatisticsStore,
      { provide: MarketplaceApiService, useValue: { readListingStatistics: vi.fn() } },
      { provide: MarketplaceAccountStore, useValue: store },
      {
        provide: WorkspaceService,
        useValue: { currentWorkspace: signal({ id: accountA.workspaceId }) },
      },
      {
        provide: ActivatedRoute,
        useValue: { queryParamMap: query, snapshot: { queryParamMap: query.value } },
      },
      {
        provide: Router,
        useValue: {
          async navigate() {
            query.next(convertToParamMap({}));
            return true;
          },
        },
      },
    ],
  });
  const component = TestBed.runInInjectionContext(() => new VintedListingsComponent());
  return { component, store, query };
}

it('wählt das Konto aus einem Favoritenlink nach dem Laden einmalig und respektiert danach Deinen Kontowechsel', async () => {
  const { store } = setup(accountB.connectionId);
  TestBed.tick();
  expect(store.selectedConnection().connectionId).toBe(accountA.connectionId);
  store.connections.set([accountA, accountB]);
  store.loading.set(false);
  TestBed.tick();
  await Promise.resolve();
  TestBed.tick();
  expect(store.selectedConnection().connectionId).toBe(accountB.connectionId);
  await store.selectConnection(accountA.connectionId);
  TestBed.tick();
  expect(store.selectedConnection().connectionId).toBe(accountA.connectionId);
});

it('verbraucht den Linkparameter, damit ein neuer Mount nach manuellem Kontowechsel nicht zurückwählt', async () => {
  const { store, query } = setup(accountB.connectionId);
  store.connections.set([accountA, accountB]);
  store.loading.set(false);
  TestBed.tick();
  await Promise.resolve();
  TestBed.tick();
  expect(query.value.get('connectionId')).toBeNull();
  await store.selectConnection(accountA.connectionId);
  TestBed.runInInjectionContext(() => new VintedListingsComponent());
  TestBed.tick();
  expect(store.selectedConnection().connectionId).toBe(accountA.connectionId);
});

it.each(['foreign-account', ''])('ignoriert einen fremden oder leeren Kontoquery %j', (id) => {
  const { store } = setup(id);
  const select = vi.spyOn(store, 'selectConnection');
  store.connections.set([accountA, accountB]);
  store.loading.set(false);
  TestBed.tick();
  expect(store.selectedConnection().connectionId).toBe(accountA.connectionId);
  expect(select).not.toHaveBeenCalled();
});

it('akzeptiert auch eine bekannte Konto-ID nur aus Deinem aktuellen Workspace', () => {
  const { store } = setup(accountB.connectionId);
  store.connections.set([accountA, { ...accountB, workspaceId: 'foreign-workspace' }]);
  store.loading.set(false);
  TestBed.tick();
  expect(store.selectedConnection().connectionId).toBe(accountA.connectionId);
});

it('bindet keine Statistik mehr in den Kleiderschrank ein', async () => {
  const { readFile } = await import('node:fs/promises');
  const template = await readFile(
    'src/app/features/marketplaces/components/vinted-listings/vinted-listings.component.html',
    'utf8',
  );
  expect(template).not.toContain('app-vinted-wardrobe-statistics');
});

it('öffnet den Preisdialog ohne Detailnavigation und erhält Eingaben nach einem Fehler', async () => {
  const { component, store } = setup('');
  TestBed.tick();
  const entry = parseMarketplacePage(
    {
      items: [
        {
          ...accountA,
          id: 'price-1',
          title: 'Schal',
          price: 29.9,
          currency: 'EUR',
          publicationState: 'active',
        },
      ],
      total: 1,
      nextCursor: null,
    },
    accountA,
  ).items[0];
  component.changePrice(entry, new MouseEvent('click'));
  expect(component.priceEditor.open()).toBe(true);
  expect(component.priceEditor.control.value).toBe(29.9);
  component.priceEditor.control.setValue(25);
  store.saveListingPrice.mockRejectedValueOnce(new Error('Nicht bestätigt'));
  await component.priceEditor.save();
  expect(component.priceEditor.control.value).toBe(25);
  expect(component.priceEditor.error()).toBe('Nicht bestätigt');
  expect(component.priceEditor.open()).toBe(true);
  expect(component.priceNotice()).toBe(null);
  await component.priceEditor.save();
  expect(store.saveListingPrice).toHaveBeenLastCalledWith(
    accountA.connectionId,
    'price-1',
    2990,
    2500,
  );
  expect(component.priceEditor.open()).toBe(false);
  expect(component.priceNotice()).toContain('bestätigt');
});

it('erhält Preisdialog und laufende Speicherung bei einer Hintergrundaktualisierung desselben Kontos', async () => {
  const { component, store } = setup('');
  TestBed.tick();
  const entry = parseMarketplacePage(
    {
      items: [{ ...accountA, id: 'price-1', price: 29.9, currency: 'EUR' }],
      total: 1,
      nextCursor: null,
    },
    accountA,
  ).items[0];
  component.changePrice(entry, new MouseEvent('click'));
  component.priceEditor.control.setValue(25);
  store.selectedConnection.set({ ...store.selectedConnection() });
  TestBed.tick();
  expect(component.priceEditor.open()).toBe(true);
  expect(component.priceEditor.control.value).toBe(25);
  let finish!: () => void;
  store.saveListingPrice.mockReturnValueOnce(new Promise<void>((resolve) => (finish = resolve)));
  const saving = component.priceEditor.save();
  store.selectedConnection.set({ ...store.selectedConnection() });
  TestBed.tick();
  expect(component.savingPrice()).toBe(true);
  expect(component.priceEditor.open()).toBe(true);
  await component.priceEditor.save();
  expect(store.saveListingPrice).toHaveBeenCalledOnce();
  finish();
  await saving;
  expect(component.priceNotice()).toContain('bestätigt');
});

it('schließt bei einem Kontowechsel den Preisdialog und verwirft verspätete Antworten', async () => {
  const { component, store } = setup('');
  TestBed.tick();
  const entry = parseMarketplacePage(
    {
      items: [{ ...accountA, id: 'price-1', price: 29.9, currency: 'EUR' }],
      total: 1,
      nextCursor: null,
    },
    accountA,
  ).items[0];
  component.changePrice(entry, new MouseEvent('click'));
  component.priceEditor.control.setValue(25);
  let finish!: () => void;
  store.saveListingPrice.mockReturnValueOnce(new Promise<void>((resolve) => (finish = resolve)));
  const saving = component.priceEditor.save();
  await component.priceEditor.save();
  component.priceEditor.close();
  expect(component.priceEditor.open()).toBe(true);
  expect(store.saveListingPrice).toHaveBeenCalledOnce();
  store.selectionVersion.update((version) => version + 1);
  TestBed.tick();
  finish();
  await saving;
  expect(component.priceEditor.open()).toBe(false);
  expect(component.priceEntry()).toBe(null);
  expect(component.priceNotice()).toBe(null);
});
