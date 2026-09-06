import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { LucideDynamicIcon, LucideIconInput, LucideLoader2 } from '@lucide/angular';

export type ButtonVariant =
  'primary' | 'primary-dark' | 'secondary' | 'destructive' | 'ghost' | 'plain';

export type ButtonSize = 'slim' | 'md' | 'lg';

@Component({
  selector: 'app-button',
  imports: [LucideDynamicIcon],
  templateUrl: './button.component.html',
  styleUrl: './button.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.inline-block]': '!fullWidth()',
    '[class.block]': 'fullWidth()',
    '[class.w-full]': 'fullWidth()',
  },
})
export class ButtonComponent {
  readonly variant = input<ButtonVariant>('secondary');
  readonly size = input<ButtonSize>('md');
  readonly loading = input<boolean>(false);
  readonly disabled = input<boolean>(false);
  readonly icon = input<LucideIconInput | null>(null);
  readonly iconPosition = input<'start' | 'end'>('start');
  readonly fullWidth = input<boolean>(false);
  readonly type = input<'button' | 'submit' | 'reset'>('button');
  readonly ariaLabel = input<string>('');
  readonly title = input<string>('');

  readonly clicked = output<MouseEvent>();

  protected readonly spinnerIcon = LucideLoader2;

  readonly effectiveDisabled = computed(() => this.disabled() || this.loading());

  protected readonly buttonClasses = computed(() => {
    const base =
      'inline-flex items-center justify-center font-medium transition select-none cursor-pointer ' +
      'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fb-primary ' +
      'disabled:cursor-not-allowed disabled:opacity-40 active:scale-[0.99]';

    const width = this.fullWidth() ? 'w-full' : '';

    const variantStyles: Record<ButtonVariant, string> = {
      primary: 'linear-btn-primary font-semibold text-fb-on-accent shadow-sm',
      'primary-dark':
        'bg-[#202223] hover:bg-[#1a1a1a] text-white border border-black/20 shadow-sm font-semibold',
      secondary:
        'linear-btn-secondary text-fb-text-secondary border border-fb-border hover:text-fb-text-primary hover:bg-fb-surface-hover shadow-sm',
      destructive:
        'bg-rose-600 hover:bg-rose-500 text-white border border-rose-700 shadow-sm font-semibold focus-visible:outline-rose-500',
      ghost:
        'bg-transparent text-fb-text-secondary hover:text-fb-text-primary hover:bg-fb-surface-hover border border-transparent',
      plain:
        'bg-transparent text-fb-text-secondary hover:text-fb-text-primary p-0 border-0 underline-offset-4 hover:underline',
    };

    const sizeStyles: Record<ButtonSize, string> = {
      slim: 'px-2.5 py-1 text-[13px] rounded-md gap-1.5 min-h-8',
      md: 'px-3.5 py-1.5 text-[13px] rounded-md gap-2 min-h-9',
      lg: 'px-4 py-2.5 text-sm rounded-lg gap-2.5 min-h-11',
    };

    return [base, width, variantStyles[this.variant()], sizeStyles[this.size()]]
      .filter(Boolean)
      .join(' ');
  });

  protected readonly iconClasses = computed(() => {
    switch (this.size()) {
      case 'slim':
        return 'w-3.5 h-3.5 shrink-0';
      case 'lg':
        return 'w-5 h-5 shrink-0';
      case 'md':
      default:
        return 'w-4 h-4 shrink-0';
    }
  });

  protected handleClick(event: MouseEvent): void {
    if (this.effectiveDisabled()) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    this.clicked.emit(event);
  }
}
