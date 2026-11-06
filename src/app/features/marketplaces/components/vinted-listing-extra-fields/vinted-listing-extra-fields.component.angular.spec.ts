import { TestBed } from '@angular/core/testing';
import { afterAll, afterEach, beforeAll, expect, it } from 'vitest';
import { prepareMarketplaceRendering } from '../../../../../../e2e/support/marketplace-rendering';
import { AttributePickerComponent } from '../../../../shared/components/attribute-picker/attribute-picker.component';
import { CustomSelectComponent } from '../../../../shared/components/custom-select/custom-select.component';
import { TextFieldComponent } from '../../../../shared/components/text-field/text-field.component';
import type { VintedListingExtraField } from '../../models/vinted-listing-catalog-fields';
import { VintedListingExtraFieldsComponent } from './vinted-listing-extra-fields.component';

const fields: readonly VintedListingExtraField[] = [
  {
    kind: 'choice',
    key: 'skirt_length',
    label: 'Rocklänge',
    required: true,
    multiple: false,
    limit: 1,
    options: [
      { id: 392, label: 'Mini' },
      { id: 649, label: 'Knielänge' },
    ],
  },
  {
    kind: 'choice',
    key: 'computer_ram',
    label: 'Arbeitsspeicher (RAM)',
    required: false,
    multiple: true,
    limit: 2,
    options: [
      { id: 3445, label: '4 GB' },
      { id: 3446, label: '8 GB' },
    ],
  },
  { kind: 'text', key: 'text_shoulder_width', label: 'Schulterweite', unit: 'cm' },
];

function setup(attributes: Record<string, string>) {
  const fixture = TestBed.createComponent(VintedListingExtraFieldsComponent);
  fixture.componentRef.setInput('fields', fields);
  fixture.componentRef.setInput('attributes', attributes);
  fixture.componentRef.setInput('errors', { skirt_length: 'Ergänze bitte: Rocklänge.' });
  const emitted: Readonly<Record<string, string>>[] = [];
  fixture.componentInstance.changed.subscribe((values) => emitted.push(values));
  fixture.detectChanges();
  return { fixture, component: fixture.componentInstance, emitted };
}
let restore: (() => void) | undefined;
beforeAll(async () => {
  const shared = 'src/app/shared/components/';
  restore = await prepareMarketplaceRendering([
    {
      type: AttributePickerComponent,
      path: shared + 'attribute-picker/attribute-picker.component.ts',
    },
    { type: CustomSelectComponent, path: shared + 'custom-select/custom-select.component.ts' },
    { type: TextFieldComponent, path: shared + 'text-field/text-field.component.ts' },
    {
      type: VintedListingExtraFieldsComponent,
      path: 'src/app/features/marketplaces/components/vinted-listing-extra-fields/vinted-listing-extra-fields.component.ts',
    },
  ]);
});
afterAll(() => restore?.());
afterEach(() => TestBed.resetTestingModule());

it('zeigt gespeicherte Zusatzangaben und Fehler mit Vinteds Beschriftung', () => {
  const { fixture, component } = setup({
    skirt_length: '649',
    computer_ram: '3446,3445',
    text_shoulder_width: '45',
  });
  const element = fixture.nativeElement as HTMLElement;
  expect(element.textContent).toContain('Rocklänge');
  expect(element.textContent).toContain('Arbeitsspeicher (RAM)');
  expect(element.textContent).toContain('Schulterweite');
  expect(element.textContent).toContain('Ergänze bitte: Rocklänge.');
  expect(component.control('skirt_length').value).toBe('649');
  expect(component.control('computer_ram').value).toBe('8 GB · 4 GB');
  expect(component.control('text_shoulder_width').value).toBe('45');
  expect(component.options(fields[0] as never).map((option) => option.label)).toEqual([
    'Mini',
    'Knielänge',
  ]);
  expect(component.options(fields[1] as never)[0]).toEqual({ value: '', label: 'Nicht angegeben' });
});

it('meldet Änderungen als Vinted-Kennungen und Text', () => {
  const { component, emitted } = setup({});
  component.control('skirt_length').setValue('392');
  component.control('computer_ram').setValue('4 GB · 8 GB');
  component.control('text_shoulder_width').setValue(' 46 ');
  expect(emitted.at(-1)).toEqual({
    skirt_length: '392',
    computer_ram: '3445,3446',
    text_shoulder_width: '46',
  });
});
