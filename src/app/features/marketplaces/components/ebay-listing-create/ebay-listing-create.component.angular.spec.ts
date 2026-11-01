import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import axe from 'axe-core';
import { prepareMarketplaceRendering } from '../../../../../../e2e/support/marketplace-rendering';
import { AuthService } from '../../../../core/services/auth.service';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.service';
import {
  EbayAccountApiService,
  EbayAccountRequestError,
} from '../../services/ebay-account-api.service';
import { EbayListingCreateComponent } from './ebay-listing-create.component';

describe('eBay-Inserat: Prüfung und Veröffentlichung', () => {
  let restore: (() => void) | undefined;
  beforeAll(async () => {
    restore = await prepareMarketplaceRendering([
      {
        type: EbayListingCreateComponent,
        path: 'src/app/features/marketplaces/components/ebay-listing-create/ebay-listing-create.component.ts',
      },
    ]);
  });
  afterAll(() => restore?.());
  const user = signal<{ id: string } | null>({ id: 'user' });
  const workspace = signal<{ id: string; archived_at: null } | null>({
    id: 'workspace',
    archived_at: null,
  });
  const scope = { workspaceId: 'workspace', connectionId: 'connection' };
  const policy = [{ id: '1', name: 'Standard' }];
  let api: {
    loadStatus: ReturnType<typeof vi.fn>;
    loadListingSettings: ReturnType<typeof vi.fn>;
    loadCategoryDetails: ReturnType<typeof vi.fn>;
    searchCategories: ReturnType<typeof vi.fn>;
    uploadDraftImage: ReturnType<typeof vi.fn>;
    checkNewListing: ReturnType<typeof vi.fn>;
    findCreatedListing: ReturnType<typeof vi.fn>;
  };
  let confirm: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    sessionStorage.clear();
    user.set({ id: 'user' });
    workspace.set({ id: 'workspace', archived_at: null });
    confirm = vi.fn(async () => true);
    api = {
      loadStatus: vi.fn(async () => ({
        configured: true,
        listingCreationAvailable: true,
        connection: {
          ...scope,
          status: 'connected',
          username: 'seller',
          environment: 'production',
          lastReadAt: null,
        },
      })),
      loadListingSettings: vi.fn(async () => ({
        payment: policy,
        fulfillment: policy,
        returns: policy,
      })),
      loadCategoryDetails: vi.fn(async () => ({
        conditions: [{ id: '3000', name: 'Gebraucht' }],
        aspects: [],
      })),
      searchCategories: vi.fn(async () => [{ id: '12', name: 'Accessoires › Schals' }]),
      uploadDraftImage: vi.fn(async () => 'https://i.ebayimg.com/uploaded.jpg'),
      checkNewListing: vi.fn(async (_scope, _draft, hash?: string) => ({
        valid: true,
        listingId: hash ? '123' : null,
        reviewHash: 'a'.repeat(64),
        fees: [],
        issues: [],
        warnings: [],
      })),
      findCreatedListing: vi.fn(async () => '123'),
    };
    TestBed.configureTestingModule({
      imports: [EbayListingCreateComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { currentUser: user } },
        { provide: WorkspaceService, useValue: { currentWorkspace: workspace } },
        { provide: EbayAccountApiService, useValue: api },
        { provide: ConfirmDialogService, useValue: { frage: confirm } },
      ],
    });
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    sessionStorage.clear();
  });
  async function create() {
    const fixture = TestBed.createComponent(EbayListingCreateComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    await vi.waitFor(() => expect(fixture.componentInstance.loading()).toBe(false));
    fixture.detectChanges();
    return fixture;
  }
  async function fill(component: EbayListingCreateComponent) {
    await component.selectCategory('12');
    component.form.setValue({
      title: 'Wollschal',
      description: 'Sehr guter Zustand',
      price: 29,
      quantity: 1,
      condition: '3000',
      postalCode: '12345',
      location: 'Testort',
      payment: '1',
      fulfillment: '1',
      returns: '1',
    });
    component.form.markAsDirty();
    component.images.set([
      { key: 'image', media: null, file: null, previewUrl: 'https://i.ebayimg.com/photo.jpg' },
    ]);
  }
  it('rendert beschriftete Pflichtfelder und die bestehende Bildverwaltung ohne AXE-Befund', async () => {
    const fixture = await create();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('app-product-media-editor')).not.toBeNull();
    expect(element.textContent).toContain('Bei eBay prüfen');
    expect(element.textContent).not.toContain('Bei eBay veröffentlichen');
    expect(
      (await axe.run(element, { rules: { 'color-contrast': { enabled: false } } })).violations,
    ).toEqual([]);
  });
  it('verhindert Anbieteraufrufe mit fehlenden Pflichtfeldern', async () => {
    const fixture = await create();
    await fixture.componentInstance.check();
    expect(api.checkNewListing).not.toHaveBeenCalled();
    expect(fixture.componentInstance.error()).toContain('Pflichtfelder');
  });
  it('veröffentlicht erst nach erfolgreicher Prüfung und bewusster Bestätigung', async () => {
    const fixture = await create(),
      component = fixture.componentInstance;
    await fill(component);
    await component.check();
    expect(api.checkNewListing).toHaveBeenCalledTimes(1);
    expect(confirm).not.toHaveBeenCalled();
    expect(component.createdId()).toBeNull();
    expect(component.form.disabled).toBe(true);
    confirm.mockResolvedValueOnce(false);
    await component.publish();
    expect(api.checkNewListing).toHaveBeenCalledTimes(1);
    await component.publish();
    expect(api.checkNewListing).toHaveBeenCalledTimes(2);
    expect(api.checkNewListing.mock.calls[0]?.[1].key).toBe(
      api.checkNewListing.mock.calls[1]?.[1].key,
    );
    expect(component.createdId()).toBe('123');
  });
  it('hält unklare Veröffentlichungen gesperrt und klärt sie ausschließlich lesend', async () => {
    const fixture = await create(),
      component = fixture.componentInstance;
    await fill(component);
    await component.check();
    api.checkNewListing.mockRejectedValueOnce(
      new EbayAccountRequestError('save_unconfirmed', 'Unklar'),
    );
    await component.publish();
    expect(component.pending()).toBe(true);
    await component.publish();
    expect(api.checkNewListing).toHaveBeenCalledTimes(2);
    expect(sessionStorage.length).toBe(1);
    await component.checkPublication();
    expect(component.createdId()).toBe('123');
    expect(sessionStorage.length).toBe(0);
    expect(api.checkNewListing).toHaveBeenCalledTimes(2);
  });
  it('lädt einen offenen Versuch nach einem Browser-Neuladen ohne neue Erstellung', async () => {
    sessionStorage.setItem(
      'flipbase.ebay.pending-listing:user:workspace:connection',
      'b'.repeat(32),
    );
    const fixture = await create();
    expect(fixture.componentInstance.pending()).toBe(true);
    expect(api.loadListingSettings).not.toHaveBeenCalled();
    await fixture.componentInstance.checkPublication();
    expect(api.findCreatedListing).toHaveBeenCalledWith(scope, 'b'.repeat(32));
    expect(api.checkNewListing).not.toHaveBeenCalled();
  });
  it('Abmeldung verwirft Eingaben, Prüfstand und private Kontorichtlinien', async () => {
    const fixture = await create();
    await fill(fixture.componentInstance);
    await fixture.componentInstance.check();
    user.set(null);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.componentInstance.settings()).toBeNull();
    expect(fixture.componentInstance.review()).toBeNull();
    expect(fixture.componentInstance.images()).toEqual([]);
    expect(fixture.componentInstance.form.controls.title.value).toBe('');
    expect(fixture.componentInstance.form.enabled).toBe(true);
  });
  it('verlangt nach geänderten Gebühren eine neue Prüfung und Bestätigung', async () => {
    const fixture = await create(),
      component = fixture.componentInstance;
    await fill(component);
    await component.check();
    api.checkNewListing.mockRejectedValueOnce(
      new EbayAccountRequestError('listing_review_changed', 'Gebühren geändert'),
    );
    await component.publish();
    expect(component.pending()).toBe(false);
    expect(component.review()).toBeNull();
    expect(component.form.enabled).toBe(true);
    expect(sessionStorage.length).toBe(0);
    await component.publish();
    expect(api.checkNewListing).toHaveBeenCalledTimes(2);
  });
  it('eine späte Bestätigung entfernt keinen offenen Versuch eines anderen Nutzers', async () => {
    const fixture = await create(),
      component = fixture.componentInstance;
    await fill(component);
    await component.check();
    let finish!: () => void;
    api.checkNewListing.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = () =>
            resolve({
              valid: true,
              listingId: '123',
              reviewHash: 'a'.repeat(64),
              fees: [],
              issues: [],
              warnings: [],
            });
        }),
    );
    const publishing = component.publish();
    await vi.waitFor(() => expect(api.checkNewListing).toHaveBeenCalledTimes(2));
    const otherKey = 'flipbase.ebay.pending-listing:other:workspace:connection';
    sessionStorage.setItem(otherKey, 'b'.repeat(32));
    user.set({ id: 'other' });
    fixture.detectChanges();
    await vi.waitFor(() => expect(component.pending()).toBe(true));
    finish();
    await publishing;
    expect(sessionStorage.getItem(otherKey)).toBe('b'.repeat(32));
    expect(component.createdId()).toBeNull();
  });
});
