import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

export type ExportStatus =
  | { readonly kind: 'ready' | 'error'; readonly title: string; readonly detail: string | null }
  | { readonly kind: 'progress'; readonly title: string; readonly detail: string | null };

/** Statuszeile und Export-Knopf. */
@Component({
  selector: 'app-export-bar',
  imports: [],
  templateUrl: './export-bar.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExportBarComponent {
  readonly status = input.required<ExportStatus>();
  readonly isBusy = input(false);
  readonly canExport = input(false);

  readonly exportRequested = output<void>();
}
