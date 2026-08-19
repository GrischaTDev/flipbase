import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
  signal,
} from '@angular/core';
import {
  ImageCropperComponent,
  ImageCroppedEvent,
  LoadedImage,
} from 'ngx-image-cropper';
import imageCompression from 'browser-image-compression';
import { ModalDialogDirective } from '../../../shared/directives/modal-dialog.directive';
import {
  LucideAngularModule,
  RotateCw,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Check,
  X,
  UploadCloud,
  Sparkles,
  RefreshCw,
  Crop,
  ArrowRight,
} from 'lucide-angular';

export interface CroppedImageResult {
  file: File;
  dataUrl: string;
  blob: Blob;
  originalSize: number;
  compressedSize: number;
}

@Component({
  selector: 'app-image-cropper-modal',
  imports: [ModalDialogDirective, ImageCropperComponent, LucideAngularModule],
  templateUrl: './image-cropper-modal.component.html',
  styleUrl: './image-cropper-modal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ImageCropperModalComponent {
  readonly initialImageFile = input<File | null>(null);
  readonly initialImageDataUrl = input<string | null>(null);
  readonly title = input<string>('Produktfoto zuschneiden & optimieren');

  readonly imageReady = output<CroppedImageResult>();
  readonly close = output<void>();

  // Lucide Icons
  readonly rotateIcon = RotateCw;
  readonly zoomInIcon = ZoomIn;
  readonly zoomOutIcon = ZoomOut;
  readonly maxIcon = Maximize2;
  readonly checkIcon = Check;
  readonly closeIcon = X;
  readonly uploadIcon = UploadCloud;
  readonly sparklesIcon = Sparkles;
  readonly refreshIcon = RefreshCw;
  readonly cropIcon = Crop;
  readonly arrowRightIcon = ArrowRight;

  // Cropper State Signals
  readonly imageChangedEvent = signal<Event | null>(null);
  readonly imageFile = signal<File | null>(null);
  readonly imageBase64 = signal<string | null>(null);
  readonly croppedImageBase64 = signal<string | null>(null);
  readonly croppedBlob = signal<Blob | null>(null);

  // Transform parameters
  readonly rotation = signal<number>(0);
  readonly scale = signal<number>(1);
  readonly isProcessing = signal<boolean>(false);
  readonly errorMessage = signal<string | null>(null);

  // Size indicators
  readonly originalSizeBytes = signal<number>(0);
  readonly compressedSizeBytes = signal<number>(0);

  constructor() {
    // If an initial file or dataUrl was passed in
    if (this.initialImageFile()) {
      const f = this.initialImageFile()!;
      this.imageFile.set(f);
      this.originalSizeBytes.set(f.size);
    } else if (this.initialImageDataUrl()) {
      this.imageBase64.set(this.initialImageDataUrl()!);
    }
  }

  onFileSelected(event: Event): void {
    const inputEl = event.target as HTMLInputElement;
    if (inputEl.files && inputEl.files.length > 0) {
      const file = inputEl.files[0];
      this.imageFile.set(file);
      this.originalSizeBytes.set(file.size);
      this.imageChangedEvent.set(event);
      this.rotation.set(0);
      this.scale.set(1);
      this.errorMessage.set(null);
    }
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    if (event.dataTransfer?.files && event.dataTransfer.files.length > 0) {
      const file = event.dataTransfer.files[0];
      if (file.type.startsWith('image/')) {
        this.imageFile.set(file);
        this.originalSizeBytes.set(file.size);
        this.imageChangedEvent.set(null);

        const reader = new FileReader();
        reader.onload = () => {
          this.imageBase64.set(reader.result as string);
        };
        reader.readAsDataURL(file);

        this.rotation.set(0);
        this.scale.set(1);
        this.errorMessage.set(null);
      }
    }
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
  }

  imageCropped(event: ImageCroppedEvent): void {
    if (event.blob) {
      this.croppedBlob.set(event.blob);
    }
    if (event.base64) {
      this.croppedImageBase64.set(event.base64);
    }
  }

  imageLoaded(image: LoadedImage): void {
    this.errorMessage.set(null);
  }

  cropperReady(): void {
    // Cropper is initialized
  }

  loadImageFailed(): void {
    this.errorMessage.set('Das Bild konnte nicht geladen werden. Bitte wähle eine gültige Bilddatei (JPEG, PNG, WebP).');
  }

  rotateClockwise(): void {
    this.rotation.update((r) => (r + 90) % 360);
  }

  zoomIn(): void {
    this.scale.update((s) => Math.min(Number((s + 0.1).toFixed(1)), 3.0));
  }

  zoomOut(): void {
    this.scale.update((s) => Math.max(Number((s - 0.1).toFixed(1)), 0.5));
  }

  onScaleChange(event: Event): void {
    const val = Number((event.target as HTMLInputElement).value);
    this.scale.set(val);
  }

  resetTransform(): void {
    this.rotation.set(0);
    this.scale.set(1);
  }

  async applyCropAndCompress(): Promise<void> {
    const blob = this.croppedBlob();
    if (!blob) {
      this.errorMessage.set('Kein zugeschnittener Bereich verfügbar.');
      return;
    }

    this.isProcessing.set(true);
    this.errorMessage.set(null);

    try {
      // 1. Create a File from Blob
      const originalFile = this.imageFile();
      const fileName = originalFile ? originalFile.name.replace(/\.[^/.]+$/, '.jpg') : `product_${Date.now()}.jpg`;
      const rawCroppedFile = new File([blob], fileName, { type: 'image/jpeg' });

      // 2. Compress image with browser-image-compression
      const options = {
        maxSizeMB: 0.35, // max ~350 KB
        maxWidthOrHeight: 1200, // 1200x1200px max
        useWebWorker: true,
        fileType: 'image/jpeg',
        initialQuality: 0.88,
      };

      const compressedFile = await imageCompression(rawCroppedFile, options);
      this.compressedSizeBytes.set(compressedFile.size);

      // 3. Convert to Data URL for instant preview & offline storage
      const dataUrl = await imageCompression.getDataUrlFromFile(compressedFile);

      this.imageReady.emit({
        file: compressedFile,
        dataUrl,
        blob: compressedFile,
        originalSize: this.originalSizeBytes() || rawCroppedFile.size,
        compressedSize: compressedFile.size,
      });

      this.close.emit();
    } catch (err: unknown) {
      this.errorMessage.set('Fehler bei der Bildkomprimierung: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      this.isProcessing.set(false);
    }
  }

  formatBytes(bytes: number): string {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return (bytes / Math.pow(k, i)).toFixed(1) + ' ' + sizes[i];
  }
}
