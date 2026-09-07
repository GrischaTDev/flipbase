import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { LucideDynamicIcon, LucideIconInput, LucideLoader2 } from '@lucide/angular';
import { NgTemplateOutlet } from '@angular/common';
import { Params, RouterLink } from '@angular/router';

export type ButtonVariant = 'primary' | 'secondary' | 'destructive' | 'ghost' | 'plain';

export type ButtonSize = 'slim' | 'md' | 'lg';

@Component({
  selector: 'app-button',
  imports: [LucideDynamicIcon, NgTemplateOutlet, RouterLink],
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
  readonly iconOnly = input<boolean>(false);
  readonly fullWidth = input<boolean>(false);
  readonly type = input<'button' | 'submit' | 'reset'>('button');
  readonly link = input<string | null>(null);
  readonly queryParams = input<Params | null>(null);
  readonly ariaLabel = input<string>('');
  readonly title = input<string>('');
  readonly ariaExpanded = input<boolean | null>(null);
  readonly ariaControls = input<string>('');
  readonly ariaHaspopup = input<'dialog' | 'menu' | 'listbox' | null>(null);

  readonly clicked = output<MouseEvent>();

  protected readonly spinnerIcon = LucideLoader2;

  readonly effectiveDisabled = computed(() => this.disabled() || this.loading());

  protected readonly buttonClasses = computed(() => {
    const base =
      'fb-button inline-flex items-center justify-center font-[550] leading-4 select-none cursor-pointer pointer-coarse:min-h-11 pointer-coarse:min-w-11 ' +
      'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fb-primary ' +
      'disabled:cursor-not-allowed disabled:opacity-40';

    const width = this.fullWidth() ? 'w-full' : '';

    const variantStyles: Record<ButtonVariant, string> = {
      primary: 'linear-btn-primary font-semibold text-fb-on-accent shadow-sm',
      secondary:
        'linear-btn-secondary text-fb-text-secondary border border-fb-border hover:text-fb-text-primary hover:bg-fb-surface-hover shadow-sm',
      destructive:
        'bg-rose-600 hover:bg-rose-500 text-white border border-rose-700 shadow-sm font-semibold focus-visible:outline-rose-500',
      ghost:
        'bg-transparent text-fb-text-secondary hover:text-fb-text-primary hover:bg-fb-surface-hover border border-transparent',
      plain:
        'bg-transparent text-fb-text-secondary hover:text-fb-text-primary p-0 border-0 underline-offset-4 hover:underline',
    };

    const sizeStyles: Record<ButtonSize, string> = this.iconOnly()
      ? {
          slim: 'h-7 w-7 px-0 text-[13px] rounded-lg gap-0',
          md: 'h-7 w-7 px-0 text-[13px] rounded-lg gap-0',
          lg: 'h-8 w-8 px-0 text-[13px] rounded-lg gap-0',
        }
      : {
          slim: 'h-7 px-2 text-[13px] rounded-lg gap-1.5',
          md: 'h-7 px-3 text-[13px] rounded-lg gap-1.5',
          lg: 'h-8 px-4 text-[13px] rounded-lg gap-2',
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
