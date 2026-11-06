import { Injectable, inject, signal } from '@angular/core';
import { SupabaseService } from '../../../core/services/supabase.service';
import { WorkspaceService } from '../../../core/services/workspace.service';
import {
  parseVintedListingCategoryFields,
  type VintedListingCategoryFields,
} from '../models/vinted-listing-category-fields';
import {
  vintedListingCatalogCategoryFields,
  vintedListingCatalogExtraFields,
  type VintedListingCatalogRows,
  type VintedListingExtraField,
} from '../models/vinted-listing-catalog-fields';
import { MarketplaceAccountStore } from './marketplace-account.store';

/**
 * Echte Vinted-Auswahlwerte je Kategorie aus der Datenbank, vorrangig aus dem zentralen
 * Katalog (alle Größengruppen mit Vinted-IDs). Solange eine Kategorie dort noch fehlt,
 * gelten die zuletzt beim Inseratabruf des Kontos gelesenen Werte. Hier wird nur gelesen.
 * Wird im Vinted-Arbeitsbereich bereitgestellt, weil die Kontoliste nur dort existiert.
 */
@Injectable()
export class VintedCategoryFieldStore {
  private readonly database = inject(SupabaseService);
  private readonly workspace = inject(WorkspaceService);
  private readonly accounts = inject(MarketplaceAccountStore);
  private readonly entries = signal<
    ReadonlyMap<string, { fields: VintedListingCategoryFields | null; at: number }>
  >(new Map());
  private readonly requests = new Map<string, Promise<VintedListingCategoryFields | null>>();
  private readonly extras = signal<ReadonlyMap<number, readonly VintedListingExtraField[]>>(
    new Map(),
  );

  /** Zusatzfelder einer Kategorie aus dem Katalog (z. B. Rocklänge, Maße); leer, solange unbekannt. */
  extraFields(categoryId: number | null | undefined): readonly VintedListingExtraField[] {
    return categoryId ? (this.extras().get(categoryId) ?? []) : [];
  }

  /** Gespeicherte Werte oder `null`, solange für diese Kategorie nichts bekannt ist. */
  fields(connectionId: string | null | undefined, categoryId: number | null | undefined) {
    const key = connectionId && categoryId ? this.key(connectionId, categoryId) : null;
    return key ? (this.entries().get(key)?.fields ?? null) : null;
  }

  async load(
    connectionId: string | null | undefined,
    categoryId: number | null | undefined,
  ): Promise<VintedListingCategoryFields | null> {
    const key = connectionId && categoryId ? this.key(connectionId, categoryId) : null;
    if (!key || !connectionId || !categoryId) return null;
    const known = this.entries().get(key);
    // Fehlende Werte nach kurzer Zeit erneut prüfen: der Worker kann sie inzwischen gespeichert haben.
    if (known && (known.fields || Date.now() - known.at < 60_000)) return known.fields;
    let request = this.requests.get(key);
    if (!request) {
      request = this.read(key, connectionId, categoryId).finally(() => this.requests.delete(key));
      this.requests.set(key, request);
    }
    return request;
  }

  /** Übernimmt live gelesene Werte sofort, ohne auf den nächsten Datenbankabruf zu warten. */
  remember(connectionId: string, fields: VintedListingCategoryFields): void {
    const key = this.key(connectionId, fields.categoryId);
    if (key) this.set(key, fields);
  }

  private async read(
    key: string,
    connectionId: string,
    categoryId: number,
  ): Promise<VintedListingCategoryFields | null> {
    const [workspaceId, , externalAccountId] = JSON.parse(key) as [string, string, string];
    // Ein nicht lesbarer Katalog wird wie ein fehlender behandelt.
    let fields = await this.readCatalog(categoryId).catch(() => null);
    if (fields) {
      if (this.key(connectionId, categoryId) === key) this.set(key, fields);
      return fields;
    }
    try {
      const { data, error } = await this.database.client
        .from('vinted_category_field_snapshots')
        .select('fields')
        .eq('workspace_id', workspaceId)
        .eq('connection_id', connectionId)
        .eq('external_account_id', externalAccountId)
        .eq('category_id', categoryId)
        .maybeSingle();
      if (!error && data) fields = parseVintedListingCategoryFields(data.fields, categoryId);
    } catch {
      // Unlesbare Werte werden wie fehlende behandelt; die Maske nutzt dann die eigene Auswahl.
      fields = null;
    }
    if (this.key(connectionId, categoryId) === key) this.set(key, fields);
    return fields;
  }

  /** Felder, Größengruppen und Werte einer Kategorie aus dem zentralen Vinted-Katalog. */
  private async readCatalog(categoryId: number): Promise<VintedListingCategoryFields | null> {
    const client = this.database.client;
    const fields = await client
      .from('vinted_listing_category_fields')
      .select('field_code,position,option_ids,title,required,selection_type,selection_limit')
      .eq('category_id', categoryId);
    if (fields.error) throw fields.error;
    if (!fields.data?.length) return null;
    const codes = fields.data.map((row) => row.field_code).filter((code) => code !== 'size');
    const [groups, options] = await Promise.all([
      client
        .from('vinted_listing_category_size_groups')
        .select('size_group_id,position')
        .eq('category_id', categoryId),
      codes.length
        ? client
            .from('vinted_listing_options')
            .select('field_code,id,title,position')
            .in('field_code', codes)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (groups.error) throw groups.error;
    if (options.error) throw options.error;
    const groupIds = (groups.data ?? []).map((group) => group.size_group_id);
    const sizes = groupIds.length
      ? await client
          .from('vinted_listing_sizes')
          .select('id,size_group_id,title,position')
          .in('size_group_id', groupIds)
      : { data: [], error: null };
    if (sizes.error) throw sizes.error;
    const rows: VintedListingCatalogRows = {
      fields: fields.data,
      sizeGroups: groups.data ?? [],
      sizes: sizes.data ?? [],
      options: options.data ?? [],
    };
    const extras = vintedListingCatalogExtraFields(rows);
    this.extras.update((entries) => new Map(entries).set(categoryId, extras));
    return vintedListingCatalogCategoryFields(categoryId, rows);
  }

  private set(key: string, fields: VintedListingCategoryFields | null): void {
    this.entries.update((entries) => {
      const next = new Map(entries);
      next.set(key, { fields, at: Date.now() });
      return next;
    });
  }

  /** Bindet die Werte an Arbeitsbereich und Vinted-Konto; ein Kontowechsel liest neu. */
  private key(connectionId: string, categoryId: number): string | null {
    const workspaceId = this.workspace.currentWorkspace()?.id;
    const connection = this.accounts
      .connections()
      .find((entry) => entry.connectionId === connectionId);
    if (!workspaceId || !connection?.externalAccountId || connection.workspaceId !== workspaceId)
      return null;
    return JSON.stringify([workspaceId, connectionId, connection.externalAccountId, categoryId]);
  }
}
