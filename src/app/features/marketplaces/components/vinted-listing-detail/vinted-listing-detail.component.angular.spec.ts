import { signal } from '@angular/core';
import { AuthService } from '../../../../core/services/auth.service';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import { NumberInputComponent } from '../../../../shared/components/number-input/number-input.component';
import { VintedListingPriceDialogComponent } from '../vinted-listing-price-dialog/vinted-listing-price-dialog.component';
import { VintedListingPriceChangedError } from '../../services/marketplace-browser-test-api.service';
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
import { ImageCropperModalComponent } from '../../../../shared/components/image-cropper-modal/image-cropper-modal.component';
import { ProductMediaEditorComponent } from '../../../../shared/components/product-media-editor/product-media-editor.component';
import { ModalShellComponent } from '../../../../shared/components/modal-shell/modal-shell.component';
import { NoticeBannerComponent } from '../../../../shared/components/notice-banner/notice-banner.component';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { ProductThumbnailComponent } from '../../../../shared/components/product-thumbnail/product-thumbnail.component';
import { ProductGalleryComponent } from '../../../../shared/components/product-gallery/product-gallery.component';
import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import { VintedListingAgeComponent } from '../vinted-listing-age/vinted-listing-age.component';
import { TextFieldComponent } from '../../../../shared/components/text-field/text-field.component';
import { TwoColumnLayoutComponent } from '../../../../shared/components/two-column-layout/two-column-layout.component';
import { VintedListingMetricsComponent } from '../vinted-listings/vinted-listing-metrics.component';
import { VintedListingDetailComponent } from './vinted-listing-detail.component';
import { MarketplaceAccountStore } from '../../services/marketplace-account.store';
import { parseMarketplacePage } from '../../models/marketplace-response';
import { createMarketplaceFixtures } from '../../testing/marketplace-fixtures';
import type { VintedListingDescription } from '../../models/vinted-listing-description';
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
      .fn<(connectionId: string, item: MarketplaceEntry) => VintedListingDescription | null>()
      .mockImplementation((_connectionId, item: MarketplaceEntry) => ({
        description: item.text ?? '',
        cacheState: 'stored',
      })),
    readListingDescription: vi.fn().mockResolvedValue({ description: '', cacheState: 'stored' }),
    readListingEdit: vi
      .fn()
      .mockResolvedValue({ title: 'Fresh', description: 'Fresh', price: '12' }),
    saveListingEdit: vi.fn().mockResolvedValue(undefined),
    saveListingPrice: vi.fn().mockResolvedValue(undefined),
    readListingContent: vi.fn().mockImplementation(async () => listingCurrentContentFixture()),
    saveListingContent: vi.fn().mockResolvedValue(undefined),
  };
  TestBed.configureTestingModule({
    providers: [
      { provide: AuthService, useValue: { currentUser: signal({ id: 'price-user' }) } },
      {
        provide: WorkspaceService,
        useValue: { currentWorkspace: signal({ id: account.workspaceId }) },
      },
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
      type: VintedListingPriceDialogComponent,
      path: 'src/app/features/marketplaces/components/vinted-listing-price-dialog/vinted-listing-price-dialog.component.ts',
    },
    { type: NumberInputComponent, path: shared + 'number-input/number-input.component.ts' },
    {
      type: ProductGalleryComponent,
      path: shared + 'product-gallery/product-gallery.component.ts',
    },
    { type: BadgeComponent, path: shared + 'badge/badge.component.ts' },
    {
      type: VintedListingAgeComponent,
      path: 'src/app/features/marketplaces/components/vinted-listing-age/vinted-listing-age.component.ts',
    },
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
    {
      type: ProductMediaEditorComponent,
      path: shared + 'product-media-editor/product-media-editor.component.ts',
    },
    {
      type: ImageCropperModalComponent,
      path: shared + 'image-cropper-modal/image-cropper-modal.component.ts',
    },
    { type: ModalShellComponent, path: shared + 'modal-shell/modal-shell.component.ts' },
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
  it('zeigt private Originale und behält Anbieteradressen nur als Fotoschlüssel', async () => {
    const listing = listingCurrentContentFixture();
    const { component, store } = setup([
      {
        ...entry('a', listing.content.description),
        listingContent: listing.content,
        providerImageUrls: listing.photoUrls,
        imageUrls: ['https://private.example.test/first', 'https://private.example.test/second'],
      },
    ]);
    await settle();
    component.edit();
    expect(component.photoDrafts().map((photo) => photo.previewUrl)).toEqual([
      'https://private.example.test/first',
      'https://private.example.test/second',
    ]);
    expect(component.photoDrafts().map((photo) => photo.key)).toEqual(listing.photoUrls);
    expect(store.readListingContent).not.toHaveBeenCalled();
  });
  it('öffnet die Bearbeitung ohne Anbieterabruf und zeigt gespeicherte Werte sofort', async () => {
    const listing = listingCurrentContentFixture();
    const { component, store } = setup([
      { ...entry('a', 'Gespeichert'), price: 20.5, listingContent: listing.content },
    ]);
    await settle();
    await component.edit();
    expect(store.readListingContent).not.toHaveBeenCalled();
    expect(store.readListingEdit).not.toHaveBeenCalled();
    expect(component.canSave()).toBe(true);
    expect(component.form.controls.description.value).toBe('Gespeichert');
    expect(component.form.controls.title.value).toBe('a');
  });
  it('zeigt die Beschreibung ohne Aufklappen', async () => {
    setup([entry('a', 'Immer sichtbarer Text')]);
    const fixture = TestBed.createComponent(VintedListingDetailComponent);
    fixture.detectChanges();
    await settle();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('details')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Immer sichtbarer Text');
  });
  it('öffnet Preisänderung ohne Abruf und erhält Eingaben nach einem Speicherfehler', async () => {
    const { component, store } = setup([
      { ...entry('a'), price: 20.5, currency: 'EUR', publicationState: 'active' },
    ]);
    await settle();
    component.openPriceChange();
    expect(component.changingPrice()).toBe(true);
    expect(component.priceControl.value).toBe(20.5);
    expect(store.readListingContent).not.toHaveBeenCalled();
    component.priceControl.setValue(10);
    store.saveListingPrice.mockRejectedValueOnce(new Error('Nicht bestätigt'));
    await component.savePrice();
    expect(component.changingPrice()).toBe(false);
    expect(component.priceControl.value).toBe(10);
    expect(component.priceError()).toBe('Nicht bestätigt');
    expect(component.entry()?.price).toBe(20.5);
    component.openPriceChange();
    component.priceControl.setValue(10);
    await component.savePrice();
    expect(store.saveListingPrice).toHaveBeenLastCalledWith(account.connectionId, 'a', 2050, 1000);
    expect(component.changingPrice()).toBe(false);
    expect(component.entry()?.price).toBe(10);
  });
  it('öffnet die Bearbeitung unabhängig vom Beschreibungscache', async () => {
    const { component } = setup([entry('a')]);
    await settle();
    await component.edit();
    expect(component.editing()).toBe(true);
  });
  it('zeigt nach einem Konflikt den aktuellen Preis und nutzt ihn erst beim erneuten Speichern als Basis', async () => {
    const { component, store } = setup([{ ...entry('a'), price: 20.5, currency: 'EUR' }]);
    await settle();
    component.openPriceChange();
    component.priceControl.setValue(10);
    store.saveListingPrice.mockRejectedValueOnce(new VintedListingPriceChangedError(1800));
    await component.savePrice();
    expect(component.priceError()).toContain('18,00');
    expect(component.priceControl.value).toBe(10);
    expect(component.changingPrice()).toBe(false);
    expect(store.saveListingPrice).toHaveBeenCalledOnce();
    component.openPriceChange();
    component.priceControl.setValue(10);
    await component.savePrice();
    expect(store.saveListingPrice).toHaveBeenLastCalledWith(account.connectionId, 'a', 1800, 1000);
    expect(component.entry()?.price).toBe(10);
  });
  it('öffnet unbekannte Beschreibungen ohne Vinted-Abruf und zeigt später den Hintergrundabgleich', async () => {
    const unknown = { ...entry('a'), text: null, textState: 'not_loaded' as const };
    const { component, store } = setup([unknown]);
    store.cachedListingDescription.mockImplementation((_connectionId, item) =>
      item.text === null ? null : { description: item.text, cacheState: 'stored' },
    );
    await settle();
    expect(component.description()).toBeNull();
    expect(store.readListingDescription).not.toHaveBeenCalled();
    expect(store.readListingContent).not.toHaveBeenCalled();
    store.snapshot.update((snapshot) => ({
      ...snapshot,
      publications: { ...snapshot.publications, items: [entry('a', 'Im Hintergrund gespeichert')] },
    }));
    await settle();
    expect(component.description()?.description).toBe('Im Hintergrund gespeichert');
    expect(store.readListingDescription).not.toHaveBeenCalled();
  });
  it('bricht lokale Änderungen ohne Anbieterkommunikation ab', async () => {
    const { component, store } = setup([{ ...entry('a'), price: 20.5, currency: 'EUR' }]);
    await settle();
    component.edit();
    component.form.controls.title.setValue('Verworfen');
    component.cancelEdit();
    component.edit();
    expect(component.form.controls.title.value).toBe('a');
    expect(store.readListingContent).not.toHaveBeenCalled();
    expect(store.readListingEdit).not.toHaveBeenCalled();
  });
  it('sperrt doppeltes Speichern und Schließen und ignoriert eine Antwort nach Routenwechsel', async () => {
    const { component, store, params } = setup([{ ...entry('a'), price: 20.5, currency: 'EUR' }]);
    await settle();
    component.openPriceChange();
    component.priceControl.setValue(10);
    let resolve!: () => void;
    store.saveListingPrice.mockReturnValueOnce(
      new Promise<void>((done) => {
        resolve = done;
      }),
    );
    const saving = component.savePrice();
    component.closePriceChange();
    await component.savePrice();
    expect(store.saveListingPrice).toHaveBeenCalledOnce();
    expect(component.changingPrice()).toBe(false);
    expect(component.priceControl.disabled).toBe(true);
    params.next(convertToParamMap({ connectionId: account.connectionId, entryId: 'b' }));
    await settle();
    resolve();
    await saving;
    expect(component.entry()?.id).toBe('b');
    expect(component.notice()).toBe(null);
    expect(component.changingPrice()).toBe(false);
  });
  it('liest Vinted erst beim Speichern und bewahrt Eingaben bei Lesefehlern', async () => {
    const listing = listingCurrentContentFixture();
    const { component, store } = setup([
      { ...entry('a', 'Alt'), listingContent: listing.content, price: 20.5 },
    ]);
    await settle();
    component.edit();
    component.form.controls.title.setValue('Eigene Eingabe');
    expect(component.canSave()).toBe(true);
    expect(store.readListingContent).not.toHaveBeenCalled();
    store.readListingContent.mockRejectedValueOnce(new Error('Nicht erreichbar'));
    await component.save();
    expect(component.form.controls.title.value).toBe('Eigene Eingabe');
    expect(component.editing()).toBe(true);
    expect(component.error()).toBe('Nicht erreichbar');
    expect(store.saveListingContent).not.toHaveBeenCalled();
  });
  it('ändert Titelbild und Fotoauswahl nur auf dem gelesenen Vinted-Stand und speichert die neue Reihenfolge', async () => {
    const { component, store } = setup([
      {
        ...entry('a', 'Sehr gut erhalten.'),
        title: 'Meine Schuhe',
        price: 20.5,
        listingContent: listingCurrentContentFixture().content,
        imageUrls: listingCurrentContentFixture().photoUrls,
      },
    ]);
    await settle();
    const listing = listingCurrentContentFixture();
    const [first, second] = listing.photoUrls;
    component.edit();
    const drafts = (...urls: (string | undefined)[]) =>
      component.photoDrafts().filter((draft) => urls.includes(draft.key));
    const ordered = (...urls: (string | undefined)[]) =>
      urls.map((url) => component.photoDrafts().find((draft) => draft.key === url)!);
    expect(component.canArrangePhotos()).toBe(true);
    expect(component.photos()).toEqual([first, second]);
    expect(component.photoDrafts().map((draft) => draft.fileName)).toEqual(['Foto 1', 'Foto 2']);
    // Der Bildeditor meldet die neue Reihenfolge: Das zweite Foto wird Titelbild.
    component.onPhotoDraftsChanged(ordered(second, first));
    expect(component.photos()).toEqual([second, first]);
    // Zurück in die alte Reihenfolge gilt als unverändert.
    component.onPhotoDraftsChanged(ordered(first, second));
    expect(component.photos()).toEqual([first, second]);
    component.onPhotoDraftsChanged(drafts(first));
    expect(component.photos()).toEqual([first]);
    // Ohne Foto oder mit einem fremden Bild bleibt der Stand unverändert.
    component.onPhotoDraftsChanged([]);
    component.onPhotoDraftsChanged([
      { key: 'neu', media: null, file: null, fileName: 'neu.jpg', previewUrl: '' },
    ]);
    expect(component.photos()).toEqual([first]);
    await component.save();
    expect(store.saveListingContent).toHaveBeenCalledWith(
      account.connectionId,
      'a',
      listing.content,
      listing.content,
      { base: [first, second], desired: [first] },
    );
    expect(component.entry()).toMatchObject({ imageUrl: first, imageUrls: [first] });
  });
  it('verwirft den Speicherabruf nach Routenwechsel vor einem Schreibaufruf', async () => {
    const listing = listingCurrentContentFixture();
    const { component, store, params } = setup([
      {
        ...entry('a', listing.content.description),
        title: listing.content.title,
        price: 20.5,
        listingContent: listing.content,
      },
    ]);
    await settle();
    component.edit();
    component.form.controls.title.setValue('Neu');
    let finishRead: (value: typeof listing) => void = () => undefined;
    store.readListingContent.mockReturnValueOnce(new Promise((resolve) => (finishRead = resolve)));
    const saving = component.save();
    params.next(convertToParamMap({ connectionId: account.connectionId, entryId: 'b' }));
    await settle();
    finishRead(listing);
    await saving;
    expect(component.entry()?.id).toBe('b');
    expect(store.saveListingContent).not.toHaveBeenCalled();
  });
  it('zeigt die Bearbeitung im Aufbau der Erstellen-Maske mit Fotos zuerst und ohne Barrierefehler', async () => {
    const { store } = setup([
      {
        ...entry('a', 'Sehr gut erhalten.'),
        title: 'Meine Schuhe',
        price: 20.5,
        listingContent: listingCurrentContentFixture().content,
        imageUrls: listingCurrentContentFixture().photoUrls,
      },
    ]);
    const fixture = TestBed.createComponent(VintedListingDetailComponent);
    fixture.detectChanges();
    await settle();
    fixture.detectChanges();
    await fixture.componentInstance.edit();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(store.readListingContent).not.toHaveBeenCalled();
    expect(element.querySelector('h1')?.textContent).toContain('Inserat bearbeiten');
    const headings = [...element.querySelectorAll('h2, h3')].map((heading) =>
      heading.textContent?.trim(),
    );
    // Fotos stehen zuerst; die Artikelangaben folgen in der rechten Spalte auf Preis und Versand.
    expect(headings.indexOf('Fotos')).toBe(0);
    expect(headings.indexOf('Artikelangaben')).toBeGreaterThan(
      headings.indexOf('Preis und Versand'),
    );
    // Derselbe Bild-Baustein wie auf der Produktseite: großes Hauptbild, Ziehen direkt am Bild.
    const editor = element.querySelector('app-product-media-editor')!;
    // Vorhandene Fotos lassen sich verschieben und entfernen; eine Kachel zum Hinzufügen fehlt.
    expect(editor.querySelectorAll('li')).toHaveLength(2);
    expect(editor.querySelector('[data-add-media]')).toBeNull();
    expect(editor.querySelector<HTMLInputElement>('input[type="file"]')?.disabled).toBe(true);
    expect(
      [...editor.querySelectorAll('button')].map((button) => button.getAttribute('aria-label')),
    ).toEqual(['Hauptbild: Foto 1, Details öffnen', 'Bild 2: Foto 2, Details öffnen']);
    // Die Bilddetails bieten Position und Löschen, aber weder Bildname noch Zuschneiden.
    editor.querySelectorAll('button')[1]!.click();
    fixture.detectChanges();
    const details = element.querySelector('app-modal-shell')!;
    expect(details.textContent).toContain('Position in der Galerie');
    expect(details.textContent).toContain('Bild löschen');
    expect(details.textContent).not.toContain('Bildname');
    expect(details.textContent).not.toContain('Zuschneiden');
    [...details.querySelectorAll('button')]
      .find((button) => button.textContent?.trim() === 'Abbrechen')!
      .click();
    fixture.detectChanges();
    expect(element.querySelector('app-modal-shell')).toBeNull();
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
  it('belegt die Bearbeitung lokal vor und übersetzt die Auswahl erst beim Speichern', async () => {
    const { component, store } = setup([
      {
        ...entry('a', 'Sehr gut erhalten.'),
        title: 'Meine Schuhe',
        price: 20.5,
        listingContent: listingCurrentContentFixture().content,
        imageUrls: listingCurrentContentFixture().photoUrls,
      },
    ]);
    await settle();
    await component.edit();
    const base = listingCurrentContentFixture().content;
    expect(component.editing()).toBe(true);
    expect(component.form.getRawValue()).toEqual({
      title: 'Meine Schuhe',
      description: 'Sehr gut erhalten.',
      price: '20,50',
      brand: '254956',
      size: '13',
      condition: '3',
      package: '2',
      color: 'Gelb · Blau',
      material: 'Acryl',
    });
    expect(component.multipleFields().find((field) => field.field === 'color')?.options).toContain(
      'Rot',
    );
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
    expect(component.notice()).toBeNull();
    expect(TestBed.inject(ToastService).toasts()).toMatchObject([
      { type: 'success', title: 'Inserat erfolgreich geändert' },
    ]);
  });
  it('bewahrt eine unbekannte Beschreibung beim Speichern einer reinen Titeländerung', async () => {
    const { component, store } = setup([
      { ...entry('a'), text: null, textState: 'not_loaded', price: 12 },
    ]);
    store.cachedListingDescription.mockImplementation(() => null);
    await settle();
    component.edit();
    expect(component.canSave()).toBe(true);
    expect(store.readListingEdit).not.toHaveBeenCalled();
    component.form.patchValue({ title: 'Neu' });
    await component.save();
    expect(store.saveListingEdit).toHaveBeenCalledWith(account.connectionId, 'a', {
      title: 'Neu',
      description: 'Fresh',
      price: '12,00',
    });
  });
  it('lässt die Eingabe bei einem Konflikt oder unbestätigtem Speichern offen und meldet keinen Erfolg', async () => {
    const { component, store } = setup([
      {
        ...entry('a', 'Sehr gut erhalten.'),
        title: 'Meine Schuhe',
        price: 20.5,
        listingContent: listingCurrentContentFixture().content,
        imageUrls: listingCurrentContentFixture().photoUrls,
      },
    ]);
    await settle();
    await component.edit();
    store.saveListingContent.mockRejectedValueOnce(new Error('inzwischen bei Vinted geändert'));
    component.form.patchValue({ title: 'Neue Schuhe' });
    await component.save();
    expect(component.editing()).toBe(true);
    expect(component.form.controls.title.value).toBe('Neue Schuhe');
    expect(component.error()).toContain('inzwischen');
    expect(component.notice()).toBeNull();
    expect(TestBed.inject(ToastService).toasts()).toEqual([]);
    expect(component.entry()?.title).toBe('Meine Schuhe');
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

it('ergaenzt den Preis auch im nur teilweise lesbaren nativen Entwurf ohne neue Veroeffentlichung', async () => {
  const f = setup([{ ...entry('a'), publicationState: 'draft', price: null }]);
  await settle();
  f.store.readListingContent.mockRejectedValueOnce(new Error('Unvollstaendig'));
  f.store.readListingEdit.mockResolvedValueOnce({ title: 'Entwurf', description: '', price: '' });
  await f.component.edit();
  expect(f.component.canSave()).toBe(true);
  f.component.form.controls.price.setValue('18,00');
  expect(f.component.form.controls.price.value).toBe('18,00');
  expect(f.store.saveListingContent).not.toHaveBeenCalled();
});

it('normalisiert einen vorhandenen formatierten Preis im nativen Grundfeld-Fallback', async () => {
  const f = setup([{ ...entry('a'), publicationState: 'draft', price: null }]);
  await settle();
  f.store.readListingContent.mockRejectedValueOnce(new Error('Unvollstaendig'));
  f.store.readListingEdit.mockResolvedValueOnce({
    title: 'Entwurf',
    description: 'Text',
    price: '20,50 €',
  });
  await f.component.edit();
  expect(f.component.form.controls.price.value).toBe('');
  expect(f.store.readListingEdit).not.toHaveBeenCalled();
  f.component.form.controls.title.setValue('Neuer Titel');
  f.component.form.controls.price.setValue('20,50');
  await f.component.save();
  expect(f.store.saveListingEdit).toHaveBeenCalledWith(account.connectionId, 'a', {
    title: 'Neuer Titel',
    description: 'Text',
    price: '20,50',
  });
});
