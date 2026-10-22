import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import type { ProductImageDraft } from '../../../../core/models/product-media.models';
import { ProductMediaEditorComponent } from '../../../../shared/components/product-media-editor/product-media-editor.component';
import type { ListingImageDraft } from '../../../../shared/components/listing-image-editor/listing-image-draft';
import { vintedDraftImageError } from '../../services/vinted-listing-image.service';

/** Verbindet die Artikelgalerie mit den Speicherreferenzen des Inseratentwurfs. */
@Component({
  selector: 'app-vinted-listing-media',
  imports: [ProductMediaEditorComponent],
  templateUrl: './vinted-listing-media.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VintedListingMediaComponent {
  readonly images = input<readonly ListingImageDraft[]>([]);
  readonly disabled = input(false);
  readonly imagesChange = output<readonly ListingImageDraft[]>();
  readonly editingChange = output<boolean>();
  readonly validateFile = vintedDraftImageError;
  readonly media = computed<readonly ProductImageDraft[]>(() =>
    this.images().map((image) => ({
      key: image.key,
      media: null,
      file: image.file,
      previewUrl: image.previewUrl,
      fileName: image.fileName,
    })),
  );
  change(images: readonly ProductImageDraft[]): void {
    this.imagesChange.emit(
      images.map((image) => {
        const previous = this.images().find((entry) => entry.key === image.key);
        const fileName = image.fileName ?? image.file?.name ?? previous?.fileName ?? 'Foto.jpg';
        const file =
          image.file && image.file.name !== fileName
            ? new File([image.file], fileName, {
                type: image.file.type,
                lastModified: image.file.lastModified,
              })
            : image.file;
        return {
          key: image.key,
          file,
          fileName,
          previewUrl: image.previewUrl,
          storagePath: file ? null : (previous?.storagePath ?? null),
        };
      }),
    );
  }
}
