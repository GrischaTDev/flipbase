import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { prepareMarketplaceRendering } from '../../../../../../e2e/support/marketplace-rendering';
import { listingTransferRendering } from '../../../../../../e2e/support/listing-transfer-rendering';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import type { Listing } from '../../../listings/models/listing.models';
import { KleinanzeigenAccountService } from '../../services/kleinanzeigen-account.service';
import { KleinanzeigenExtensionBridge } from '../../services/kleinanzeigen-extension-bridge';
import { KleinanzeigenFormSchemaService } from '../../services/kleinanzeigen-form-schema.service';
import { KleinanzeigenListingJobService } from '../../services/kleinanzeigen-listing-job.service';
import { KleinanzeigenPublicationPanelComponent } from '../kleinanzeigen-publication-panel/kleinanzeigen-publication-panel.component';
import { KleinanzeigenTransferTargetComponent } from './kleinanzeigen-transfer-target.component';
const workspaceId = '25000000-0000-4000-8000-000000000011';
const content = {
  title: 'Jacke',
  description: 'Voller Text',
  priceCents: 1200,
  currency: 'EUR',
  priceType: 'FIXED' as const,
  shippingType: 'pickup' as const,
  shippingPriceCents: null,
  postalCode: '12345',
  categoryId: null,
  categoryFields: {},
  schemaRevision: null,
};
const listing: Listing = {
  id: 'draft',
  workspaceId,
  inventoryItemId: null,
  targetConnectionId: '9',
  platform: 'kleinanzeigen',
  status: 'prepared',
  endReason: null,
  content: {
    title: content.title,
    description: content.description,
    price: 12,
    priceType: 'FIXED',
    shippingType: 'pickup',
    shippingPrice: null,
    postalCode: '12345',
  },
  listedCount: 0,
  lastListedAt: null,
  onlineSince: null,
  endedAt: null,
  createdAt: '2026-10-16T00:00:00Z',
  updatedAt: '2026-10-16T00:00:00Z',
  revision: 4,
  transferImagesComplete: true,
};
const account = {
  workspaceId,
  connectionId: '9',
  externalAccountId: '88',
  displayName: 'Privatkonto',
  accountType: 'private',
  status: 'connected',
  localGrant: { active: true, generation: 2, canPublish: true },
};
let restore: () => void;
beforeAll(async () => {
  restore = await prepareMarketplaceRendering([
    ...listingTransferRendering,
    {
      type: KleinanzeigenTransferTargetComponent,
      path: 'src/app/features/marketplaces/components/kleinanzeigen-transfer-target/kleinanzeigen-transfer-target.component.ts',
    },
  ]);
});
afterAll(() => restore?.());
afterEach(() => TestBed.resetTestingModule());
describe('Kleinanzeigen-Zielfassung im vollständigen Editor', () => {
  const workspace = {
    currentWorkspace: signal<{ id: string; archived_at: null }>({
      id: workspaceId,
      archived_at: null,
    }),
  };
  const accounts = { readAccounts: vi.fn() };
  const schemas = { browse: vi.fn(), cancel: vi.fn() };
  const jobs = {
    job: signal(null),
    busy: signal(false),
    error: signal(null),
    latest: vi.fn().mockResolvedValue(null),
    cancel: vi.fn(),
  };
  const bridge = {
    checkInstallation: vi.fn(),
    formSchemaAvailable: signal(true),
    quotaAvailable: signal(true),
    capabilities: signal({ publish: true }),
  };
  beforeEach(() => {
    vi.clearAllMocks();
    workspace.currentWorkspace.set({ id: workspaceId, archived_at: null });
    accounts.readAccounts.mockResolvedValue({ canManage: true, accounts: [account] });
    TestBed.configureTestingModule({
      imports: [KleinanzeigenTransferTargetComponent],
      providers: [
        provideRouter([]),
        { provide: WorkspaceService, useValue: workspace },
        { provide: KleinanzeigenAccountService, useValue: accounts },
      ],
    });
    TestBed.overrideProvider(KleinanzeigenExtensionBridge, { useValue: bridge });
    TestBed.overrideProvider(KleinanzeigenFormSchemaService, { useValue: schemas });
    TestBed.overrideProvider(KleinanzeigenListingJobService, { useValue: jobs });
  });
  async function create() {
    const f = TestBed.createComponent(KleinanzeigenTransferTargetComponent);
    f.componentRef.setInput('listing', listing);
    f.componentRef.setInput('content', content);
    f.componentRef.setInput('photoCount', 1);
    f.detectChanges();
    await f.whenStable();
    f.detectChanges();
    return f;
  }
  it('erhält den lesenden Auftragszugriff nach Widerruf, sperrt aber jede neue Veröffentlichung', async () => {
    accounts.readAccounts.mockResolvedValue({
      canManage: true,
      accounts: [{ ...account, localGrant: null }],
    });
    const f = await create();
    const panel = f.debugElement.query(By.directive(KleinanzeigenPublicationPanelComponent))
      .componentInstance as KleinanzeigenPublicationPanelComponent;
    expect(f.componentInstance.publicationScope()?.generation).toBe(0);
    expect(f.componentInstance.scope()).toBeNull();
    expect(panel.publicationAllowed()).toBe(false);
    expect(panel.canPublish()).toBe(false);
    expect(jobs.latest).toHaveBeenCalledWith(
      expect.objectContaining({ connectionId: '9' }),
      'draft',
    );
  });
  it('verwirft verspätete Kontodaten nach einem Workspacewechsel', async () => {
    let complete!: (value: unknown) => void;
    accounts.readAccounts.mockReturnValue(
      new Promise((resolve) => {
        complete = resolve;
      }),
    );
    const f = TestBed.createComponent(KleinanzeigenTransferTargetComponent);
    f.componentRef.setInput('listing', listing);
    f.componentRef.setInput('content', content);
    f.detectChanges();
    workspace.currentWorkspace.set({ id: 'other', archived_at: null });
    f.detectChanges();
    complete({ canManage: true, accounts: [account] });
    await f.whenStable();
    f.detectChanges();
    expect(f.componentInstance.publicationScope()).toBeNull();
    expect(f.componentInstance.targetName()).toBe('');
  });
  it('verwendet im Editor denselben vollständigen lokalen Kategorie-Wähler', async () => {
    const f = await create();
    f.detectChanges();
    expect(f.nativeElement.querySelector('app-category-picker')).toBeTruthy();
    expect(await f.componentInstance.categorySource.loadChildren(null)).toHaveLength(9);
    expect(schemas.browse).not.toHaveBeenCalled();
    f.componentInstance.categorySelection.setValue('153');
    await f.whenStable();
    expect(schemas.browse).not.toHaveBeenCalled();
    expect(f.componentInstance.schema()).toBeNull();
    expect(f.componentInstance.error()).toContain('Unterkategorie');
  });
  it('rendert Kategorieangaben und sperrt den Submit bei ungespeicherten Änderungen', async () => {
    const schema = {
      categoryPath: '153/160/shirts',
      categoryLabel: 'Shirts',
      titleMax: 65,
      descriptionMax: 4000,
      photoCountMax: 20,
      photoBytesMax: 12582912,
      priceStepCents: 100,
      fields: [
        {
          key: 'kleidung_herren.condition',
          label: 'Zustand',
          kind: 'select',
          selection: 'value',
          required: false,
          choices: [{ value: 'ok', label: 'Gut', description: '' }],
        },
      ],
      shipping: { defaultGroup: null, defaultMethods: [], groups: [] },
    };
    schemas.browse.mockResolvedValue({
      choices: [],
      categoryLabel: 'Shirts',
      schema,
      schemaRevision: 'a'.repeat(64),
    });
    const f = await create();
    const changed = vi.fn();
    f.componentInstance.fieldsChanged.subscribe(changed);
    await f.componentInstance.browse('153/160/shirts');
    f.detectChanges();
    expect((f.nativeElement as HTMLElement).textContent).toContain('Zustand');
    expect(changed).toHaveBeenCalledWith(
      expect.objectContaining({ categoryId: '153/160/shirts', schemaRevision: 'a'.repeat(64) }),
    );
    f.componentRef.setInput('unsaved', true);
    f.detectChanges();
    const panel = f.debugElement.query(By.directive(KleinanzeigenPublicationPanelComponent))
      .componentInstance as KleinanzeigenPublicationPanelComponent;
    expect(panel.unsaved()).toBe(true);
    expect(panel.canPublish()).toBe(false);
  });
});
