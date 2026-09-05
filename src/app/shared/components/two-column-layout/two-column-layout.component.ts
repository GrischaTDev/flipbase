import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type TwoColumnRatio = '2-1' | '7-5' | 'sidebar-content';

@Component({
  selector: 'app-two-column-layout',
  templateUrl: './two-column-layout.component.html',
  styleUrl: './two-column-layout.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'block w-full',
  },
})
export class TwoColumnLayoutComponent {
  readonly ratio = input<TwoColumnRatio>('2-1');

  protected readonly containerClasses = computed(() => {
    switch (this.ratio()) {
      case 'sidebar-content':
        return 'grid grid-cols-1 lg:grid-cols-[17rem_minmax(0,1fr)] gap-5 items-start';
      case '7-5':
      case '2-1':
      default:
        return 'grid grid-cols-1 lg:grid-cols-12 gap-5 items-start';
    }
  });

  protected readonly mainClasses = computed(() => {
    switch (this.ratio()) {
      case 'sidebar-content':
        return 'min-w-0 space-y-5';
      case '7-5':
        return 'lg:col-span-7 min-w-0 space-y-5';
      case '2-1':
      default:
        return 'lg:col-span-8 min-w-0 space-y-5';
    }
  });

  protected readonly sidebarClasses = computed(() => {
    switch (this.ratio()) {
      case 'sidebar-content':
        return 'min-w-0 space-y-5';
      case '7-5':
        return 'lg:col-span-5 min-w-0 space-y-5';
      case '2-1':
      default:
        return 'lg:col-span-4 min-w-0 space-y-5';
    }
  });
}
