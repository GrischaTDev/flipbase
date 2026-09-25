import { Injectable, inject } from '@angular/core';
import { MediaService } from '../../../core/services/media.service';
import { SupabaseService } from '../../../core/services/supabase.service';
import { imageFileError } from '../../../shared/components/image-cropper-modal/image-file';
import type { ListingEditorItem, ListingImageDraft } from '../models/listing.models';

@Injectable({ providedIn: 'root' })
export class ListingImagesService {
  private readonly supabase = inject(SupabaseService);
  private readonly media = inject(MediaService);

  private get table() {
    return this.supabase.client.from('listing_images');
  }

  async load(
    listingId: string,
    item: ListingEditorItem,
    saved: boolean,
  ): Promise<readonly ListingImageDraft[]> {
    const { data, error } = await this.table
      .select('*')
      .eq('listing_id', listingId)
      .order('sort_order', { ascending: true });
    if (error) throw new Error(error.message);
    const images = saved
      ? (data ?? []).map((image) => ({ path: image.storage_path, name: image.file_name }))
      : this.defaultImages(item);
    return this.withPreviews(images);
  }

  async defaults(item: ListingEditorItem): Promise<readonly ListingImageDraft[]> {
    return this.withPreviews(this.defaultImages(item));
  }

  async save(
    listingId: string,
    workspaceId: string,
    drafts: readonly ListingImageDraft[],
  ): Promise<readonly ListingImageDraft[]> {
    const { data: current, error: loadError } = await this.table
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('listing_id', listingId);
    if (loadError) throw new Error(loadError.message);
    const existing = new Map((current ?? []).map((image) => [image.storage_path, image]));
    const saved: ListingImageDraft[] = [];
    for (const [index, draft] of drafts.entries()) {
      let path = draft.storagePath;
      if (draft.file) {
        const validationError = imageFileError(draft.file);
        if (validationError) throw new Error(`${draft.file.name}: ${validationError}`);
        const extension = draft.file.name.split('.').at(-1)?.toLowerCase();
        if (!extension || !['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif'].includes(extension)) {
          throw new Error('Nur JPG-, PNG-, WebP-, GIF- oder AVIF-Bilder sind erlaubt.');
        }
        path = `listings/${workspaceId}/${listingId}/${crypto.randomUUID()}.${extension}`;
        const { error } = await this.supabase.client.storage
          .from('item-media')
          .upload(path, draft.file, { contentType: draft.file.type, upsert: false });
        if (error) throw new Error(error.message);
      }
      if (!path) continue;
      const row = existing.get(path);
      const result = row
        ? await this.table.update({ sort_order: index }).eq('id', row.id)
        : await this.table.insert({
            workspace_id: workspaceId,
            listing_id: listingId,
            storage_path: path,
            file_name: draft.fileName,
            sort_order: index,
          });
      if (result.error) {
        if (draft.file) await this.supabase.client.storage.from('item-media').remove([path]);
        throw new Error(result.error.message);
      }
      saved.push({ ...draft, storagePath: path, file: null });
    }
    const retainedPaths = new Set(saved.map((image) => image.storagePath));
    for (const row of current ?? []) {
      if (retainedPaths.has(row.storage_path)) continue;
      const { error } = await this.table.delete().eq('id', row.id);
      if (error) throw new Error(error.message);
      if (row.storage_path.startsWith(`listings/${workspaceId}/${listingId}/`)) {
        const removal = await this.supabase.client.storage
          .from('item-media')
          .remove([row.storage_path]);
        if (removal.error) throw new Error(removal.error.message);
      }
    }
    const { error: markerError } = await this.supabase.client
      .from('listings')
      .update({ image_selection_saved: true })
      .eq('id', listingId)
      .eq('workspace_id', workspaceId);
    if (markerError) throw new Error(markerError.message);
    return saved;
  }

  async pathsForListing(
    listingId: string,
    item: ListingEditorItem,
    saved: boolean,
  ): Promise<readonly { path: string; name: string | null }[]> {
    const { data, error } = await this.table
      .select('*')
      .eq('listing_id', listingId)
      .order('sort_order', { ascending: true });
    if (error) throw new Error(error.message);
    return saved
      ? (data ?? []).map((image) => ({ path: image.storage_path, name: image.file_name }))
      : this.defaultImages(item);
  }

  private defaultImages(item: ListingEditorItem): readonly { path: string; name: string | null }[] {
    return [...item.media]
      .sort((left, right) => (left.sort_order ?? 0) - (right.sort_order ?? 0))
      .map((image) => ({ path: image.storage_path, name: image.file_name ?? null }));
  }

  private async withPreviews(
    images: readonly { path: string; name: string | null }[],
  ): Promise<readonly ListingImageDraft[]> {
    const urls = await this.media.resolveMediaUrls(images.map((image) => image.path));
    return images.map((image) => ({
      key: image.path,
      storagePath: image.path,
      file: null,
      fileName: image.name ?? image.path.split('/').at(-1) ?? 'Bild',
      previewUrl: urls[image.path] ?? '',
    }));
  }
}
