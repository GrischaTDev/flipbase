import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  linkedSignal,
  output,
  signal,
} from '@angular/core';
import { ProductImageDraft } from '../../../../core/models/product-media.models';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import {
  CroppedImageResult,
  ImageCropperModalComponent,
} from '../../../../shared/components/image-cropper-modal/image-cropper-modal.component';
import {
  IMAGE_FILE_ACCEPT,
  imageFileError,
} from '../../../../shared/components/image-cropper-modal/image-file';

@Component({
  selector: 'app-product-media-editor',
  imports: [ButtonComponent, ImageCropperModalComponent],
  templateUrl: './product-media-editor.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductMediaEditorComponent {
  readonly images = input<readonly ProductImageDraft[]>([]);
  readonly disabled = input(false);
  readonly imagesChange = output<readonly ProductImageDraft[]>();
  readonly imageFailed = output<ProductImageDraft>();
  readonly drafts = linkedSignal(() => this.images());
  readonly errors = signal<readonly string[]>([]);
  readonly announcement = signal('');
  readonly dragActive = signal(false);
  readonly cropKey = signal<string | null>(null);
  readonly cropImage = computed(
    () => this.drafts().find((image) => image.key === this.cropKey()) ?? null,
  );
  readonly accept = IMAGE_FILE_ACCEPT;
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly readers = new Set<FileReader>();

  constructor() {
    effect(() => {
      if (this.disabled()) this.cropKey.set(null);
    });
    this.destroyRef.onDestroy(() => {
      for (const reader of this.readers) reader.abort();
      this.readers.clear();
    });
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    this.addFiles(files);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.dragActive.set(false);
    this.addFiles(Array.from(event.dataTransfer?.files ?? []));
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    if (!this.disabled()) this.dragActive.set(true);
  }

  onDragLeave(event: DragEvent): void {
    const target = event.currentTarget as HTMLElement;
    if (!(event.relatedTarget instanceof Node) || !target.contains(event.relatedTarget)) {
      this.dragActive.set(false);
    }
  }

  addFiles(files: readonly File[]): void {
    if (this.disabled() || files.length === 0) return;
    const rejected: string[] = [];
    const additions: ProductImageDraft[] = [];
    for (const file of files) {
      const error = imageFileError(file);
      if (error) rejected.push(file.name + ': ' + error);
      else additions.push({ key: crypto.randomUUID(), media: null, file, previewUrl: '' });
    }
    this.errors.set(rejected);
    if (!additions.length) return;
    // Dateien sofort melden: Speichern/Verlassen sieht den Entwurf auch vor der Vorschau.
    this.change([...this.drafts(), ...additions]);
    this.announcement.set(
      additions.length + (additions.length === 1 ? ' Bild hinzugefügt.' : ' Bilder hinzugefügt.'),
    );
    for (const image of additions) this.readPreview(image);
  }

  move(key: string, direction: -1 | 1): void {
    if (this.disabled()) return;
    const images = [...this.drafts()];
    const index = images.findIndex((image) => image.key === key);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= images.length) return;
    [images[index], images[target]] = [images[target], images[index]];
    this.change(images);
    this.announcement.set(
      'Bild auf Position ' +
        (target + 1) +
        ' verschoben.' +
        (target === 0 ? ' Es ist jetzt das Hauptbild.' : ''),
    );
  }

  setPrimary(key: string): void {
    if (this.disabled()) return;
    const image = this.drafts().find((entry) => entry.key === key);
    if (!image) return;
    this.change([image, ...this.drafts().filter((entry) => entry.key !== key)]);
    this.announcement.set('Hauptbild geändert.');
  }

  remove(key: string, event?: MouseEvent): void {
    if (this.disabled()) return;
    const button = event?.target instanceof Element ? event.target.closest('button') : null;
    const row = button?.closest('li');
    const nextRow = row?.nextElementSibling ?? row?.previousElementSibling;
    const focusTarget =
      nextRow?.querySelector<HTMLButtonElement>('button') ??
      row
        ?.closest('app-product-media-editor')
        ?.querySelector<HTMLButtonElement>('[data-add-media] button');
    this.change(this.drafts().filter((image) => image.key !== key));
    if (this.cropKey() === key) this.cropKey.set(null);
    this.announcement.set('Bild entfernt.');
    if (focusTarget) afterNextRender(() => focusTarget.focus(), { injector: this.injector });
  }

  startCrop(key: string): void {
    if (!this.disabled() && this.drafts().some((image) => image.key === key)) this.cropKey.set(key);
  }

  applyCrop(result: CroppedImageResult): void {
    const key = this.cropKey();
    if (this.disabled() || !key) return;
    this.change(
      this.drafts().map((image) =>
        image.key === key
          ? { key: image.key, media: null, file: result.file, previewUrl: result.dataUrl }
          : image,
      ),
    );
    this.cropKey.set(null);
    this.announcement.set(
      'Bildausschnitt übernommen. Änderungen werden mit dem Artikel gespeichert.',
    );
  }

  previewFailed(key: string): void {
    const image = this.drafts().find((entry) => entry.key === key);
    if (image) {
      const message =
        (image.file?.name ?? image.media?.file_name ?? 'Bild') +
        ': Die Vorschau konnte nicht geladen werden.';
      this.errors.update((errors) => (errors.includes(message) ? errors : [...errors, message]));
      this.imageFailed.emit(image);
    }
  }

  imageName(image: ProductImageDraft, index: number): string {
    return image.file?.name ?? image.media?.file_name ?? 'Bild ' + (index + 1);
  }

  private change(images: readonly ProductImageDraft[]): void {
    this.drafts.set(images);
    this.imagesChange.emit(images);
  }

  private readPreview(image: ProductImageDraft): void {
    if (!image.file) return;
    const reader = new FileReader();
    this.readers.add(reader);
    reader.onload = () => {
      this.readers.delete(reader);
      if (this.destroyRef.destroyed || typeof reader.result !== 'string') return;
      const previewUrl = reader.result;
      // Ein verspäteter Reader darf Entfernen, Zuschnitt oder einen bestätigten Upload nicht überschreiben.
      const current = this.drafts().find((entry) => entry.key === image.key);
      if (current?.file !== image.file) return;
      this.change(
        this.drafts().map((entry) => (entry.key === image.key ? { ...entry, previewUrl } : entry)),
      );
    };
    reader.onerror = () => {
      this.readers.delete(reader);
      if (!this.destroyRef.destroyed) this.previewFailed(image.key);
    };
    reader.onabort = () => this.readers.delete(reader);
    // Data-URLs bleiben bei einem Ansichtswechsel im Elternentwurf gültig; keine langlebigen Blob-URLs.
    reader.readAsDataURL(image.file);
  }
}
