import '@angular/compiler';
import { registerLocaleData } from '@angular/common';
import localeDe from '@angular/common/locales/de';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeAll, describe, expect, it } from 'vitest';
import { signal, ɵresolveComponentResources } from '@angular/core';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { InventoryItem, Purchase } from '../../../../core/models/flipbase.models';
import { InboundTrackingService } from '../../../../core/services/inbound-tracking.service';
import { LoggerService } from '../../../../core/services/logger.service';
import { MediaService } from '../../../../core/services/media.service';
import { MockDataStoreService } from '../../../../core/services/mock-data-store.service';
import { ProfitEngineService } from '../../../../core/services/profit-engine.service';
import { PurchaseService } from '../../../../core/services/purchase.service';
import { StockService } from '../../../../core/services/stock.service';
import { SyncStatusService } from '../../../../core/services/sync-status.service';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import { CatalogService } from '../../../../core/services/catalog.service';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.service';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { provideTranslateService } from '@ngx-translate/core';
import { PurchaseDetailComponent } from './purchase-detail.component';
beforeAll(async () => {
  registerLocaleData(localeDe);
  const resources: Record<string, string> = {
    './purchase-detail.component.html':
      'src/app/features/purchases/pages/purchase-detail/purchase-detail.component.html',
    './image-cropper-modal.component.html':
      'src/app/shared/components/image-cropper-modal/image-cropper-modal.component.html',
    './image-cropper-modal.component.scss':
      'src/app/shared/components/image-cropper-modal/image-cropper-modal.component.scss',
    './custom-select.component.html':
      'src/app/shared/components/custom-select/custom-select.component.html',
    './custom-checkbox.component.html':
      'src/app/shared/components/custom-checkbox/custom-checkbox.component.html',
    './custom-checkbox.component.scss':
      'src/app/shared/components/custom-checkbox/custom-checkbox.component.scss',
    './purchase-line-editor.component.html':
      'src/app/features/purchases/components/purchase-line-editor/purchase-line-editor.component.html',
    './purchase-create-modal.component.html':
      'src/app/features/purchases/components/purchase-create-modal/purchase-create-modal.component.html',
  };
  await ɵresolveComponentResources((url) => {
    const resource = resources[url];
    if (resource) return readFile(resolve(resource), 'utf8');

    return readdir(resolve('src/app'), { recursive: true }).then((files) => {
      const matches = files.filter((file) => file.endsWith(url.slice(2)));
      if (matches.length !== 1) throw new Error(`Unbekannte Test-Ressource: ${url}`);
      return readFile(resolve('src/app', matches[0]), 'utf8');
    });
  });
});

const purchase: Purchase = {
  id: 'purchase-1',
  workspace_id: 'workspace-1',
  type: 'single',
  title: 'Test-Einkauf',
  purchase_date: '2026-08-30',
  purchase_price: 10,
  cost_allocation_mode: 'even',
};

const item: InventoryItem = {
  id: 'item-1',
  workspace_id: purchase.workspace_id,
  purchase_id: purchase.id,
  title: 'Testartikel',
  condition: 'used',
  status: 'received',
  allocated_purchase_cost: 10,
};

describe('PurchaseDetailComponent – Artikelnavigation', () => {
  it('überträgt die Einkaufs-ID an beide Artikeldetail-Links', async () => {
    const purchaseService = {
      selectedPurchase: signal<Purchase | null>(purchase),
      purchaseItems: signal<InventoryItem[]>([item]),
      purchaseLines: signal([]),
      getPurchaseById: async () => purchase,
    };

    await TestBed.configureTestingModule({
      imports: [PurchaseDetailComponent],
      providers: [
        provideRouter([]),
        provideTranslateService(),
        { provide: ConfirmDialogService, useValue: {} },
        { provide: PurchaseService, useValue: purchaseService },
        { provide: StockService, useValue: {} },
        { provide: LoggerService, useValue: {} },
        { provide: MediaService, useValue: {} },
        { provide: InboundTrackingService, useValue: { carrierOptions: [] } },
        { provide: ProfitEngineService, useValue: {} },
        { provide: ToastService, useValue: {} },
        { provide: SyncStatusService, useValue: {} },
        {
          provide: CatalogService,
          useValue: {
            products: signal([]),
            loadError: signal(null),
            isLoading: signal(false),
            loadedWorkspaceId: signal(purchase.workspace_id),
            loadProducts: async () => undefined,
          },
        },
        {
          provide: WorkspaceService,
          useValue: { currentWorkspace: signal({ id: purchase.workspace_id }) },
        },
        { provide: MockDataStoreService, useValue: { isDemoMode: signal(false) } },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(PurchaseDetailComponent);
    Object.assign(fixture.componentInstance, { id: signal(purchase.id) });
    fixture.detectChanges();
    await fixture.whenStable();

    const host = fixture.nativeElement as HTMLElement;
    const links = [...host.querySelectorAll<HTMLAnchorElement>(`a[href*="/inventory/${item.id}"]`)];
    expect(links).toHaveLength(2);
    for (const link of links) {
      const url = new URL(link.href);
      expect(url.pathname).toBe(`/inventory/${item.id}`);
      expect(url.searchParams.get('fromPurchaseId')).toBe(purchase.id);
    }
  });
});
