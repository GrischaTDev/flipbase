import '@angular/compiler';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Purchase, Supplier } from '../../../../core/models/flipbase.models';
import {
  PURCHASE_SELLER_DETAILS_CONFLICT_MESSAGE,
  PurchaseService,
} from '../../../../core/services/purchase.service';
import { SourcesService } from '../../../../core/services/sources.service';
import { SuppliersService } from '../../../../core/services/suppliers.service';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { PurchaseSellerDetailsDialogComponent } from './purchase-seller-details-dialog.component';

const supplier: Supplier = {
  id: 'supplier-nord',
  workspace_id: 'workspace-1',
  name: 'Großhandel Nord',
  seller_type: 'business',
  street: 'Hafenstraße 1',
  postal_code: '20457',
  city: 'Hamburg',
  country_code: 'DE',
  phone: '+4940123456',
};

const finalizedPurchase: Purchase = {
  id: 'purchase-1',
  workspace_id: 'workspace-1',
  type: 'single',
  title: 'Vinted-Jacke',
  purchase_date: '2026-09-17',
  purchase_price: 10,
  cost_allocation_mode: 'even',
  entry_status: 'finalized',
  source_id: 'source-vinted',
  seller_marketplace_username: 'vintage_lea92',
  external_order_id: '84739392',
  seller_details_version: 4,
};

const updatePurchaseSellerDetails = vi.fn();
const toastSuccess = vi.fn();

function createDialog(purchase = finalizedPurchase) {
  const component = TestBed.runInInjectionContext(() => new PurchaseSellerDetailsDialogComponent());
  Object.defineProperty(component, 'purchase', { value: () => purchase });
  const saved = vi.spyOn(component.saved, 'emit');
  const closed = vi.spyOn(component.closed, 'emit');
  component.resetToPurchase(purchase);
  return { component, saved, closed };
}

beforeEach(() => {
  updatePurchaseSellerDetails.mockReset();
  toastSuccess.mockReset();
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: PurchaseService, useValue: { updatePurchaseSellerDetails } },
      { provide: SourcesService, useValue: { sources: signal([]) } },
      { provide: SuppliersService, useValue: { suppliers: signal([supplier]) } },
      { provide: ToastService, useValue: { success: toastSuccess } },
    ],
  });
});

describe('PurchaseSellerDetailsDialogComponent', () => {
  it('bietet nur Herkunftsangaben und keinen Preis, keine Kosten und keine Positionen an', () => {
    const template = readFileSync(
      'src/app/features/purchases/components/purchase-seller-details-dialog/purchase-seller-details-dialog.component.html',
      'utf8',
    );
    const controls = [...template.matchAll(/formControlName="([a-z_]+)"/g)].map(
      (match) => match[1],
    );

    expect(controls.sort()).toEqual(
      [
        'external_order_id',
        'original_url',
        'reason',
        'seller_address_extra',
        'seller_city',
        'seller_country_code',
        'seller_marketplace_username',
        'seller_name',
        'seller_postal_code',
        'seller_street',
        'seller_type',
        'source_id',
        'supplier_id',
        'supplier_reference',
      ].sort(),
    );
  });

  it('speichert Nachtrag, Grund und den beim Öffnen gelesenen Versionsstand', async () => {
    updatePurchaseSellerDetails.mockResolvedValue({ error: null, conflict: false });
    const { component, saved, closed } = createDialog();
    component.form.patchValue({
      seller_name: 'Lea Mustermann',
      seller_city: 'Köln',
      reason: 'Versandanschrift nachgereicht',
    });

    await component.save();

    expect(updatePurchaseSellerDetails).toHaveBeenCalledWith(
      'purchase-1',
      4,
      expect.objectContaining({
        source_id: 'source-vinted',
        seller_marketplace_username: 'vintage_lea92',
        external_order_id: '84739392',
        seller_name: 'Lea Mustermann',
        seller_city: 'Köln',
        seller_street: null,
      }),
      'Versandanschrift nachgereicht',
    );
    expect(toastSuccess).toHaveBeenCalledOnce();
    expect(saved).toHaveBeenCalledOnce();
    expect(closed).toHaveBeenCalledOnce();
  });

  it('bleibt bei einem Versionskonflikt offen, behält die Eingaben und erklärt den nächsten Schritt', async () => {
    updatePurchaseSellerDetails.mockResolvedValue({
      error: new Error(PURCHASE_SELLER_DETAILS_CONFLICT_MESSAGE),
      conflict: true,
    });
    const { component, closed } = createDialog();
    component.form.controls.seller_city.setValue('Köln');

    await component.save();

    expect(component.errorMessage()).toBe(PURCHASE_SELLER_DETAILS_CONFLICT_MESSAGE);
    expect(component.hasConflict()).toBe(true);
    expect(component.form.controls.seller_city.value).toBe('Köln');
    expect(component.isSaving()).toBe(false);
    expect(closed).not.toHaveBeenCalled();
  });

  it('kopiert bei Auswahl eines gespeicherten Verkäufers nur Art, Name und Anschrift', () => {
    const { component } = createDialog();

    component.onSupplierSelected('supplier-nord');

    expect(component.form.getRawValue()).toMatchObject({
      seller_type: 'business',
      seller_name: 'Großhandel Nord',
      seller_city: 'Hamburg',
      seller_marketplace_username: 'vintage_lea92',
    });
  });
});
