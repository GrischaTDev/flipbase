import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EbaySaleReviewComponent } from './ebay-sale-review.component';
import { EbaySaleReviewStore } from '../../services/ebay-sale-review.store';
import { AuthService } from '../../../../core/services/auth.service';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import { WorkspaceContextLockService } from '../../../../core/services/workspace-context-lock.service';
import { SalesService } from '../../../../core/services/sales.service';
import type { EbayOrderBooking } from '../../../../../../supabase/functions/_shared/ebay-order-import-contracts';

const connectionId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
describe('eBay-Verkaufsprüfseite', () => {
  let component: EbaySaleReviewComponent;
  let workspace: ReturnType<typeof signal<{ id: string; archived_at: string | null } | null>>;
  let load: ReturnType<typeof vi.fn>;
  let mark: ReturnType<typeof vi.fn>;
  let navigateByUrl: ReturnType<typeof vi.fn>;
  let release: ReturnType<typeof vi.fn>;
  let loading: ReturnType<typeof signal<boolean>>;
  let outcomeUnknown: ReturnType<typeof signal<boolean>>;
  let reviewChanged: ReturnType<typeof signal<boolean>>;
  let booking: ReturnType<typeof signal<EbayOrderBooking>>;
  let params: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
  beforeEach(() => {
    workspace = signal({ id: 'workspace-a', archived_at: null });
    loading = signal(false);
    outcomeUnknown = signal(false);
    reviewChanged = signal(false);
    booking = signal({ status: 'unrecorded', saleId: null });
    load = vi.fn();
    mark = vi.fn(async () => {
      booking.set({ status: 'recorded_elsewhere', saleId: null });
    });
    release = vi.fn();
    navigateByUrl = vi.fn();
    params = new BehaviorSubject(convertToParamMap({ connectionId, orderId: 'order-1' }));
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: { currentUser: signal({ id: 'user-a' }) } },
        { provide: WorkspaceService, useValue: { currentWorkspace: workspace } },
        { provide: WorkspaceContextLockService, useValue: { acquire: () => release } },
        {
          provide: ActivatedRoute,
          useValue: { paramMap: params, snapshot: { paramMap: params.value } },
        },
        { provide: Router, useValue: { navigateByUrl } },
        {
          provide: SalesService,
          useValue: {
            sales: signal([]),
            isLoading: signal(false),
            loadedWorkspaceId: signal('workspace-a'),
            loadSales: vi.fn(),
          },
        },
        {
          provide: EbaySaleReviewStore,
          useValue: {
            load,
            clear: vi.fn(),
            loading,
            booking,
            outcomeUnknown,
            reviewChanged,
            review: signal(null),
            draft: signal(null),
            error: signal(null),
            submit: vi.fn(),
            markRecordedElsewhere: mark,
          },
        },
      ],
    });
    component = TestBed.runInInjectionContext(() => new EbaySaleReviewComponent());
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    params.complete();
  });
  it('loads full source from route parameters without navigation state and keeps the workspace locked', () => {
    TestBed.tick();
    expect(load).toHaveBeenCalledWith({ workspaceId: 'workspace-a', connectionId }, 'order-1');
    params.next(convertToParamMap({ connectionId, orderId: 'order-2' }));
    TestBed.tick();
    expect(load).toHaveBeenLastCalledWith({ workspaceId: 'workspace-a', connectionId }, 'order-2');
    TestBed.resetTestingModule();
    expect(release).toHaveBeenCalledOnce();
  });
  it('requires explicit confirmation of changed source and blocks unknown outcomes', () => {
    const submit = vi.fn();
    vi.spyOn(component, 'entryForm').mockImplementation(
      () =>
        ({
          canSave: () => true,
          onSubmit: submit,
          hasUnsavedChanges: () => true,
          isSaving: () => false,
        }) as unknown as ReturnType<EbaySaleReviewComponent['entryForm']>,
    );
    expect(component.canSave()).toBe(true);
    reviewChanged.set(true);
    expect(component.canSave()).toBe(false);
    component.reviewConfirmation.setValue(true);
    expect(component.canSave()).toBe(true);
    outcomeUnknown.set(true);
    expect(component.canSave()).toBe(false);
    component.save();
    expect(submit).not.toHaveBeenCalled();
    const event = { preventDefault: vi.fn() } as unknown as BeforeUnloadEvent;
    component.onBeforeUnload(event);
    expect(event.preventDefault).toHaveBeenCalledOnce();
  });
  it('requires reason and confirmation for a manual marker and keeps the known return route', async () => {
    component.openManualDialog('mark');
    await component.markManually();
    expect(mark).not.toHaveBeenCalled();
    component.manualForm.controls.reason.setValue('Schon manuell gebucht');
    await component.markManually();
    expect(mark).not.toHaveBeenCalled();
    component.manualForm.controls.confirmed.setValue(true);
    await component.markManually();
    expect(mark).toHaveBeenCalledWith('Schon manuell gebucht', null);
    expect(component.manualDialog()).toBeNull();
    component.returnToEbay();
    expect(navigateByUrl).toHaveBeenCalledWith('/marketplaces/ebay');
  });
  it('does not load a foreign archived or missing workspace and rejects invalid route identifiers', () => {
    workspace.set({ id: 'workspace-a', archived_at: '2026-10-01' });
    TestBed.tick();
    expect(load).not.toHaveBeenCalled();
    workspace.set({ id: 'workspace-a', archived_at: null });
    params.next(convertToParamMap({ connectionId: 'invalid', orderId: 'order-1' }));
    TestBed.tick();
    expect(load).not.toHaveBeenCalled();
    expect(component.routeError()).not.toBeNull();
  });
});
