import { DestroyRef, EnvironmentInjector, Injectable, effect, inject, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { SyncFehlerAktion, SyncStatusService } from './sync-status.service';
import { CatalogProductMedia, ItemMedia } from '../models/flipbase.models';
import { WorkspaceService } from './workspace.service';
import { MutationResult } from '../models/mutation-result.model';
import { AuthService } from './auth.service';

@Injectable({
  providedIn: 'root',
})
export class MediaService {
  private readonly supabase = inject(SupabaseService);
  private readonly syncStatus = inject(SyncStatusService, { optional: true });
  private readonly workspace = inject(WorkspaceService, { optional: true });
  private readonly auth = inject(AuthService, { optional: true });
  private readonly environmentInjector = inject(EnvironmentInjector, { optional: true });
  private readonly destroyRef = inject(DestroyRef);
  private contextKey = '';
  private generation = 0;
  private readonly expirations = new Map<string, number>();
  private readonly retryAfter = new Map<string, number>();
  private readonly retriedPaths = new Set<string>();
  private readonly refreshTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly queuedPaths = new Set<string>();
  private signatureBatchQueued = false;

  constructor() {
    if (this.environmentInjector) effect(() => this.synchronizeContext());
    this.destroyRef.onDestroy(() => this.clearCache());
  }

  private synchronizeContext(deferSignalWrite = false): number {
    const key = `${this.workspace?.currentWorkspace()?.id ?? ''}:${this.auth?.session()?.access_token ?? ''}`;
    if (key !== this.contextKey) {
      this.contextKey = key;
      this.clearCache(deferSignalWrite);
    }
    return this.generation;
  }

  private clearCache(deferSignalWrite = false): void {
    this.generation += 1;
    if (deferSignalWrite) {
      const generation = this.generation;
      queueMicrotask(() => {
        if (generation === this.generation) this.signedUrls.set({});
      });
    } else this.signedUrls.set({});
    this.pendingSignatures.clear();
    this.queuedPaths.clear();
    this.expirations.clear();
    this.retryAfter.clear();
    this.retriedPaths.clear();
    for (const timer of this.refreshTimers.values()) clearTimeout(timer);
    this.refreshTimers.clear();
  }

  invalidateMediaUrl(storagePath: string): void {
    this.expirations.delete(storagePath);
    this.retryAfter.delete(storagePath);
    this.signedUrls.update((urls) => {
      const next = { ...urls };
      delete next[storagePath];
      return next;
    });
  }

  reportMediaFailure(storagePath: string): void {
    this.scheduleRetry(storagePath);
    this.expirations.delete(storagePath);
    this.signedUrls.update((urls) => {
      const next = { ...urls };
      delete next[storagePath];
      return next;
    });
  }

  private scheduleRetry(storagePath: string): void {
    const previous = this.refreshTimers.get(storagePath);
    if (previous) clearTimeout(previous);
    if (this.retriedPaths.has(storagePath)) {
      this.retryAfter.set(storagePath, Number.POSITIVE_INFINITY);
      return;
    }
    this.retriedPaths.add(storagePath);
    this.retryAfter.set(storagePath, Date.now() + 30000);
    const generation = this.generation;
    this.refreshTimers.set(
      storagePath,
      setTimeout(() => {
        if (generation === this.synchronizeContext()) this.invalidateMediaUrl(storagePath);
      }, 30000),
    );
  }

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
    this.synchronizeContext(true);
    if (!storagePath) return '';
    if (
      storagePath.startsWith('catalog-products/') &&
      this.workspace &&
      storagePath.split('/')[1] !== this.workspace.currentWorkspace()?.id
    )
      return '';
    if (
      storagePath.startsWith('http://') ||
      storagePath.startsWith('https://') ||
      storagePath.startsWith('data:') ||
      storagePath.startsWith('blob:')
    ) {
      return storagePath;
    }

    const cached = this.signedUrls()[storagePath];
    if (cached && (this.expirations.get(storagePath) ?? 0) > Date.now()) return cached;
    if ((this.retryAfter.get(storagePath) ?? 0) > Date.now()) return '';

    this.requestSignedUrl(storagePath);
    return '';
  }

  /**
   * Liefert abrufbare URLs fuer mehrere Speicherpfade und wartet auf die
   * Signierung. Gedacht fuer Uebergaben ausserhalb der Anwendung (z. B. die
   * Browser-Erweiterung), die mit dem leeren Zwischenwert von `getMediaUrl`
   * nichts anfangen koennen. Nicht signierbare Pfade fehlen in der Zuordnung;
   * `blob:`-Adressen gelten nur in diesem Tab und fehlen ebenfalls.
   */
  async resolveMediaUrls(storagePaths: readonly string[]): Promise<Record<string, string>> {
    const urls: Record<string, string> = {};
    const pathsToSign: string[] = [];
    for (const storagePath of storagePaths) {
      if (!storagePath) continue;
      if (
        storagePath.startsWith('http://') ||
        storagePath.startsWith('https://') ||
        storagePath.startsWith('data:')
      ) {
        urls[storagePath] = storagePath;
      } else if (!storagePath.startsWith('blob:')) {
        pathsToSign.push(storagePath);
      }
    }
    if (!pathsToSign.length) return urls;

    try {
      const { data, error } = await this.supabase.client.storage
        .from('item-media')
        .createSignedUrls(pathsToSign, MediaService.SIGNED_URL_TTL);
      if (error) throw error;
      for (const entry of data ?? []) {
        if (entry.path && entry.signedUrl && !entry.error) urls[entry.path] = entry.signedUrl;
      }
    } catch (error: unknown) {
      this.melde('Vorbereiten der Bilder', error);
    }
    return urls;
  }

  /** Fordert eine signierte URL an und legt sie im Zwischenspeicher ab. */
  private requestSignedUrl(storagePath: string): void {
    if (this.pendingSignatures.has(storagePath)) return;
    this.pendingSignatures.add(storagePath);
    this.queuedPaths.add(storagePath);
    if (this.signatureBatchQueued) return;
    this.signatureBatchQueued = true;
    queueMicrotask(() => {
      this.signatureBatchQueued = false;
      void this.signQueuedPaths();
    });
  }

  private async signQueuedPaths(): Promise<void> {
    const generation = this.synchronizeContext();
    const paths = [...this.queuedPaths];
    this.queuedPaths.clear();
    if (!paths.length) return;
    try {
      const { data, error } = await this.supabase.client.storage
        .from('item-media')
        .createSignedUrls(paths, MediaService.SIGNED_URL_TTL);
      if (generation !== this.synchronizeContext()) return;
      if (error) throw error;
      const urls: Record<string, string> = {};
      for (const entry of data ?? []) {
        if (!entry.path || !entry.signedUrl || entry.error) continue;
        urls[entry.path] = entry.signedUrl;
        const lifetime = (MediaService.SIGNED_URL_TTL - 120) * 1000;
        this.expirations.set(entry.path, Date.now() + lifetime);
        const path = entry.path;
        const previous = this.refreshTimers.get(path);
        if (previous) clearTimeout(previous);
        this.refreshTimers.set(
          path,
          setTimeout(() => this.invalidateMediaUrl(path), lifetime),
        );
      }
      for (const path of paths) if (!urls[path]) this.scheduleRetry(path);
      this.signedUrls.update((previous) => ({ ...previous, ...urls }));
    } catch (error: unknown) {
      if (generation !== this.synchronizeContext()) return;
      paths.forEach((path) => this.scheduleRetry(path));
      this.melde('Laden der Bildvorschau', error);
    } finally {
      if (generation === this.synchronizeContext())
        paths.forEach((path) => this.pendingSignatures.delete(path));
    }
  }

  async loadProductMedia(productId: string): Promise<CatalogProductMedia[]> {
    const generation = this.synchronizeContext();
    try {
      const { data, error } = await this.supabase.client
        .from('catalog_product_media')
        .select('*')
        .eq('catalog_product_id', productId)
        .order('is_primary', { ascending: false })
        .order('sort_order')
        .order('created_at')
        .order('id');
      if (generation !== this.synchronizeContext()) return [];
      if (error) throw error;
      return (data ?? []).filter(
        (entry) => !this.workspace || entry.workspace_id === this.workspace.currentWorkspace()?.id,
      );
    } catch (error: unknown) {
      throw this.melde('Laden der Produktbilder', error);
    }
  }

  async uploadProductMedia(
    productId: string,
    file: File,
    action?: SyncFehlerAktion,
  ): Promise<{ data: CatalogProductMedia | null; error: Error | null }> {
    const generation = this.synchronizeContext();
    let uploadedPath: string | null = null;
    try {
      const extensions: Readonly<Record<string, readonly string[]>> = {
        'image/jpeg': ['jpg', 'jpeg'],
        'image/png': ['png'],
        'image/webp': ['webp'],
        'image/gif': ['gif'],
        'image/avif': ['avif'],
      };
      const extension = file.name.split('.').at(-1)?.toLowerCase() ?? '';
      if (!extensions[file.type]?.includes(extension) || file.size === 0)
        throw new Error('Bitte ein JPEG-, PNG-, WebP-, GIF- oder AVIF-Bild auswählen.');
      const product = await this.readProductForUpload(productId);
      if (!product) throw new Error('Das Produkt wurde nicht gefunden oder ist nicht zugänglich.');
      if (generation !== this.synchronizeContext())
        throw new Error('Workspace oder Sitzung wurde gewechselt. Bitte erneut versuchen.');
      const existing = await this.loadProductMedia(productId);
      const isPrimary = !existing.some((entry) => entry.is_primary);
      const id = crypto.randomUUID();
      const path = `catalog-products/${product.workspace_id}/${productId}/${id}.${extension}`;
      const metadata = {
        workspace_id: product.workspace_id,
        catalog_product_id: productId,
        is_primary: isPrimary,
        sort_order: existing.length,
        file_name: file.name,
        file_size: file.size,
        mime_type: file.type,
      };
      if (generation !== this.synchronizeContext())
        throw new Error('Workspace oder Sitzung wurde gewechselt.');
      const { error: uploadError } = await this.supabase.client.storage
        .from('item-media')
        .upload(path, file, { contentType: file.type, upsert: false });
      if (uploadError) throw uploadError;
      uploadedPath = path;
      if (generation !== this.synchronizeContext())
        throw new Error('Workspace oder Sitzung wurde gewechselt.');
      const { data, error } = await this.supabase.client
        .from('catalog_product_media')
        .insert({ ...metadata, storage_path: path })
        .select()
        .single();
      if (error || !data) throw error ?? new Error('Der Bildeintrag wurde nicht zurückgegeben.');
      uploadedPath = null;
      return { data, error: null };
    } catch (error: unknown) {
      let failure = this.melde('Speichern des Produktbilds', error, action);
      if (uploadedPath && generation === this.synchronizeContext()) {
        try {
          const { error: rollbackError } = await this.supabase.client.storage
            .from('item-media')
            .remove([uploadedPath]);
          if (rollbackError) throw rollbackError;
        } catch (rollbackError: unknown) {
          failure = this.melde(
            'Aufräumen des fehlgeschlagenen Bilduploads',
            new Error(
              `${failure.message} Nicht entfernt: ${uploadedPath}. ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`,
            ),
            action,
          );
        }
      }
      return { data: null, error: failure };
    }
  }

  async updateProductMediaLayout(
    productId: string,
    orderedMediaIds: readonly string[],
    expectedMediaIds: readonly string[],
    workspaceId: string,
  ): Promise<MutationResult<CatalogProductMedia[]>> {
    const generation = this.synchronizeContext();
    try {
      if (this.workspace?.currentWorkspace()?.id !== workspaceId)
        throw new Error('Der Workspace wurde gewechselt.');
      if (
        new Set(orderedMediaIds).size !== orderedMediaIds.length ||
        new Set(expectedMediaIds).size !== expectedMediaIds.length ||
        orderedMediaIds.some((id) => !expectedMediaIds.includes(id))
      )
        throw new Error('Die Bilderliste ist ungültig.');
      const existing = await this.loadProductMedia(productId);
      if (generation !== this.synchronizeContext())
        throw new Error('Workspace oder Sitzung wurde gewechselt.');
      const { data, error } = await this.supabase.client.rpc('update_product_media_layout', {
        p_product_id: productId,
        p_ordered_media_ids: [...orderedMediaIds],
        p_expected_media_ids: [...expectedMediaIds],
        p_workspace_id: workspaceId,
      });
      if (error) throw error;
      if (!data) throw new Error('Die gespeicherte Bilderliste wurde nicht zurückgegeben.');
      const result = data;
      // Eine bestätigte Änderung bleibt erfolgreich, auch wenn die Dateibereinigung scheitert.
      // Nach Kontextwechsel keine weiteren Schreibzugriffe mit einer anderen Sitzung ausführen.
      if (generation === this.synchronizeContext()) {
        const removed = existing.filter(
          (entry) => !orderedMediaIds.includes(entry.id) && entry.workspace_id === workspaceId,
        );
        if (removed.length) {
          try {
            const cleanup = await this.supabase.client.storage
              .from('item-media')
              .remove(removed.map((entry) => entry.storage_path));
            if (cleanup.error) throw cleanup.error;
            if (generation === this.synchronizeContext())
              removed.forEach((entry) => this.invalidateMediaUrl(entry.storage_path));
          } catch (error: unknown) {
            this.melde('Aufräumen entfernter Produktbilder', error);
          }
        }
      }
      return { data: result, error: null, reportedBySyncStatus: false };
    } catch (cause: unknown) {
      const error = this.melde('Speichern der Bilderliste', cause);
      return {
        data: null,
        error,
        reportedBySyncStatus: this.syncStatus?.istZentralGemeldet(error) ?? false,
      };
    }
  }

  private async readProductForUpload(productId: string): Promise<{ workspace_id: string } | null> {
    const { data, error } = await this.supabase.client
      .from('catalog_products')
      .select('workspace_id')
      .eq('id', productId)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  /**
   * Loads all media records for a given inventory item.
   */
  async loadItemMedia(itemId: string): Promise<ItemMedia[]> {
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
        return data as unknown as ItemMedia[];
      }
    } catch (e: unknown) {
      this.melde('Laden der Bilder', e);
    }

    return [];
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
  async deleteMedia(itemId: string, mediaId: string): Promise<{ error: Error | null }> {
    try {
      const { data: medium, error: leseFehler } = await this.supabase.client
        .from('item_media')
        .select('storage_path')
        .eq('id', mediaId)
        .eq('inventory_item_id', itemId)
        .maybeSingle();
      if (leseFehler) return { error: this.melde('Prüfen des Bildeintrags', leseFehler) };
      if (!medium) {
        return {
          error: this.melde('Prüfen des Bildeintrags', new Error('Das Bild wurde nicht gefunden.')),
        };
      }

      const storagePath = medium.storage_path;
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
        .eq('id', mediaId)
        .eq('inventory_item_id', itemId);
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

    return { error: null };
  }

  /**
   * Sets a specific media as the primary thumbnail.
   */
  async setPrimary(itemId: string, mediaId: string): Promise<{ error: Error | null }> {
    try {
      const { data: medium, error: leseFehler } = await this.supabase.client
        .from('item_media')
        .select('id')
        .eq('id', mediaId)
        .eq('inventory_item_id', itemId)
        .maybeSingle();
      if (leseFehler) return { error: this.melde('Prüfen des Hauptbilds', leseFehler) };
      if (!medium) {
        return {
          error: this.melde('Prüfen des Hauptbilds', new Error('Das Bild wurde nicht gefunden.')),
        };
      }

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
        .eq('id', mediaId)
        .eq('inventory_item_id', itemId);
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

    return { error: null };
  }
}
