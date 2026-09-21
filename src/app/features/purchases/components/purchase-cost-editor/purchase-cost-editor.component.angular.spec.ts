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
