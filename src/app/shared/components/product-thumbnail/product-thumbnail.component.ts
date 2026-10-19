import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  linkedSignal,
  output,
} from '@angular/core';
import { LucideImage, LucideShirt } from '@lucide/angular';

@Component({
  selector: 'app-product-thumbnail',
  imports: [LucideImage, LucideShirt],
  templateUrl: './product-thumbnail.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex shrink-0 align-middle', '[class.w-full]': "size() === 'reference'" },
})
export class ProductThumbnailComponent {
  readonly src = input<string | null>(null);
  readonly alt = input('');
  readonly garmentPlaceholder = computed(() =>
    ['sm', 'md', 'listing', 'listing-detail', 'gallery'].includes(this.size()),
  );
  readonly placeholderColor = computed(() => {
    if (!this.garmentPlaceholder()) return null;
    const colors = ['#e6d6bf', '#d2d9dc', '#b7c2b0', '#b3c3d6', '#d8cbc7'];
    const hash = Array.from(this.alt()).reduce(
      (value, char) => (value * 31 + char.charCodeAt(0)) >>> 0,
      0,
    );
    return colors[hash % colors.length];
  });
  readonly size = input<
    | 'sm'
    | 'md'
    | 'listing'
    | 'listing-detail'
    | 'avatar'
    | 'profile'
    | 'badge'
    | 'reference'
    | 'gallery'
    | 'viewer'
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
