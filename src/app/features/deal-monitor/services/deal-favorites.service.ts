import {
  Injectable,
  DestroyRef,
  DOCUMENT,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { AuthService } from '../../../core/services/auth.service';
import { SupabaseService } from '../../../core/services/supabase.service';
import { WorkspaceService } from '../../../core/services/workspace.service';
import { Json } from '../../../core/models/supabase.types';
import { FeedItem } from '../models/deal-monitor.model';
import { favoriteIdentity, readFavoriteItem } from '../models/account-favorites';

interface FavoriteScope {
  user: string;
  workspace: string;
  key: string;
}
interface Cursor {
  time: string;
  id: string;
}
interface RpcResult {
  data: unknown;
  error: unknown;
}
const STORAGE_PREFIX = 'flipbase_vinted_favorites_';

/** Persönliche Serverdaten. Der alte Browserspeicher wird nur ausdrücklich importiert. */
@Injectable({ providedIn: 'root' })
export class DealFavoritesService {
  private readonly auth = inject(AuthService);
  private readonly workspaceService = inject(WorkspaceService);
  private readonly client = inject(SupabaseService).client;
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);
  private readonly scope = computed<FavoriteScope | null>(() => {
    const user = this.auth.currentUser()?.id;
    const workspace = this.workspaceService.currentWorkspace()?.id;
    return user && workspace ? { user, workspace, key: `${user}:${workspace}` } : null;
  });
  private readonly saved = signal<{ key: string; items: FeedItem[] }>({ key: '', items: [] });
  private readonly loadedKey = signal('');
  private readonly pending = signal<ReadonlySet<string>>(new Set());
  readonly favorites = computed(() =>
    this.saved().key === this.scope()?.key ? this.saved().items : [],
  );
  readonly count = computed(() => this.favorites().length);
  readonly ready = computed(() => !!this.scope() && this.loadedKey() === this.scope()?.key);
  readonly loading = signal(false);
  readonly busy = computed(() => this.pending().size > 0);
  readonly error = signal<string | null>(null);
  readonly legacyCount = signal(0);
  private generation = 0;
  private revision = 0;
  private readingGeneration: number | null = null;

  constructor() {
    effect(() => {
      const scope = this.scope();
      untracked(() => {
        this.generation++;
        this.revision++;
        this.saved.set({ key: scope?.key ?? '', items: [] });
        this.loadedKey.set('');
        this.pending.set(new Set());
        this.loading.set(false);
        this.error.set(null);
        this.readLegacyCount(scope);
        if (scope) void this.refresh();
      });
    });
    const refresh = () => {
      if (!this.document.hidden) void this.refresh();
    };
    const view = this.document.defaultView;
    view?.addEventListener('focus', refresh);
    this.document.addEventListener('visibilitychange', refresh);
    const timer = setInterval(refresh, 30_000);
    this.destroyRef.onDestroy(() => {
      this.generation++;
      clearInterval(timer);
      view?.removeEventListener('focus', refresh);
      this.document.removeEventListener('visibilitychange', refresh);
    });
  }

  isFavorite(item: FeedItem | string): boolean {
    return typeof item === 'string'
      ? this.favorites().some((row) => row.id === item)
      : this.favorites().some((row) => favoriteIdentity(row) === favoriteIdentity(item));
  }

  async refresh(): Promise<void> {
    const scope = this.scope();
    const generation = this.generation;
    const revision = this.revision;
    if (!scope || this.busy() || this.readingGeneration === generation || this.destroyRef.destroyed)
      return;
    this.readingGeneration = generation;
    this.loading.set(true);
    try {
      const items: FeedItem[] = [];
      const cursors = new Set<string>();
      let cursor: Cursor | null = null;
      do {
        const { data, error } = await this.client.rpc('sniper_favorites_page', {
          p_workspace_id: scope.workspace,
          p_expected_user_id: scope.user,
          p_before_time: cursor?.time ?? undefined,
          p_before_id: cursor?.id ?? undefined,
          p_limit: 200,
        });
        if (!this.current(scope, generation) || revision !== this.revision) return;
        if (
          error ||
          !data ||
          typeof data !== 'object' ||
          Array.isArray(data) ||
          !Array.isArray(data['items'])
        )
          throw new Error('Favoriten konnten nicht geladen werden. Bitte erneut versuchen.');
        for (const value of data['items']) {
          const item = readFavoriteItem(value);
          if (!item) throw new Error('Der Server hat einen ungültigen Favoriten geliefert.');
          items.push(item);
        }
        const next: unknown = data['next_cursor'];
        if (next === null) cursor = null;
        else {
          if (
            !next ||
            typeof next !== 'object' ||
            !('time' in next) ||
            !('id' in next) ||
            typeof next.time !== 'string' ||
            typeof next.id !== 'string'
          )
            throw new Error('Ungültige Favoritenseite.');
          cursor = { time: next.time, id: next.id };
          const key = JSON.stringify(cursor);
          if (cursors.has(key))
            throw new Error('Die Favoritenseite wurde wiederholt. Bitte erneut laden.');
          cursors.add(key);
        }
      } while (cursor);
      this.saved.set({ key: scope.key, items });
      this.loadedKey.set(scope.key);
      this.error.set(null);
    } catch (error) {
      if (this.current(scope, generation) && revision === this.revision)
        this.error.set(
          error instanceof Error ? error.message : 'Favoriten konnten nicht geladen werden.',
        );
    } finally {
      if (this.readingGeneration === generation) this.readingGeneration = null;
      if (this.current(scope, generation)) this.loading.set(false);
    }
  }

  toggle(item: FeedItem): Promise<boolean> {
    return this.isFavorite(item) ? this.remove(item) : this.add(item);
  }

  add(item: FeedItem): Promise<boolean> {
    const id = favoriteIdentity(item);
    if (!id) {
      this.error.set('Dieser Artikel hat keinen gültigen Vinted-Link.');
      return Promise.resolve(false);
    }
    if (this.isFavorite(item)) return Promise.resolve(true);
    return this.write(
      id,
      (scope) =>
        this.client.rpc('save_sniper_favorite', {
          p_workspace_id: scope.workspace,
          p_expected_user_id: scope.user,
          p_item: item as unknown as Json,
        }),
      (items) => [item, ...items.filter((row) => favoriteIdentity(row) !== id)],
    );
  }

  remove(item: FeedItem | string): Promise<boolean> {
    const row = typeof item === 'string' ? this.favorites().find((row) => row.id === item) : item;
    const id = row ? favoriteIdentity(row) : null;
    if (!id) return Promise.resolve(false);
    return this.write(
      id,
      (scope) =>
        this.client.rpc('remove_sniper_favorite', {
          p_workspace_id: scope.workspace,
          p_expected_user_id: scope.user,
          p_external_id: id,
        }),
      (items) => items.filter((row) => favoriteIdentity(row) !== id),
    );
  }

  clear(): Promise<boolean> {
    return this.write(
      '*',
      (scope) =>
        this.client.rpc('clear_sniper_favorites', {
          p_workspace_id: scope.workspace,
          p_expected_user_id: scope.user,
        }),
      () => [],
    );
  }

  async importLegacy(): Promise<boolean> {
    const scope = this.scope();
    const generation = this.generation;
    if (!scope || this.busy() || !this.ready()) return false;
    const key = STORAGE_PREFIX + scope.workspace;
    this.pending.set(new Set(['*']));
    this.revision++;
    this.error.set(null);
    try {
      const storage = this.document.defaultView?.localStorage;
      const raw = storage?.getItem(key);
      if (!raw) return true;
      const source: unknown = JSON.parse(raw);
      if (!Array.isArray(source))
        throw new Error(
          'Die lokalen Favoriten haben ein ungültiges Format. Die Quelle bleibt erhalten.',
        );
      const items = source.map(readFavoriteItem);
      if (items.some((item) => !item))
        throw new Error('Ein lokaler Favorit ist unvollständig. Die Quelle bleibt erhalten.');
      for (let start = 0; start < items.length; start += 50) {
        if (!this.current(scope, generation)) return false;
        const { error, data } = await this.client.rpc('import_sniper_favorites', {
          p_workspace_id: scope.workspace,
          p_expected_user_id: scope.user,
          p_items: items.slice(start, start + 50) as unknown as Json,
        });
        if (error || typeof data !== 'number')
          throw new Error(
            'Import fehlgeschlagen. Deine lokalen Favoriten bleiben erhalten; Du kannst es erneut versuchen.',
          );
      }
      if (!this.current(scope, generation)) return false;
      if (storage?.getItem(key) === raw) storage.removeItem(key);
      this.readLegacyCount(scope);
    } catch (error) {
      if (this.current(scope, generation))
        this.error.set(error instanceof Error ? error.message : 'Favoritenimport fehlgeschlagen.');
      return false;
    } finally {
      if (this.current(scope, generation)) {
        this.pending.set(new Set());
        this.revision++;
      }
    }
    await this.refresh();
    return this.current(scope, generation);
  }

  private async write(
    id: string,
    submit: (scope: FavoriteScope) => PromiseLike<RpcResult>,
    update: (items: FeedItem[]) => FeedItem[],
  ): Promise<boolean> {
    const scope = this.scope();
    const generation = this.generation;
    if (
      !scope ||
      !this.ready() ||
      this.pending().has(id) ||
      this.pending().has('*') ||
      (id === '*' && this.busy())
    )
      return false;
    this.pending.update((pending) => new Set([...pending, id]));
    this.revision++;
    this.error.set(null);
    try {
      const result = await submit(scope);
      if (!this.current(scope, generation)) return false;
      if (result.error || result.data !== true)
        throw new Error('Änderung konnte nicht gespeichert werden. Bitte erneut versuchen.');
      this.saved.update((state) => ({ key: scope.key, items: update(state.items) }));
      return true;
    } catch (error) {
      if (this.current(scope, generation))
        this.error.set(
          error instanceof Error ? error.message : 'Favoriten konnten nicht gespeichert werden.',
        );
      return false;
    } finally {
      if (this.current(scope, generation)) {
        this.pending.update((pending) => new Set([...pending].filter((value) => value !== id)));
        this.revision++;
      }
    }
  }

  private current(scope: FavoriteScope, generation: number): boolean {
    return (
      generation === this.generation &&
      this.scope()?.key === scope.key &&
      !this.destroyRef.destroyed
    );
  }
  private readLegacyCount(scope: FavoriteScope | null): void {
    try {
      const raw = scope
        ? this.document.defaultView?.localStorage.getItem(STORAGE_PREFIX + scope.workspace)
        : null;
      const value: unknown = raw ? JSON.parse(raw) : [];
      this.legacyCount.set(Array.isArray(value) ? value.length : 0);
    } catch {
      this.legacyCount.set(0);
    }
  }
}
