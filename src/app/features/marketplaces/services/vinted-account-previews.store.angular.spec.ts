import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MarketplaceAccountPreview } from '../models/marketplace-read.models';
import { createMarketplaceFixtures } from '../testing/marketplace-fixtures';
import { MarketplaceAccountStore } from './marketplace-account.store';
import { MarketplaceApiService } from './marketplace-api.service';
import { VintedAccountPreviewsStore } from './vinted-account-previews.store';

const fixtures = createMarketplaceFixtures();
const connections = signal(fixtures.connections);
const canManage = signal(true);
const readAccountPreview = vi.fn();
let store: VintedAccountPreviewsStore;
async function settle() {
  for (let pass = 0; pass < 3; pass++) {
    TestBed.tick();
    for (let step = 0; step < 8; step++) await Promise.resolve();
  }
}
beforeEach(() => {
  TestBed.resetTestingModule();
  connections.set(fixtures.connections);
  canManage.set(true);
  readAccountPreview.mockReset().mockImplementation(async (scope) => ({
    ...scope,
    profile: null,
    publicationCount: 0,
    saleCount: 0,
  }));
  TestBed.configureTestingModule({
    providers: [
      VintedAccountPreviewsStore,
      { provide: MarketplaceAccountStore, useValue: { connections, canManage } },
      { provide: MarketplaceApiService, useValue: { readAccountPreview } },
    ],
  });
  store = TestBed.inject(VintedAccountPreviewsStore);
});

describe('Vinted-Kontovorschauen', () => {
  it('verwirft verspätete Vorschauen nach einem Workspacewechsel', async () => {
    let resolve!: (value: MarketplaceAccountPreview) => void;
    readAccountPreview.mockReturnValueOnce(
      new Promise<MarketplaceAccountPreview>((yes) => {
        resolve = yes;
      }),
    );
    await settle();
    connections.set([{ ...fixtures.connections[0], workspaceId: 'other-workspace' }]);
    await settle();
    resolve({ ...fixtures.connections[0], profile: null, publicationCount: 99, saleCount: 99 });
    await settle();
    expect(store.tiles()).toHaveLength(1);
    expect(store.tiles()[0].preview?.workspaceId).toBe('other-workspace');
    expect(store.tiles()[0].preview?.saleCount).toBe(0);
  });
  it('bewahrt erfolgreiche Vorschauen beim Hintergrundladen und trennt Teilfehler', async () => {
    await settle();
    readAccountPreview.mockRejectedValueOnce(new Error('offline'));
    connections.set(
      fixtures.connections.map((account) => ({ ...account, lastSyncedAt: '2026-10-02T12:00:00Z' })),
    );
    await settle();
    expect(store.tiles()[0]).toMatchObject({
      error: true,
      loading: false,
      preview: { saleCount: 0 },
    });
    expect(store.tiles()[1]).toMatchObject({ error: false, loading: false });
  });
  it('liest für viele Konten höchstens drei Vorschauen gleichzeitig', async () => {
    let active = 0;
    let maximum = 0;
    const finish: (() => void)[] = [];
    connections.set(
      Array.from({ length: 7 }, (_, index) => ({
        ...fixtures.connections[0],
        connectionId: `account-${index}`,
      })),
    );
    readAccountPreview.mockImplementation(
      (scope) =>
        new Promise((resolve) => {
          active++;
          maximum = Math.max(maximum, active);
          finish.push(() => {
            active--;
            resolve({ ...scope, profile: null, publicationCount: 0, saleCount: 0 });
          });
        }),
    );
    await settle();
    expect(readAccountPreview).toHaveBeenCalledTimes(3);
    while (finish.length) {
      finish.splice(0).forEach((resolve) => resolve());
      await settle();
    }
    expect(maximum).toBe(3);
    expect(readAccountPreview).toHaveBeenCalledTimes(7);
    expect(store.tiles().every((tile) => !tile.loading)).toBe(true);
  });
  it('liest keine Vorschauen ohne Verwaltungszugriff', async () => {
    canManage.set(false);
    await settle();
    expect(readAccountPreview).not.toHaveBeenCalled();
  });
  it('lädt bei unveränderten Kontometadaten nicht nochmals alle Vorschauen', async () => {
    await settle();
    connections.set(fixtures.connections.map((account) => ({ ...account })));
    await settle();
    expect(readAccountPreview).toHaveBeenCalledTimes(2);
  });
});
