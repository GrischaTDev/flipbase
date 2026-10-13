import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { afterAll, beforeAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import axe from 'axe-core';
import { prepareMarketplaceRendering } from '../../../../../../e2e/support/marketplace-rendering';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { CardComponent } from '../../../../shared/components/card/card.component';
import { PageHeaderComponent } from '../../../../shared/components/page-header/page-header.component';
import { TextFieldComponent } from '../../../../shared/components/text-field/text-field.component';
import { NumberInputComponent } from '../../../../shared/components/number-input/number-input.component';
import { ProductMediaEditorComponent } from '../../../../shared/components/product-media-editor/product-media-editor.component';
import { ImageCropperModalComponent } from '../../../../shared/components/image-cropper-modal/image-cropper-modal.component';
import { ModalShellComponent } from '../../../../shared/components/modal-shell/modal-shell.component';
import { CustomSelectComponent } from '../../../../shared/components/custom-select/custom-select.component';
import { AuthService } from '../../../../core/services/auth.service';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.service';
import {
  EbayAccountApiService,
  EbayAccountRequestError,
} from '../../services/ebay-account-api.service';
import { EbayListingEditorComponent } from './ebay-listing-editor.component';
import type { EbayListingDetails } from '../../../../../../supabase/functions/_shared/ebay-contracts';

const connection = {
  workspaceId: 'workspace-a',
  connectionId: 'connection-a',
  status: 'connected',
  environment: 'production',
  username: 'seller',
  lastReadAt: null,
};
const listing: EbayListingDetails = {
  id: '123',
  title: 'My item',
  price: 10,
  currency: 'EUR',
  quantity: 2,
  listingType: 'FixedPriceItem',
  url: 'https://www.ebay.de/itm/123',
  description: '<p>My description</p>',
  imageUrls: ['https://i.ebayimg.com/original.jpg'],
  revision: 'a'.repeat(64),
};
describe('eBay-Inseratbearbeitung', () => {
  let restoreBindings: (() => void) | undefined;
  beforeAll(async () => {
    restoreBindings = await prepareMarketplaceRendering([
      {
        type: EbayListingEditorComponent,
        path: 'src/app/features/marketplaces/components/ebay-listing-editor/ebay-listing-editor.component.ts',
      },
      { type: ButtonComponent, path: 'src/app/shared/components/button/button.component.ts' },
      { type: CardComponent, path: 'src/app/shared/components/card/card.component.ts' },
      {
        type: PageHeaderComponent,
        path: 'src/app/shared/components/page-header/page-header.component.ts',
      },
      {
        type: TextFieldComponent,
        path: 'src/app/shared/components/text-field/text-field.component.ts',
      },
      {
        type: NumberInputComponent,
        path: 'src/app/shared/components/number-input/number-input.component.ts',
      },
      {
        type: ProductMediaEditorComponent,
        path: 'src/app/shared/components/product-media-editor/product-media-editor.component.ts',
      },
      {
        type: ImageCropperModalComponent,
        path: 'src/app/shared/components/image-cropper-modal/image-cropper-modal.component.ts',
      },
      {
        type: ModalShellComponent,
        path: 'src/app/shared/components/modal-shell/modal-shell.component.ts',
      },
      {
        type: CustomSelectComponent,
        path: 'src/app/shared/components/custom-select/custom-select.component.ts',
      },
    ]);
  });
  afterAll(() => restoreBindings?.());
  let component: EbayListingEditorComponent;
  const workspace = signal<{ id: string; archived_at: null } | null>(null);
  const user = signal<{ id: string } | null>(null);
  let parameters: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
  let query: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
  let api: {
    loadStatus: ReturnType<typeof vi.fn>;
    loadListingDetails: ReturnType<typeof vi.fn>;
    updateListing: ReturnType<typeof vi.fn>;
    uploadListingImage: ReturnType<typeof vi.fn>;
  };
  const confirm = vi.fn(async () => false);
  beforeEach(async () => {
    workspace.set({ id: 'workspace-a', archived_at: null });
    user.set({ id: 'user-a' });
    confirm.mockReset();
    parameters = new BehaviorSubject(convertToParamMap({ listingId: '123' }));
    query = new BehaviorSubject(convertToParamMap({ connection: 'connection-a' }));
    api = {
      loadStatus: vi.fn(async () => ({
        configured: true,
        listingManagementAvailable: true,
        connection,
      })),
      loadListingDetails: vi.fn(async () => listing),
      updateListing: vi.fn(async () => null),
      uploadListingImage: vi.fn(async () => 'https://i.ebayimg.com/new.jpg'),
    };
    TestBed.configureTestingModule({
      imports: [EbayListingEditorComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { currentUser: user } },
        { provide: WorkspaceService, useValue: { currentWorkspace: workspace } },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { paramMap: parameters.value, queryParamMap: query.value },
            paramMap: parameters,
            queryParamMap: query,
          },
        },
        { provide: EbayAccountApiService, useValue: api },
        { provide: ConfirmDialogService, useValue: { frage: confirm } },
      ],
    });
    component = TestBed.runInInjectionContext(() => new EbayListingEditorComponent());
    TestBed.tick();
    await vi.waitFor(() => expect(component.loading()).toBe(false));
  });
  afterEach(() => TestBed.resetTestingModule());
  it('rendert beschriftete Felder, die gemeinsame Bildverwaltung und die Aktion im Seitenkopf', async () => {
    const fixture = TestBed.createComponent(EbayListingEditorComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    await vi.waitFor(() => expect(fixture.componentInstance.listing()).not.toBeNull());
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('header')?.textContent).toContain('Bei eBay speichern');
    expect(element.querySelector('app-product-media-editor')).not.toBeNull();
    expect(element.querySelector('textarea')?.value).toBe(listing.description);
    const results = await axe.run(element, { rules: { 'color-contrast': { enabled: false } } });
    expect(results.violations).toEqual([]);
  });
  it('lädt vorhandenes HTML und erkennt Titeländerungen ohne Bild- oder Preisüberschreibung', async () => {
    expect(component.form.controls.description.value).toBe(listing.description);
    expect(component.dirty()).toBe(false);
    component.form.controls.title.setValue('New title');
    api.loadListingDetails.mockResolvedValueOnce({ ...listing, title: 'New title' });
    await component.save();
    expect(api.updateListing).toHaveBeenCalledWith(connection, '123', {
      expectedRevision: listing.revision,
      title: 'New title',
    });
    expect(component.confirmation()).toContain('gespeichert');
    expect(component.dirty()).toBe(false);
  });
  it('überträgt erst neue Bilder und bewahrt bestehende Bilder in der gewünschten Reihenfolge', async () => {
    const file = new File(['photo'], 'new.png', { type: 'image/png' });
    component.images.update((images) => [
      ...images,
      { key: 'new', media: null, previewUrl: 'data:photo', file },
    ]);
    await component.save();
    expect(api.uploadListingImage).toHaveBeenCalledWith(connection, '123', file);
    expect(api.updateListing).toHaveBeenCalledWith(connection, '123', {
      expectedRevision: listing.revision,
      imageUrls: [listing.imageUrls[0], 'https://i.ebayimg.com/new.jpg'],
    });
    expect(api.uploadListingImage.mock.invocationCallOrder[0]).toBeLessThan(
      api.updateListing.mock.invocationCallOrder[0],
    );
  });
  it('verhindert wiederholtes Speichern nach einer unklaren Antwort', async () => {
    component.form.controls.price.setValue(12);
    api.updateListing.mockRejectedValueOnce(
      new EbayAccountRequestError('save_unconfirmed', 'Prüfe das Angebot.'),
    );
    await component.save();
    await component.save();
    expect(component.mustReload()).toBe(true);
    expect(api.updateListing).toHaveBeenCalledOnce();
    expect(component.confirmation()).toBeNull();
    expect(component.error()).toBe('Prüfe das Angebot.');
  });
  it('behält Änderungen nach einer bestätigten Ablehnung zur Korrektur bei', async () => {
    component.form.controls.title.setValue('New title');
    api.updateListing.mockRejectedValueOnce(
      new EbayAccountRequestError('revision_rejected', 'Abgelehnt.'),
    );
    await component.save();
    expect(component.form.controls.title.value).toBe('New title');
    expect(component.dirty()).toBe(true);
    expect(component.mustReload()).toBe(false);
  });
  it('zeigt eine bestätigte Speicherung auch bei fehlgeschlagenem anschließenden Lesen getrennt an', async () => {
    component.form.controls.price.setValue(12);
    api.loadListingDetails.mockRejectedValueOnce(new Error('Lesen nicht möglich.'));
    await component.save();
    expect(component.confirmation()).toContain('gespeichert');
    expect(component.error()).toBe('Lesen nicht möglich.');
    expect(component.mustReload()).toBe(true);
  });
  it('fragt vor dem Verwerfen und schützt einen laufenden Speichervorgang', async () => {
    component.form.controls.title.setValue('Draft');
    confirm.mockResolvedValueOnce(false);
    expect(await component.canLeave()).toBe(false);
    expect(confirm).toHaveBeenCalledOnce();
    component.saving.set(true);
    expect(await component.canLeave()).toBe(false);
    expect(confirm).toHaveBeenCalledOnce();
  });
  it('verwirft späte Antworten nach Abmeldung und sendet danach keine Änderung', async () => {
    let resolve: (result: EbayListingDetails) => void = () => undefined;
    api.loadListingDetails.mockReturnValueOnce(
      new Promise<EbayListingDetails>((done) => {
        resolve = done;
      }),
    );
    confirm.mockResolvedValueOnce(true);
    const pending = component.reload();
    await vi.waitFor(() => expect(api.loadListingDetails).toHaveBeenCalledTimes(2));
    user.set(null);
    TestBed.tick();
    resolve(listing);
    await pending;
    expect(component.listing()).toBeNull();
    await component.save();
    expect(api.updateListing).not.toHaveBeenCalled();
  });
  it('lädt auch beim Wechsel zu einem anderen Inserat innerhalb derselben Route neue Daten', async () => {
    api.loadListingDetails.mockResolvedValueOnce({ ...listing, id: '456' });
    parameters.next(convertToParamMap({ listingId: '456' }));
    TestBed.tick();
    await vi.waitFor(() => expect(component.listing()?.id).toBe('456'));
    expect(api.loadListingDetails).toHaveBeenLastCalledWith(connection, '456');
  });
});
