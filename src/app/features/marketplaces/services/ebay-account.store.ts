import { Injectable, inject, signal } from '@angular/core';
import type {
  EbayConnection,
  EbayListing,
  EbayOrder,
} from '../../../../../supabase/functions/_shared/ebay-contracts';
import { EbayAccountApiService } from './ebay-account-api.service';

@Injectable()
export class EbayAccountStore {
  private readonly api = inject(EbayAccountApiService);
  private revision = 0;
  private workspaceId: string | null = null;
  readonly isConfigured = signal(false);
  readonly connection = signal<EbayConnection | null>(null);
  readonly isLoading = signal(false);
  readonly isReading = signal(false);
  readonly error = signal<string | null>(null);
  readonly dataError = signal<string | null>(null);
  readonly listings = signal<readonly EbayListing[]>([]);
  readonly orders = signal<readonly EbayOrder[]>([]);
  readonly section = signal<'listings' | 'orders'>('listings');
  readonly total = signal<number | null>(null);
  readonly nextPage = signal<number | null>(null);
  readonly hasRead = signal(false);

  reset(workspaceId: string | null): number {
    this.workspaceId = workspaceId;
    this.revision += 1;
    this.isConfigured.set(false);
    this.connection.set(null);
    this.isLoading.set(false);
    this.isReading.set(false);
    this.error.set(null);
    this.clearData();
    return this.revision;
  }
  private clearData(): void {
    this.listings.set([]);
    this.orders.set([]);
    this.total.set(null);
    this.nextPage.set(null);
    this.hasRead.set(false);
    this.dataError.set(null);
  }
  private message(error: unknown): string {
    return error instanceof Error
      ? error.message
      : 'Die eBay-Anfrage konnte nicht bestätigt werden.';
  }
  async initialize(workspaceId: string | null, read: boolean): Promise<void> {
    const revision = this.reset(workspaceId);
    if (!workspaceId) return;
    this.isLoading.set(true);
    try {
      const status = await this.api.loadStatus(workspaceId);
      if (revision !== this.revision) return;
      this.isConfigured.set(status.configured);
      this.connection.set(status.connection);
      this.isLoading.set(false);
      if (read && status.configured && status.connection?.status === 'connected')
        await this.read(false);
    } catch (error) {
      if (revision === this.revision) this.error.set(this.message(error));
    } finally {
      if (revision === this.revision) this.isLoading.set(false);
    }
  }
  async connect(): Promise<string | null> {
    const workspaceId = this.workspaceId;
    if (!workspaceId || this.isLoading() || this.isReading() || !this.isConfigured()) return null;
    const revision = this.revision;
    this.isLoading.set(true);
    this.error.set(null);
    this.clearData();
    try {
      const url = await this.api.connect(workspaceId);
      return revision === this.revision ? url : null;
    } catch (error) {
      if (revision === this.revision) this.error.set(this.message(error));
      return null;
    } finally {
      if (revision === this.revision) this.isLoading.set(false);
    }
  }
  async disconnect(): Promise<void> {
    const connection = this.connection();
    if (!connection || this.isLoading()) return;
    // Laufende Antworten werden bereits vor dem Trennen aus der Ansicht ausgeschlossen.
    const revision = ++this.revision;
    this.isLoading.set(true);
    this.isReading.set(false);
    this.error.set(null);
    this.clearData();
    try {
      await this.api.disconnect(connection);
      if (revision === this.revision)
        this.connection.set({
          ...connection,
          status: 'disconnected',
          username: null,
          lastReadAt: null,
        });
    } catch (error) {
      if (revision === this.revision) this.error.set(this.message(error));
    } finally {
      if (revision === this.revision) this.isLoading.set(false);
    }
  }
  async selectSection(section: 'listings' | 'orders'): Promise<void> {
    if (this.isLoading() || this.isReading() || this.section() === section) return;
    this.section.set(section);
    this.clearData();
    await this.read(false);
  }
  async read(append: boolean): Promise<void> {
    const connection = this.connection();
    if (
      !connection ||
      connection.status !== 'connected' ||
      this.isReading() ||
      this.isLoading() ||
      !this.isConfigured()
    )
      return;
    const revision = this.revision;
    const section = this.section();
    const page = append ? this.nextPage() : 1;
    if (page === null) return;
    this.isReading.set(true);
    this.dataError.set(null);
    if (!append) this.clearData();
    try {
      if (section === 'listings') {
        const result = await this.api.loadListings(connection, page);
        if (revision !== this.revision) return;
        this.listings.update((items) =>
          append
            ? [...items, ...result.items].filter(
                (item, index, all) =>
                  all.findIndex((candidate) => candidate.id === item.id) === index,
              )
            : result.items,
        );
        this.total.set(result.total);
        this.nextPage.set(result.nextPage);
      } else {
        const result = await this.api.loadOrders(connection, page);
        if (revision !== this.revision) return;
        this.orders.update((items) =>
          append
            ? [...items, ...result.items].filter(
                (item, index, all) =>
                  all.findIndex((candidate) => candidate.id === item.id) === index,
              )
            : result.items,
        );
        this.total.set(result.total);
        this.nextPage.set(result.nextPage);
      }
      this.hasRead.set(true);
    } catch (error) {
      if (revision !== this.revision) return;
      const errorMessage = this.message(error);
      this.dataError.set(errorMessage);
      try {
        const status = await this.api.loadStatus(connection.workspaceId);
        if (revision === this.revision) {
          this.connection.set(status.connection);
          if (status.connection?.status !== 'connected') {
            this.clearData();
            this.dataError.set(errorMessage);
          }
        }
      } catch {
        /* Der ursprüngliche Abruffehler bleibt sichtbar. */
      }
    } finally {
      if (revision === this.revision) this.isReading.set(false);
    }
  }
}
