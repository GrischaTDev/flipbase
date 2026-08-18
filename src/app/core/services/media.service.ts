import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { MockDataStoreService } from './mock-data-store.service';
import { ItemMedia } from '../models/reflip.models';

@Injectable({
  providedIn: 'root',
})
export class MediaService {
  private readonly supabase = inject(SupabaseService);
  private readonly mockStore = inject(MockDataStoreService);

  private readonly localMediaMap = new Map<string, ItemMedia[]>();

  /**
   * Retrieves public URL for a given storage path or data URI.
   */
  getPublicUrl(storagePath: string): string {
    if (!storagePath) return '';
    if (storagePath.startsWith('http://') || storagePath.startsWith('https://') || storagePath.startsWith('data:')) {
      return storagePath;
    }
    const { data } = this.supabase.client.storage.from('item-media').getPublicUrl(storagePath);
    return data.publicUrl;
  }

  /**
   * Loads all media records for a given inventory item.
   */
  async loadItemMedia(itemId: string): Promise<ItemMedia[]> {
    const local = this.mockStore.getItemMedia(itemId);

    if (this.mockStore.isDemoMode() || itemId.startsWith('demo-')) {
      return local;
    }

    try {
      const queryPromise = this.supabase.client
        .from('item_media')
        .select('*')
        .eq('inventory_item_id', itemId)
        .order('created_at', { ascending: false });

      const res: any = await this.mockStore.withTimeout(queryPromise, { data: null, error: new Error('Timeout') }, 1200);
      if (res?.data && !res.error && res.data.length > 0) {
        (res.data as ItemMedia[]).forEach((m) => this.mockStore.saveItemMedia(m));
        return res.data as ItemMedia[];
      }
    } catch {
      // offline fallback
    }

    return local;
  }

  /**
   * Uploads an image or document to Supabase Storage and records it in item_media.
   */
  async uploadItemMedia(
    itemId: string,
    file: File,
    isPrimary: boolean = false
  ): Promise<{ data: ItemMedia | null; error: Error | null }> {
    const cleanFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `${itemId}/${Date.now()}_${cleanFileName}`;

    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = async () => {
        const dataUrl = reader.result as string;
        const localMedia: ItemMedia = {
          id: 'media-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7),
          inventory_item_id: itemId,
          storage_path: dataUrl,
          is_primary: isPrimary,
          file_name: file.name,
          file_size: file.size,
          mime_type: file.type,
          created_at: new Date().toISOString(),
        };

        // 1. Immediately persist locally
        this.mockStore.saveItemMedia(localMedia);

        if (this.mockStore.isDemoMode() || itemId.startsWith('demo-')) {
          resolve({ data: localMedia, error: null });
          return;
        }

        // 2. Try Supabase Storage upload in background
        try {
          const { error: uploadError } = await this.supabase.client.storage
            .from('item-media')
            .upload(storagePath, file, {
              contentType: file.type,
              upsert: true,
            });

          if (!uploadError) {
            if (isPrimary) {
              await this.supabase.client
                .from('item_media')
                .update({ is_primary: false })
                .eq('inventory_item_id', itemId);
            }

            const { data: inserted, error: dbError } = await this.supabase.client
              .from('item_media')
              .insert({
                inventory_item_id: itemId,
                storage_path: storagePath,
                is_primary: isPrimary,
                file_name: file.name,
                file_size: file.size,
                mime_type: file.type,
              })
              .select()
              .single();

            if (!dbError && inserted) {
              const cloudMedia = inserted as ItemMedia;
              this.mockStore.saveItemMedia(cloudMedia);
              resolve({ data: cloudMedia, error: null });
              return;
            }
          }
        } catch {
          // Local media already saved
        }

        resolve({ data: localMedia, error: null });
      };

      reader.onerror = () => resolve({ data: null, error: new Error('Datei konnte nicht gelesen werden.') });
      reader.readAsDataURL(file);
    });
  }

  /**
   * Deletes a media item from storage and database.
   */
  async deleteMedia(itemId: string, mediaId: string, storagePath: string): Promise<{ error: Error | null }> {
    this.mockStore.deleteItemMedia(mediaId);

    if (!this.mockStore.isDemoMode() && !itemId.startsWith('demo-')) {
      try {
        if (!storagePath.startsWith('data:')) {
          await this.supabase.client.storage.from('item-media').remove([storagePath]);
        }
        const { error } = await this.supabase.client.from('item_media').delete().eq('id', mediaId);
        return { error };
      } catch (err: unknown) {
        return { error: err as Error };
      }
    }

    return { error: null };
  }

  /**
   * Sets a specific media as the primary thumbnail.
   */
  async setPrimary(itemId: string, mediaId: string): Promise<{ error: Error | null }> {
    this.mockStore.setItemMediaPrimary(itemId, mediaId);

    if (!this.mockStore.isDemoMode() && !itemId.startsWith('demo-')) {
      try {
        await this.supabase.client
          .from('item_media')
          .update({ is_primary: false })
          .eq('inventory_item_id', itemId);

        const { error } = await this.supabase.client
          .from('item_media')
          .update({ is_primary: true })
          .eq('id', mediaId);

        return { error };
      } catch (err: unknown) {
        return { error: err as Error };
      }
    }

    return { error: null };
  }
}
