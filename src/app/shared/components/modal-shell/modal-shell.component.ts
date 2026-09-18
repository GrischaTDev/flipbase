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
  readonly closeOnBackdrop = input<boolean>(false);
  readonly hasFooter = input<boolean>(true);

  readonly closed = output<void>();

  protected readonly closeIcon = LucideX;

  protected readonly cardClasses = computed(() => {
    const base =
      'linear-surface my-auto flex max-h-[90vh] w-full flex-col overflow-hidden rounded-2xl shadow-lg animate-modal-card';

    const sizeClasses: Record<ModalSize, string> = {
      sm: 'max-w-md',
      md: 'max-w-xl',
      lg: 'max-w-[620px]',
      xl: 'max-w-4xl',
      full: 'max-w-6xl',
    };

    return [base, sizeClasses[this.size()]].join(' ');
  });

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
