import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  input,
  linkedSignal,
  output,
  signal,
} from '@angular/core';
import {
  CdkDrag,
  CdkDragDrop,
  CdkDragHandle,
  CdkDragPlaceholder,
  CdkDropList,
} from '@angular/cdk/drag-drop';
import {
  LucideArrowLeft,
  LucideArrowRight,
  LucideGripVertical,
  LucideStar,
  LucideTrash2,
} from '@lucide/angular';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import {
  IMAGE_FILE_ACCEPT,
  imageFileError,
} from '../../../../shared/components/image-cropper-modal/image-file';
import type { ListingImageDraft } from '../../models/listing.models';

@Component({
  selector: 'app-listing-image-editor',
  imports: [ButtonComponent, CdkDrag, CdkDragHandle, CdkDragPlaceholder, CdkDropList],
  templateUrl: './listing-image-editor.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ListingImageEditorComponent {
  readonly images = input<readonly ListingImageDraft[]>([]);
  readonly drafts = linkedSignal(() => this.images());
  readonly disabled = input(false);
  readonly imagesChange = output<readonly ListingImageDraft[]>();
  readonly errors = signal<readonly string[]>([]);
  readonly announcement = signal('');
  readonly dragActive = signal(false);
  readonly dragStartDelay = { touch: 200, mouse: 0 } as const;
  readonly dragIcon = LucideGripVertical;
  readonly primaryIcon = LucideStar;
  readonly previousIcon = LucideArrowLeft;
  readonly nextIcon = LucideArrowRight;
  readonly removeIcon = LucideTrash2;
  readonly accept = IMAGE_FILE_ACCEPT;
  private readonly readers = new Set<FileReader>();
  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    this.destroyRef.onDestroy(() => {
      for (const reader of this.readers) reader.abort();
      this.readers.clear();
    });
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.addFiles(Array.from(input.files ?? []));
    input.value = '';
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragActive.set(false);
    this.addFiles(Array.from(event.dataTransfer?.files ?? []));
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    if (!this.disabled()) this.dragActive.set(true);
  }

  onDragLeave(event: DragEvent): void {
    const target = event.currentTarget as HTMLElement;
    if (!(event.relatedTarget instanceof Node) || !target.contains(event.relatedTarget)) {
      this.dragActive.set(false);
    }
  }

  addFiles(files: readonly File[]): void {
    if (this.disabled()) return;
    const rejected: string[] = [];
    const accepted: ListingImageDraft[] = [];
    for (const file of files) {
      const error = imageFileError(file);
      if (error) rejected.push(`${file.name}: ${error}`);
      else {
        const draft: ListingImageDraft = {
          key: crypto.randomUUID(),
          storagePath: null,
          file,
          fileName: file.name,
          previewUrl: '',
        };
        accepted.push(draft);
        const reader = new FileReader();
        this.readers.add(reader);
        reader.onload = () => {
          this.readers.delete(reader);
          const previewUrl = typeof reader.result === 'string' ? reader.result : '';
          this.change(
            this.drafts().map((image) =>
              image.key === draft.key ? { ...image, previewUrl } : image,
            ),
          );
        };
        reader.onerror = () => this.readers.delete(reader);
        reader.readAsDataURL(file);
      }
    }
    this.errors.set(rejected);
    if (accepted.length) {
      this.change([...this.drafts(), ...accepted]);
      this.announcement.set(
        `${accepted.length} ${accepted.length === 1 ? 'Bild' : 'Bilder'} hinzugefügt.`,
      );
    }
  }

  move(key: string, direction: -1 | 1): void {
    const images = [...this.drafts()];
    const index = images.findIndex((image) => image.key === key);
    const next = index + direction;
    if (this.disabled() || index < 0 || next < 0 || next >= images.length) return;
    [images[index], images[next]] = [images[next], images[index]];
    this.change(images);
    this.announcement.set(`Bild auf Position ${next + 1} verschoben.`);
  }

  setPrimary(key: string): void {
    const image = this.drafts().find((entry) => entry.key === key);
    if (this.disabled() || !image) return;
    this.change([image, ...this.drafts().filter((entry) => entry.key !== key)]);
    this.announcement.set('Hauptbild geändert.');
  }

  remove(key: string): void {
    if (this.disabled()) return;
    this.change(this.drafts().filter((image) => image.key !== key));
    this.announcement.set('Bild entfernt.');
  }

  onReordered(event: CdkDragDrop<unknown>): void {
    if (this.disabled() || event.previousIndex === event.currentIndex) return;
    const images = [...this.drafts()];
    const [image] = images.splice(event.previousIndex, 1);
    images.splice(event.currentIndex, 0, image);
    this.change(images);
    this.announcement.set(`Bild auf Position ${event.currentIndex + 1} verschoben.`);
  }

  private change(images: readonly ListingImageDraft[]): void {
    this.drafts.set(images);
    this.imagesChange.emit(images);
  }
}
