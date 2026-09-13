import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { ImageCropperComponent, ImageCroppedEvent, LoadedImage } from 'ngx-image-cropper';
import imageCompression from 'browser-image-compression';
import { ButtonComponent } from '../button/button.component';
import { ModalShellComponent } from '../modal-shell/modal-shell.component';
import { IMAGE_FILE_ACCEPT, imageFileError } from './image-file';
import { CropperFrameAccessibilityDirective } from './cropper-frame-accessibility.directive';

export interface CroppedImageResult {
  file: File;
  dataUrl: string;
  blob: Blob;
  originalSize: number;
  compressedSize: number;
}

@Component({
  selector: 'app-image-cropper-modal',
  imports: [
    ImageCropperComponent,
    ButtonComponent,
    ModalShellComponent,
    CropperFrameAccessibilityDirective,
  ],
  templateUrl: './image-cropper-modal.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ImageCropperModalComponent {
  readonly initialImageFile = input<File | null>(null);
  readonly initialImageDataUrl = input<string | null>(null);
  readonly initialImageUrl = input<string | null>(null);
  readonly title = input('Bild zuschneiden');
  // Einkauf und Inventar behalten ihren bisherigen quadratischen Zuschnitt.
  readonly maintainAspectRatio = input(true);
  readonly imageReady = output<CroppedImageResult>();
  readonly closed = output<void>();

  readonly accept = IMAGE_FILE_ACCEPT;
  readonly imageFile = signal<File | null>(null);
  readonly imageBase64 = signal<string | null>(null);
  readonly imageUrl = signal<string | null>(null);
  readonly croppedBlob = signal<Blob | null>(null);
  readonly rotation = signal(0);
  readonly isProcessing = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly sourceVersion = signal(0);
  private readonly destroyRef = inject(DestroyRef);
  private readonly loadedObjectUrls = new Set<string>();
  private cancelled = false;

  constructor() {
    // Signal-Eingänge sind erst nach dem Konstruktor gebunden.
    effect(() => {
      const file = this.initialImageFile();
      const dataUrl = this.initialImageDataUrl();
      const url = this.initialImageUrl();
      untracked(() => this.setSource(file, dataUrl, url));
    });
    this.destroyRef.onDestroy(() => {
      this.cancelled = true;
      this.releaseLoadedImages();
    });
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file && !this.isProcessing()) this.setSource(file);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    const file = event.dataTransfer?.files[0];
    if (file && !this.isProcessing()) this.setSource(file);
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
  }

  imageCropped(event: ImageCroppedEvent): void {
    // Die Bibliothek erzeugt pro Bewegung eine URL; verwendet wird nur ihr Blob.
    if (event.objectUrl) URL.revokeObjectURL(event.objectUrl);
    if (!this.cancelled) this.croppedBlob.set(event.blob ?? null);
  }

  imageLoaded(image: LoadedImage): void {
    for (const url of [image.original.objectUrl, image.transformed.objectUrl]) {
      if (url?.startsWith('blob:')) this.loadedObjectUrls.add(url);
    }
    if (this.cancelled) this.releaseLoadedImages();
  }

  loadImageFailed(): void {
    this.croppedBlob.set(null);
    this.errorMessage.set(
      'Das Bild konnte nicht geladen werden. Bitte wähle eine andere Bilddatei.',
    );
  }

  rotateClockwise(): void {
    if (this.isProcessing()) return;
    this.croppedBlob.set(null);
    this.rotation.update((rotation) => (rotation + 90) % 360);
  }

  close(): void {
    this.cancelled = true;
    this.closed.emit();
  }

  async applyCropAndCompress(): Promise<void> {
    const blob = this.croppedBlob();
    if (!blob || this.isProcessing() || this.cancelled) return;
    const version = this.sourceVersion();
    this.isProcessing.set(true);
    this.errorMessage.set(null);
    try {
      const name = this.imageFile()?.name.replace(/\.[^/.]+$/, '.jpg') ?? 'produktbild.jpg';
      const cropped = new File([blob], name, { type: 'image/jpeg' });
      const compressed = await imageCompression(cropped, {
        maxSizeMB: 0.35,
        maxWidthOrHeight: 1200,
        useWebWorker: true,
        fileType: 'image/jpeg',
        initialQuality: 0.88,
      });
      const dataUrl = await imageCompression.getDataUrlFromFile(compressed);
      if (this.cancelled || this.destroyRef.destroyed || version !== this.sourceVersion()) return;
      const file = new File([compressed], name, { type: 'image/jpeg' });
      this.imageReady.emit({
        file,
        dataUrl,
        blob: file,
        originalSize: this.imageFile()?.size ?? blob.size,
        compressedSize: file.size,
      });
      this.close();
    } catch {
      if (!this.cancelled) {
        this.errorMessage.set(
          'Das Bild konnte nicht verarbeitet werden. Bitte versuche es erneut.',
        );
      }
    } finally {
      this.isProcessing.set(false);
    }
  }

  private setSource(
    file: File | null,
    dataUrl: string | null = null,
    url: string | null = null,
  ): void {
    this.releaseLoadedImages();
    this.sourceVersion.update((version) => version + 1);
    this.rotation.set(0);
    this.croppedBlob.set(null);
    const error = file ? imageFileError(file) : null;
    this.errorMessage.set(error);
    this.imageFile.set(error ? null : file);
    this.imageBase64.set(file ? null : dataUrl);
    this.imageUrl.set(file || dataUrl ? null : url);
  }

  private releaseLoadedImages(): void {
    for (const url of this.loadedObjectUrls) URL.revokeObjectURL(url);
    this.loadedObjectUrls.clear();
  }
}
