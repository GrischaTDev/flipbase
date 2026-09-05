import '@angular/compiler';
import { signal } from '@angular/core';
import { FormControl } from '@angular/forms';
import { describe, expect, it, vi } from 'vitest';
import { PurchaseCostRepairComponent } from './purchase-cost-repair.component';

describe('PurchaseCostRepairComponent', () => {
  it('übernimmt ohne bestätigte Vollständigkeit keine Kosten', async () => {
    const repairPurchaseCosts = vi.fn();
    const component = Object.create(
      PurchaseCostRepairComponent.prototype,
    ) as PurchaseCostRepairComponent;
    Object.assign(component, {
      busy: signal(false),
      confirmed: new FormControl(false),
      costing: { repairPurchaseCosts },
    });
    await component.save();
    expect(repairPurchaseCosts).not.toHaveBeenCalled();
  });

  it('verwirft verspätete Vorschauen nach einem Einkaufswechsel', async () => {
    const purchase = signal({ id: 'first', workspace_id: 'workspace' });
    const preview = signal(null);
    const component = Object.create(
      PurchaseCostRepairComponent.prototype,
    ) as PurchaseCostRepairComponent;
    Object.assign(component, {
      purchase,
      preview,
      busy: signal(false),
      message: signal(''),
      reviewedKey: signal(''),
      confirmed: new FormControl(false),
      costing: {
        previewCostRepair: async () => {
          purchase.set({ id: 'second', workspace_id: 'workspace' });
          return { data: { purchaseId: 'first' }, error: null };
        },
      },
    });
    await component.load();
    expect(preview()).toBeNull();
    expect(component.busy()).toBe(false);
  });
});
