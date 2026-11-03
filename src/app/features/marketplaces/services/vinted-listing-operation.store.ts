import { Injectable, computed, inject, signal } from '@angular/core';
import { AuthService } from '../../../core/services/auth.service';
import { WorkspaceService } from '../../../core/services/workspace.service';
import type { MarketplaceEntry } from '../models/marketplace-read.models';
import type { VintedListingJob } from '../models/vinted-listing-job';
import type { VintedListingDraft } from '../models/vinted-listing-draft';
import type { VintedRelistingPlanRecord } from '../models/vinted-relisting-plan';

export interface VintedListingOperation {
  readonly key: string;
  readonly kind: 'price' | 'delete' | 'relist';
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
  private readonly accepted = signal<
    readonly { userId: string; record: VintedRelistingPlanRecord; imageUrl: string | null }[]
  >([]);
  readonly acceptedRelistings = computed(() => {
    const user = this.auth.currentUser();
    const workspace = this.workspace.currentWorkspace();
    return user && workspace && !workspace.archived_at
      ? this.accepted().filter(
          (pending) =>
            pending.userId === user.id && pending.record.job.workspaceId === workspace.id,
        )
      : [];
  });
  acceptRelisting(
    entry: MarketplaceEntry,
    job: VintedListingJob,
    draft: VintedListingDraft,
    userId: string,
  ): void {
    if (
      job.workspaceId !== entry.workspaceId ||
      job.connectionId !== entry.connectionId ||
      job.relistExternalId !== entry.externalId ||
      draft.workspaceId !== job.workspaceId ||
      draft.connectionId !== job.connectionId ||
      draft.id !== job.draftId ||
      draft.revision !== job.draftRevision ||
      (job.relistEntryId != null && job.relistEntryId !== entry.id)
    )
      throw new Error('Der angenommene Relist-Auftrag gehört nicht zum gewählten Artikel.');
    this.accepted.update((pending) => [
      ...pending.filter((item) => item.record.job.id !== job.id),
      { userId, record: { job, draft }, imageUrl: entry.imageUrl },
    ]);
  }
  releaseRelisting(job: VintedListingJob, userId = this.auth.currentUser()?.id): void {
    this.accepted.update((pending) =>
      pending.filter(
        (item) =>
          item.userId !== userId ||
          item.record.job.workspaceId !== job.workspaceId ||
          item.record.job.connectionId !== job.connectionId ||
          item.record.job.id !== job.id,
      ),
    );
  }
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

  async prepareRelisting(entry: MarketplaceEntry, prepare: () => Promise<void>): Promise<void> {
    return this.run(entry, 'relist', prepare, true);
  }

  label(kind: VintedListingOperation['kind']): string {
    return kind === 'relist' ? 'Relisting' : kind === 'delete' ? 'Löschung' : 'Preisänderung';
  }

  runningLabel(entry: MarketplaceEntry): string {
    const action = this.entries().find(
      (action) =>
        action.entryId === entry.id &&
        action.connectionId === entry.connectionId &&
        action.state === 'running',
    );
    return action?.kind === 'relist'
      ? 'Relisting wird vorbereitet'
      : action?.kind === 'delete'
        ? 'Inserat wird gelöscht'
        : 'Preis wird geändert';
  }

  private async run(
    entry: MarketplaceEntry,
    kind: VintedListingOperation['kind'],
    action: () => Promise<void>,
    removeWhenPrepared = false,
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
        message:
          kind === 'relist'
            ? 'Relisting wird vorbereitet …'
            : kind === 'delete'
              ? 'Inserat wird gelöscht …'
              : 'Preis wird geändert …',
      },
    ]);
    try {
      await action();
      if (removeWhenPrepared) {
        this.actions.update((actions) => actions.filter((action) => action.key !== key));
        return;
      }
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
