import '@angular/compiler';
import { registerLocaleData } from '@angular/common';
import localeDe from '@angular/common/locales/de';
import { ɵresolveComponentResources } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import axe from 'axe-core';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import { PurchaseCostingService } from '../../../../core/services/purchase-costing.service';
import { PurchaseCostRepairComponent } from './purchase-cost-repair.component';

beforeAll(async () => {
  registerLocaleData(localeDe);
  await ɵresolveComponentResources((url) =>
    readFile(resolve('src/app/features/purchases/components/purchase-cost-repair', url), 'utf8'),
  );
});
afterEach(() => TestBed.resetTestingModule());

it('zeigt die geprüften Beträge und erlaubt die Übernahme erst nach Bestätigung', async () => {
  const repairPurchaseCosts = vi.fn(async () => ({ data: true, error: null }));
  TestBed.configureTestingModule({
    imports: [PurchaseCostRepairComponent],
    providers: [
      {
        provide: PurchaseCostingService,
        useValue: {
          previewCostRepair: async () => ({
            data: {
              purchaseId: 'purchase-1',
              purchasePrice: 100,
              fingerprint: 'checked',
              classification: 'auto_repair',
              reason: '',
              costs: [{ id: 'cost-1', type: 'shipping', amount: 5, description: null }],
              items: [{ id: 'item-1', title: 'Nackenkissen', status: 'sold' }],
            },
            error: null,
          }),
          repairPurchaseCosts,
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(PurchaseCostRepairComponent);
  Object.defineProperty(fixture.componentInstance, 'purchase', {
    value: () => ({ id: 'purchase-1', workspace_id: 'workspace-1' }),
  });
  fixture.detectChanges();
  await fixture.componentInstance.load();
  fixture.detectChanges();
  const host = fixture.nativeElement as HTMLElement;
  const save = [...host.querySelectorAll('button')].find((button) =>
    button.textContent?.includes('übernehmen'),
  )!;
  expect(save.disabled).toBe(true);
  expect(host.textContent).toContain('105,00');
  expect(host.textContent).toContain('Nackenkissen');
  const checkbox = host.querySelector<HTMLInputElement>('input[type=checkbox]')!;
  checkbox.click();
  fixture.detectChanges();
  expect(save.disabled).toBe(false);
  const accessibility = await axe.run(host, { rules: { 'color-contrast': { enabled: false } } });
  expect(accessibility.violations).toEqual([]);
  save.click();
  await fixture.whenStable();
  expect(repairPurchaseCosts).toHaveBeenCalledWith('workspace-1', 'purchase-1', 'checked');
});
