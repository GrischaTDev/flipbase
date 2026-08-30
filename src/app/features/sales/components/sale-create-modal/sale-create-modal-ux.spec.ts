import '@angular/compiler';
import { registerLocaleData } from '@angular/common';
import localeDe from '@angular/common/locales/de';
import { signal, ɵresolveComponentResources } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { InventoryService } from '../../../../core/services/inventory.service';
import { ProfitEngineService } from '../../../../core/services/profit-engine.service';
import { SalesService } from '../../../../core/services/sales.service';
import { StockService } from '../../../../core/services/stock.service';
import { SyncStatusService } from '../../../../core/services/sync-status.service';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { CustomSelectComponent } from '../../../../shared/components/custom-select/custom-select.component';
import { DatePickerComponent } from '../../../../shared/components/date-picker/date-picker.component';
import { ModalDialogDirective } from '../../../../shared/directives/modal-dialog.directive';
import { SaleCreateModalComponent } from './sale-create-modal.component';

TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
type InputDefinition = {
  inputs: Record<string, [string, number, null]>;
  declaredInputs: Record<string, string>;
};

function exposeInputs(definition: InputDefinition, names: readonly string[]): void {
  definition.inputs = {
    ...definition.inputs,
    ...Object.fromEntries(names.map((name) => [name, [name, 1, null] as [string, number, null]])),
  };
  definition.declaredInputs = {
    ...definition.declaredInputs,
    ...Object.fromEntries(names.map((name) => [name, name])),
  };
}

async function resolveTemplateResources(): Promise<void> {
  await ɵresolveComponentResources((url) =>
    readdir(resolve('src/app'), { recursive: true }).then((files) => {
      const matches = files.filter((file) => file.endsWith(url.slice(2)));
      if (matches.length !== 1) throw new Error(`Unbekannte Test-Ressource: ${url}`);
      return readFile(resolve('src/app', matches[0]), 'utf8');
    }),
  );
}

beforeAll(async () => {
  registerLocaleData(localeDe);
  await resolveTemplateResources();
  exposeInputs((CustomSelectComponent as unknown as { ɵcmp: InputDefinition }).ɵcmp, [
    'options',
    'placeholder',
    'size',
  ]);
  exposeInputs((DatePickerComponent as unknown as { ɵcmp: InputDefinition }).ɵcmp, ['feldId']);
  exposeInputs((ModalDialogDirective as unknown as { ɵdir: InputDefinition }).ɵdir, [
    'dialogTitel',
  ]);
});

describe('SaleCreateModalComponent – historische Verkaufskorrektur', () => {
  it('zeigt den automatischen Protokollhinweis ohne manuelles Grundfeld', async () => {
    TestBed.configureTestingModule({
      imports: [SaleCreateModalComponent],
      providers: [
        {
          provide: SalesService,
          useValue: { recordSale: vi.fn(), recordLegacySale: vi.fn(), updateSale: vi.fn() },
        },
        { provide: InventoryService, useValue: { items: signal([]) } },
        { provide: StockService, useValue: { positions: signal([]) } },
        {
          provide: ProfitEngineService,
          useValue: { calculateProfit: () => 0, calculateRoi: () => 0 },
        },
        { provide: ToastService, useValue: new ToastService() },
        { provide: SyncStatusService, useValue: new SyncStatusService() },
      ],
    });
    await resolveTemplateResources();
    await TestBed.compileComponents();
    const fixture = TestBed.createComponent(SaleCreateModalComponent);
    Object.assign(fixture.componentInstance, {
      saleTarget: signal({
        kind: 'inventory_item' as const,
        inventoryItemId: 'item-1',
        title: 'Testartikel',
      }),
      legacyReconciliation: signal({
        kind: 'legacy_sold_unverified' as const,
        inventoryItemId: 'item-1',
      }),
    });
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.textContent).toContain('Historischen Verkauf nachtragen');
    expect(host.textContent).toContain('Diese Korrektur wird automatisch protokolliert.');
    expect(host.textContent).not.toContain('Dokumentierter Grund');
    expect(host.textContent).not.toContain('Legacy');
    expect(host.querySelector('#reconciliation-reason')).toBeNull();
  });
});
