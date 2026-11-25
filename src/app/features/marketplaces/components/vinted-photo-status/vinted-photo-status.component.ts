import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { LoadingIndicatorComponent } from '../../../../shared/components/loading-indicator/loading-indicator.component';

@Component({
  selector: 'app-vinted-photo-status',
  imports: [LoadingIndicatorComponent],
  templateUrl: './vinted-photo-status.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class:
      'absolute left-1/2 top-1/2 flex w-max max-w-[calc(100%-1rem)] -translate-x-1/2 -translate-y-1/2 items-center justify-center gap-2 rounded-md bg-fb-brand-strong px-2 py-1 text-center text-xs font-medium text-fb-on-accent shadow-sm',
    '[attr.role]': "countdownSeconds() ? 'timer' : 'status'",
  },
})
export class VintedPhotoStatusComponent {
  readonly label = input.required<string>();
  readonly busy = input(false);
  readonly countdownSeconds = input<number>();
}
