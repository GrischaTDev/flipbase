import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink, type Params } from '@angular/router';

export type CardVariant = 'surface' | 'kpi' | 'subtle' | 'overview' | 'section';
export type CardPadding = 'none' | 'sm' | 'md' | 'lg';
export type CardRounded = 'md' | 'lg' | 'xl';

@Component({
  selector: 'app-card',
  imports: [RouterLink],
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
  readonly overflowVisible = input(false);
  readonly contentLayout = input<'default' | 'fill'>('default');
  /** Ganzflächiger Link für Karten ohne weitere interaktive Inhalte. */
  readonly link = input<string | null>(null);
  readonly queryParams = input<Params | null>(null);
  readonly linkLabel = input('Karte öffnen');

  protected readonly sectionAppearance = computed(() => this.variant() === 'section');
  protected readonly headerClasses = computed(() =>
    this.sectionAppearance()
      ? 'flex items-start justify-between gap-3 px-5 pt-5 pb-0'
      : 'flex items-center justify-between border-b border-fb-line px-4 py-3 md:px-5 md:py-3.5',
  );
  protected readonly cardClasses = computed(() => {
    const base = `flex flex-col ${this.link() ? 'relative' : ''} ${this.overflowVisible() ? 'overflow-visible' : 'overflow-hidden'} ${this.variant() === 'overview' ? 'border-0' : 'border'}`;

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
      section: 'border-fb-border-subtle bg-fb-surface shadow-[0_1px_3px_rgb(0_0_0/0.03)]',
      overview: 'border-transparent bg-fb-surface shadow-[0_4px_24px_-12px_rgb(15_23_42/0.14)]',
    };

    return [
      base,
      this.variant() === 'overview'
        ? 'rounded-[20px]'
        : this.sectionAppearance()
          ? 'rounded-xl'
          : roundedClass,
      variantClasses[this.variant()],
    ].join(' ');
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
        return this.sectionAppearance() ? 'p-5' : 'p-4';
    }
  });
}
