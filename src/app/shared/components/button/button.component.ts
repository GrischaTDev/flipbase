import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { LucideDynamicIcon, LucideIconInput, LucideLoader2 } from '@lucide/angular';
import { NgTemplateOutlet } from '@angular/common';
import { Params, RouterLink } from '@angular/router';

export type ButtonVariant =
  'primary' | 'secondary' | 'destructive' | 'ghost' | 'plain' | 'table-action' | 'thumbnail-remove';

export type TableActionTone = 'brand' | 'positive' | 'warning' | 'critical';

export type ButtonSize = 'slim' | 'md' | 'lg' | 'search';

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
  readonly tone = input<TableActionTone>('brand');
  readonly size = input<ButtonSize>('md');
  readonly loading = input<boolean>(false);
  readonly disabled = input<boolean>(false);
  readonly icon = input<LucideIconInput | null>(null);
  readonly iconPosition = input<'start' | 'end'>('start');
  readonly iconOnly = input<boolean>(false);
  readonly fullWidth = input<boolean>(false);
  readonly contentAlign = input<'center' | 'start'>('center');
  readonly type = input<'button' | 'submit' | 'reset'>('button');
  readonly formId = input('');
  readonly link = input<string | null>(null);
  readonly href = input<string | null>(null);
  readonly target = input<'_self' | '_blank'>('_self');
  readonly queryParams = input<Params | null>(null);
  readonly ariaLabel = input<string>('');
  readonly title = input<string>('');
  readonly ariaExpanded = input<boolean | null>(null);
  readonly ariaPressed = input<boolean | null>(null);
  readonly ariaControls = input<string>('');
  readonly ariaHaspopup = input<'dialog' | 'menu' | 'listbox' | null>(null);

  readonly clicked = output<MouseEvent>();

  protected readonly spinnerIcon = LucideLoader2;

  readonly effectiveDisabled = computed(() => this.disabled() || this.loading());

  protected readonly buttonClasses = computed(() => {
    const focusColor =
      this.variant() === 'table-action'
        ? 'focus-visible:outline-fb-text-primary'
        : 'focus-visible:outline-fb-primary';
    const base =
      'fb-button inline-flex items-center font-[550] leading-4 select-none cursor-pointer ' +
      (this.variant() === 'thumbnail-remove'
        ? 'pointer-coarse:min-h-7 pointer-coarse:min-w-7 '
        : 'pointer-coarse:min-h-11 pointer-coarse:min-w-11 ') +
      'focus-visible:outline-2 focus-visible:outline-offset-2 ' +
      'disabled:cursor-not-allowed disabled:opacity-40';

    const width = this.fullWidth() ? 'w-full' : '';
    const alignment =
      this.contentAlign() === 'start' ? 'justify-start text-left' : 'justify-center';

    const variantStyles: Record<ButtonVariant, string> = {
      primary: 'linear-btn-primary font-semibold text-fb-on-accent shadow-sm',
      secondary:
        'linear-btn-secondary text-fb-text-secondary border border-fb-border hover:text-fb-text-primary hover:bg-fb-surface-hover shadow-sm',
      destructive:
        'bg-fb-critical-surface hover:bg-fb-critical-border text-fb-critical border border-fb-critical-border shadow-sm font-semibold focus-visible:outline-fb-critical',
      ghost:
        'bg-transparent text-fb-text-secondary hover:text-fb-text-primary hover:bg-fb-surface-hover border border-transparent',
      plain:
        'bg-transparent text-fb-text-secondary hover:text-fb-text-primary p-0 border-0 underline-offset-4 hover:underline',
      'table-action': 'border border-transparent bg-transparent text-fb-text-muted shadow-none',
      'thumbnail-remove':
        'rounded-full border border-zinc-300 bg-white text-zinc-900 shadow-sm hover:bg-zinc-100 focus-visible:outline-zinc-900',
    };

    const tableActionToneStyles: Record<TableActionTone, string> = {
      brand:
        'hover:bg-[var(--fb-color-brand-surface)] hover:text-[var(--fb-color-brand-text)] focus-visible:bg-[var(--fb-color-brand-surface)] focus-visible:text-[var(--fb-color-brand-text)]',
      positive:
        'hover:bg-[var(--fb-color-success-surface)] hover:text-[var(--fb-color-success-text)] focus-visible:bg-[var(--fb-color-success-surface)] focus-visible:text-[var(--fb-color-success-text)]',
      warning:
        'hover:bg-[var(--fb-color-warning-surface)] hover:text-[var(--fb-color-warning-text)] focus-visible:bg-[var(--fb-color-warning-surface)] focus-visible:text-[var(--fb-color-warning-text)]',
      critical:
        'hover:bg-[var(--fb-color-critical-surface)] hover:text-[var(--fb-color-critical-text)] focus-visible:bg-[var(--fb-color-critical-surface)] focus-visible:text-[var(--fb-color-critical-text)]',
    };

    const sizeStyles: Record<ButtonSize, string> = this.iconOnly()
      ? {
          slim:
            this.variant() === 'thumbnail-remove'
              ? 'h-7 w-7 px-0 text-[13px] rounded-full gap-0'
              : 'h-7 w-7 px-0 text-[13px] rounded-lg gap-0',
          md: 'h-7 w-7 px-0 text-[13px] rounded-lg gap-0',
          lg: 'h-8 w-8 px-0 text-[13px] rounded-lg gap-0',
          search: 'h-9 w-9 px-0 text-[13px] rounded-lg gap-0',
        }
      : {
          slim: 'h-7 text-[13px] rounded-lg gap-1.5',
          md: 'h-7 text-[13px] rounded-lg gap-1.5',
          lg: 'h-8 text-[13px] rounded-lg gap-2',
          search: 'h-9 text-[13px] rounded-lg gap-1.5',
        };
    const horizontalPadding = this.iconOnly()
      ? ''
      : this.variant() === 'plain'
        ? 'px-0'
        : { slim: 'px-2', md: 'px-3', lg: 'px-4', search: 'px-2' }[this.size()];

    return [
      base,
      focusColor,
      alignment,
      width,
      variantStyles[this.variant()],
      this.variant() === 'table-action' ? tableActionToneStyles[this.tone()] : '',
      sizeStyles[this.size()],
      horizontalPadding,
    ]
      .filter(Boolean)
      .join(' ');
  });

  protected readonly iconClasses = computed(() => {
    switch (this.size()) {
      case 'slim':
        return this.variant() === 'table-action' ? 'w-4 h-4 shrink-0' : 'w-3.5 h-3.5 shrink-0';
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
