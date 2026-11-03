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
import {
  VintedListingPhotoSourceService,
  type VintedListingPhotoScope,
} from '../../services/vinted-listing-photo-source.service';

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
  readonly photoScope = input<VintedListingPhotoScope | null>(null);
  private readonly photos = inject(VintedListingPhotoSourceService);
  readonly preview = signal<string | null>(null);
  readonly error = signal<string | null>(null);
  readonly loading = signal(false);
  private generation = 0;
  private source: File | string | null = null;
  private sourceScope: string | null = null;
  private original: Promise<{ base64: string; mimeType: string }> | null = null;
  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.generation++;
    });
    effect(() => {
      const image = this.image(),
        options = this.options(),
        photoScope = this.photoScope();
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
        if (image) void this.render(image, options, generation, photoScope);
      });
    });
  }
  private async render(
    image: ListingImageDraft,
    options: VintedListingPhotoOptions,
    generation: number,
    photoScope: VintedListingPhotoScope | null,
  ): Promise<void> {
    try {
      const source =
        image.originalFile ??
        (image.crop ? null : image.file) ??
        image.originalPreviewUrl ??
        image.previewUrl;
      const scopeKey = JSON.stringify(photoScope);
      if (source !== this.source || this.sourceScope !== scopeKey || !this.original) {
        this.source = source;
        this.sourceScope = scopeKey;
        this.original = this.readOriginal(source, photoScope);
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
  private async readOriginal(
    source: File | string,
    photoScope: VintedListingPhotoScope | null,
  ): Promise<{ base64: string; mimeType: string }> {
    const blob = await this.photos.read(source, photoScope);
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
