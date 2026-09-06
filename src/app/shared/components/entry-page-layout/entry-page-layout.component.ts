import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { LucideArrowLeft, LucideDynamicIcon } from '@lucide/angular';

@Component({
  selector: 'app-entry-page-layout',
  imports: [LucideDynamicIcon],
  templateUrl: './entry-page-layout.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class EntryPageLayoutComponent {
  readonly title = input.required<string>();
  readonly subtitle = input<string>('');
  readonly backLabel = input<string>('Zurück');
  readonly cancelled = output<void>();

  protected readonly backIcon = LucideArrowLeft;
}
