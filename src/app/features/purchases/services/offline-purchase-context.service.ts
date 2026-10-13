import { Injectable, effect, inject, signal, untracked } from '@angular/core';
import { AuthService } from '../../../core/services/auth.service';
import { WorkspaceService } from '../../../core/services/workspace.service';
import { WorkspaceAccessService } from '../../../core/services/workspace-access.service';
import { OfflinePurchaseDraftStore } from './offline-purchase-draft.store';

@Injectable({ providedIn: 'root' })
export class OfflinePurchaseContextService {
  private readonly auth = inject(AuthService);
  private readonly workspace = inject(WorkspaceService);
  private readonly access = inject(WorkspaceAccessService);
  private readonly store = inject(OfflinePurchaseDraftStore);
  readonly error = signal<string | null>(null);
  constructor() {
    effect(() => {
      const userId = this.auth.currentUser()?.id;
      const workspace = this.workspace.currentWorkspace();
      const accessRows = this.access.access();
      const accessError = this.access.error();
      const isLoading = this.auth.isLoading();
      const verifiedUserId = this.access.verifiedUserId();
      if (isLoading || !userId || !workspace || accessError || verifiedUserId !== userId) return;
      untracked(() => {
        if (
          !accessRows.some(
            (row) => row.workspace_id === workspace.id && row.access_status === 'active',
          )
        ) {
          void this.store
            .lock()
            .catch((reason: unknown) =>
              this.error.set(
                reason instanceof Error
                  ? reason.message
                  : 'Der lokale Kontext konnte nicht gesperrt werden.',
              ),
            );
          return;
        }
        if (!workspace.setup_completed_at) return;
        void this.store.registerContext(userId, workspace.id, workspace.name).then(
          () => this.error.set(null),
          (reason: unknown) =>
            this.error.set(
              reason instanceof Error
                ? reason.message
                : 'Der Offlinebereich konnte nicht vorbereitet werden.',
            ),
        );
      });
    });
  }
}
