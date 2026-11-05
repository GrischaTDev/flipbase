import { Injectable, inject, signal } from '@angular/core';
import { SupabaseService } from '../../../core/services/supabase.service';
import { WorkspaceService } from '../../../core/services/workspace.service';
import {
  parseVintedListingCategoryFields,
  type VintedListingCategoryFields,
} from '../models/vinted-listing-category-fields';
import { MarketplaceAccountStore } from './marketplace-account.store';

/**
 * Echte Vinted-Auswahlwerte je Konto und Kategorie aus der Datenbank.
 * Der Worker speichert sie bei jedem Inserat- oder Kategorieabruf; hier wird nur gelesen.
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
    let fields: VintedListingCategoryFields | null = null;
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
