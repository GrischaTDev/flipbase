import { ChangeDetectionStrategy, Component, input, model, output } from '@angular/core';

@Component({
  selector: 'app-test-first-child',
  templateUrl: './content.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FirstRenderingChild {
  // Der Test sichert ausdrücklich die Alias-Zuordnung der JIT-Hilfe ab.
  // eslint-disable-next-line @angular-eslint/no-input-rename
  readonly caption = input.required<string>({ alias: 'label' });
  readonly selected = model(false, { alias: 'chosen' });
  // eslint-disable-next-line @angular-eslint/no-output-rename
  readonly acknowledged = output<string>({ alias: 'confirmed' });
}
