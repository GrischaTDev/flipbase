import '@angular/compiler';
import { ɵresolveComponentResources } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import {
  CustomSelectComponent,
  SelectOption,
} from '../../../../shared/components/custom-select/custom-select.component';
import { NumberInputComponent } from '../../../../shared/components/number-input/number-input.component';
import { PurchaseCostEditorComponent } from './purchase-cost-editor.component';
import type { PurchaseCostDraft } from './purchase-cost-adjustments';

interface AngularBindingMetadata {
  inputs: Record<string, unknown>;
  declaredInputs: Record<string, string>;
  outputs: Record<string, string>;
}

const metadataSnapshots = new Map<unknown, AngularBindingMetadata>();

function bridgeBindings(
  component: unknown,
  inputs: readonly string[],
  outputs: readonly string[] = [],
): void {
  if (import.meta.url.includes('/out-tsc/')) return;
  const metadata = (component as { ɵcmp: AngularBindingMetadata }).ɵcmp;
  metadataSnapshots.set(component, {
    inputs: metadata.inputs,
    declaredInputs: metadata.declaredInputs,
    outputs: metadata.outputs,
  });
  metadata.inputs = {
    ...metadata.inputs,
    ...Object.fromEntries(inputs.map((name) => [name, [name, 1, null]])),
  };
  metadata.declaredInputs = {
    ...metadata.declaredInputs,
    ...Object.fromEntries(inputs.map((name) => [name, name])),
  };
  metadata.outputs = {
    ...metadata.outputs,
    ...Object.fromEntries(outputs.map((name) => [name, name])),
  };
}

async function createEditor(
  purchaseType: 'lot' | 'mystery_pack' = 'lot',
  purchaseLineOptions: SelectOption<string>[] = [],
): Promise<ComponentFixture<PurchaseCostEditorComponent>> {
  TestBed.resetTestingModule();
  await TestBed.configureTestingModule({
    imports: [PurchaseCostEditorComponent],
  }).compileComponents();
  const fixture = TestBed.createComponent(PurchaseCostEditorComponent);
  fixture.componentRef.setInput('purchaseType', purchaseType);
  fixture.componentRef.setInput('initialCosts', []);
  fixture.componentRef.setInput('initialDiscountAmount', 0);
  fixture.componentRef.setInput('purchaseLineOptions', purchaseLineOptions);
  fixture.detectChanges();
  return fixture;
}

function findButton(host: HTMLElement, label: string): HTMLButtonElement {
  const button = Array.from(host.querySelectorAll('button')).find(
    (candidate) =>
      candidate.getAttribute('aria-label') === label ||
      candidate.textContent?.replace(/\s+/g, ' ').trim() === label,
  );
  if (!button) throw new Error(`Schaltfläche „${label}“ fehlt.`);
  return button;
}

describe('PurchaseCostEditorComponent', () => {
  beforeAll(async () => {
    await ɵresolveComponentResources(async (url) => {
      const resourceUrl = String(url);
      if (!url || resourceUrl === 'undefined' || resourceUrl.endsWith('/undefined')) return '';
      const fileName = resourceUrl.split('/').at(-1);
      if (resourceUrl.includes('custom-select.component.')) {
        return readFile(`src/app/shared/components/custom-select/${fileName}`, 'utf8');
      }
      if (resourceUrl.includes('number-input.component.')) {
        return readFile(`src/app/shared/components/number-input/${fileName}`, 'utf8');
      }
      if (resourceUrl.includes('button.component.')) {
        return readFile(`src/app/shared/components/button/${fileName}`, 'utf8');
      }
      return readFile(new URL(resourceUrl, import.meta.url), 'utf8');
    });
    bridgeBindings(PurchaseCostEditorComponent, [
      'purchaseType',
      'initialCosts',
      'initialDiscountAmount',
      'purchaseLineOptions',
    ]);
    bridgeBindings(
      CustomSelectComponent,
      ['ariaLabel', 'options', 'placeholder', 'size'],
      ['valueChange'],
    );
    bridgeBindings(NumberInputComponent, [
      'placeholder',
      'ariaLabel',
      'step',
      'min',
      'unit',
      'asCurrency',
      'showStepper',
    ]);
    bridgeBindings(
      ButtonComponent,
      ['variant', 'size', 'icon', 'iconOnly', 'ariaLabel', 'ariaExpanded', 'disabled'],
      ['clicked'],
    );
  });

  afterAll(() => {
    for (const [component, snapshot] of metadataSnapshots) {
      const metadata = (component as { ɵcmp: AngularBindingMetadata }).ɵcmp;
      metadata.inputs = snapshot.inputs;
      metadata.declaredInputs = snapshot.declaredInputs;
      metadata.outputs = snapshot.outputs;
    }
  });

  it('zeigt nur Zusatzausgabe, Betrag und Entfernen', async () => {
    const fixture = await createEditor();
    const host = fixture.nativeElement as HTMLElement;

    expect(host.textContent).toContain('Zusatzausgabe');
    expect(host.textContent).toContain('Betrag');
    expect(host.textContent).not.toContain('Wer hat diese Kosten berechnet?');
    expect(host.textContent).not.toContain('Verteilung ändern');
    expect(host.textContent).not.toContain('Zielposition');
    expect(host.querySelector('[aria-label="Zusatzausgabe 1"]')).not.toBeNull();
    expect(findButton(host, 'Zusatzausgabe hinzufügen').disabled).toBe(true);
  });

  it('gibt Rabatt getrennt von Zusatzkosten aus', async () => {
    const fixture = await createEditor();
    const discountsChanged = vi.fn();
    const costsChanged = vi.fn();
    fixture.componentInstance.discountChanged.subscribe(discountsChanged);
    fixture.componentInstance.costsChanged.subscribe(costsChanged);

    fixture.componentInstance.costRows.at(0).patchValue({ adjustment: 'discount', amount: 12 });
    fixture.detectChanges();

    expect(discountsChanged).toHaveBeenLastCalledWith(12);
    expect(costsChanged).toHaveBeenLastCalledWith([]);
    expect(
      findButton(fixture.nativeElement as HTMLElement, 'Zusatzausgabe hinzufügen').disabled,
    ).toBe(false);
  });

  it('entfernt eine Zusatzausgabe über den gemeinsamen roten Icon-Button', async () => {
    const fixture = await createEditor();
    const host = fixture.nativeElement as HTMLElement;
    const row = fixture.componentInstance.costRows.at(0);
    row.patchValue({ adjustment: 'shipping', amount: 8 });
    fixture.componentInstance.addCostRow();
    fixture.detectChanges();
    const remove = findButton(host, 'Zusatzausgabe 1 entfernen');

    expect(remove.closest('app-button')).not.toBeNull();
    expect(remove.classList).toContain('text-fb-critical');
    remove.click();
    fixture.detectChanges();

    expect(fixture.componentInstance.costRows.length).toBe(1);
    expect(fixture.componentInstance.costRows.controls).not.toContain(row);
  });

  it('bewahrt unsichtbare Steuer- und Zuordnungswerte vorhandener Kosten', async () => {
    const fixture = await createEditor('lot', [{ value: 'line-1', label: 'Kamera' }]);
    fixture.componentRef.setInput('initialCosts', [
      {
        type: 'shipping',
        amount: 8,
        description: 'Versandkosten',
        taxTreatment: 'expense',
        allocationMethod: 'direct',
        targetPurchaseLineId: 'line-1',
      },
    ]);
    const changed = vi.fn();
    fixture.componentInstance.costsChanged.subscribe(changed);
    fixture.detectChanges();

    fixture.componentInstance.costRows.at(0).controls.amount.setValue(9);

    expect(changed).toHaveBeenLastCalledWith([
      expect.objectContaining({
        amount: 9,
        taxTreatment: 'expense',
        allocationMethod: 'direct',
        targetPurchaseLineId: 'line-1',
      }),
    ]);
  });

  it.each([
    { purchaseType: 'lot' as const, defaultAllocation: 'by_value' },
    { purchaseType: 'mystery_pack' as const, defaultAllocation: 'by_quantity' },
  ])(
    'löst bei $purchaseType nur entfernte Artikelzuordnungen sichtbar auf',
    async ({ purchaseType, defaultAllocation }) => {
      const costs: readonly PurchaseCostDraft[] = [
        {
          type: 'travel',
          amount: 9.37,
          description: 'Fahrt zur Abholung',
          taxTreatment: 'expense',
          allocationMethod: 'direct',
          targetPurchaseLineId: 'line-1',
        },
        {
          type: 'shipping',
          amount: 8.25,
          description: 'Versand der Kamera',
          taxTreatment: 'purchase_price',
          allocationMethod: 'direct',
          targetPurchaseLineId: 'line-2',
        },
      ];
      const fixture = await createEditor(purchaseType, [
        { value: 'line-1', label: 'Objektiv' },
        { value: 'line-2', label: 'Kamera' },
      ]);
      const changed = vi.fn();
      const validityChanged = vi.fn();
      fixture.componentInstance.costsChanged.subscribe(changed);
      fixture.componentInstance.validityChanged.subscribe(validityChanged);
      fixture.componentRef.setInput('initialCosts', costs);
      fixture.detectChanges();
      const host = fixture.nativeElement as HTMLElement;
      const rows = fixture.componentInstance.costRows;

      expect(changed).toHaveBeenLastCalledWith(costs);
      expect(rows.valid).toBe(true);
      expect(host.querySelector('[role="status"]')).toBeNull();
      const retainedRow = rows.at(1).getRawValue();

      fixture.componentRef.setInput('purchaseLineOptions', [{ value: 'line-2', label: 'Kamera' }]);
      fixture.detectChanges();

      expect(rows.at(0).getRawValue()).toEqual({
        adjustment: 'other',
        amount: 9.37,
        allocationMethod: defaultAllocation,
        targetPurchaseLineId: null,
        sourceCost: costs[0],
        taxTreatment: 'expense',
      });
      expect(rows.at(0).controls.sourceCost.value).toBe(costs[0]);
      expect(rows.at(1).getRawValue()).toEqual(retainedRow);
      expect(rows.valid).toBe(true);
      expect(validityChanged).toHaveBeenLastCalledWith(true);
      expect(changed).toHaveBeenLastCalledWith([
        { ...costs[0], allocationMethod: defaultAllocation, targetPurchaseLineId: null },
        costs[1],
      ]);
      const notices = host.querySelectorAll('[role="status"]');
      expect(notices).toHaveLength(1);
      expect(notices[0].textContent).toContain('Artikelzuordnung');
      expect(notices[0].textContent).toContain('entfernt');
      expect(notices[0].textContent).toContain('gesamten Einkauf');
      expect(findButton(host, 'Zusatzausgabe hinzufügen').disabled).toBe(false);
    },
  );

  it('setzt technische Standardwerte für neue normale Kosten', async () => {
    const fixture = await createEditor();
    const row = fixture.componentInstance.costRows.at(0);

    expect(row.controls.taxTreatment.value).toBeNull();
    expect(row.controls.allocationMethod.value).toBe('by_value');
  });

  it('setzt für neue Mystery-Kosten die Verteilung nach Menge', async () => {
    const fixture = await createEditor('mystery_pack');
    const row = fixture.componentInstance.costRows.at(0);

    expect(row.controls.allocationMethod.value).toBe('by_quantity');
  });
});
