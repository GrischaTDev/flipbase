import { Injectable, inject, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { MockDataStoreService } from './mock-data-store.service';
import { SyncFehlerAktion, SyncStatusService } from './sync-status.service';
import { ItemMedia } from '../models/flipbase.models';

@Injectable({
  providedIn: 'root',
})
export class MediaService {
  private readonly supabase = inject(SupabaseService);
  private readonly mockStore = inject(MockDataStoreService);
  private readonly syncStatus = inject(SyncStatusService, { optional: true });

  private readonly localMediaMap = new Map<string, ItemMedia[]>();

  /**
   * Zwischenspeicher fuer signierte URLs: Speicherpfad -> abrufbare URL.
   * Als Signal, damit Templates automatisch nachziehen, sobald eine URL
   * eingetroffen ist.
   */
  private readonly signedUrls = signal<Record<string, string>>({});

  /** Pfade, deren Signierung gerade laeuft - verhindert Mehrfachanfragen. */
  private readonly pendingSignatures = new Set<string>();

  /** Gueltigkeit einer signierten URL in Sekunden. */
  private static readonly SIGNED_URL_TTL = 3600;

  /**
   * Liefert eine abrufbare URL fuer einen Speicherpfad.
   *
   * Der Bucket ist seit der Sicherheitshaertung nicht mehr oeffentlich, daher
   * werden signierte URLs verwendet. Weil Templates synchron binden, gibt die
   * Methode zunaechst eine leere Zeichenkette zurueck und stoesst die
   * Signierung an; sobald die URL vorliegt, aktualisiert das Signal die Ansicht.
   *
   * Bereits vollstaendige URLs und Daten-URIs werden unveraendert
   * durchgereicht - das betrifft alle lokal gespeicherten Bilder.
   */
  getMediaUrl(storagePath: string): string {
    if (!storagePath) return '';
    if (
      storagePath.startsWith('http://') ||
      storagePath.startsWith('https://') ||
      storagePath.startsWith('data:') ||
      storagePath.startsWith('blob:')
    ) {
      return storagePath;
    }

    const cached = this.signedUrls()[storagePath];
    if (cached) return cached;

    this.requestSignedUrl(storagePath);
    return '';
  }

  /** Fordert eine signierte URL an und legt sie im Zwischenspeicher ab. */
  private requestSignedUrl(storagePath: string): void {
    if (this.pendingSignatures.has(storagePath)) return;
    this.pendingSignatures.add(storagePath);

    void this.supabase.client.storage
      .from('item-media')
      .createSignedUrl(storagePath, MediaService.SIGNED_URL_TTL)
      .then(({ data, error }) => {
        if (!error && data?.signedUrl) {
          this.signedUrls.update((map) => ({ ...map, [storagePath]: data.signedUrl }));
        }
      })
      .catch(() => {
        // Ohne erreichbares Backend bleibt das Bild leer.
      })
      .finally(() => {
        this.pendingSignatures.delete(storagePath);
      });
  }

  /**
   * Loads all media records for a given inventory item.
   */
  async loadItemMedia(itemId: string): Promise<ItemMedia[]> {
    const local = this.mockStore.getItemMedia(itemId);

    if (this.mockStore.isDemoMode()) {
      return local;
    }

    try {
      const queryPromise = this.supabase.client
        .from('item_media')
        .select('*')
        .eq('inventory_item_id', itemId)
        .order('created_at', { ascending: false });

      const { data, error } = await queryPromise;
      if (error) {
        // Ohne Meldung faenden sich einfach keine Bilder - nicht zu
        // unterscheiden von einem Artikel, der nie welche hatte.
        this.melde('Laden der Bilder', error);
      } else if (data && data.length > 0) {
        const medien = data as unknown as ItemMedia[];
        medien.forEach((m) => this.mockStore.saveItemMedia(m));
        return medien;
      }
    } catch (e: unknown) {
      this.melde('Laden der Bilder', e);
    }

    return local;
  }

  /**
   * Uploads an image or document to Supabase Storage and records it in item_media.
   */
  async uploadItemMedia(
    itemId: string,
    file: File,
    isPrimary = false,
    fehlerAktion?: SyncFehlerAktion,
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

        if (this.mockStore.isDemoMode()) {
          this.mockStore.saveItemMedia(localMedia);
          resolve({ data: localMedia, error: null });
          return;
        }

        // 2. In den Speicher der Datenbank hochladen.
        //
        // Frueher endete jeder Fehlschlag hier in einem leeren catch mit dem
        // Vermerk "Local media already saved" - und darunter wurde Erfolg
        // gemeldet. Angemeldet stimmte beides nicht: Der lokale Spiegel nimmt
        // nichts auf, also war das Bild nach dem naechsten Laden weg, ohne dass
        // irgendwo ein Hinweis auftauchte. Bei Artikelfotos ist das verlorene
        // Arbeit.
        try {
          const { error: uploadError } = await this.supabase.client.storage
            .from('item-media')
            .upload(storagePath, file, {
              contentType: file.type,
              upsert: true,
            });

          if (uploadError) {
            resolve({
              data: null,
              error: this.melde('Hochladen des Bildes', uploadError, fehlerAktion),
            });
            return;
          }

          {
            if (isPrimary) {
              const { error: hauptbildResetFehler } = await this.supabase.client
                .from('item_media')
                .update({ is_primary: false })
                .eq('inventory_item_id', itemId);
              if (hauptbildResetFehler) {
                resolve({
                  data: null,
                  error: this.melde(
                    'Zurücksetzen des bisherigen Hauptbilds',
                    hauptbildResetFehler,
                    fehlerAktion,
                  ),
                });
                return;
              }
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

            if (dbError || !inserted) {
              resolve({
                data: null,
                error: this.melde('Speichern des Bildeintrags', dbError, fehlerAktion),
              });
              return;
            }

            const cloudMedia = inserted as ItemMedia;
            this.mockStore.saveItemMedia(cloudMedia);
            resolve({ data: cloudMedia, error: null });
            return;
          }
        } catch (e: unknown) {
          resolve({ data: null, error: this.melde('Hochladen des Bildes', e, fehlerAktion) });
          return;
        }
      };

      reader.onerror = () =>
        resolve({ data: null, error: new Error('Datei konnte nicht gelesen werden.') });
      reader.readAsDataURL(file);
    });
  }

  /** Meldet einen Fehler und liefert ihn zurueck - auch ohne SyncStatus. */
  private melde(vorgang: string, ursache: unknown, aktion?: SyncFehlerAktion): Error {
    return (
      this.syncStatus?.melde(vorgang, ursache, aktion) ??
      new Error(`${vorgang} fehlgeschlagen: ${String(ursache)}`)
    );
  }

  /**
   * Deletes a media item from storage and database.
   */
  async deleteMedia(
    itemId: string,
    mediaId: string,
    storagePath: string,
  ): Promise<{ error: Error | null }> {
    if (this.mockStore.isDemoMode()) {
      this.mockStore.deleteItemMedia(mediaId);
      return { error: null };
    }

    try {
      if (!storagePath.startsWith('data:')) {
        const { error: storageFehler } = await this.supabase.client.storage
          .from('item-media')
          .remove([storagePath]);
        if (storageFehler) {
          return { error: this.melde('Löschen der Bilddatei', storageFehler) };
        }
      }
      const { error, count } = await this.supabase.client
        .from('item_media')
        .delete({ count: 'exact' })
        .eq('id', mediaId);
      if (error) return { error: this.melde('Löschen des Bildeintrags', error) };
      if (count === 0) {
        return {
          error: this.melde('Löschen des Bildeintrags', {
            code: 'PGRST116',
            message: 'Das Bild wurde nicht gefunden.',
          }),
        };
      }
    } catch (err: unknown) {
      return { error: this.melde('Löschen des Bildes', err) };
    }

    this.mockStore.deleteItemMedia(mediaId);
    return { error: null };
  }

  /**
   * Sets a specific media as the primary thumbnail.
   */
  async setPrimary(itemId: string, mediaId: string): Promise<{ error: Error | null }> {
    if (this.mockStore.isDemoMode()) {
      this.mockStore.setItemMediaPrimary(itemId, mediaId);
      return { error: null };
    }

    try {
      const { error: zuruecksetzFehler } = await this.supabase.client
        .from('item_media')
        .update({ is_primary: false })
        .eq('inventory_item_id', itemId);
      if (zuruecksetzFehler) {
        return { error: this.melde('Zurücksetzen des bisherigen Hauptbilds', zuruecksetzFehler) };
      }

      const { error, count } = await this.supabase.client
        .from('item_media')
        .update({ is_primary: true }, { count: 'exact' })
        .eq('id', mediaId);
      if (error) return { error: this.melde('Festlegen des Hauptbilds', error) };
      if (count === 0) {
        return {
          error: this.melde('Festlegen des Hauptbilds', {
            code: 'PGRST116',
            message: 'Das Bild wurde nicht gefunden.',
          }),
        };
      }
    } catch (err: unknown) {
      return { error: this.melde('Festlegen des Hauptbilds', err) };
    }

    this.mockStore.setItemMediaPrimary(itemId, mediaId);
    return { error: null };
  }
}
