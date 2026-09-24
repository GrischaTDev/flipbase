import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type BadgeTone = 'neutral' | 'brand' | 'admin' | 'info' | 'success' | 'caution' | 'critical';
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
      'inline-flex items-center justify-center font-semibold rounded-lg transition-colors select-none';

    const sizeClass =
      this.size() === 'md'
        ? 'h-6 px-2.5 text-xs gap-1.5 leading-4'
        : 'h-5 px-2 text-xs gap-1 leading-4';

    const toneClasses: Record<BadgeTone, string> = {
      neutral: 'bg-fb-badge-neutral text-fb-badge-on-neutral',
      brand: 'bg-fb-badge-brand text-fb-badge-on-brand',
      admin: 'bg-fb-admin-surface text-fb-admin',
      info: 'bg-fb-badge-neutral text-fb-badge-on-neutral',
      success: 'bg-fb-badge-success text-fb-badge-on-success',
      caution: 'bg-fb-badge-warning text-fb-badge-on-warning',
      critical: 'bg-fb-badge-critical text-fb-badge-on-critical',
    };

    const monoClass = this.mono() ? 'font-mono' : '';
    return [base, sizeClass, toneClasses[this.tone()], monoClass].filter(Boolean).join(' ');
  });
}
