import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type BadgeTone = 'neutral' | 'brand' | 'admin' | 'info' | 'success' | 'caution' | 'critical';
export type BadgeSize = 'sm' | 'md' | 'comfortable';

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
  readonly shape = input<'default' | 'pill'>('default');

  protected readonly badgeClasses = computed(() => {
    const base =
      'inline-flex min-w-0 max-w-full items-center justify-center font-semibold transition-colors select-none';

    const sizeClass =
      this.size() === 'comfortable'
        ? 'h-8 px-3 text-xs gap-1.5 leading-4'
        : this.size() === 'md'
          ? 'h-6 px-2.5 text-xs gap-1.5 leading-4'
          : 'h-5 px-2 text-xs gap-1 leading-4';

    const toneClasses: Record<BadgeTone, string> = {
      neutral: 'bg-fb-badge-neutral text-fb-badge-on-neutral',
      brand: 'bg-fb-badge-brand text-fb-badge-on-brand',
      admin: 'bg-fb-admin-surface text-fb-admin',
      info: 'bg-fb-badge-info text-fb-badge-on-info',
      success: 'bg-fb-badge-success text-fb-badge-on-success',
      caution: 'bg-fb-badge-warning text-fb-badge-on-warning',
      critical: 'bg-fb-badge-critical text-fb-badge-on-critical',
    };

    const monoClass = this.mono() ? 'font-mono' : '';
    return [
      base,
      this.shape() === 'pill' ? 'rounded-full' : 'rounded-lg',
      sizeClass,
      toneClasses[this.tone()],
      monoClass,
    ]
      .filter(Boolean)
      .join(' ');
  });
}
