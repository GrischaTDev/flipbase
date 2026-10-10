import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/services/supabase.service';
import type { ListingImageDraft } from '../../../shared/components/listing-image-editor/listing-image-draft';
import {
  listingIdentifier,
  listingResponse,
  parseVintedListingDraft,
  type VintedListingDraft,
} from '../models/vinted-listing-draft';

export function vintedDraftImageError(file: File): string | null {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type))
    return 'Wähle ein JPG-, PNG- oder WebP-Foto.';
  if (file.size < 1 || file.size > 52428800)
    return 'Das Foto muss zwischen 1 Byte und 50 MB groß sein.';
  return null;
}
@Injectable({ providedIn: 'root' })
export class VintedListingImageService {
  private readonly client = inject(SupabaseService).client;
  private readonly bucket = 'marketplace-listing-media';
  async previews(draft: VintedListingDraft): Promise<readonly ListingImageDraft[]> {
    if (!draft.images.length) return [];
    const { data, error } = await this.client.storage.from(this.bucket).createSignedUrls(
      draft.images.map((image) => image.storagePath),
      3600,
    );
    if (error) throw new Error('Die Fotos konnten nicht geladen werden. Versuche es erneut.');
    const urls = new Map(
      (data ?? []).filter((image) => !image.error).map((image) => [image.path, image.signedUrl]),
    );
    if (draft.images.some((image) => !urls.get(image.storagePath)))
      throw new Error('Ein gespeichertes Foto konnte nicht geladen werden. Lade die Fotos erneut.');
    return draft.images.map((image) => ({
      key: image.id,
      storagePath: image.storagePath,
      file: null,
      fileName: image.fileName,
      previewUrl: urls.get(image.storagePath)!,
    }));
  }
  async upload(
    draft: VintedListingDraft,
    file: File,
    replaceImageId?: string,
  ): Promise<VintedListingDraft> {
    const error = vintedDraftImageError(file);
    if (error) throw new Error(error);
    try {
      const bitmap = await createImageBitmap(file);
      const readable = bitmap.width > 0 && bitmap.height > 0;
      bitmap.close();
      if (!readable) throw new Error('Empty image');
    } catch {
      throw new Error('Das Foto kann nicht gelesen werden. Wähle eine gültige Bilddatei.');
    }
    const reservation = listingResponse(
      await this.client.rpc('marketplace_reserve_listing_image', {
        p_draft_id: draft.id,
        p_file_name: file.name,
        p_mime_type: file.type,
        p_byte_size: file.size,
      }),
    );
    if (!reservation || typeof reservation !== 'object' || Array.isArray(reservation))
      throw new Error('Die Bildreservierung ist ungültig.');
    const row = reservation as Record<string, unknown>;
    const id = listingIdentifier(row['id']);
    const path = row['storagePath'];
    if (
      typeof path !== 'string' ||
      !path.startsWith(`${draft.workspaceId}/${draft.id}/`) ||
      path.split('/').length !== 3 ||
      path.includes('..')
    )
      throw new Error('Der Upload konnte nicht sicher zugeordnet werden.');
    try {
      const upload = await this.client.storage
        .from(this.bucket)
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upload.error)
        throw new Error('Das Foto konnte nicht hochgeladen werden. Deine Auswahl bleibt erhalten.');
      return parseVintedListingDraft(
        listingResponse(
          await this.client.rpc('marketplace_commit_listing_image', {
            p_draft_id: draft.id,
            p_expected_revision: draft.revision,
            p_image_id: id,
            ...(replaceImageId ? { p_replace_image_id: listingIdentifier(replaceImageId) } : {}),
          }),
        ),
        draft.workspaceId,
        draft.id,
      );
    } catch (error) {
      // Der Server sperrt die Bereinigung bestätigter Fotos, auch nach einer verlorenen Antwort.
      try {
        const discarded = listingResponse(
          await this.client.rpc('marketplace_discard_listing_image', { p_image_id: id }),
        );
        if (discarded === path) await this.client.storage.from(this.bucket).remove([path]);
      } catch {
        /* Bestätigtes Foto oder vorübergehend keine Verbindung: Original behalten. */
      }
      throw error;
    }
  }
  async setOrder(draft: VintedListingDraft, ids: readonly string[]): Promise<VintedListingDraft> {
    return parseVintedListingDraft(
      listingResponse(
        await this.client.rpc('marketplace_set_listing_image_order', {
          p_draft_id: draft.id,
          p_expected_revision: draft.revision,
          p_image_ids: [...ids],
        }),
      ),
      draft.workspaceId,
      draft.id,
    );
  }
}
