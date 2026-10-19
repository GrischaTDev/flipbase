import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Gemeinsame Beschriftung und Rückmeldung; lädt keine Daten und verändert keine Feldwerte. */
@Component({
  selector: 'app-form-field',
  templateUrl: '../form-field/form-field.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0 w-full' },
})
export class FormFieldComponent {
  readonly controlId = input.required<string>();
  readonly label = input('');
  readonly labelHidden = input(false);
  readonly required = input(false);
  readonly helpText = input('');
  readonly error = input<string | null>(null);
}
