import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { VintedListingDetailComponent } from './vinted-listing-detail.component';
import { MarketplaceAccountStore } from '../../services/marketplace-account.store';
import { parseMarketplacePage } from '../../models/marketplace-response';
import { createMarketplaceFixtures } from '../../testing/marketplace-fixtures';
import type { MarketplaceEntry } from '../../models/marketplace-read.models';
import { listingCurrentContentFixture } from '../../../../../../services/marketplace-worker/test/fixtures/vinted-listing-current-content';

const account = createMarketplaceFixtures().connections[0];
const entry = (id: string, text = '') =>
  parseMarketplacePage(
    {
      items: [
        {
          ...account,
          id,
          title: id,
          imageUrl: `https://images.example.test/${id}.webp`,
          imageUrls: [
            `https://images.example.test/${id}.webp`,
            `https://images.example.test/${id}-2.webp`,
          ],
          text,
          textState: 'loaded',
        },
      ],
      total: 1,
      nextCursor: null,
    },
    account,
  ).items[0];
async function settle() {
  TestBed.tick();
  for (let i = 0; i < 8; i++) await Promise.resolve();
  TestBed.tick();
}
function setup(items: MarketplaceEntry[] = []) {
  const params = new BehaviorSubject(
    convertToParamMap({ connectionId: account.connectionId, entryId: 'a' }),
  );
  const readPublication = vi.fn().mockImplementation(async (_: string, id: string) => entry(id));
  const store = {
    connections: signal([account]),
    selectedConnection: signal(account),
    selectionVersion: signal(1),
    canManage: signal(true),
    loading: signal(false),
    loadingSnapshot: signal(false),
    snapshot: signal({
      ...account,
      publications: { items, total: items.length, nextCursor: null },
    }),
    listingMetricChanges: signal({}),
    consumeListingMetricChanges: () => ({}),
    readPublication,
    cachedListingDescription: vi
      .fn()
      .mockImplementation((_connectionId, item: MarketplaceEntry) => ({
        description: item.text ?? '',
        cacheState: 'stored',
      })),
    readListingDescription: vi.fn().mockResolvedValue({ description: '', cacheState: 'stored' }),
    readListingEdit: vi
      .fn()
      .mockResolvedValue({ title: 'Fresh', description: 'Fresh', price: '12' }),
    saveListingEdit: vi.fn().mockResolvedValue(undefined),
    readListingContent: vi.fn().mockImplementation(async () => listingCurrentContentFixture()),
    saveListingContent: vi.fn().mockResolvedValue(undefined),
  };
  TestBed.configureTestingModule({
    providers: [
      {
        provide: ActivatedRoute,
        useValue: { paramMap: params, snapshot: { paramMap: params.value } },
      },
      { provide: Router, useValue: { navigate: vi.fn() } },
      { provide: MarketplaceAccountStore, useValue: store },
    ],
  });
  const component = TestBed.runInInjectionContext(() => new VintedListingDetailComponent());
  return { component, store, params };
}
afterEach(() => TestBed.resetTestingModule());

describe('Reaktive Inseratdetails', () => {
  it('belegt die Bearbeitung mit dem frischen Vinted-Stand vor und speichert nur gegen diesen Stand', async () => {
    const { component, store } = setup([entry('a', 'Alt')]);
    await settle();
    await component.edit();
    const base = listingCurrentContentFixture().content;
    expect(component.editing()).toBe(true);
    expect(component.form.getRawValue()).toEqual({
      title: 'Meine Schuhe',
      description: 'Sehr gut erhalten.',
      price: '20,50',
      brand: '254956',
      size: '607',
      condition: '2',
      package: '2',
    });
    expect(component.choiceFields().map((field) => field.label)).toEqual([
      'Marke',
      'Größe',
      'Zustand',
      'Paketgröße',
    ]);
    component.toggle('color', '3', true, 2);
    expect(component.colors()).toEqual(['1', '2']);
    component.toggle('color', '2', false, 2);
    component.toggle('color', '3', true, 2);
    component.form.patchValue({ title: 'Neue Schuhe', price: '18' });
    await component.save();
    expect(store.saveListingContent).toHaveBeenCalledWith(account.connectionId, 'a', base, {
      ...base,
      title: 'Neue Schuhe',
      priceCents: 1800,
      colorIds: [1, 3],
      colorLabels: ['Blau', 'Rot'],
    });
    expect(component.editing()).toBe(false);
    expect(component.entry()).toMatchObject({ title: 'Neue Schuhe', price: 18, brand: 'Jako' });
    expect(component.notice()).toContain('bestätigt');
  });
  it('behält bei unlesbarer vollständiger Maske die bisherige Bearbeitung von Titel, Beschreibung und Preis', async () => {
    const { component, store } = setup([entry('a', 'Alt')]);
    await settle();
    store.readListingContent.mockRejectedValueOnce(new Error('private detail'));
    await component.edit();
    expect(component.editing()).toBe(true);
    expect(component.current()).toBeNull();
    expect(component.choiceFields()).toEqual([]);
    expect(component.notice()).toContain('nicht alle Angaben');
    expect(component.error()).toBeNull();
    component.form.patchValue({ title: 'Neu', price: '15,50' });
    await component.save();
    expect(store.saveListingContent).not.toHaveBeenCalled();
    expect(store.saveListingEdit).toHaveBeenCalledWith(account.connectionId, 'a', {
      title: 'Neu',
      description: 'Fresh',
      price: '15,50',
    });
    expect(component.entry()).toMatchObject({ title: 'Neu', price: 15.5 });
    expect(component.editing()).toBe(false);
  });
  it('lässt die Eingabe bei einem Konflikt oder unbestätigtem Speichern offen und meldet keinen Erfolg', async () => {
    const { component, store } = setup([entry('a', 'Alt')]);
    await settle();
    await component.edit();
    store.saveListingContent.mockRejectedValueOnce(new Error('inzwischen bei Vinted geändert'));
    component.form.patchValue({ title: 'Neue Schuhe' });
    await component.save();
    expect(component.editing()).toBe(true);
    expect(component.form.controls.title.value).toBe('Neue Schuhe');
    expect(component.error()).toContain('inzwischen');
    expect(component.notice()).toBeNull();
    expect(component.entry()?.title).toBe('a');
  });
  it('reopenedLoadedEntryUsesConfirmedSessionDescriptionWithoutAnotherProviderRead', async () => {
    const { component, store } = setup([entry('a', 'Alter Datenbanktext')]);
    store.cachedListingDescription.mockReturnValue({
      description: 'Bestätigter neuer Sitzungstext',
      cacheState: 'unconfirmed',
    });
    await settle();
    expect(component.description()).toEqual({
      description: 'Bestätigter neuer Sitzungstext',
      cacheState: 'unconfirmed',
    });
    expect(store.readListingDescription).not.toHaveBeenCalled();
    expect(store.readPublication).not.toHaveBeenCalled();
  });
  it('detailRouteChangeResetsPhoto und verwirft den Rücklauf des vorherigen Inserats', async () => {
    const { component, store, params } = setup();
    let resolve!: (value: MarketplaceEntry) => void;
    store.readPublication.mockReturnValueOnce(
      new Promise<MarketplaceEntry>((yes) => {
        resolve = yes;
      }),
    );
    await settle();
    component.selectedPhoto.set('/images/old-selection.webp');
    params.next(convertToParamMap({ connectionId: account.connectionId, entryId: 'b' }));
    await settle();
    expect(component.entry()?.id).toBe('b');
    expect(component.selectedPhoto()).toBe('https://images.example.test/b.webp');
    resolve(entry('a'));
    await settle();
    expect(component.entry()?.id).toBe('b');
    expect(component.selectedPhoto()).toBe('https://images.example.test/b.webp');
  });
  it('zeigt bekannte Snapshotdaten sofort und öffnet für leeren geladenen Text keinen Browser', async () => {
    const { component, store } = setup([entry('a')]);
    TestBed.tick();
    expect(component.entry()?.id).toBe('a');
    expect(component.loading()).toBe(false);
    expect(store.readListingDescription).not.toHaveBeenCalled();
  });
});
