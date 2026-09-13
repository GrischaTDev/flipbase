import '@angular/compiler';
import { ɵresolveComponentResources, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PurchaseCostingService } from '../../../../core/services/purchase-costing.service';
import { PurchaseCorrectionDialogComponent } from './purchase-correction-dialog.component';

import { CustomSelectComponent } from '../../../../shared/components/custom-select/custom-select.component';
import { NumberInputComponent } from '../../../../shared/components/number-input/number-input.component';

interface BindingMetadata {
  inputs: Record<string, unknown>;
  declaredInputs: Record<string, string>;
}
const snapshots = new Map<unknown, BindingMetadata>();
function bridgeInputs(component: unknown, names: string[]): void {
  if (import.meta.url.includes('/out-tsc/')) return;
  const metadata = (component as { ɵcmp: BindingMetadata }).ɵcmp;
  snapshots.set(component, { inputs: metadata.inputs, declaredInputs: metadata.declaredInputs });
  metadata.inputs = {
    ...metadata.inputs,
    ...Object.fromEntries(names.map((name) => [name, [name, 1, null]])),
  };
  metadata.declaredInputs = {
    ...metadata.declaredInputs,
    ...Object.fromEntries(names.map((name) => [name, name])),
  };
}
afterAll(() => {
  for (const [component, snapshot] of snapshots) {
    Object.assign((component as { ɵcmp: BindingMetadata }).ɵcmp, snapshot);
  }
});

beforeAll(async () => {
  TestBed.resetTestingModule();
  await ɵresolveComponentResources(async (url) => {
    const resourceUrl = String(url);
    if (resourceUrl.includes('custom-select.component.')) {
      const fileName = resourceUrl.split('/').at(-1);
      return readFile(`src/app/shared/components/custom-select/${fileName}`, 'utf8');
    }
    if (resourceUrl.includes('number-input.component.')) {
      const fileName = resourceUrl.split('/').at(-1);
      return readFile(`src/app/shared/components/number-input/${fileName}`, 'utf8');
    }
    return readFile(new URL(resourceUrl, import.meta.url), 'utf8');
  });
  bridgeInputs(CustomSelectComponent, ['ariaLabel', 'options', 'size', 'placeholder']);
  bridgeInputs(NumberInputComponent, ['feldId', 'minimum', 'alsBetrag']);
});

describe('PurchaseCorrectionDialogComponent', () => {
  it('verlangt genau einen verständlichen Grund der Korrektur', async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [PurchaseCorrectionDialogComponent],
      providers: [{ provide: PurchaseCostingService, useValue: {} }],
    });
    const fixture = TestBed.createComponent(PurchaseCorrectionDialogComponent);
    Object.assign(fixture.componentInstance, {
      purchase: signal({
        id: 'purchase-1',
        workspace_id: 'workspace-1',
        type: 'mystery_pack',
        title: 'Mystery Box',
        purchase_date: '2026-08-31',
        purchase_price: 45,
        cost_allocation_mode: 'even',
        entry_status: 'finalized',
        purchase_lines: [],
        costs: [],
      }),
    });
    fixture.detectChanges();
    await fixture.whenStable();

    const text = fixture.nativeElement.textContent as string;
    const reasonLabels = Array.from(
      fixture.nativeElement.querySelectorAll('label') as NodeListOf<HTMLLabelElement>,
    ).filter((label) => label.textContent?.trim() === 'Grund der Korrektur');
    expect(reasonLabels).toHaveLength(1);
    expect(text).toContain(
      'Die Änderung wird protokolliert und betroffene Verkaufsergebnisse werden neu berechnet.',
    );
    expect(text).not.toMatch(/Legacy|Altdaten|Bestandsrücknahme/);
    expect(fixture.componentInstance.form.controls.reason.hasError('required')).toBe(true);
  });

  it('bewahrt unbekannte Kostenzuordnung und speichert eine ausdrücklich korrigierte Herkunft', async () => {
    const correctPurchase = vi.fn(async () => ({
      data: null,
      error: null,
      reportedBySyncStatus: false,
    }));
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [PurchaseCorrectionDialogComponent],
      providers: [{ provide: PurchaseCostingService, useValue: { correctPurchase } }],
    });
    const fixture = TestBed.createComponent(PurchaseCorrectionDialogComponent);
    Object.assign(fixture.componentInstance, {
      purchase: signal({
        id: 'purchase-1',
        workspace_id: 'workspace-1',
        type: 'lot',
        title: 'Werkzeug',
        purchase_date: '2026-09-13',
        purchase_price: 50,
        purchase_lines: [],
        costs: [
          { id: 'cost-unknown', type: 'shipping', amount: 5, tax_treatment: null },
          { id: 'cost-expense', type: 'transport', amount: 10, tax_treatment: 'expense' },
        ],
      }),
    });
    fixture.detectChanges();
    const component = fixture.componentInstance;
    expect(component.costRows.at(0).controls.taxTreatment.value).toBeNull();
    const trigger = (fixture.nativeElement as HTMLElement).querySelector(
      '[aria-label="Kostenherkunft 1"]',
    );
    expect(trigger?.textContent?.trim()).toBe('Noch prüfen');
    expect(component.costRows.at(1).controls.taxTreatment.value).toBe('expense');
    component.form.controls.reason.setValue('Beleg geprüft');
    await component.submit();
    expect(correctPurchase).toHaveBeenLastCalledWith(
      expect.objectContaining({
        costs: [
          expect.objectContaining({ id: 'cost-unknown', tax_treatment: null }),
          expect.objectContaining({ id: 'cost-expense', tax_treatment: 'expense' }),
        ],
      }),
    );
    component.costRows.at(0).controls.taxTreatment.setValue('purchase_price');
    await component.submit();
    expect(correctPurchase).toHaveBeenLastCalledWith(
      expect.objectContaining({
        costs: [
          expect.objectContaining({ id: 'cost-unknown', tax_treatment: 'purchase_price' }),
          expect.objectContaining({ id: 'cost-expense', tax_treatment: 'expense' }),
        ],
      }),
    );
  });

  it('behält den einzigen Korrekturgrund bei einem Servicefehler erhalten', async () => {
    const correctPurchase = vi.fn(async () => ({
      data: null,
      error: new Error('Die Korrektur konnte nicht gebucht werden.'),
      reportedBySyncStatus: false,
    }));
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [PurchaseCorrectionDialogComponent],
      providers: [{ provide: PurchaseCostingService, useValue: { correctPurchase } }],
    });
    const fixture = TestBed.createComponent(PurchaseCorrectionDialogComponent);
    Object.assign(fixture.componentInstance, {
      purchase: signal({
        id: 'purchase-1',
        workspace_id: 'workspace-1',
        type: 'mystery_pack',
        title: 'Mystery Box',
        purchase_date: '2026-08-31',
        purchase_price: 45,
        cost_allocation_mode: 'even',
        entry_status: 'finalized',
        purchase_lines: [],
        costs: [],
      }),
    });
    fixture.detectChanges();
    fixture.componentInstance.form.controls.reason.setValue('Versandbetrag berichtigt');

    await fixture.componentInstance.submit();

    expect(correctPurchase).toHaveBeenCalledOnce();
    expect(fixture.componentInstance.form.controls.reason.value).toBe('Versandbetrag berichtigt');
    expect(fixture.componentInstance.errorMessage()).toBe(
      'Die Korrektur konnte nicht gebucht werden.',
    );
  });

  it('weist einen Korrekturgrund aus reinem Leerraum bereits im Client zurück', async () => {
    const correctPurchase = vi.fn();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [PurchaseCorrectionDialogComponent],
      providers: [{ provide: PurchaseCostingService, useValue: { correctPurchase } }],
    });
    const fixture = TestBed.createComponent(PurchaseCorrectionDialogComponent);
    Object.assign(fixture.componentInstance, {
      purchase: signal({
        id: 'purchase-1',
        workspace_id: 'workspace-1',
        type: 'mystery_pack',
        title: 'Mystery Box',
        purchase_date: '2026-08-31',
        purchase_price: 45,
        cost_allocation_mode: 'even',
        entry_status: 'finalized',
        purchase_lines: [],
        costs: [],
      }),
    });
    fixture.detectChanges();
    fixture.componentInstance.form.controls.reason.setValue('   \t  ');

    await fixture.componentInstance.submit();

    expect(fixture.componentInstance.form.controls.reason.invalid).toBe(true);
    expect(correctPurchase).not.toHaveBeenCalled();
  });

  it('sperrt eine wiederholte Korrektur während der laufenden Buchung', async () => {
    let resolveCorrection!: (value: {
      data: null;
      error: null;
      reportedBySyncStatus: false;
    }) => void;
    const correctPurchase = vi.fn(
      () =>
        new Promise<{ data: null; error: null; reportedBySyncStatus: false }>((resolve) => {
          resolveCorrection = resolve;
        }),
    );
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [PurchaseCorrectionDialogComponent],
      providers: [{ provide: PurchaseCostingService, useValue: { correctPurchase } }],
    });
    const fixture = TestBed.createComponent(PurchaseCorrectionDialogComponent);
    Object.assign(fixture.componentInstance, {
      purchase: signal({
        id: 'purchase-1',
        workspace_id: 'workspace-1',
        type: 'mystery_pack',
        title: 'Mystery Box',
        purchase_date: '2026-08-31',
        purchase_price: 45,
        cost_allocation_mode: 'even',
        entry_status: 'finalized',
        purchase_lines: [],
        costs: [],
      }),
    });
    fixture.detectChanges();
    fixture.componentInstance.form.controls.reason.setValue('Kaufpreis berichtigt');

    const first = fixture.componentInstance.submit();
    const second = fixture.componentInstance.submit();
    expect(correctPurchase).toHaveBeenCalledOnce();
    resolveCorrection({ data: null, error: null, reportedBySyncStatus: false });
    await Promise.all([first, second]);
  });
});
