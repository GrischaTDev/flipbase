import { SupabaseService } from '../../../core/services/supabase.service';
import {
  parseVintedSellingTree,
  type VintedSellingTreeNode,
} from '../../../../../supabase/functions/_shared/vinted-selling-tree.mjs';
import { vintedListingCategorySource } from '../models/vinted-listing-category-source';
import type { CategoryPickerSource } from '../../../core/models/category-picker-source';
import { Injectable, inject } from '@angular/core';
import { AuthService } from '../../../core/services/auth.service';
import { WorkspaceService } from '../../../core/services/workspace.service';
import type { VintedListingCategoryFields } from '../models/vinted-listing-category-fields';
import { MarketplaceAccountStore } from './marketplace-account.store';
import { MarketplaceBrowserTestApiService } from './marketplace-browser-test-api.service';
import { VintedCategoryFieldStore } from './vinted-category-field.store';

/** Verwendet den Kontozustand des geöffneten Editors statt einer globalen Kontoauswahl. */
@Injectable()
export class VintedListingCategoryService {
  private readonly database = inject(SupabaseService);
  private readonly auth = inject(AuthService);
  private readonly workspace = inject(WorkspaceService);
  private readonly store = inject(MarketplaceAccountStore);
  private readonly api = inject(MarketplaceBrowserTestApiService);
  private readonly stored = inject(VintedCategoryFieldStore);
  private readonly requests = new Map<string, Promise<VintedListingCategoryFields>>();
  private readonly snapshots = new Map<
    string,
    { at: number; fields: VintedListingCategoryFields }
  >();

  async read(
    connectionId: string,
    categoryId: number,
    options: { fresh?: boolean; categoryLabel?: string } = {},
  ): Promise<VintedListingCategoryFields> {
    const current = this.binding(connectionId);
    const token = this.auth.session()?.access_token;
    if (!token) throw new Error('Melde Dich erneut an, um die Vinted-Auswahl zu laden.');
    const key = JSON.stringify([
      current,
      categoryId,
      options.categoryLabel,
      options.fresh === true,
    ]);
    const cached = this.snapshots.get(key);
    if (!options.fresh && cached && Date.now() - cached.at < 300_000) return cached.fields;
    let request = this.requests.get(key);
    if (!request) {
      request = (async () => {
        // Gespeicherte echte Werte ersparen den Abruf bei Vinted.
        const saved = options.fresh ? null : await this.stored.load(connectionId, categoryId);
        return (
          saved ??
          this.api.readListingCategory(
            { workspaceId: current.workspaceId, connectionId },
            categoryId,
            token,
            ...(options.categoryLabel ? [options.categoryLabel] : []),
          )
        );
      })();
      this.requests.set(key, request);
    }
    let fields: VintedListingCategoryFields;
    try {
      fields = await request;
    } finally {
      if (this.requests.get(key) === request) this.requests.delete(key);
    }
    if (JSON.stringify(this.binding(connectionId)) !== JSON.stringify(current))
      throw new Error('Die Kontoverbindung wurde inzwischen geändert. Lade die Auswahl erneut.');
    this.snapshots.set(key, { at: Date.now(), fields });
    this.stored.remember(connectionId, fields);
    if (this.snapshots.size > 12) this.snapshots.delete(this.snapshots.keys().next().value!);
    return fields;
  }
  async readSnapshot(
    connectionId: string,
  ): Promise<{ categories: VintedSellingTreeNode[]; observedAt: string }> {
    const current = this.binding(connectionId);
    const { data, error } = await this.database.client
      .from('vinted_selling_category_snapshots')
      .select('external_account_id,categories,observed_at')
      .eq('workspace_id', current.workspaceId)
      .eq('connection_id', connectionId)
      .eq('external_account_id', current.externalAccountId)
      .maybeSingle();
    if (JSON.stringify(this.binding(connectionId)) !== JSON.stringify(current))
      throw new Error('Die Kontoverbindung wurde geändert.');
    if (error || !data || data.external_account_id !== current.externalAccountId)
      throw new Error(
        'Für dieses Konto fehlt der Verkaufsbaum. Aktualisiere das Konto und lade die Kategorien erneut.',
      );
    return { categories: parseVintedSellingTree(data.categories), observedAt: data.observed_at };
  }
  source(
    connectionId: string,
    remember: (category: VintedSellingTreeNode) => void,
  ): CategoryPickerSource {
    let binding: string | undefined;
    let pending: Promise<CategoryPickerSource> | undefined;
    const load = () => {
      const currentBinding = JSON.stringify(this.binding(connectionId));
      binding ??= currentBinding;
      if (currentBinding !== binding)
        throw new Error('Die Kontoverbindung wurde geändert. Lade die Kategorien erneut.');
      return (pending ??= this.readSnapshot(connectionId)
        .then((snapshot) => {
          snapshot.categories.forEach(remember);
          return vintedListingCategorySource(snapshot.categories);
        })
        .catch((error) => {
          pending = undefined;
          throw error;
        }));
    };
    return {
      getById: async (id) => (await load()).getById(id),
      loadChildren: async (id) => (await load()).loadChildren(id),
      search: async (term) => (await load()).search(term),
    };
  }
  private binding(connectionId: string) {
    const workspace = this.workspace.currentWorkspace(),
      user = this.auth.currentUser();
    const connection = this.store
      .connections()
      .find((entry) => entry.connectionId === connectionId);
    if (!user || !workspace || workspace.archived_at || !this.store.canManage())
      throw new Error('Du hast keinen Zugriff auf die Vinted-Auswahl dieses Arbeitsbereichs.');
    if (
      !connection ||
      connection.workspaceId !== workspace.id ||
      connection.status !== 'connected' ||
      connection.executionMode !== 'cloud' ||
      typeof connection.externalAccountId !== 'string' ||
      !/^[1-9][0-9]{0,31}$/.test(connection.externalAccountId)
    )
      throw new Error('Wähle ein verbundenes Cloud-Konto aus, um dessen Vinted-Auswahl zu laden.');
    return {
      userId: user.id,
      workspaceId: workspace.id,
      connectionId,
      externalAccountId: connection.externalAccountId,
      status: connection.status,
      executionMode: connection.executionMode,
    };
  }
}
