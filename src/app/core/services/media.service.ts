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
    if (this.mockStore.isDemoMode() || itemId.startsWith('demo-')) {
      return this.localMediaMap.get(itemId) || [];
    }

    try {
      const queryPromise = this.supabase.client
        .from('item_media')
        .select('*')
        .eq('inventory_item_id', itemId)
        .order('created_at', { ascending: false });

      const res: any = await this.mockStore.withTimeout(queryPromise, { data: null, error: new Error('Timeout') }, 1200);
      if (res?.data && !res.error) {
        return res.data as ItemMedia[];
      }
    } catch {
      // offline fallback
    }

    return this.localMediaMap.get(itemId) || [];
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

    if (this.mockStore.isDemoMode() || itemId.startsWith('demo-')) {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => {
          const mockMedia: ItemMedia = {
            id: 'media-' + Math.random().toString(36).substring(2, 9),
            inventory_item_id: itemId,
            storage_path: reader.result as string,
            is_primary: isPrimary,
            file_name: file.name,
            file_size: file.size,
            mime_type: file.type,
            created_at: new Date().toISOString(),
          };

          const existing = this.localMediaMap.get(itemId) || [];
          if (isPrimary) {
            existing.forEach((m) => (m.is_primary = false));
          }
          this.localMediaMap.set(itemId, [mockMedia, ...existing]);
          resolve({ data: mockMedia, error: null });
        };
        reader.onerror = () => resolve({ data: null, error: new Error('Datei konnte nicht gelesen werden.') });
        reader.readAsDataURL(file);
      });
    }

    try {
      // 1. Upload to Supabase Storage
      const { error: uploadError } = await this.supabase.client.storage
        .from('item-media')
        .upload(storagePath, file, {
          contentType: file.type,
          upsert: true,
        });

      if (uploadError) {
        return { data: null, error: uploadError };
      }

      // 2. If setting as primary, unset other primaries first
      if (isPrimary) {
        await this.supabase.client
          .from('item_media')
          .update({ is_primary: false })
          .eq('inventory_item_id', itemId);
      }

      // 3. Insert record in item_media table
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

      if (dbError) {
        return { data: null, error: dbError };
      }

      const mediaRecord = inserted as ItemMedia;
      return { data: mediaRecord, error: null };
    } catch (err: unknown) {
      return { data: null, error: err as Error };
    }
  }

  /**
   * Deletes a media item from storage and database.
   */
  async deleteMedia(itemId: string, mediaId: string, storagePath: string): Promise<{ error: Error | null }> {
    if (this.mockStore.isDemoMode() || itemId.startsWith('demo-')) {
      const existing = this.localMediaMap.get(itemId) || [];
      this.localMediaMap.set(itemId, existing.filter((m) => m.id !== mediaId));
      return { error: null };
    }

    try {
      // Delete from storage if not a data URL
      if (!storagePath.startsWith('data:')) {
        await this.supabase.client.storage.from('item-media').remove([storagePath]);
      }

      // Delete from table
      const { error } = await this.supabase.client.from('item_media').delete().eq('id', mediaId);
      return { error };
    } catch (err: unknown) {
      return { error: err as Error };
    }
  }

  /**
   * Sets a specific media as the primary thumbnail.
   */
  async setPrimary(itemId: string, mediaId: string): Promise<{ error: Error | null }> {
    if (this.mockStore.isDemoMode() || itemId.startsWith('demo-')) {
      const list = this.localMediaMap.get(itemId) || [];
      list.forEach((m) => (m.is_primary = m.id === mediaId));
      this.localMediaMap.set(itemId, list);
      return { error: null };
    }

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
}
