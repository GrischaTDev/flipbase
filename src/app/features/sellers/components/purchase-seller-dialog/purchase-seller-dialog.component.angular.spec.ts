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
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { ModalShellComponent } from '../../../../shared/components/modal-shell/modal-shell.component';
import { TextFieldComponent } from '../../../../shared/components/text-field/text-field.component';
import { ModalDialogDirective } from '../../../../shared/directives/modal-dialog.directive';
import { PurchaseSellerDialogComponent } from './purchase-seller-dialog.component';

interface AngularInputMetadata {
  inputs: Record<string, unknown>;
  declaredInputs: Record<string, string>;
  outputs: Record<string, string>;
}

const metadataSnapshots = new Map<unknown, AngularInputMetadata>();

function bridgeBindings(
  component: unknown,
  inputs: readonly string[],
  outputs: readonly string[] = [],
): void {
  const type = component as { ɵcmp?: AngularInputMetadata; ɵdir?: AngularInputMetadata };
  const metadata = type.ɵcmp ?? type.ɵdir;
  if (!metadata) throw new Error('Angular-Metadaten fehlen');
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
  bridgeBindings(PurchaseSellerDialogComponent, ['seller']);
  bridgeBindings(ModalShellComponent, ['title', 'size'], ['closed']);
  bridgeBindings(ModalDialogDirective, ['dialogTitel', 'schliesstBeiKlickAussen'], ['dialogClose']);
  bridgeBindings(CustomSelectComponent, ['options', 'ariaLabel', 'triggerId']);
  bridgeBindings(TextFieldComponent, ['id', 'label', 'type', 'error', 'multiline', 'required']);
  bridgeBindings(
    ButtonComponent,
    ['variant', 'disabled', 'loading', 'type', 'formId'],
    ['clicked'],
  );
});

afterEach(() => TestBed.resetTestingModule());

afterAll(() => {
  for (const [component, snapshot] of metadataSnapshots) {
    const type = component as { ɵcmp?: AngularInputMetadata; ɵdir?: AngularInputMetadata };
    const metadata = type.ɵcmp ?? type.ɵdir;
    if (!metadata) continue;
    metadata.inputs = snapshot.inputs;
    metadata.declaredInputs = snapshot.declaredInputs;
    metadata.outputs = snapshot.outputs;
  }
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
  it('nutzt den breiten gemeinsamen Dialog ohne redundante Hinweistexte', () => {
    const { fixture } = render();
    const host = fixture.nativeElement as HTMLElement;

    expect(host.querySelector('app-modal-shell')).not.toBeNull();
    expect(host.textContent).not.toContain('Weitere Angaben können leer bleiben');
    expect(host.textContent).not.toContain('Bitte einen Namen angeben');
    expect(host.textContent).toContain('Land/Region');
    expect(host.querySelector('[data-seller-street]')?.classList).toContain('sm:col-span-2');
    expect(host.querySelector('[data-seller-address-extra]')?.classList).toContain('sm:col-span-2');
  });

  it('aktiviert Speichern erst bei einem gültigen Namen und gültigen optionalen Feldern', () => {
    const { fixture } = render();
    const component = fixture.componentInstance;
    const save = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      '[data-save-seller] button',
    );

    expect(save).not.toBeNull();
    expect(save?.disabled).toBe(true);
    component.form.controls.name.setValue('Ada Beispiel');
    fixture.detectChanges();
    expect(save?.disabled).toBe(false);
    component.form.controls.email.setValue('ungueltig');
    fixture.detectChanges();
    expect(save?.disabled).toBe(true);
  });

  it('hält Speichern bei einem Namen nur aus Leerzeichen deaktiviert', () => {
    const { fixture } = render();
    const component = fixture.componentInstance;
    const save = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      '[data-save-seller] button',
    );

    component.form.controls.name.setValue('   ');
    fixture.detectChanges();

    expect(save?.disabled).toBe(true);
  });

  it('zeigt für Privatpersonen klare Felder ohne Profilverweis', () => {
    const { fixture } = render();
    const host = fixture.nativeElement as HTMLElement;
    const selects = fixture.debugElement
      .queryAll(By.directive(CustomSelectComponent))
      .map((debugElement) => debugElement.componentInstance as CustomSelectComponent<string>);
    const countrySelect = selects.find((select) => select.ariaLabel() === 'Land/Region');

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

  it('verknüpft die Verkäufer-ID ausschließlich mit dem benannten Eingabefeld', () => {
    const { fixture } = render();
    const host = fixture.nativeElement as HTMLElement;
    const matchingElements = host.querySelectorAll('#seller-name');

    expect(matchingElements).toHaveLength(1);
    expect(matchingElements[0]?.tagName).toBe('INPUT');
    expect(host.querySelector('label[for="seller-name"]')?.textContent).toContain(
      'Vor- und Nachname',
    );
  });

  it('bindet Verkäuferart und Land über die Formularauswahl', () => {
    const { fixture } = render();
    const selects = fixture.debugElement
      .queryAll(By.directive(CustomSelectComponent))
      .map((debugElement) => debugElement.componentInstance as CustomSelectComponent<string>);
    const sellerTypeSelect = selects.find((select) => select.ariaLabel() === 'Verkäuferart');
    const countrySelect = selects.find((select) => select.ariaLabel() === 'Land/Region');
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
      .querySelector<HTMLButtonElement>('[modal-footer] button')
      ?.click();

    expect(closed).toHaveBeenCalledOnce();
    expect(fixture.componentInstance.form.controls.name.value).toBe('Close Vintage GmbH');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Verkäufer bearbeiten');
  });

  it('zeigt den E-Mail-Fehler nur für eine berührte ungültige Eingabe', () => {
    const { fixture } = render();
    fixture.componentInstance.form.controls.email.setValue('keine-mail');
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;

    expect(host.querySelector('#seller-email-error')).toBeNull();

    fixture.componentInstance.form.controls.email.markAsTouched();
    fixture.detectChanges();

    expect(host.querySelector('#seller-email-error')?.textContent).toContain('E-Mail-Adresse');
    expect(host.querySelector('input#seller-email')?.getAttribute('aria-invalid')).toBe('true');
  });

  it('verknüpft die Telefonnummer nur bei einem berührten ungültigen Wert mit dem Fehlerziel', () => {
    const { fixture } = render();
    const host = fixture.nativeElement as HTMLElement;

    expect(host.querySelector('#seller-phone')?.getAttribute('aria-describedby')).toBeNull();
    expect(host.querySelector('#seller-phone-error')).toBeNull();

    fixture.componentInstance.form.controls.phone.setValue('+491701234567');
    fixture.detectChanges();

    expect(host.querySelector('#seller-phone')?.getAttribute('aria-describedby')).toBeNull();
    expect(host.querySelector('#seller-phone-error')).toBeNull();

    fixture.componentInstance.form.controls.phone.setErrors({ invalidPhone: true });
    fixture.componentInstance.form.controls.phone.markAsTouched();
    fixture.detectChanges();

    const phoneError = host.querySelector('#seller-phone-error');
    expect(phoneError).not.toBeNull();
    expect(phoneError?.textContent).toContain('Bitte eine gültige Telefonnummer angeben.');
    expect(host.querySelector('#seller-phone')?.getAttribute('aria-describedby')).toBe(
      'seller-phone-error',
    );
  });

  it('ignoriert das Schließen über die Dialoghülle während des Speicherns', () => {
    const { fixture } = render();
    const closed = vi.fn();
    fixture.componentInstance.closed.subscribe(closed);
    fixture.componentInstance.saving.set(true);
    fixture.detectChanges();

    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('app-modal-shell button[aria-label="Dialog schließen"]')
      ?.click();

    expect(closed).not.toHaveBeenCalled();
  });

  it.each(['Formular', 'Speichern-Button'] as const)(
    'speichert den Verkäufer über %s genau einmal mit nativer Formularzuordnung',
    async (submitPath) => {
      const { fixture, suppliersService } = render();
      let settleSave!: (result: Awaited<ReturnType<SuppliersService['createSupplier']>>) => void;
      suppliersService.createSupplier.mockImplementationOnce(
        () => new Promise((resolve) => (settleSave = resolve)),
      );
      fixture.componentInstance.form.controls.name.setValue('Ada Beispiel');
      fixture.detectChanges();
      const host = fixture.nativeElement as HTMLElement;
      const form = host.querySelector<HTMLFormElement>('[data-seller-form]');
      const save = host.querySelector<HTMLButtonElement>('[data-save-seller] button');
      if (!form || !save) throw new Error('Verkäuferformular oder Speichern-Button fehlt.');
      const saveCalls = vi.spyOn(fixture.componentInstance, 'save');
      const created = vi.spyOn(fixture.componentInstance.created, 'emit');

      expect(save.type).toBe('submit');
      expect(save.getAttribute('form')).toBe('seller-form');
      expect(save.form).toBe(form);
      if (submitPath === 'Formular') form.requestSubmit();
      else save.click();
      fixture.detectChanges();

      expect(saveCalls).toHaveBeenCalledOnce();
      expect(suppliersService.createSupplier).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ name: 'Ada Beispiel' }),
      );
      expect(save.disabled).toBe(true);
      expect(save.getAttribute('aria-busy')).toBe('true');
      save.click();
      expect(saveCalls).toHaveBeenCalledOnce();

      settleSave({ data: createdSeller, error: null });
      await fixture.whenStable();
      fixture.detectChanges();

      expect(created).toHaveBeenCalledExactlyOnceWith(createdSeller);
      expect(save.disabled).toBe(false);
    },
  );

  it('erfüllt die automatischen Barrierefreiheitsprüfungen', async () => {
    const { fixture } = render();

    const result = await axe.run(fixture.nativeElement as HTMLElement);
    expect(result.violations).toEqual([]);
  }, 10_000);

  it('benennt den Aktionsbutton auch beim Speichern einheitlich', () => {
    const { fixture } = render(createdSeller);
    const host = fixture.nativeElement as HTMLElement;
    const saveButton = host.querySelector<HTMLButtonElement>('[data-save-seller] button');

    expect(saveButton?.textContent?.trim()).toBe('Speichern');

    fixture.componentInstance.saving.set(true);
    fixture.detectChanges();
    expect(saveButton?.textContent?.trim()).toBe('Speichern');
  });

  it('ordnet Postleitzahl und Ort nebeneinander im Adressraster an', () => {
    const { fixture } = render();
    const host = fixture.nativeElement as HTMLElement;
    const grid = host.querySelector<HTMLElement>('.grid');
    const labels = Array.from(grid?.children ?? []).map((el) => el.textContent?.trim());

    // In sm:grid-cols-2 beginnen Postleitzahl und Ort nach den zwei breiten Adresszeilen.
    expect(labels[4]).toContain('Postleitzahl');
    expect(labels[5]).toContain('Ort');
  });
});
