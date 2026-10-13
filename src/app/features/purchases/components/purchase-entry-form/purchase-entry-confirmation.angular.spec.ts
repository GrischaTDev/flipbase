import '@angular/compiler';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PurchaseEntryFormComponent } from './purchase-entry-form.component';
import { PurchaseService } from '../../../../core/services/purchase.service';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import { CatalogService } from '../../../../core/services/catalog.service';
import { SourcesService } from '../../../../core/services/sources.service';
import { SuppliersService } from '../../../../core/services/suppliers.service';
import { InboundTrackingService } from '../../../../core/services/inbound-tracking.service';
import { SyncStatusService } from '../../../../core/services/sync-status.service';
import { WorkspaceContextLockService } from '../../../../core/services/workspace-context-lock.service';
import { PurchaseCostingService } from '../../../../core/services/purchase-costing.service';
import { PurchaseDocumentService } from '../../../../core/services/purchase-document.service';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { PurchaseProductReturnService } from '../../services/purchase-product-return.service';
import { PurchaseSelfReceiptService } from '../../services/purchase-self-receipt.service';
import { PurchaseBufferService } from '../../services/purchase-buffer.service';
import type { Purchase } from '../../../../core/models/flipbase.models';
import type {
  OfflinePurchaseDraft,
  OfflinePurchaseReview,
} from '../../models/offline-purchase-draft.models';

describe('purchase confirmation effects', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  it('preserves newer seller inputs when the submitted purchase is confirmed', async () => {
    const confirmed = signal<ReturnType<PurchaseBufferService['confirmed']>>(null);
    const toast = { success: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        { provide: Router, useValue: { url: '/purchases/new', events: new Subject() } },
        { provide: WorkspaceService, useValue: { currentWorkspace: signal({ id: 'workspace' }) } },
        { provide: WorkspaceContextLockService, useValue: { acquire: () => () => undefined } },
        { provide: PurchaseBufferService, useValue: { confirmed, observe: () => () => undefined } },
        { provide: SourcesService, useValue: { sources: signal([]) } },
        { provide: SuppliersService, useValue: { suppliers: signal([]) } },
        { provide: PurchaseProductReturnService, useValue: { consume: () => null } },
        { provide: ToastService, useValue: toast },
        ...[
          PurchaseService,
          CatalogService,
          SyncStatusService,
          PurchaseCostingService,
          PurchaseDocumentService,
          PurchaseSelfReceiptService,
          InboundTrackingService,
        ].map((provide) => ({ provide, useValue: {} })),
      ],
    });
    const component = TestBed.runInInjectionContext(() => new PurchaseEntryFormComponent());
    const internal = component as unknown as {
      observingBuffer: ReturnType<typeof signal<boolean>>;
      persistOfflineReview: () => Promise<void>;
    };
    internal.persistOfflineReview = vi.fn(async () => undefined);
    component.setReceiptMode('self');
    component.form.controls.seller_name.setValue('Submitted seller');
    const review: OfflinePurchaseReview = {
      form: component.form.getRawValue(),
      lines: [],
      costs: [],
      documents: [],
      content: { draftName: '', purchaseDate: '2026-10-13', notes: '', sellerNote: '', lines: [] },
    };
    const draft: OfflinePurchaseDraft = {
      schemaVersion: 1,
      draftId: 'draft',
      requestId: 'request',
      userId: 'user',
      workspaceId: 'workspace',
      revision: 2,
      updatedAt: '2026-10-13T00:00:00Z',
      state: 'review_required',
      purchaseId: null,
      review,
      content: review.content,
    };
    component.offlineDraft.set(draft);
    internal.observingBuffer.set(true);
    component.form.controls.seller_name.setValue('Newer seller');
    confirmed.set({
      draftId: draft.draftId,
      purchase: {
        id: 'purchase',
        workspace_id: 'workspace',
        purchase_lines: [],
      } as unknown as Purchase,
      completion: 'newer_revision',
      review,
      finalizeAfterSave: false,
      uploadedDocumentIds: [],
      documentsComplete: true,
    });
    TestBed.tick();
    await Promise.resolve();
    expect(component.form.controls.seller_name.value).toBe('Newer seller');
    expect(component.persistedDraft()?.id).toBe('purchase');
    expect(toast.success).toHaveBeenCalledTimes(1);
    component.offlineDraft.update((current) => (current ? { ...current, revision: 3 } : null));
    TestBed.tick();
    expect(toast.success).toHaveBeenCalledTimes(1);
    const previousConfirmation = confirmed();
    expect(previousConfirmation).not.toBeNull();
    if (!previousConfirmation) throw new Error('The purchase confirmation is missing.');
    confirmed.set({ ...previousConfirmation, documentsComplete: false });
    TestBed.tick();
    expect(component.errorMessage()).toContain('Belege');
    expect(toast.success).toHaveBeenCalledTimes(1);
    confirmed.set({ ...previousConfirmation, documentsComplete: true });
    TestBed.tick();
    expect(component.errorMessage()).toBeNull();
    expect(component.form.controls.seller_name.value).toBe('Newer seller');
    expect(toast.success).toHaveBeenCalledTimes(2);
  });
});
