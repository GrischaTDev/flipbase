import { SupabaseService } from '../../../core/services/supabase.service';
import { VintedCategoryService } from '../../../core/services/vinted-category.service';
import { buildVintedCategoryTree } from '../../../core/models/vinted-category-tree';
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
  private readonly catalog = inject(VintedCategoryService);
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

  async readPublicationSnapshot(connectionId: string): Promise<{
    categories: VintedSellingTreeNode[];
    publishableCategoryIds: ReadonlySet<number>;
    observedAt: string;
  }> {
    const binding = JSON.stringify(this.binding(connectionId));
    const [sellingTree, catalog] = await Promise.all([
      this.readSnapshot(connectionId),
      this.catalog.readSnapshot(),
    ]);
    if (JSON.stringify(this.binding(connectionId)) !== binding)
      throw new Error('Die Kontoverbindung wurde geändert.');
    const catalogTree = buildVintedCategoryTree(catalog.categories);
    return {
      categories: sellingTree.categories,
      observedAt: sellingTree.observedAt,
      publishableCategoryIds: new Set(
        sellingTree.categories
          .filter(({ id, isLeaf }) => isLeaf && catalogTree.get(id)?.isLeaf)
          .map(({ id }) => id),
      ),
    };
  }

  async refreshPublicationSnapshot(connectionId: string) {
    const binding = this.binding(connectionId);
    const token = this.auth.session()?.access_token;
    if (!token) throw new Error('Melde Dich erneut an, um die Vinted-Auswahl zu laden.');
    const previous = await this.readSnapshot(connectionId).catch(() => null);
    if (JSON.stringify(this.binding(connectionId)) !== JSON.stringify(binding))
      throw new Error('Die Kontoverbindung wurde geändert.');
    await this.api.syncConnection({ workspaceId: binding.workspaceId, connectionId }, token);
    if (JSON.stringify(this.binding(connectionId)) !== JSON.stringify(binding))
      throw new Error('Die Kontoverbindung wurde geändert.');
    const snapshot = await this.readPublicationSnapshot(connectionId);
    if (snapshot.observedAt === previous?.observedAt)
      throw new Error('Der Verkaufsbaum wurde bei Vinted nicht aktualisiert.');
    return snapshot;
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
      connection.marketplace !== 'vinted' ||
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
