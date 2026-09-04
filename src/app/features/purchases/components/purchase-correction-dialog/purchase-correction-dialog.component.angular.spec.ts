import '@angular/compiler';
import { ɵresolveComponentResources, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { readFile } from 'node:fs/promises';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { PurchaseCostingService } from '../../../../core/services/purchase-costing.service';
import { PurchaseCorrectionDialogComponent } from './purchase-correction-dialog.component';

beforeAll(async () => {
  TestBed.resetTestingModule();
  await ɵresolveComponentResources(async (url) => {
    const resourceUrl = String(url);
    if (resourceUrl.includes('number-input.component.')) {
      const fileName = resourceUrl.split('/').at(-1);
      return readFile(`src/app/shared/components/number-input/${fileName}`, 'utf8');
    }
    return readFile(new URL(resourceUrl, import.meta.url), 'utf8');
  });
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
