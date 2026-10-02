import { Injectable, inject, signal } from '@angular/core';
import type { AccountScope } from '../models/marketplace.models';
import type {
  EbayArticleMapping,
  EbaySaleTarget,
} from '../../../../../supabase/functions/_shared/ebay-order-import-contracts';
import { EbayOrderImportApiService } from './ebay-order-import-api.service';

@Injectable()
export class EbayArticleMappingStore {
  private readonly api = inject(EbayOrderImportApiService);
  private scope: AccountScope | null = null;
  private revision = 0;
  readonly mappings = signal<readonly EbayArticleMapping[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  clear(): void {
    this.revision++;
    this.scope = null;
    this.mappings.set([]);
    this.loading.set(false);
    this.error.set(null);
  }
  private matches(scope: AccountScope): boolean {
    return (
      this.scope?.workspaceId === scope.workspaceId &&
      this.scope.connectionId === scope.connectionId
    );
  }
  private message(error: unknown): string {
    return error instanceof Error
      ? error.message
      : 'Die Artikelzuordnung konnte nicht bestätigt werden.';
  }
  async load(scope: AccountScope): Promise<void> {
    this.clear();
    this.scope = { ...scope };
    const revision = this.revision;
    this.loading.set(true);
    try {
      const mappings = await this.api.loadMappings(scope);
      if (revision === this.revision) this.mappings.set(mappings);
    } catch (error) {
      if (revision === this.revision) this.error.set(this.message(error));
    } finally {
      if (revision === this.revision) this.loading.set(false);
    }
  }
  async save(
    scope: AccountScope,
    listingId: string,
    variationId: string | null,
    target: EbaySaleTarget,
  ): Promise<boolean> {
    if (!this.matches(scope) || this.loading()) return false;
    const revision = this.revision;
    this.loading.set(true);
    this.error.set(null);
    try {
      const mapping = await this.api.saveMapping(scope, listingId, variationId, target);
      if (revision !== this.revision) return false;
      this.mappings.update((items) => [
        ...items.filter((item) => item.listingId !== listingId || item.variationId !== variationId),
        mapping,
      ]);
      return true;
    } catch (error) {
      if (revision === this.revision) this.error.set(this.message(error));
      return false;
    } finally {
      if (revision === this.revision) this.loading.set(false);
    }
  }
  async remove(scope: AccountScope, mappingId: string): Promise<boolean> {
    if (!this.matches(scope) || this.loading()) return false;
    const revision = this.revision;
    this.loading.set(true);
    this.error.set(null);
    try {
      await this.api.removeMapping(scope, mappingId);
      if (revision !== this.revision) return false;
      this.mappings.update((items) => items.filter((item) => item.id !== mappingId));
      return true;
    } catch (error) {
      if (revision === this.revision) this.error.set(this.message(error));
      return false;
    } finally {
      if (revision === this.revision) this.loading.set(false);
    }
  }
}
