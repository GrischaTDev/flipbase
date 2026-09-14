import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { LucideDynamicIcon, LucideIconInput, LucideLoader2 } from '@lucide/angular';

@Component({
  selector: 'app-loading-indicator',
  imports: [LucideDynamicIcon],
  templateUrl: './loading-indicator.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'inline-flex shrink-0 items-center justify-center',
  },
})
export class LoadingIndicatorComponent {
  readonly size = input<'sm' | 'md'>('sm');

  protected readonly icon: LucideIconInput = LucideLoader2;
  protected readonly iconClasses = computed(() =>
    this.size() === 'md' ? 'h-4 w-4' : 'h-3.5 w-3.5',
  );
}
