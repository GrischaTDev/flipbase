import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type CardVariant = 'surface' | 'kpi' | 'subtle';
export type CardPadding = 'none' | 'sm' | 'md' | 'lg';
export type CardRounded = 'md' | 'lg' | 'xl';

@Component({
  selector: 'app-card',
  templateUrl: './card.component.html',
  styleUrl: './card.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class]': 'cardClasses()',
  },
})
export class CardComponent {
  readonly title = input<string>('');
  readonly subtitle = input<string>('');
  readonly variant = input<CardVariant>('surface');
  readonly padding = input<CardPadding>('md');
  readonly rounded = input<CardRounded>('lg');

  protected readonly cardClasses = computed(() => {
    const base = 'flex flex-col overflow-hidden border';

    const roundedClass =
      this.rounded() === 'xl'
        ? 'rounded-xl'
        : this.rounded() === 'md'
          ? 'rounded-md'
          : 'rounded-lg';

    const variantClasses: Record<CardVariant, string> = {
      surface: 'linear-surface border-transparent bg-fb-surface shadow-sm',
      kpi: 'linear-kpi border-transparent bg-fb-surface shadow-sm',
      subtle: 'border-fb-border-subtle bg-fb-subtle',
    };

    return [base, roundedClass, variantClasses[this.variant()]].join(' ');
  });

  protected readonly contentPaddingClass = computed(() => {
    switch (this.padding()) {
      case 'none':
        return 'p-0';
      case 'sm':
        return 'p-3';
      case 'lg':
        return 'p-5';
      case 'md':
      default:
        return 'p-4';
    }
  });
}
