import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { WorkspaceService } from '../../../core/services/workspace.service';
import { AuthService } from '../../../core/services/auth.service';
import { FeedItem } from '../models/deal-monitor.model';

const STORAGE_PREFIX = 'flipbase_vinted_favorites_';
const DEMO_STORAGE_KEY = 'flipbase_demo_vinted_favorites';

@Injectable({ providedIn: 'root' })
export class DealFavoritesService {
  private readonly workspaceService = inject(WorkspaceService);
  private readonly auth = inject(AuthService);

  readonly favorites = signal<FeedItem[]>([]);
  readonly count = computed(() => this.favorites().length);
  private readonly favoriteIds = computed(() => new Set(this.favorites().map((item) => item.id)));

  constructor() {
    effect(() => {
      const isDemo = this.auth.isDemoMode();
      const workspaceId = this.workspaceService.currentWorkspace()?.id;
      untracked(() => {
        this.loadFromStorage(isDemo, workspaceId);
      });
    });
  }

  isFavorite(id: string): boolean {
    return this.favoriteIds().has(id);
  }

  toggle(item: FeedItem): void {
    if (this.isFavorite(item.id)) {
      this.remove(item.id);
    } else {
      this.add(item);
    }
  }

  add(item: FeedItem): void {
    if (this.isFavorite(item.id)) return;
    this.favorites.update((prev) => [item, ...prev].slice(0, 500));
    this.saveToStorage();
  }

  remove(id: string): void {
    this.favorites.update((prev) => prev.filter((item) => item.id !== id));
    this.saveToStorage();
  }

  clear(): void {
    this.favorites.set([]);
    this.saveToStorage();
  }

  private getStorageKey(isDemo: boolean, workspaceId?: string | null): string | null {
    if (isDemo) return DEMO_STORAGE_KEY;
    if (!workspaceId) return null;
    return `${STORAGE_PREFIX}${workspaceId}`;
  }

  private loadFromStorage(isDemo: boolean, workspaceId?: string | null): void {
    const key = this.getStorageKey(isDemo, workspaceId);
    if (!key) {
      this.favorites.set([]);
      return;
    }

    try {
      const raw = localStorage.getItem(key);
      if (!raw) {
        this.favorites.set([]);
        return;
      }
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        this.favorites.set(parsed);
      } else {
        this.favorites.set([]);
      }
    } catch {
      this.favorites.set([]);
    }
  }

  private saveToStorage(): void {
    const isDemo = this.auth.isDemoMode();
    const workspaceId = this.workspaceService.currentWorkspace()?.id;
    const key = this.getStorageKey(isDemo, workspaceId);
    if (!key) return;

    try {
      localStorage.setItem(key, JSON.stringify(this.favorites()));
    } catch {
      // Storage full or unavailable
    }
  }
}
