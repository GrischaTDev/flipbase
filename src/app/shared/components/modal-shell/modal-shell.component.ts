import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { LucideDynamicIcon, LucideIconInput, LucideX } from '@lucide/angular';
import { ModalDialogDirective } from '../../directives/modal-dialog.directive';

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | 'full';
export type ModalTone = 'neutral' | 'info' | 'success' | 'caution' | 'critical';

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
      'linear-surface my-auto flex max-h-[90vh] w-full flex-col overflow-hidden rounded-lg border border-fb-border shadow-lg animate-modal-card';

    const sizeClasses: Record<ModalSize, string> = {
      sm: 'max-w-md',
      md: 'max-w-xl',
      lg: 'max-w-2xl',
      xl: 'max-w-4xl',
      full: 'max-w-6xl',
    };

    return [base, sizeClasses[this.size()]].join(' ');
  });

  protected readonly iconToneClasses = computed(() => {
    const tones: Record<ModalTone, string> = {
      neutral: 'bg-fb-subtle text-fb-text-secondary border-fb-border',
      info: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30',
      success: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
      caution: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
      critical: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
    };
    return tones[this.iconTone()];
  });
}
