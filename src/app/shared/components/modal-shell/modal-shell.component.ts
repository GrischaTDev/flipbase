import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { LucideDynamicIcon, LucideIconInput, LucideX } from '@lucide/angular';
import { ModalDialogDirective } from '../../directives/modal-dialog.directive';

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | 'full';
export type ModalTone = 'neutral' | 'brand' | 'info' | 'success' | 'caution' | 'critical';

@Component({
  selector: 'app-modal-shell',
  imports: [ModalDialogDirective, LucideDynamicIcon],
  templateUrl: './modal-shell.component.html',
  styleUrl: './modal-shell.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'contents',
  },
})
export class ModalShellComponent {
  readonly title = input.required<string>();
  readonly subtitle = input<string>('');
  readonly icon = input<LucideIconInput | null>(null);
  readonly iconTone = input<ModalTone>('info');
  readonly size = input<ModalSize>('lg');
  readonly presentation = input<'center' | 'drawer' | 'sheet'>('center');
  readonly closeOnBackdrop = input<boolean>(false);
  readonly hasFooter = input<boolean>(true);

  readonly closed = output<void>();

  protected readonly closeIcon = LucideX;

  protected readonly cardClasses = computed(() => {
    if (this.presentation() === 'sheet')
      return 'linear-surface fb-dialog-surface flex max-h-[85dvh] w-full flex-col overflow-hidden rounded-t-2xl animate-modal-card';
    if (this.presentation() === 'drawer')
      return 'linear-surface fb-dialog-surface flex h-dvh w-full max-w-lg flex-col overflow-hidden animate-modal-card';
    const base =
      'linear-surface fb-dialog-surface flex min-h-0 max-h-[calc(100dvh-1.5rem)] w-full flex-col overflow-hidden rounded-2xl animate-modal-card sm:max-h-[calc(100dvh-3rem)]';

    const sizeClasses: Record<ModalSize, string> = {
      sm: 'max-w-md',
      md: 'max-w-xl',
      lg: 'max-w-[620px]',
      xl: 'max-w-4xl',
      full: 'max-w-6xl',
    };

    return [base, sizeClasses[this.size()]].join(' ');
  });

  protected readonly overlayClasses = computed(() =>
    this.presentation() === 'sheet'
      ? 'fb-dialog-overlay fb-safe-drawer fixed inset-0 z-50 flex h-dvh items-end justify-center overflow-hidden animate-fade-in'
      : this.presentation() === 'drawer'
        ? 'fb-dialog-overlay fb-safe-drawer fixed inset-0 z-50 flex h-dvh items-stretch justify-end overflow-hidden animate-fade-in'
        : 'fb-dialog-overlay fb-safe-modal fixed inset-0 z-50 flex h-dvh items-center justify-center overflow-hidden p-3 sm:p-6 animate-fade-in',
  );

  protected readonly iconToneClasses = computed(() => {
    const tones: Record<ModalTone, string> = {
      neutral:
        'bg-fb-status-neutral-surface text-fb-status-neutral border-fb-status-neutral-border',
      brand: 'bg-fb-brand-surface text-fb-brand border-fb-brand-border',
      info: 'bg-fb-info-surface text-fb-info border-fb-info-border',
      success: 'bg-fb-success-surface text-fb-success border-fb-success-border',
      caution: 'bg-fb-warning-surface text-fb-warning border-fb-warning-border',
      critical: 'bg-fb-critical-surface text-fb-critical border-fb-critical-border',
    };
    return tones[this.iconTone()];
  });
}
