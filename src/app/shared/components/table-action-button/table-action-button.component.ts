import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { Params } from '@angular/router';
import { LucideIconInput } from '@lucide/angular';
import { ButtonComponent, TableActionTone } from '../button/button.component';

@Component({
  selector: 'app-table-action-button',
  imports: [ButtonComponent],
  templateUrl: './table-action-button.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex align-middle' },
})
export class TableActionButtonComponent {
  readonly icon = input.required<LucideIconInput>();
  readonly label = input.required<string>();
  readonly tone = input<TableActionTone>('brand');
  readonly disabled = input(false);
  readonly loading = input(false);
  readonly link = input<string | null>(null);
  readonly href = input<string | null>(null);
  readonly queryParams = input<Params | null>(null);
  readonly clicked = output<MouseEvent>();
}
