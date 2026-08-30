import '@angular/compiler';
import { registerLocaleData } from '@angular/common';
import localeDe from '@angular/common/locales/de';
import { signal, ɵresolveComponentResources } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { provideRouter, Routes, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { InventoryItem } from '../../../../core/models/flipbase.models';
import { InventoryService } from '../../../../core/services/inventory.service';
import { MediaService } from '../../../../core/services/media.service';
import { SyncStatusService } from '../../../../core/services/sync-status.service';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.service';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { ItemDetailComponent } from './item-detail.component';
import { provideTranslateService } from '@ngx-translate/core';

TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
const resources: Record<string, string> = {
  './item-detail.component.html':
    'src/app/features/inventory/pages/item-detail/item-detail.component.html',
  './custom-select.component.html':
    'src/app/shared/components/custom-select/custom-select.component.html',
  './custom-checkbox.component.html':
    'src/app/shared/components/custom-checkbox/custom-checkbox.component.html',
  './custom-checkbox.component.scss':
    'src/app/shared/components/custom-checkbox/custom-checkbox.component.scss',
  './inventory-label-modal.component.html':
    'src/app/shared/components/inventory-label-modal/inventory-label-modal.component.html',
  './item-create-modal.component.html':
    'src/app/features/inventory/components/item-create-modal/item-create-modal.component.html',
};

async function resolveItemResources(): Promise<void> {
  await ɵresolveComponentResources((url) => {
    const resource = resources[url];
    if (resource) return readFile(resolve(resource), 'utf8');

    return readdir(resolve('src/app'), { recursive: true }).then((files) => {
      const matches = files.filter((file) => file.endsWith(url.slice(2)));
      if (matches.length !== 1) throw new Error(`Unbekannte Test-Ressource: ${url}`);
      return readFile(resolve('src/app', matches[0]), 'utf8');
    });
  });
}

interface ItemDetailComponentDefinition {
  readonly ɵcmp: {
    declaredInputs: Record<string, string>;
    inputs: Record<string, [string, number, null]>;
  };
}

const itemDetailDefinition = ItemDetailComponent as unknown as ItemDetailComponentDefinition;
let urspruenglicheInputs: Record<string, [string, number, null]>;
let urspruenglicheDeclaredInputs: Record<string, string>;

beforeAll(async () => {
  registerLocaleData(localeDe);
  await resolveItemResources();
  urspruenglicheInputs = itemDetailDefinition.ɵcmp.inputs;
  urspruenglicheDeclaredInputs = itemDetailDefinition.ɵcmp.declaredInputs;
  itemDetailDefinition.ɵcmp.inputs = {
    ...itemDetailDefinition.ɵcmp.inputs,
    id: ['id', 1, null],
    fromPurchaseId: ['fromPurchaseId', 1, null],
  };
  itemDetailDefinition.ɵcmp.declaredInputs = {
    ...itemDetailDefinition.ɵcmp.declaredInputs,
    id: 'id',
    fromPurchaseId: 'fromPurchaseId',
  };
});

afterAll(() => {
  itemDetailDefinition.ɵcmp.inputs = urspruenglicheInputs;
  itemDetailDefinition.ɵcmp.declaredInputs = urspruenglicheDeclaredInputs;
});

const purchase = { id: 'purchase-1' };
const item: InventoryItem = {
  id: 'item-1',
  workspace_id: 'workspace-1',
  purchase_id: purchase.id,
  title: 'Testartikel',
  condition: 'used',
  status: 'sold',
  sale_state: 'sold',
  allocated_purchase_cost: 10,
};

const routes: Routes = [{ path: 'inventory/:id', component: ItemDetailComponent }];

let selectedItem = signal<InventoryItem | null>(null);

beforeEach(() => {
  selectedItem = signal<InventoryItem | null>(null);
  const inventoryService = {
    selectedItem,
    itemCosts: signal([]),
    activityLogs: signal([]),
    getItemById: async () => selectedItem(),
  };

  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideRouter(routes, withComponentInputBinding()),
      provideTranslateService(),
      { provide: InventoryService, useValue: inventoryService },
      { provide: MediaService, useValue: { loadItemMedia: async () => [] } },
      { provide: ConfirmDialogService, useValue: {} },
      { provide: SyncStatusService, useValue: {} },
      { provide: ToastService, useValue: {} },
    ],
  });
});

async function createHarness(initialItem: InventoryItem | null) {
  selectedItem.set(initialItem);
  return RouterTestingHarness.create();
}

describe('ItemDetailComponent – Einkaufs-Rücknavigation', () => {
  it('verlinkt bei passendem Einkaufs-Kontext zum tatsächlichen Einkauf', async () => {
    const harness = await createHarness(item);
    await harness.navigateByUrl(`/inventory/${item.id}?fromPurchaseId=${purchase.id}`);

    const root = harness.routeNativeElement as HTMLElement;
    expect(root.textContent).toContain('Zurück zum Einkauf');
    expect(root.querySelector<HTMLAnchorElement>('[data-item-back-link]')?.pathname).toBe(
      `/purchases/${purchase.id}`,
    );
  });

  it('fällt bei einem fremden Einkaufs-Kontext auf das Inventar zurück', async () => {
    const harness = await createHarness(item);
    await harness.navigateByUrl(`/inventory/${item.id}?fromPurchaseId=fremder-einkauf`);

    expect(harness.routeNativeElement!.textContent).toContain('Zurück zum Inventar');
  });

  it('fällt bei einer vom Pfad abweichenden geladenen Artikel-ID auf das Inventar zurück', async () => {
    const harness = await createHarness(item);
    selectedItem.set({ ...item, id: 'stale-item', purchase_id: purchase.id });
    await harness.navigateByUrl(`/inventory/${item.id}?fromPurchaseId=${purchase.id}`);

    expect(harness.routeNativeElement!.textContent).toContain('Zurück zum Inventar');
  });

  it('fällt ohne Einkaufs-Parameter auf das Inventar zurück', async () => {
    const harness = await createHarness(item);
    await harness.navigateByUrl(`/inventory/${item.id}`);

    expect(harness.routeNativeElement!.textContent).toContain('Zurück zum Inventar');
  });

  it('zeigt bis zum Nachladen keinen ungeprüften Einkaufs-Rücksprung', async () => {
    const harness = await createHarness(null);
    await harness.navigateByUrl(`/inventory/${item.id}?fromPurchaseId=${purchase.id}`);
    expect(harness.routeNativeElement!.textContent).toContain('Zurück zum Inventar');

    selectedItem.set(item);
    harness.detectChanges();

    const root = harness.routeNativeElement as HTMLElement;
    expect(root.textContent).toContain('Zurück zum Einkauf');
    expect(root.querySelector<HTMLAnchorElement>('[data-item-back-link]')?.pathname).toBe(
      `/purchases/${purchase.id}`,
    );
  });
});
