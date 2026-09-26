import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
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
import { CdkDrag, CdkDragDrop, CdkDragPlaceholder, CdkDropList } from '@angular/cdk/drag-drop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { LucideDynamicIcon, LucideGrip, LucidePlus } from '@lucide/angular';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import {
  CustomSelectComponent,
  SelectOption,
} from '../../../../shared/components/custom-select/custom-select.component';
import { ModalShellComponent } from '../../../../shared/components/modal-shell/modal-shell.component';
import { TextFieldComponent } from '../../../../shared/components/text-field/text-field.component';
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
  imports: [
    ButtonComponent,
    CustomSelectComponent,
    CdkDrag,
    CdkDragPlaceholder,
    CdkDropList,
    LucideDynamicIcon,
    ModalShellComponent,
    TextFieldComponent,
    ReactiveFormsModule,
    ImageCropperModalComponent,
  ],
  templateUrl: './product-media-editor.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductMediaEditorComponent {
  readonly addIcon = LucidePlus;
  readonly dragIcon = LucideGrip;
  readonly dragStartDelay = { touch: 200, mouse: 0 } as const;
  readonly images = input<readonly ProductImageDraft[]>([]);
  readonly disabled = input(false);
  readonly imagesChange = output<readonly ProductImageDraft[]>();
  readonly imageFailed = output<ProductImageDraft>();
  readonly drafts = linkedSignal(() => this.images());
  readonly errors = signal<readonly string[]>([]);
  readonly announcement = signal('');
  readonly dragActive = signal(false);
  readonly cropKey = signal<string | null>(null);
  readonly detailsKey = signal<string | null>(null);
  readonly detailsImage = computed(
    () => this.drafts().find((image) => image.key === this.detailsKey()) ?? null,
  );
  readonly positionOptions = computed<readonly SelectOption<number>[]>(() =>
    this.drafts().map((_, index) => ({
      value: index + 1,
      label: index === 0 ? '1 · Hauptbild' : String(index + 1),
    })),
  );
  readonly detailsForm = new FormGroup({
    fileName: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(255)],
    }),
    altText: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(500)] }),
    position: new FormControl(1, { nonNullable: true }),
  });
  readonly cropImage = computed(
    () => this.drafts().find((image) => image.key === this.cropKey()) ?? null,
  );
  readonly accept = IMAGE_FILE_ACCEPT;
  private readonly destroyRef = inject(DestroyRef);
  private readonly hostElement = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly readers = new Set<FileReader>();
  private dragDepth = 0;

  constructor() {
    effect(() => {
      if (this.disabled()) {
        this.cropKey.set(null);
        this.detailsKey.set(null);
        this.dragDepth = 0;
        this.dragActive.set(false);
      }
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
    this.dragDepth = 0;
    this.dragActive.set(false);
    this.addFiles(Array.from(event.dataTransfer?.files ?? []));
  }

  onDragEnter(event: DragEvent): void {
    if (this.disabled() || !event.dataTransfer?.types.includes('Files')) return;
    event.preventDefault();
    this.dragDepth++;
    this.dragActive.set(true);
  }

  onDragOver(event: DragEvent): void {
    if (this.disabled() || !event.dataTransfer?.types.includes('Files')) return;
    event.preventDefault();
    event.stopPropagation();
    this.dragActive.set(true);
  }

  onDragLeave(): void {
    this.dragDepth = Math.max(0, this.dragDepth - 1);
    if (this.dragDepth === 0) this.dragActive.set(false);
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

  onReordered(event: CdkDragDrop<unknown>): void {
    if (this.disabled() || event.previousIndex === event.currentIndex) return;
    this.moveTo(event.previousIndex, event.currentIndex);
  }

  openDetails(key: string): void {
    if (this.disabled()) return;
    const index = this.drafts().findIndex((image) => image.key === key);
    if (index < 0) return;
    const image = this.drafts()[index];
    this.detailsForm.setValue({
      fileName: this.imageName(image, index),
      altText: image.altText ?? image.media?.alt_text ?? '',
      position: index + 1,
    });
    this.detailsKey.set(key);
  }

  saveDetails(): void {
    if (this.disabled() || this.detailsForm.invalid) {
      this.detailsForm.markAllAsTouched();
      return;
    }
    const key = this.detailsKey();
    if (!key) return;
    const { fileName, altText, position } = this.detailsForm.getRawValue();
    if (!fileName.trim()) {
      this.detailsForm.controls.fileName.setErrors({ required: true });
      return;
    }
    const images = this.drafts().map((image) =>
      image.key === key ? { ...image, fileName: fileName.trim(), altText: altText.trim() } : image,
    );
    const index = images.findIndex((image) => image.key === key);
    const target = Math.min(Math.max(Number(position) - 1, 0), images.length - 1);
    const [image] = images.splice(index, 1);
    images.splice(target, 0, image);
    this.change(images);
    this.detailsKey.set(null);
    this.announcement.set(`Bildangaben gespeichert. Bild auf Position ${target + 1}.`);
  }

  removeFromDetails(): void {
    const key = this.detailsKey();
    if (!key) return;
    this.detailsKey.set(null);
    this.remove(key);
  }

  cropFromDetails(): void {
    const key = this.detailsKey();
    if (!key) return;
    this.detailsKey.set(null);
    this.startCrop(key);
  }

  remove(key: string, event?: MouseEvent): void {
    if (this.disabled()) return;
    const removedIndex = this.drafts().findIndex((image) => image.key === key);
    if (removedIndex < 0) return;
    const button = event?.target instanceof Element ? event.target.closest('button') : null;
    const row = button?.closest('li');
    const nextRow = row?.nextElementSibling ?? row?.previousElementSibling;
    const host = row?.closest('app-product-media-editor') ?? this.hostElement.nativeElement;
    const remaining = this.drafts().filter((image) => image.key !== key);
    const focusTarget = remaining.length
      ? nextRow?.querySelector<HTMLButtonElement>('button')
      : null;
    this.change(remaining);
    if (this.cropKey() === key) this.cropKey.set(null);
    this.announcement.set('Bild entfernt.');
    afterNextRender(
      () =>
        (focusTarget?.isConnected
          ? focusTarget
          : (host.querySelectorAll<HTMLButtonElement>('ol li[cdkdrag] button')[
              Math.min(removedIndex, remaining.length - 1)
            ] ??
            host.querySelector<HTMLButtonElement>(
              '[data-add-media] button, button[data-add-media]',
            ))
        )?.focus(),
      { injector: this.injector },
    );
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
          ? { ...image, media: null, file: result.file, previewUrl: result.dataUrl }
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
    return image.fileName ?? image.media?.file_name ?? image.file?.name ?? 'Bild ' + (index + 1);
  }

  private moveTo(index: number, target: number): void {
    const images = [...this.drafts()];
    if (index < 0 || target < 0 || target >= images.length) return;
    const [image] = images.splice(index, 1);
    images.splice(target, 0, image);
    this.change(images);
    this.announcement.set(
      `Bild auf Position ${target + 1} verschoben.${target === 0 ? ' Es ist jetzt das Hauptbild.' : ''}`,
    );
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
