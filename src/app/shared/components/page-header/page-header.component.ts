import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideArrowLeft, LucideDynamicIcon, LucideIconInput } from '@lucide/angular';

@Component({
  selector: 'app-page-header',
  imports: [RouterLink, LucideDynamicIcon],
  templateUrl: './page-header.component.html',
  styleUrl: './page-header.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'block w-full',
  },
})
export class PageHeaderComponent {
  readonly title = input<string>('');
  readonly subtitle = input<string>('');
  readonly icon = input<LucideIconInput | null>(null);
  readonly backLink = input<string | readonly unknown[] | null>(null);
  readonly backLabel = input<string>('Zurück');

  protected readonly backIcon = LucideArrowLeft;
}
