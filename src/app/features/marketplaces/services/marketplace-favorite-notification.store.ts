import { DestroyRef, Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { AuthService } from '../../../core/services/auth.service';
import { WorkspaceService } from '../../../core/services/workspace.service';
import { PlatformOperatorService } from '../../../core/services/platform-operator.service';
import {
  favoriteNotificationToInbox,
  type FavoriteNotificationFeed,
} from '../models/marketplace-favorite-notifications';
import {
  MarketplaceFavoriteNotificationApiService,
  FavoriteNotificationApiError,
} from './marketplace-favorite-notification-api.service';
@Injectable({ providedIn: 'root' })
export class MarketplaceFavoriteNotificationStore {
  private readonly api = inject(MarketplaceFavoriteNotificationApiService);
  private readonly auth = inject(AuthService);
  private readonly workspace = inject(WorkspaceService);
  private readonly operator = inject(PlatformOperatorService);
  private readonly context = computed(() => {
    const userId = this.auth.currentUser()?.id;
    const workspace = this.workspace.currentWorkspace();
    return userId && workspace && !workspace.archived_at && this.operator.operator()
      ? JSON.stringify([userId, workspace.id])
      : null;
  });
  private readonly loadedContext = signal<string | null>(null);
  private readonly feed = signal<FavoriteNotificationFeed | null>(null);
  private readonly loadError = signal<string | null>(null);
  private disconnect: (() => void) | null = null;
  private revision = 0;
  private destroyed = false;
  readonly notifications = computed(() =>
    this.context() && this.context() === this.loadedContext()
      ? (this.feed()?.items ?? []).map(favoriteNotificationToInbox)
      : [],
  );
  readonly unreadCount = computed(() =>
    this.context() && this.context() === this.loadedContext() ? (this.feed()?.unreadCount ?? 0) : 0,
  );
  readonly error = computed(() =>
    this.context() === this.loadedContext() ? this.loadError() : null,
  );
  constructor() {
    effect(() => {
      const key = this.context();
      untracked(() => {
        this.revision++;
        this.disconnect?.();
        this.disconnect = null;
        this.feed.set(null);
        this.loadError.set(null);
        this.loadedContext.set(key);
        if (key) {
          this.connect();
          void this.reload();
        }
      });
    });
    effect(() => {
      const token = this.auth.session()?.access_token;
      if (this.context() && token) this.api.authenticate(token);
    });
    const timer = setInterval(() => {
      if (this.context()) void this.reload();
    }, 30_000);
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.revision++;
      clearInterval(timer);
      this.disconnect?.();
      this.disconnect = null;
      this.feed.set(null);
    });
  }
  private connect(): void {
    const workspaceId = this.workspace.currentWorkspace()?.id;
    if (this.disconnect || !workspaceId || !this.context() || this.destroyed) return;
    try {
      this.disconnect = this.api.listen(
        workspaceId,
        () => {
          void this.reload();
        },
        () => {
          void this.reload();
        },
      );
    } catch {
      this.disconnect = null;
    }
  }
  async reload(): Promise<void> {
    const key = this.context();
    const workspaceId = this.workspace.currentWorkspace()?.id;
    if (!key || !workspaceId || this.destroyed) return;
    const revision = ++this.revision;
    try {
      const feed = await this.api.read(workspaceId);
      if (this.destroyed || key !== this.context() || revision !== this.revision) return;
      if (feed.workspaceId !== workspaceId)
        throw new FavoriteNotificationApiError('request_failed');
      this.feed.set(feed);
      this.loadedContext.set(key);
      this.loadError.set(null);
      this.connect();
    } catch (error) {
      if (this.destroyed || key !== this.context() || revision !== this.revision) return;
      if (error instanceof FavoriteNotificationApiError && error.code === 'forbidden') {
        this.revision++;
        this.feed.set(null);
        this.disconnect?.();
        this.disconnect = null;
        this.loadError.set(null);
      } else
        this.loadError.set(
          error instanceof Error
            ? error.message
            : 'Favoritenmeldungen konnten nicht geladen werden.',
        );
    }
  }
  async markAsRead(id: string): Promise<void> {
    await this.mark(id.startsWith('marketplace:') ? id.slice(12) : id, false);
  }
  async markAllAsRead(): Promise<void> {
    if (this.unreadCount()) await this.mark(null, false);
  }
  async clearNotifications(): Promise<void> {
    if (this.feed()?.items.length) await this.mark(null, true);
  }
  private async mark(id: string | null, clear: boolean): Promise<void> {
    const key = this.context();
    const workspaceId = this.workspace.currentWorkspace()?.id;
    if (!key || !workspaceId) throw new FavoriteNotificationApiError('forbidden');
    try {
      await this.api.mark(workspaceId, id, clear);
    } catch (error) {
      if (
        key === this.context() &&
        error instanceof FavoriteNotificationApiError &&
        error.code === 'forbidden'
      ) {
        this.revision++;
        this.feed.set(null);
        this.disconnect?.();
        this.disconnect = null;
      }
      throw error;
    }
    if (key === this.context()) await this.reload();
  }
}
