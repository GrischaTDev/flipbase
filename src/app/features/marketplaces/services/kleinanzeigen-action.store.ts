import { Injectable, computed, inject, signal } from '@angular/core';
import { AuthService } from '../../../core/services/auth.service';
import { WorkspaceService } from '../../../core/services/workspace.service';
import type { MarketplaceListingReference } from '../models/marketplace-overview.models';

export interface KleinanzeigenAction {
  readonly key: string;
  readonly userId: string;
  readonly reference: MarketplaceListingReference;
  readonly title: string;
  readonly accountName: string;
  readonly state: 'running' | 'success' | 'paused' | 'error';
  readonly message: string;
}

/** Lokale Fortschritte bleiben auch nach dem Wechsel auf eine andere Seite sichtbar. */
@Injectable({ providedIn: 'root' })
export class KleinanzeigenActionStore {
  private readonly auth = inject(AuthService);
  private readonly workspace = inject(WorkspaceService);
  private readonly actions = signal<readonly KleinanzeigenAction[]>([]);
  readonly entries = computed(() => {
    const userId = this.auth.currentUser()?.id;
    const workspace = this.workspace.currentWorkspace();
    return !userId || !workspace || workspace.archived_at
      ? []
      : this.actions().filter(
          (action) => action.userId === userId && action.reference.workspaceId === workspace.id,
        );
  });
  readonly runningCount = computed(
    () => this.entries().filter((action) => action.state === 'running').length,
  );

  isRunning(reference: MarketplaceListingReference): boolean {
    return (
      reference.platform === 'kleinanzeigen' &&
      this.entries().some(
        (action) =>
          action.state === 'running' &&
          action.reference.connectionId === reference.connectionId &&
          action.reference.externalId === reference.externalId,
      )
    );
  }

  begin(reference: MarketplaceListingReference, title: string, accountName: string): string {
    const userId = this.auth.currentUser()?.id;
    if (!userId || reference.workspaceId !== this.workspace.currentWorkspace()?.id)
      throw new Error('Der Arbeitsbereich wurde gewechselt.');
    if (this.isRunning(reference)) throw new Error('Diese Anzeige wird bereits inseriert.');
    const key = crypto.randomUUID();
    this.actions.update((actions) => [
      ...actions.filter(
        (action) =>
          action.userId !== userId ||
          action.reference.workspaceId !== reference.workspaceId ||
          action.reference.connectionId !== reference.connectionId ||
          action.reference.externalId !== reference.externalId,
      ),
      {
        key,
        userId,
        reference,
        title,
        accountName,
        state: 'running',
        message: 'Anzeige wird vorbereitet und inseriert …',
      },
    ]);
    return key;
  }

  finish(key: string, state: KleinanzeigenAction['state'], message: string): void {
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
