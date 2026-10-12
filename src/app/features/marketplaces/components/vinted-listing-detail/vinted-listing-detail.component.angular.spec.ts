import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import axe from 'axe-core';
import { prepareMarketplaceRendering } from '../../../../../../e2e/support/marketplace-rendering';
import { AttributePickerComponent } from '../../../../shared/components/attribute-picker/attribute-picker.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { CardComponent } from '../../../../shared/components/card/card.component';
import { CustomCheckboxComponent } from '../../../../shared/components/custom-checkbox/custom-checkbox.component';
import { CustomSelectComponent } from '../../../../shared/components/custom-select/custom-select.component';
import { EntryPageLayoutComponent } from '../../../../shared/components/entry-page-layout/entry-page-layout.component';
import { NoticeBannerComponent } from '../../../../shared/components/notice-banner/notice-banner.component';
import { ProductThumbnailComponent } from '../../../../shared/components/product-thumbnail/product-thumbnail.component';
import { TextFieldComponent } from '../../../../shared/components/text-field/text-field.component';
import { TwoColumnLayoutComponent } from '../../../../shared/components/two-column-layout/two-column-layout.component';
import { VintedListingMetricsComponent } from '../vinted-listings/vinted-listing-metrics.component';
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
let restoreRendering: (() => void) | undefined;
beforeAll(async () => {
  const shared = 'src/app/shared/components/';
  restoreRendering = await prepareMarketplaceRendering([
    {
      type: VintedListingDetailComponent,
      path: 'src/app/features/marketplaces/components/vinted-listing-detail/vinted-listing-detail.component.ts',
    },
    {
      type: VintedListingMetricsComponent,
      path: 'src/app/features/marketplaces/components/vinted-listings/vinted-listing-metrics.component.ts',
    },
    {
      type: AttributePickerComponent,
      path: shared + 'attribute-picker/attribute-picker.component.ts',
    },
    { type: ButtonComponent, path: shared + 'button/button.component.ts' },
    { type: CardComponent, path: shared + 'card/card.component.ts' },
    {
      type: CustomCheckboxComponent,
      path: shared + 'custom-checkbox/custom-checkbox.component.ts',
    },
    { type: CustomSelectComponent, path: shared + 'custom-select/custom-select.component.ts' },
    {
      type: EntryPageLayoutComponent,
      path: shared + 'entry-page-layout/entry-page-layout.component.ts',
    },
    { type: NoticeBannerComponent, path: shared + 'notice-banner/notice-banner.component.ts' },
    {
      type: ProductThumbnailComponent,
      path: shared + 'product-thumbnail/product-thumbnail.component.ts',
    },
    { type: TextFieldComponent, path: shared + 'text-field/text-field.component.ts' },
    {
      type: TwoColumnLayoutComponent,
      path: shared + 'two-column-layout/two-column-layout.component.ts',
    },
  ]);
});
afterAll(() => restoreRendering?.());
afterEach(() => TestBed.resetTestingModule());

describe('Reaktive Inseratdetails', () => {
  it('öffnet die Maske sofort mit gespeicherten Angaben und lädt den Vinted-Stand im Hintergrund', async () => {
    const { component, store } = setup([entry('a', 'Gespeicherter Text')]);
    await settle();
    let finishRead: (value: ReturnType<typeof listingCurrentContentFixture>) => void = () =>
      undefined;
    store.readListingContent.mockReturnValueOnce(new Promise((resolve) => (finishRead = resolve)));
    const opening = component.edit();
    // Ohne Wartezeit sichtbar: Titel und Beschreibung aus den gespeicherten Daten.
    expect(component.editing()).toBe(true);
    expect(component.loadingCurrent()).toBe(true);
    expect(component.form.controls.title.value).toBe('a');
    expect(component.form.controls.description.value).toBe('Gespeicherter Text');
    // Gespeichert werden darf erst auf einem von Vinted gelesenen Stand.
    expect(component.canSave()).toBe(false);
    await component.save();
    expect(store.saveListingContent).not.toHaveBeenCalled();
    expect(store.saveListingEdit).not.toHaveBeenCalled();
    // Eine Eingabe während des Ladens bleibt erhalten; unberührte Felder übernehmen den Stand.
    component.form.controls.title.setValue('Eigene Eingabe');
    component.form.controls.title.markAsDirty();
    finishRead(listingCurrentContentFixture());
    await opening;
    expect(component.loadingCurrent()).toBe(false);
    expect(component.canSave()).toBe(true);
    expect(component.form.controls.title.value).toBe('Eigene Eingabe');
    expect(component.form.controls.description.value).toBe('Sehr gut erhalten.');
    expect(component.packageChoice()?.field).toBe('package');
    expect(component.articleChoiceFields().some((choice) => choice.field === 'package')).toBe(
      false,
    );
  });
  it('verwirft beim Abbrechen den noch laufenden Vinted-Abruf', async () => {
    const { component, store } = setup([entry('a', 'Alt')]);
    await settle();
    let finishRead: (value: ReturnType<typeof listingCurrentContentFixture>) => void = () =>
      undefined;
    store.readListingContent.mockReturnValueOnce(new Promise((resolve) => (finishRead = resolve)));
    const opening = component.edit();
    component.cancelEdit();
    expect(component.editing()).toBe(false);
    expect(component.loadingCurrent()).toBe(false);
    finishRead(listingCurrentContentFixture());
    await opening;
    expect(component.editing()).toBe(false);
    expect(component.current()).toBeNull();
  });
  it('zeigt die Bearbeitung im Aufbau der Erstellen-Maske mit Fotos zuerst und ohne Barrierefehler', async () => {
    const { store } = setup([entry('a', 'Alt')]);
    const fixture = TestBed.createComponent(VintedListingDetailComponent);
    fixture.detectChanges();
    await settle();
    fixture.detectChanges();
    await fixture.componentInstance.edit();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(store.readListingContent).toHaveBeenCalled();
    expect(element.querySelector('h1')?.textContent).toContain('Inserat bearbeiten');
    const headings = [...element.querySelectorAll('h2, h3')].map((heading) =>
      heading.textContent?.trim(),
    );
    expect(headings.indexOf('Fotos')).toBe(0);
    expect(headings).toContain('Artikelangaben');
    expect(headings).toContain('Preis und Versand');
    expect(element.querySelectorAll('[aria-label="Fotos des Inserats"] button')).toHaveLength(2);
    // Farben und Material sind Auswahlboxen, keine Checkbox-Listen.
    expect(element.querySelectorAll('app-attribute-picker')).toHaveLength(2);
    expect(element.querySelector('[role="checkbox"]')).toBeNull();
    expect(element.textContent).toContain('Blau');
    expect(element.textContent).toContain('Gelb');
    expect(element.textContent).toContain('Kategorie:');
    expect(element.textContent).not.toContain('Zurück zu Inseraten');
    const result = await axe.run(element, { rules: { 'color-contrast': { enabled: false } } });
    expect(result.violations.map((violation) => violation.id)).toEqual([]);
  });
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
      color: 'Blau · Gelb',
      material: 'Acryl',
    });
    expect(component.multipleFields()).toEqual([
      { field: 'color', label: 'Farben', max: 2, options: ['Blau', 'Gelb', 'Rot'] },
      { field: 'material', label: 'Material', max: 3, options: ['Acryl'] },
    ]);
    expect(component.choiceFields().map((field) => field.label)).toEqual([
      'Marke',
      'Größe',
      'Zustand',
      'Paketgröße',
    ]);
    // Die Auswahlbox liefert Bezeichnungen; gespeichert werden Vinteds Kennungen.
    component.form.patchValue({ title: 'Neue Schuhe', price: '18', color: 'Blau · Rot' });
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
