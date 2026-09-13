import '@angular/compiler';
import { signal, ɵresolveComponentResources } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { glob, readFile } from 'node:fs/promises';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { InventoryItem } from '../../../../core/models/flipbase.models';
import { InventoryService } from '../../../../core/services/inventory.service';
import { PurchaseService } from '../../../../core/services/purchase.service';
import { MediaService } from '../../../../core/services/media.service';
import { AiAssistantService } from '../../../../core/services/ai-assistant.service';
import { BarcodeLookupService } from '../../../../core/services/barcode-lookup.service';
import { CatalogService } from '../../../../core/services/catalog.service';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { SyncStatusService } from '../../../../core/services/sync-status.service';
import { CustomSelectComponent } from '../../../../shared/components/custom-select/custom-select.component';
import { ItemCreateModalComponent } from './item-create-modal.component';

let restoreInputs = (): void => undefined;
beforeAll(async () => {
  await ɵresolveComponentResources(async (url) => {
    const matches: string[] = [];
    for await (const match of glob(`src/app/**/${url.replace(/^\.\//, '')}`)) matches.push(match);
    if (matches.length !== 1) throw new Error(`Test-Ressource nicht eindeutig: ${url}`);
    return readFile(matches[0], 'utf8');
  });
  const metadata = (
    CustomSelectComponent as unknown as {
      ɵcmp: { inputs: Record<string, unknown>; declaredInputs: Record<string, string> };
    }
  ).ɵcmp;
  const originalInputs = metadata.inputs;
  const originalDeclared = metadata.declaredInputs;
  restoreInputs = () => {
    metadata.inputs = originalInputs;
    metadata.declaredInputs = originalDeclared;
  };
  metadata.inputs = { ...metadata.inputs };
  metadata.declaredInputs = { ...metadata.declaredInputs };
  for (const name of ['options', 'ariaLabel', 'triggerId', 'size']) {
    metadata.inputs[name] = [name, 1, null];
    metadata.declaredInputs[name] = name;
  }
});
afterEach(() => TestBed.resetTestingModule());
afterAll(() => restoreInputs());

describe('Gemeinsame Artikelbearbeitung für Paketinhalt', () => {
  it.each([null, 0, 12])('lädt und speichert Kosten %s über das echte Formular', async (cost) => {
    const item: InventoryItem = {
      id: 'content',
      workspace_id: 'ws',
      purchase_id: 'purchase',
      source_package_line_id: 'package',
      title: 'Ein Paar Schuhe',
      condition: 'used',
      status: 'ready',
      allocated_purchase_cost: cost,
    };
    const updateItem = vi.fn(async () => ({ error: null }));
    TestBed.configureTestingModule({
      imports: [ItemCreateModalComponent],
      providers: [
        { provide: InventoryService, useValue: { updateItem } },
        {
          provide: PurchaseService,
          useValue: {
            purchases: signal([{ id: 'purchase', title: 'Paket', purchase_date: '2026-09-13' }]),
          },
        },
        { provide: MediaService, useValue: {} },
        { provide: AiAssistantService, useValue: {} },
        { provide: BarcodeLookupService, useValue: {} },
        { provide: CatalogService, useValue: {} },
        { provide: WorkspaceService, useValue: { currentWorkspace: signal({ id: 'ws' }) } },
        { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn() } },
        { provide: SyncStatusService, useValue: { istZentralGemeldet: () => false } },
      ],
    });
    const fixture = TestBed.createComponent(ItemCreateModalComponent);
    Object.assign(fixture.componentInstance, { item: signal(item), presentation: signal('page') });
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const costInput = host.querySelector<HTMLInputElement>('#itemCost')!;
    expect(costInput.value).toBe(cost === null ? '' : String(cost));
    expect(fixture.componentInstance.form.controls.purchase_id.disabled).toBe(true);
    expect(host.textContent).toContain('Die Herkunft bleibt unverändert');
    const title = host.querySelector<HTMLInputElement>('#itemTitle')!;
    title.value = 'Schuhe mit neuer Beschreibung';
    title.dispatchEvent(new Event('input', { bubbles: true }));
    await fixture.componentInstance.onSubmit();
    expect(updateItem).toHaveBeenCalledWith(
      'content',
      expect.objectContaining({
        title: title.value,
        allocated_purchase_cost: cost,
        purchase_id: 'purchase',
      }),
    );
  });
});
