import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  linkedSignal,
  output,
} from '@angular/core';
import { LucideImage } from '@lucide/angular';

@Component({
  selector: 'app-product-thumbnail',
  imports: [LucideImage],
  templateUrl: './product-thumbnail.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex shrink-0 align-middle', '[class.w-full]': "size() === 'reference'" },
})
export class ProductThumbnailComponent {
  readonly src = input<string | null>(null);
  readonly alt = input('');
  readonly size = input<
    'sm' | 'md' | 'listing' | 'listing-detail' | 'avatar' | 'profile' | 'badge' | 'reference'
  >('sm');
  readonly priority = input(false);
  readonly flush = input(false);
  readonly fit = input<'contain' | 'cover' | null>(null);
  readonly cover = computed(() =>
    this.fit()
      ? this.fit() === 'cover'
      : ['listing', 'avatar', 'profile', 'badge'].includes(this.size()),
  );
  readonly imageFailed = output<void>();
  readonly failed = linkedSignal({ source: this.src, computation: () => false });
  readonly imageSource = computed(() => (this.failed() ? null : this.src()?.trim() || null));
  /** Im Detail umschließt der Rahmen das Foto: kein Rand daneben und nichts abgeschnitten. */
  readonly adaptive = computed(() => this.size() === 'listing-detail' && !!this.imageSource());
  /** Ohne Foto braucht die Detailansicht einen festen Platzhalter, sonst fiele der Rahmen zusammen. */
  readonly detailPlaceholder = computed(
    () => this.size() === 'listing-detail' && !this.imageSource(),
  );
}
