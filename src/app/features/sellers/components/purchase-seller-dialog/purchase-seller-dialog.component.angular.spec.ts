import '@angular/compiler';
import { ElementRef, ɵresolveComponentResources } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { glob, readFile } from 'node:fs/promises';
import axe from 'axe-core';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Supplier } from '../../../../core/models/flipbase.models';
import { SuppliersService } from '../../../../core/services/suppliers.service';
import {
  CustomSelectComponent,
  SelectOption,
} from '../../../../shared/components/custom-select/custom-select.component';
import { ModalDialogDirective } from '../../../../shared/directives/modal-dialog.directive';
import { PurchaseSellerDialogComponent } from './purchase-seller-dialog.component';

interface AngularInputMetadata {
  inputs: Record<string, unknown>;
  declaredInputs: Record<string, string>;
}

let inputMetadataSnapshot: AngularInputMetadata;
let modalInputMetadataSnapshot: AngularInputMetadata;
let customSelectInputMetadataSnapshot: AngularInputMetadata;

beforeAll(async () => {
  await ɵresolveComponentResources(async (url) => {
    const fileName = url.replace(/^\.\//, '');
    const matches: string[] = [];
    for await (const match of glob(`src/app/**/${fileName}`)) matches.push(match);
    if (matches.length !== 1) {
      throw new Error(`Test-Ressource ${url} ist nicht eindeutig: ${matches.join(', ')}`);
    }
    return readFile(matches[0], 'utf8');
  });
  const metadata = (PurchaseSellerDialogComponent as unknown as { ɵcmp: AngularInputMetadata })
    .ɵcmp;
  inputMetadataSnapshot = {
    inputs: metadata.inputs,
    declaredInputs: metadata.declaredInputs,
  };
  metadata.inputs = { ...metadata.inputs, seller: ['seller', 1, null] };
  metadata.declaredInputs = { ...metadata.declaredInputs, seller: 'seller' };

  const modalMetadata = (ModalDialogDirective as unknown as { ɵdir: AngularInputMetadata }).ɵdir;
  modalInputMetadataSnapshot = {
    inputs: modalMetadata.inputs,
    declaredInputs: modalMetadata.declaredInputs,
  };
  modalMetadata.inputs = {
    ...modalMetadata.inputs,
    dialogTitel: ['dialogTitel', 1, null],
    schliesstMitEscape: ['schliesstMitEscape', 1, null],
  };
  modalMetadata.declaredInputs = {
    ...modalMetadata.declaredInputs,
    dialogTitel: 'dialogTitel',
    schliesstMitEscape: 'schliesstMitEscape',
  };

  const customSelectMetadata = (CustomSelectComponent as unknown as { ɵcmp: AngularInputMetadata })
    .ɵcmp;
  customSelectInputMetadataSnapshot = {
    inputs: customSelectMetadata.inputs,
    declaredInputs: customSelectMetadata.declaredInputs,
  };
  customSelectMetadata.inputs = {
    ...customSelectMetadata.inputs,
    options: ['options', 1, null],
    ariaLabel: ['ariaLabel', 1, null],
    triggerId: ['triggerId', 1, null],
  };
  customSelectMetadata.declaredInputs = {
    ...customSelectMetadata.declaredInputs,
    options: 'options',
    ariaLabel: 'ariaLabel',
    triggerId: 'triggerId',
  };
});

afterEach(() => TestBed.resetTestingModule());

afterAll(() => {
  const metadata = (PurchaseSellerDialogComponent as unknown as { ɵcmp: AngularInputMetadata })
    .ɵcmp;
  metadata.inputs = inputMetadataSnapshot.inputs;
  metadata.declaredInputs = inputMetadataSnapshot.declaredInputs;
  const modalMetadata = (ModalDialogDirective as unknown as { ɵdir: AngularInputMetadata }).ɵdir;
  modalMetadata.inputs = modalInputMetadataSnapshot.inputs;
  modalMetadata.declaredInputs = modalInputMetadataSnapshot.declaredInputs;
  const customSelectMetadata = (CustomSelectComponent as unknown as { ɵcmp: AngularInputMetadata })
    .ɵcmp;
  customSelectMetadata.inputs = customSelectInputMetadataSnapshot.inputs;
  customSelectMetadata.declaredInputs = customSelectInputMetadataSnapshot.declaredInputs;
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

function selectOption(
  select: CustomSelectComponent<string>,
  option: SelectOption<string>,
  trigger: HTMLButtonElement | null,
): void {
  if (!trigger) throw new Error('Auswahl-Trigger fehlt');
  Object.defineProperty(select, 'trigger', {
    value: () => new ElementRef(trigger),
  });
  select.selectOption(option);
}

describe('PurchaseSellerDialogComponent', () => {
  it('zeigt für Privatpersonen klare Felder ohne Profilverweis', () => {
    const { fixture } = render();
    const host = fixture.nativeElement as HTMLElement;
    const selects = fixture.debugElement
      .queryAll(By.directive(CustomSelectComponent))
      .map((debugElement) => debugElement.componentInstance as CustomSelectComponent<string>);
    const countrySelect = selects.find((select) => select.ariaLabel() === 'Land');

    expect(host.textContent).toContain('Vor- und Nachname');
    expect(host.textContent).not.toContain('Profilverweis');
    expect(selects).toHaveLength(2);
    expect(countrySelect?.options().length).toBeGreaterThanOrEqual(240);
    expect(countrySelect?.options().slice(0, 4)).toEqual([
      { value: 'AF', label: 'Afghanistan' },
      { value: 'EG', label: 'Ägypten' },
      { value: 'AX', label: 'Ålandinseln' },
      { value: 'AL', label: 'Albanien' },
    ]);
    expect(countrySelect?.value()).toBe('DE');
    expect(host.querySelector('[data-phone-input]')).not.toBeNull();
  });

  it('bindet Verkäuferart und Land über die Formularauswahl', () => {
    const { fixture } = render();
    const selects = fixture.debugElement
      .queryAll(By.directive(CustomSelectComponent))
      .map((debugElement) => debugElement.componentInstance as CustomSelectComponent<string>);
    const sellerTypeSelect = selects.find((select) => select.ariaLabel() === 'Verkäuferart');
    const countrySelect = selects.find((select) => select.ariaLabel() === 'Land');
    const businessOption = sellerTypeSelect
      ?.options()
      .find((option) => option.value === 'business');
    const austriaOption = countrySelect?.options().find((option) => option.value === 'AT');

    expect(businessOption).toBeDefined();
    expect(austriaOption).toBeDefined();

    if (!sellerTypeSelect || !countrySelect || !businessOption || !austriaOption) {
      throw new Error('Verkäuferart oder Land fehlt');
    }
    const host = fixture.nativeElement as HTMLElement;
    selectOption(sellerTypeSelect, businessOption, host.querySelector('#seller-type'));
    selectOption(countrySelect, austriaOption, host.querySelector('#seller-country'));
    fixture.detectChanges();

    expect(fixture.componentInstance.form.controls.seller_type.value).toBe('business');
    expect(fixture.componentInstance.form.controls.country_code.value).toBe('AT');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Firmenname');
  });

  it('wechselt bei Unternehmen auf Firmenname und Kontaktperson', () => {
    const { fixture } = render();
    const sellerTypeSelect = fixture.debugElement
      .queryAll(By.directive(CustomSelectComponent))
      .map((debugElement) => debugElement.componentInstance as CustomSelectComponent<string>)
      .find((select) => select.ariaLabel() === 'Verkäuferart');
    const businessOption = sellerTypeSelect
      ?.options()
      .find((option) => option.value === 'business');

    if (!sellerTypeSelect || !businessOption) throw new Error('Unternehmensauswahl fehlt');
    selectOption(
      sellerTypeSelect,
      businessOption,
      (fixture.nativeElement as HTMLElement).querySelector('#seller-type'),
    );
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

  it('zeigt verständliche und verknüpfte Feldfehler', () => {
    const { fixture } = render();
    fixture.componentInstance.form.controls.name.markAsTouched();
    fixture.componentInstance.form.controls.email.setValue('keine-mail');
    fixture.componentInstance.form.controls.email.markAsTouched();
    fixture.componentInstance.form.controls.phone.setErrors({ invalidPhone: true });
    fixture.componentInstance.form.controls.phone.markAsTouched();
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;

    expect(host.querySelector('#seller-name')?.getAttribute('aria-invalid')).toBe('true');
    expect(host.querySelector('#seller-name-error')?.textContent).toContain('Namen');
    expect(host.querySelector('#seller-email-error')?.textContent).toContain('E-Mail-Adresse');
    expect(host.querySelector('#seller-phone-error')?.textContent).toContain('Telefonnummer');
  });

  it('speichert über ein echtes Formular', async () => {
    const { fixture, suppliersService } = render();
    fixture.componentInstance.form.controls.name.setValue('Ada Beispiel');
    const form = (fixture.nativeElement as HTMLElement).querySelector<HTMLFormElement>(
      '[data-seller-form]',
    );

    form?.dispatchEvent(new SubmitEvent('submit'));
    await fixture.whenStable();

    expect(form).not.toBeNull();
    expect(suppliersService.createSupplier).toHaveBeenCalledOnce();
  });

  it('erfüllt die automatischen Barrierefreiheitsprüfungen', async () => {
    const { fixture } = render();

    const result = await axe.run(fixture.nativeElement as HTMLElement);
    expect(result.violations).toEqual([]);
  }, 10_000);
});
