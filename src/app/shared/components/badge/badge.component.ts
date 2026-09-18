import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type BadgeTone = 'neutral' | 'brand' | 'info' | 'success' | 'caution' | 'critical';
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
      'inline-flex items-center justify-center font-semibold rounded-lg border transition-colors select-none';

    const sizeClass =
      this.size() === 'md'
        ? 'h-6 px-2.5 text-xs gap-1.5 leading-4'
        : 'h-5 px-2 text-xs gap-1 leading-4';

    const toneClasses: Record<BadgeTone, string> = {
      neutral:
        'bg-fb-status-neutral-surface text-fb-status-neutral border-fb-status-neutral-border',
      brand: 'bg-fb-brand-surface text-fb-brand border-fb-brand-border',
      info: 'bg-fb-info-surface text-fb-info border-fb-info-border',
      success: 'bg-fb-success-surface text-fb-success border-fb-success-border',
      caution: 'bg-fb-warning-surface text-fb-warning border-fb-warning-border',
      critical: 'bg-fb-critical-surface text-fb-critical border-fb-critical-border',
    };

    const monoClass = this.mono() ? 'font-mono' : '';
    return [base, sizeClass, toneClasses[this.tone()], monoClass].filter(Boolean).join(' ');
  });
}
