import '@angular/compiler';
import { ɵresolveComponentResources } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { glob, readFile } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { CustomSelectComponent } from '../../../../shared/components/custom-select/custom-select.component';
import { ModalShellComponent } from '../../../../shared/components/modal-shell/modal-shell.component';
import { NumberInputComponent } from '../../../../shared/components/number-input/number-input.component';
import { ModalDialogDirective } from '../../../../shared/directives/modal-dialog.directive';
import { PurchaseCostEditorComponent } from '../purchase-cost-editor/purchase-cost-editor.component';
import { PurchaseCostOverviewDialogComponent } from './purchase-cost-overview-dialog.component';

interface AngularBindingMetadata {
  inputs: Record<string, unknown>;
  declaredInputs: Record<string, string>;
  outputs: Record<string, string>;
}

const metadataSnapshots = new Map<unknown, AngularBindingMetadata>();

function bridgeBindings(
  target: unknown,
  inputs: readonly string[],
  outputs: readonly string[] = [],
  directive = false,
): void {
  if (import.meta.url.includes('/out-tsc/')) return;
  const definition = directive ? 'ɵdir' : 'ɵcmp';
  const metadata = (target as Record<string, AngularBindingMetadata>)[definition];
  metadataSnapshots.set(target, {
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

async function createDialog(): Promise<ComponentFixture<PurchaseCostOverviewDialogComponent>> {
  TestBed.resetTestingModule();
  await TestBed.configureTestingModule({
    imports: [PurchaseCostOverviewDialogComponent],
  }).compileComponents();
  const fixture = TestBed.createComponent(PurchaseCostOverviewDialogComponent);
  fixture.componentRef.setInput('purchaseType', 'lot');
  fixture.componentRef.setInput('initialDiscountAmount', 0);
  fixture.componentRef.setInput('initialCosts', []);
  fixture.componentRef.setInput('purchaseLineOptions', []);
  fixture.detectChanges();
  return fixture;
}

function findButton(host: HTMLElement, label: string): HTMLButtonElement {
  const button = Array.from(host.querySelectorAll('button')).find(
    (candidate) => candidate.textContent?.replace(/\s+/g, ' ').trim() === label,
  );
  if (!button) throw new Error(`Schaltfläche „${label}“ fehlt.`);
  return button;
}

describe('PurchaseCostOverviewDialogComponent', () => {
  beforeAll(async () => {
    await ɵresolveComponentResources(async (url) => {
      const resourceUrl = String(url);
      if (!url || resourceUrl === 'undefined' || resourceUrl.endsWith('/undefined')) return '';
      const fileName = resourceUrl.replace(/^\.\//, '');
      const matches: string[] = [];
      for await (const match of glob(`src/app/**/${fileName}`)) matches.push(match);
      if (matches.length !== 1) {
        throw new Error(`Test-Ressource ${resourceUrl} ist nicht eindeutig: ${matches.join(', ')}`);
      }
      return readFile(matches[0], 'utf8');
    });
    bridgeBindings(PurchaseCostOverviewDialogComponent, [
      'purchaseType',
      'initialDiscountAmount',
      'initialCosts',
      'purchaseLineOptions',
    ]);
    bridgeBindings(
      PurchaseCostEditorComponent,
      ['purchaseType', 'initialDiscountAmount', 'initialCosts', 'purchaseLineOptions'],
      ['costsChanged', 'discountChanged', 'validityChanged', 'rawChanged'],
    );
    bridgeBindings(
      ButtonComponent,
      ['variant', 'size', 'icon', 'iconOnly', 'ariaLabel', 'ariaExpanded', 'disabled'],
      ['clicked'],
    );
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
    bridgeBindings(ModalShellComponent, ['title', 'size'], ['closed']);
    bridgeBindings(
      ModalDialogDirective,
      ['dialogTitel', 'schliesstBeiKlickAussen'],
      ['dialogClose'],
      true,
    );
  });

  afterAll(() => {
    for (const [target, snapshot] of metadataSnapshots) {
      const component = target as Record<string, AngularBindingMetadata>;
      const metadata = component['ɵcmp'] ?? component['ɵdir'];
      metadata.inputs = snapshot.inputs;
      metadata.declaredInputs = snapshot.declaredInputs;
      metadata.outputs = snapshot.outputs;
    }
  });

  it('verwirft den lokalen Entwurf beim Abbrechen', async () => {
    const fixture = await createDialog();
    const saved = vi.fn();
    const closed = vi.fn();
    fixture.componentInstance.saved.subscribe(saved);
    fixture.componentInstance.closed.subscribe(closed);
    fixture.componentInstance.onDiscountChanged(12);
    fixture.componentInstance.onValidityChanged(true);
    fixture.detectChanges();

    findButton(fixture.nativeElement as HTMLElement, 'Abbrechen').click();

    expect(saved).not.toHaveBeenCalled();
    expect(closed).toHaveBeenCalledOnce();
  });

  it('gibt den lokalen Entwurf erst beim Speichern aus', async () => {
    const fixture = await createDialog();
    const saved = vi.fn();
    fixture.componentInstance.saved.subscribe(saved);
    fixture.componentInstance.onCostsChanged([
      {
        type: 'shipping',
        amount: 10,
        description: 'Versandkosten',
        allocationMethod: 'by_value',
        targetPurchaseLineId: null,
      },
    ]);
    fixture.componentInstance.onValidityChanged(true);
    fixture.detectChanges();

    const saveButton = findButton(fixture.nativeElement as HTMLElement, 'Speichern');
    expect(saveButton.disabled).toBe(false);
    saveButton.click();

    expect(saved).toHaveBeenCalledWith({
      discountAmount: 0,
      costs: [
        {
          type: 'shipping',
          amount: 10,
          description: 'Versandkosten',
          allocationMethod: 'by_value',
          targetPurchaseLineId: null,
        },
      ],
    });
  });

  it('aktiviert Speichern bei einer alleinigen Änderung der Kostenherkunft', async () => {
    const fixture = await createDialog();
    const cost = {
      type: 'shipping' as const,
      amount: 8,
      description: 'Versand',
      allocationMethod: 'by_value' as const,
      targetPurchaseLineId: null,
      taxTreatment: null,
    };
    fixture.componentRef.setInput('initialCosts', [cost]);
    fixture.detectChanges();
    const editor = fixture.debugElement.query(By.directive(PurchaseCostEditorComponent))
      .componentInstance as PurchaseCostEditorComponent;
    const saved = vi.fn();
    fixture.componentInstance.saved.subscribe(saved);
    expect(fixture.componentInstance.isDirty()).toBe(false);
    editor.costRows.at(0).controls.taxTreatment.setValue('expense');
    fixture.detectChanges();
    expect(fixture.componentInstance.saveDisabled()).toBe(false);
    findButton(fixture.nativeElement as HTMLElement, 'Speichern').click();
    expect(saved).toHaveBeenCalledWith({
      discountAmount: 0,
      costs: [{ ...cost, taxTreatment: 'expense' }],
    });
  });

  it('erkennt auch eine unvollständige rohe Eingabe als ungespeichert', async () => {
    const fixture = await createDialog();
    const editor = fixture.debugElement.query(By.directive(PurchaseCostEditorComponent))
      .componentInstance as PurchaseCostEditorComponent;
    editor.costRows.at(0).controls.amount.setValue(10);

    expect(fixture.componentInstance.hasUnsavedChanges()).toBe(true);
    expect(fixture.componentInstance.isDirty()).toBe(false);
  });
});
