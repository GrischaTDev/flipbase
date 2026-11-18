import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { renderVintedListingPhoto } from '../../../../../../supabase/functions/_shared/vinted-listing-photo-renderer.mjs';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import type { ListingImageDraft } from '../../../../shared/components/listing-image-editor/listing-image-draft';
import {
  isNeutralVintedListingPhotoAdjustment,
  isNeutralVintedListingPhotoOptions,
  resolveVintedListingPhotoAdjustment,
  type VintedListingPhotoOptions,
} from '../../models/vinted-listing-photo-options';
import {
  VintedListingPhotoSourceService,
  type VintedListingPhotoScope,
} from '../../services/vinted-listing-photo-source.service';

/** Liest nur die Originalquelle; die kurzlebige Ausgabe wird nie in die Bildauswahl geschrieben. */
@Component({
  selector: 'app-vinted-listing-photo-preview',
  imports: [ButtonComponent],
  templateUrl: './vinted-listing-photo-preview.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0' },
})
export class VintedListingPhotoPreviewComponent {
  readonly compact = input(false);
  readonly image = input<ListingImageDraft | null>(null);
  readonly images = input<readonly ListingImageDraft[]>([]);
  readonly selectedIndex = input(0);
  readonly selectedIndexChange = output<number>();
  readonly options = input.required<VintedListingPhotoOptions>();
  readonly photoScope = input<VintedListingPhotoScope | null>(null);
  private readonly photos = inject(VintedListingPhotoSourceService);
  readonly preview = signal<string | null>(null);
  readonly error = signal<string | null>(null);
  readonly loading = signal(false);
  readonly viewMode = signal<'edited' | 'original' | 'compare'>('edited');
  readonly compareSplit = signal(50);
  readonly zoom100 = signal(false);

  readonly photoList = computed<readonly ListingImageDraft[]>(() => {
    const list = this.images();
    if (list.length > 0) return list;
    const single = this.image();
    return single ? [single] : [];
  });

  readonly safeIndex = computed(() => {
    const list = this.photoList();
    if (!list.length) return 0;
    return Math.min(list.length - 1, Math.max(0, this.selectedIndex()));
  });

  readonly activeImage = computed<ListingImageDraft | null>(() => {
    const list = this.photoList();
    return list[this.safeIndex()] ?? null;
  });

  readonly hasActiveModification = computed(() => {
    const current = this.activeImage();
    if (!current) return false;
    return !isNeutralVintedListingPhotoOptions(this.options(), current.key);
  });

  private generation = 0;
  private readonly originalCache = new Map<string, Promise<{ base64: string; mimeType: string }>>();

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.generation++;
      this.originalCache.clear();
    });
    effect(() => {
      const image = this.activeImage(),
        options = this.options(),
        photoScope = this.photoScope();
      untracked(() => {
        const generation = ++this.generation;
        this.preview.set(null);
        this.error.set(null);
        this.loading.set(!!image);
        if (image && isNeutralVintedListingPhotoOptions(options, image.key)) {
          this.preview.set(image.previewUrl);
          this.loading.set(false);
          return;
        }
        if (image) void this.render(image, options, generation, photoScope);
      });
    });
  }

  selectPhoto(index: number): void {
    const list = this.photoList();
    if (index < 0 || index >= list.length) return;
    this.selectedIndexChange.emit(index);
  }

  previousPhoto(): void {
    const list = this.photoList();
    if (list.length <= 1) return;
    this.selectPhoto((this.safeIndex() - 1 + list.length) % list.length);
  }

  nextPhoto(): void {
    const list = this.photoList();
    if (list.length <= 1) return;
    this.selectPhoto((this.safeIndex() + 1) % list.length);
  }

  setViewMode(mode: 'edited' | 'original' | 'compare'): void {
    this.viewMode.set(mode);
  }

  toggleZoom(): void {
    this.zoom100.update((value) => !value);
  }

  onCompareSlider(raw: string): void {
    const value = Number(raw);
    if (Number.isFinite(value)) {
      this.compareSplit.set(Math.min(100, Math.max(0, Math.round(value))));
    }
  }

  hasCustomOverride(photo: ListingImageDraft): boolean {
    const opts = this.options();
    return (
      !!opts.crops[photo.key] ||
      !isNeutralVintedListingPhotoAdjustment(opts.photoAdjustments?.[photo.key])
    );
  }

  originalUrl(photo: ListingImageDraft): string {
    return photo.originalPreviewUrl ?? photo.previewUrl;
  }

  private cacheKey(source: File | string, scopeKey: string): string {
    if (typeof source === 'string') return `${scopeKey}::url::${source}`;
    return `${scopeKey}::file::${source.name}::${source.size}::${source.lastModified}`;
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
      const key = this.cacheKey(source, scopeKey);
      let pending = this.originalCache.get(key);
      if (!pending) {
        pending = this.readOriginal(source, photoScope);
        this.originalCache.set(key, pending);
      }
      const original = await pending;
      if (generation !== this.generation) return;
      const adjustment = resolveVintedListingPhotoAdjustment(options, image.key);
      const encoded = await renderVintedListingPhoto({
        ...original,
        resize: options.resize,
        crop: options.crops[image.key] ?? null,
        filter: options.filter,
        border: options.border,
        ...(isNeutralVintedListingPhotoAdjustment(adjustment) ? {} : { adjustments: adjustment }),
      });
      if (generation === this.generation) this.preview.set('data:image/jpeg;base64,' + encoded);
    } catch {
      if (generation === this.generation) {
        this.originalCache.clear();
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
