import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import {
  parseVintedAccountAction,
  type VintedAccountAction,
} from '../models/vinted-account-action';
import { claimVintedAccountActionNotification } from './vinted-account-action-transport';
import { AuthService } from '../../../core/services/auth.service';
import { WorkspaceService } from '../../../core/services/workspace.service';
import { ToastService } from '../../../shared/components/toast/toast.service';
import type { MarketplaceEntry } from '../models/marketplace-read.models';
import type { VintedListingJob } from '../models/vinted-listing-job';
import type { VintedListingDraft } from '../models/vinted-listing-draft';
import type { VintedRelistingPlanRecord } from '../models/vinted-relisting-plan';

export interface VintedListingOperation {
  readonly key: string;
  readonly kind: 'price' | 'delete' | 'relist' | 'edit';
  readonly userId: string;
  readonly workspaceId: string;
  readonly connectionId: string;
  readonly entryId: string;
  readonly title: string;
  readonly state: 'running' | 'success' | 'error';
  readonly message: string;
  readonly serverActionId?: string;
  readonly updatedAt: string;
}

/** Behält den Fortschritt einer Artikelaktion auch nach dem Schließen der Artikelansicht. */
@Injectable({ providedIn: 'root' })
export class VintedListingOperationStore {
  private readonly auth = inject(AuthService);
  private readonly workspace = inject(WorkspaceService);
  private readonly toast = inject(ToastService);
  private readonly actions = signal<readonly VintedListingOperation[]>([]);
  private readonly accountActions = signal<{
    userId: string;
    actions: readonly VintedAccountAction[];
  } | null>(null);

  updateAccountActions(userId: string, actions: readonly VintedAccountAction[]): void {
    this.accountActions.set({ userId, actions });
  }
  private pendingAccountAction(
    entry: Pick<MarketplaceEntry, 'workspaceId' | 'connectionId' | 'id'>,
  ): VintedAccountAction | undefined {
    const stored = this.accountActions();
    if (
      stored?.userId !== this.auth.currentUser()?.id ||
      this.workspace.currentWorkspace()?.id !== entry.workspaceId ||
      this.workspace.currentWorkspace()?.archived_at
    )
      return undefined;
    return stored?.actions.find(
      (action) =>
        action.workspaceId === entry.workspaceId &&
        action.connectionId === entry.connectionId &&
        action.entryId === entry.id &&
        ['queued', 'running'].includes(action.state) &&
        [
          'price_save',
          'listing_delete',
          'listing_edit_intent',
          'listing_edit_save',
          'listing_content_save',
        ].includes(action.kind),
    );
  }
  constructor() {
    const accepted = (event: Event) => {
      if (!(event instanceof CustomEvent)) return;
      const action: unknown = event.detail;
      if (
        !action ||
        typeof action !== 'object' ||
        !('workspaceId' in action) ||
        typeof action.workspaceId !== 'string' ||
        !('connectionId' in action) ||
        typeof action.connectionId !== 'string'
      )
        return;
      let server;
      try {
        server = parseVintedAccountAction(action, {
          workspaceId: action.workspaceId,
          connectionId: action.connectionId,
        });
      } catch {
        return;
      }
      const kind =
        server.kind === 'price_save'
          ? 'price'
          : server.kind === 'listing_delete'
            ? 'delete'
            : ['listing_edit_intent', 'listing_edit_save', 'listing_content_save'].includes(
                  server.kind,
                )
              ? 'edit'
              : null;
      if (!kind) return;
      this.actions.update((actions) =>
        actions.map((pending) =>
          pending.state === 'running' &&
          pending.workspaceId === server.workspaceId &&
          pending.connectionId === server.connectionId &&
          pending.entryId === server.entryId &&
          pending.kind === kind
            ? { ...pending, serverActionId: server.id }
            : pending,
        ),
      );
    };
    window.addEventListener('flipbase-account-action-accepted', accepted);
    inject(DestroyRef).onDestroy(() =>
      window.removeEventListener('flipbase-account-action-accepted', accepted),
    );
  }
  private readonly accepted = signal<
    readonly { userId: string; record: VintedRelistingPlanRecord; imageUrl: string | null }[]
  >([]);
  private readonly relistingViews = new Set<{
    readonly scope: Pick<VintedListingOperation, 'userId' | 'workspaceId' | 'connectionId'>;
    readonly update: (job: VintedListingJob) => Promise<boolean>;
    readonly releaseCancelled?: (job: VintedListingJob) => void;
  }>();

  registerRelistingView(
    scope: Pick<VintedListingOperation, 'userId' | 'workspaceId' | 'connectionId'>,
    update: (job: VintedListingJob) => Promise<boolean>,
    releaseCancelled?: (job: VintedListingJob) => void,
  ): () => void {
    const view = { scope, update, releaseCancelled };
    this.relistingViews.add(view);
    return () => {
      this.relistingViews.delete(view);
    };
  }

  /** Der Erfolgstoast folgt erst, wenn offene Ansichten den bestätigten Artikel übernommen haben. */
  async synchronizeRelisting(job: VintedListingJob): Promise<boolean> {
    if (!job.relistExternalId) return true;
    const userId = this.auth.currentUser()?.id;
    const workspace = this.workspace.currentWorkspace();
    if (
      !userId ||
      !workspace ||
      workspace.archived_at ||
      workspace.id !== job.workspaceId ||
      job.state !== 'confirmed' ||
      !job.externalId ||
      job.externalId === job.relistExternalId
    )
      return false;
    const views = [...this.relistingViews].filter(
      ({ scope }) =>
        scope.userId === userId &&
        scope.workspaceId === job.workspaceId &&
        scope.connectionId === job.connectionId,
    );
    const ready = await Promise.all(views.map((view) => view.update(job)));
    return ready.every(Boolean);
  }

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
    if (
      job.state !== 'cancelled' ||
      job.executionMode !== 'cloud' ||
      job.action !== 'publish' ||
      !job.relistExternalId ||
      job.relistDeletedAt != null ||
      job.externalId !== null
    )
      return;
    for (const view of this.relistingViews) {
      if (
        view.scope.userId === userId &&
        view.scope.workspaceId === job.workspaceId &&
        view.scope.connectionId === job.connectionId
      )
        view.releaseCancelled?.(job);
    }
  }
  private readonly scopedActions = computed(() => {
    const user = this.auth.currentUser();
    const workspace = this.workspace.currentWorkspace();
    return user && workspace && !workspace.archived_at
      ? this.actions().filter(
          (action) => action.userId === user.id && action.workspaceId === workspace.id,
        )
      : [];
  });
  readonly entries = computed(() =>
    this.scopedActions().filter((action) => !action.serverActionId),
  );
  readonly runningCount = computed(
    () => this.entries().filter((action) => action.state === 'running').length,
  );

  isRunning(entry: Pick<MarketplaceEntry, 'workspaceId' | 'connectionId' | 'id'>): boolean {
    return (
      !!this.pendingAccountAction(entry) ||
      this.scopedActions().some(
        (action) =>
          action.state === 'running' &&
          action.workspaceId === entry.workspaceId &&
          action.connectionId === entry.connectionId &&
          action.entryId === entry.id,
      )
    );
  }

  async changePrice(entry: MarketplaceEntry, save: () => Promise<void>): Promise<void> {
    return this.run(entry, 'price', save);
  }

  async deleteListing(entry: MarketplaceEntry, remove: () => Promise<void>): Promise<void> {
    return this.run(entry, 'delete', remove);
  }

  /** Speichert eine Bearbeitung im Hintergrund; die Artikelansicht ist dann schon geschlossen. */
  async updateListing(entry: MarketplaceEntry, save: () => Promise<void>): Promise<void> {
    return this.run(entry, 'edit', save);
  }

  async prepareRelisting(entry: MarketplaceEntry, prepare: () => Promise<void>): Promise<void> {
    return this.run(entry, 'relist', prepare, true);
  }

  label(kind: VintedListingOperation['kind']): string {
    return kind === 'relist'
      ? 'Relisting'
      : kind === 'delete'
        ? 'Löschung'
        : kind === 'edit'
          ? 'Aktualisierung'
          : 'Preisänderung';
  }

  runningLabel(entry: MarketplaceEntry): string {
    const server = this.pendingAccountAction(entry);
    if (server) {
      if (server.kind === 'price_save')
        return server.state === 'queued' ? 'Preisänderung wartet' : 'Preis wird geändert';
      if (server.kind === 'listing_delete')
        return server.state === 'queued' ? 'Löschen wartet' : 'Inserat wird gelöscht';
      return server.state === 'queued' ? 'Aktualisierung wartet' : 'Inserat wird aktualisiert';
    }
    const action = this.scopedActions().find(
      (action) =>
        action.entryId === entry.id &&
        action.connectionId === entry.connectionId &&
        action.state === 'running',
    );
    return action?.kind === 'relist'
      ? 'Relisting wird vorbereitet'
      : action?.kind === 'delete'
        ? 'Inserat wird gelöscht'
        : action?.kind === 'edit'
          ? 'Inserat wird aktualisiert'
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
      {
        key,
        kind,
        userId,
        workspaceId: entry.workspaceId,
        connectionId: entry.connectionId,
        entryId: entry.id,
        title: entry.title,
        updatedAt: new Date().toISOString(),
        state: 'running',
        message:
          kind === 'relist'
            ? 'Relisting wird vorbereitet …'
            : kind === 'delete'
              ? 'Inserat wird gelöscht …'
              : kind === 'edit'
                ? 'Inserat wird aktualisiert …'
                : 'Preis wird geändert …',
      },
      ...actions,
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
        kind === 'delete'
          ? 'Inserat erfolgreich gelöscht'
          : kind === 'edit'
            ? 'Inserat erfolgreich aktualisiert'
            : 'Preis erfolgreich geändert',
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
    if (state === 'success') {
      const completed = this.actions().find((action) => action.key === key);
      const workspace = this.workspace.currentWorkspace();
      if (
        completed &&
        completed.userId === this.auth.currentUser()?.id &&
        workspace &&
        !workspace.archived_at &&
        completed.workspaceId === workspace.id &&
        (!completed.serverActionId ||
          claimVintedAccountActionNotification(completed.serverActionId))
      )
        this.toast.success(message, completed.title);
      this.actions.update((actions) => actions.filter((action) => action.key !== key));
      return;
    }
    this.actions.update((actions) =>
      actions.map((action) =>
        action.key === key
          ? { ...action, state, message, updatedAt: new Date().toISOString() }
          : action,
      ),
    );
  }

  dismiss(key: string): void {
    this.actions.update((actions) =>
      actions.filter((action) => action.key !== key || action.state === 'running'),
    );
  }
}
