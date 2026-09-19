import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { WorkspaceService } from '../../../core/services/workspace.service';
import { FeedItem } from '../models/deal-monitor.model';

const STORAGE_PREFIX = 'flipbase_vinted_favorites_';

@Injectable({ providedIn: 'root' })
export class DealFavoritesService {
  private readonly workspaceService = inject(WorkspaceService);

  readonly favorites = signal<FeedItem[]>([]);
  readonly count = computed(() => this.favorites().length);
  private readonly favoriteIds = computed(() => new Set(this.favorites().map((item) => item.id)));

  constructor() {
    effect(() => {
      const workspaceId = this.workspaceService.currentWorkspace()?.id;
      untracked(() => {
        this.loadFromStorage(workspaceId);
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

  private getStorageKey(workspaceId?: string | null): string | null {
    if (!workspaceId) return null;
    return `${STORAGE_PREFIX}${workspaceId}`;
  }

  private loadFromStorage(workspaceId?: string | null): void {
    const key = this.getStorageKey(workspaceId);
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
    const workspaceId = this.workspaceService.currentWorkspace()?.id;
    const key = this.getStorageKey(workspaceId);
    if (!key) return;

    try {
      localStorage.setItem(key, JSON.stringify(this.favorites()));
    } catch {
      // Storage full or unavailable
    }
  }
}
