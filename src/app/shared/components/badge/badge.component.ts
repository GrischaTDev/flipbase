import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { LucideDynamicIcon, LucideIconInput } from '@lucide/angular';

export type BadgeTone = 'neutral' | 'info' | 'success' | 'caution' | 'critical';
export type BadgeSize = 'sm' | 'md';

@Component({
  selector: 'app-badge',
  imports: [LucideDynamicIcon],
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
  readonly dot = input<boolean>(false);
  readonly pulse = input<boolean>(false);
  readonly icon = input<LucideIconInput | null>(null);
  readonly mono = input<boolean>(false);
  readonly uppercase = input<boolean>(false);

  protected readonly badgeClasses = computed(() => {
    const base =
      'inline-flex items-center font-semibold rounded-full border transition-colors select-none';

    const sizeClass =
      this.size() === 'md'
        ? 'px-2.5 py-1 text-xs gap-1.5 leading-normal'
        : 'px-2 py-0.5 text-[10px] gap-1 leading-normal';

    const toneClasses: Record<BadgeTone, string> = {
      neutral: 'bg-fb-subtle text-fb-text-secondary border-fb-border',
      info: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
      success: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
      caution: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
      critical: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
    };

    const monoClass = this.mono() ? 'font-mono' : '';
    const uppercaseClass = this.uppercase() ? 'uppercase tracking-wider' : '';

    return [base, sizeClass, toneClasses[this.tone()], monoClass, uppercaseClass]
      .filter(Boolean)
      .join(' ');
  });

  protected readonly dotClasses = computed(() => {
    const toneDots: Record<BadgeTone, string> = {
      neutral: 'bg-fb-text-muted',
      info: 'bg-blue-400',
      success: 'bg-emerald-400',
      caution: 'bg-amber-400',
      critical: 'bg-rose-400',
    };

    const pulseClass = this.pulse() ? 'animate-pulse' : '';
    return ['w-1.5 h-1.5 rounded-full shrink-0', toneDots[this.tone()], pulseClass]
      .filter(Boolean)
      .join(' ');
  });

  protected readonly iconClasses = computed(() => {
    return this.size() === 'md' ? 'w-3.5 h-3.5 shrink-0' : 'w-3 h-3 shrink-0';
  });
}
