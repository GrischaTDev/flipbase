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
  host: { class: 'inline-flex shrink-0 align-middle' },
})
export class ProductThumbnailComponent {
  readonly src = input<string | null>(null);
  readonly alt = input('');
  readonly size = input<'sm' | 'md'>('sm');
  readonly imageFailed = output<void>();
  readonly failed = linkedSignal({ source: this.src, computation: () => false });
  readonly imageSource = computed(() => (this.failed() ? null : this.src()?.trim() || null));
}
