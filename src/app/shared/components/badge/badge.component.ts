import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type BadgeTone = 'neutral' | 'info' | 'success' | 'caution' | 'critical';
export type BadgeSize = 'sm' | 'md';

@Component({
  selector: 'app-badge',
  templateUrl: './badge.component.html',
  styleUrl: './badge.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'inline-flex align-middle',
  },
})
export class BadgeComponent {
  readonly tone = input<BadgeTone>('neutral');
  readonly size = input<BadgeSize>('sm');
  readonly mono = input<boolean>(false);

  protected readonly badgeClasses = computed(() => {
    const base =
      'inline-flex items-center font-semibold rounded-lg border-0 transition-colors select-none';

    const sizeClass =
      this.size() === 'md'
        ? 'h-6 px-2.5 text-xs gap-1.5 leading-4'
        : 'h-5 px-2 text-xs gap-1 leading-4';

    const toneClasses: Record<BadgeTone, string> = {
      neutral: 'bg-fb-subtle text-fb-text-secondary border-fb-border',
      info: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
      success: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
      caution: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
      critical: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
    };

    const monoClass = this.mono() ? 'font-mono' : '';
    return [base, sizeClass, toneClasses[this.tone()], monoClass].filter(Boolean).join(' ');
  });
}
