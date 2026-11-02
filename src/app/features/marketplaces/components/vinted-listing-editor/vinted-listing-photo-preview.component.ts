import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { renderVintedListingPhoto } from '../../../../../../supabase/functions/_shared/vinted-listing-photo-renderer.mjs';
import type { ListingImageDraft } from '../../../../shared/components/listing-image-editor/listing-image-draft';
import type { VintedListingPhotoOptions } from '../../models/vinted-listing-photo-options';

/** Liest nur die Originalquelle; die kurzlebige Ausgabe wird nie in die Bildauswahl geschrieben. */
@Component({
  selector: 'app-vinted-listing-photo-preview',
  templateUrl: './vinted-listing-photo-preview.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0' },
})
export class VintedListingPhotoPreviewComponent {
  readonly compact = input(false);
  readonly image = input<ListingImageDraft | null>(null);
  readonly options = input.required<VintedListingPhotoOptions>();
  readonly preview = signal<string | null>(null);
  readonly error = signal<string | null>(null);
  readonly loading = signal(false);
  private generation = 0;
  private source: File | string | null = null;
  private original: Promise<{ base64: string; mimeType: string }> | null = null;
  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.generation++;
    });
    effect(() => {
      const image = this.image(),
        options = this.options();
      untracked(() => {
        const generation = ++this.generation;
        this.preview.set(null);
        this.error.set(null);
        this.loading.set(!!image);
        if (
          image &&
          options.resize === null &&
          !options.crops[image.key] &&
          (!options.filter || options.filter === 'none') &&
          (!options.border || options.border === 'none')
        ) {
          this.preview.set(image.previewUrl);
          this.loading.set(false);
          return;
        }
        if (image) void this.render(image, options, generation);
      });
    });
  }
  private async render(
    image: ListingImageDraft,
    options: VintedListingPhotoOptions,
    generation: number,
  ): Promise<void> {
    try {
      const source =
        image.originalFile ??
        (image.crop ? null : image.file) ??
        image.originalPreviewUrl ??
        image.previewUrl;
      if (source !== this.source || !this.original) {
        this.source = source;
        this.original = this.readOriginal(source);
      }
      const original = await this.original;
      if (generation !== this.generation) return;
      const encoded = await renderVintedListingPhoto({
        ...original,
        resize: options.resize,
        crop: options.crops[image.key] ?? null,
        filter: options.filter,
        border: options.border,
      });
      if (generation === this.generation) this.preview.set('data:image/jpeg;base64,' + encoded);
    } catch {
      if (generation === this.generation) {
        this.original = null;
        this.error.set('Die Bildvorschau konnte nicht geladen werden.');
      }
    } finally {
      if (generation === this.generation) this.loading.set(false);
    }
  }
  private async readOriginal(source: File | string): Promise<{ base64: string; mimeType: string }> {
    const blob =
      typeof source === 'string'
        ? await (async () => {
            const response = await fetch(source);
            if (!response.ok) throw new Error('Original nicht verfügbar.');
            return response.blob();
          })()
        : source;
    if (!blob.size || blob.size > 50 * 1024 * 1024) throw new Error('Ungültige Bildgröße.');
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () =>
        typeof reader.result === 'string'
          ? resolve(reader.result.slice(reader.result.indexOf(',') + 1))
          : reject(new Error('Bild nicht lesbar.'));
      reader.onerror = () => reject(new Error('Bild nicht lesbar.'));
      reader.readAsDataURL(blob);
    });
    return { base64: data, mimeType: blob.type };
  }
}
