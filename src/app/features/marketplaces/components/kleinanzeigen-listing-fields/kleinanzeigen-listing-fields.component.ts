import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { FormControl, FormRecord, ReactiveFormsModule } from '@angular/forms';
import { CustomSelectComponent } from '../../../../shared/components/custom-select/custom-select.component';
import { CustomCheckboxComponent } from '../../../../shared/components/custom-checkbox/custom-checkbox.component';
import { TextFieldComponent } from '../../../../shared/components/text-field/text-field.component';
import type {
  KleinanzeigenProviderSchema,
  KleinanzeigenProviderField,
} from '../../../../../../supabase/functions/_shared/kleinanzeigen-form-contracts';
@Component({
  selector: 'app-kleinanzeigen-listing-fields',
  imports: [
    ReactiveFormsModule,
    CustomSelectComponent,
    CustomCheckboxComponent,
    TextFieldComponent,
  ],
  templateUrl: './kleinanzeigen-listing-fields.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class KleinanzeigenListingFieldsComponent {
  readonly schema = input.required<KleinanzeigenProviderSchema>();
  readonly attributes = input.required<FormRecord<FormControl<string>>>();
  readonly shippingEnabled = input(false);
  readonly shippingGroup = input.required<FormControl<string>>();
  readonly selectedGroup = input<string>('');
  readonly selectedMethods = input<readonly string[]>([]);
  readonly methodsChanged = output<readonly string[]>();
  readonly groupOptions = computed(() =>
    this.schema().shipping.groups.map((group) => ({ value: group.value, label: group.label })),
  );
  readonly methods = computed(
    () =>
      this.schema().shipping.groups.find((group) => group.value === this.selectedGroup())
        ?.choices ?? [],
  );
  options(field: KleinanzeigenProviderField) {
    return field.choices.map((choice) => ({
      value: choice.value,
      label: choice.label,
      description: choice.description,
    }));
  }
  chooseMethod(value: string, checked: boolean): void {
    const values = new Set(this.selectedMethods());
    if (checked) values.add(value);
    else values.delete(value);
    this.methodsChanged.emit([...values]);
  }
}
