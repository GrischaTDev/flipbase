import '@angular/compiler';
import { ɵresolveComponentResources } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { readFile } from 'node:fs/promises';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Supplier } from '../../../../core/models/flipbase.models';
import { SuppliersService } from '../../../../core/services/suppliers.service';
import { PurchaseSellerDialogComponent } from './purchase-seller-dialog.component';

interface AngularInputMetadata {
  inputs: Record<string, unknown>;
  declaredInputs: Record<string, string>;
}

let inputMetadataSnapshot: AngularInputMetadata;

beforeAll(async () => {
  await ɵresolveComponentResources((url) => readFile(new URL(url, import.meta.url), 'utf8'));
  const metadata = (PurchaseSellerDialogComponent as unknown as { ɵcmp: AngularInputMetadata })
    .ɵcmp;
  inputMetadataSnapshot = {
    inputs: metadata.inputs,
    declaredInputs: metadata.declaredInputs,
  };
  metadata.inputs = { ...metadata.inputs, seller: ['seller', 1, null] };
  metadata.declaredInputs = { ...metadata.declaredInputs, seller: 'seller' };
});

afterEach(() => TestBed.resetTestingModule());

afterAll(() => {
  const metadata = (PurchaseSellerDialogComponent as unknown as { ɵcmp: AngularInputMetadata })
    .ɵcmp;
  metadata.inputs = inputMetadataSnapshot.inputs;
  metadata.declaredInputs = inputMetadataSnapshot.declaredInputs;
});

const createdSeller: Supplier = {
  id: 'seller-1',
  workspace_id: 'workspace-1',
  seller_type: 'private',
  name: 'Ada Beispiel',
  country_code: 'DE',
  phone: '+491701234567',
  is_active: true,
};

function render(seller: Supplier | null = null) {
  const suppliersService = {
    createSupplier: vi.fn().mockResolvedValue({ data: createdSeller, error: null }),
    updateSupplier: vi.fn().mockResolvedValue({ data: createdSeller, error: null }),
  };
  const fixture = TestBed.configureTestingModule({
    imports: [PurchaseSellerDialogComponent],
    providers: [{ provide: SuppliersService, useValue: suppliersService }],
  }).createComponent(PurchaseSellerDialogComponent);
  fixture.componentRef.setInput('seller', seller);
  fixture.detectChanges();

  return { fixture, suppliersService };
}

describe('PurchaseSellerDialogComponent', () => {
  it('zeigt für Privatpersonen klare Felder ohne Profilverweis', () => {
    const { fixture } = render();
    const host = fixture.nativeElement as HTMLElement;
    const countrySelect = host.querySelector<HTMLSelectElement>('[data-country-select]');

    expect(host.textContent).toContain('Vor- und Nachname');
    expect(host.textContent).not.toContain('Profilverweis');
    expect(countrySelect?.options.length).toBeGreaterThanOrEqual(240);
    expect(countrySelect?.value).toBe('DE');
    expect(host.querySelector('[data-phone-input]')).not.toBeNull();
  });

  it('wechselt bei Unternehmen auf Firmenname und Kontaktperson', () => {
    const { fixture } = render();

    fixture.componentInstance.form.controls.seller_type.setValue('business');
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Firmenname');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Kontaktperson');
  });

  it('übergibt beim Erstellen strukturierte ISO- und E.164-Daten', async () => {
    const { fixture, suppliersService } = render();
    fixture.componentInstance.form.patchValue({
      seller_type: 'private',
      name: 'Ada Beispiel',
      country_code: 'DE',
      phone: '+491701234567',
    });

    await fixture.componentInstance.save();

    expect(suppliersService.createSupplier).toHaveBeenCalledWith(
      expect.objectContaining({
        seller_type: 'private',
        name: 'Ada Beispiel',
        country_code: 'DE',
        phone: '+491701234567',
      }),
    );
  });

  it('lädt einen Verkäufer zur Bearbeitung und behält Werte beim Abbrechen', () => {
    const seller: Supplier = {
      ...createdSeller,
      seller_type: 'business',
      name: 'Close Vintage',
      contact_person: 'Ada Beispiel',
    };
    const { fixture } = render(seller);
    const closed = vi.fn();
    fixture.componentInstance.closed.subscribe(closed);

    fixture.componentInstance.form.controls.name.setValue('Close Vintage GmbH');
    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('[data-cancel-seller]')
      ?.click();

    expect(closed).toHaveBeenCalledOnce();
    expect(fixture.componentInstance.form.controls.name.value).toBe('Close Vintage GmbH');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Verkäufer bearbeiten');
  });
});
