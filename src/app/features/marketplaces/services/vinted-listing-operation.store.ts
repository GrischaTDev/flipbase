import { Injectable, computed, inject, signal } from '@angular/core';
import { AuthService } from '../../../core/services/auth.service';
import { WorkspaceService } from '../../../core/services/workspace.service';
import type { MarketplaceEntry } from '../models/marketplace-read.models';

export interface VintedListingOperation {
  readonly key: string;
  readonly kind: 'price' | 'delete';
  readonly userId: string;
  readonly workspaceId: string;
  readonly connectionId: string;
  readonly entryId: string;
  readonly title: string;
  readonly state: 'running' | 'success' | 'error';
  readonly message: string;
}

/** Behält den Fortschritt einer Artikelaktion auch nach dem Schließen der Artikelansicht. */
@Injectable({ providedIn: 'root' })
export class VintedListingOperationStore {
  private readonly auth = inject(AuthService);
  private readonly workspace = inject(WorkspaceService);
  private readonly actions = signal<readonly VintedListingOperation[]>([]);
  readonly entries = computed(() => {
    const user = this.auth.currentUser();
    const workspace = this.workspace.currentWorkspace();
    return user && workspace && !workspace.archived_at
      ? this.actions().filter(
          (action) => action.userId === user.id && action.workspaceId === workspace.id,
        )
      : [];
  });
  readonly runningCount = computed(
    () => this.entries().filter((action) => action.state === 'running').length,
  );

  isRunning(entry: Pick<MarketplaceEntry, 'workspaceId' | 'connectionId' | 'id'>): boolean {
    return this.entries().some(
      (action) =>
        action.state === 'running' &&
        action.workspaceId === entry.workspaceId &&
        action.connectionId === entry.connectionId &&
        action.entryId === entry.id,
    );
  }

  async changePrice(entry: MarketplaceEntry, save: () => Promise<void>): Promise<void> {
    return this.run(entry, 'price', save);
  }

  async deleteListing(entry: MarketplaceEntry, remove: () => Promise<void>): Promise<void> {
    return this.run(entry, 'delete', remove);
  }

  runningLabel(entry: MarketplaceEntry): string {
    return this.entries().some(
      (action) =>
        action.entryId === entry.id &&
        action.connectionId === entry.connectionId &&
        action.state === 'running' &&
        action.kind === 'delete',
    )
      ? 'Inserat wird gelöscht'
      : 'Preis wird geändert';
  }

  private async run(
    entry: MarketplaceEntry,
    kind: 'price' | 'delete',
    action: () => Promise<void>,
  ): Promise<void> {
    const userId = this.auth.currentUser()?.id;
    if (
      !userId ||
      entry.workspaceId !== this.workspace.currentWorkspace()?.id ||
      this.isRunning(entry)
    )
      throw new Error('Die Aktion ist für diesen Artikel nicht verfügbar.');
    const key = crypto.randomUUID();
    this.actions.update((actions) => [
      ...actions,
      {
        key,
        kind,
        userId,
        workspaceId: entry.workspaceId,
        connectionId: entry.connectionId,
        entryId: entry.id,
        title: entry.title,
        state: 'running',
        message: kind === 'delete' ? 'Inserat wird gelöscht …' : 'Preis wird geändert …',
      },
    ]);
    try {
      await action();
      this.finish(
        key,
        'success',
        kind === 'delete' ? 'Das Inserat wurde gelöscht.' : 'Der neue Preis wurde bestätigt.',
      );
    } catch (error) {
      this.finish(
        key,
        'error',
        error instanceof Error ? error.message : 'Die Aktion konnte nicht bestätigt werden.',
      );
      throw error;
    }
  }

  private finish(key: string, state: 'success' | 'error', message: string): void {
    this.actions.update((actions) =>
      actions.map((action) => (action.key === key ? { ...action, state, message } : action)),
    );
  }

  dismiss(key: string): void {
    this.actions.update((actions) =>
      actions.filter((action) => action.key !== key || action.state === 'running'),
    );
  }
}
