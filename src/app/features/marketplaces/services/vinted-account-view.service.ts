import { Injectable, computed, inject, signal } from '@angular/core';
import { AuthService } from '../../../core/services/auth.service';
import { WorkspaceService } from '../../../core/services/workspace.service';

export const VINTED_ALL_ACCOUNTS_OPTION = 'all-accounts';

@Injectable({ providedIn: 'root' })
export class VintedAccountViewService {
  private readonly auth = inject(AuthService);
  private readonly workspace = inject(WorkspaceService);
  private readonly storageKey = computed(() => {
    const user = this.auth.currentUser();
    const workspace = this.workspace.currentWorkspace();
    return user && workspace && !workspace.archived_at
      ? `flipbase:vinted:all-accounts:${JSON.stringify([user.id, workspace.id])}`
      : null;
  });
  private readonly selection = signal<{ key: string; allAccounts: boolean } | null>(null);

  readonly showAllAccounts = computed(() => {
    const key = this.storageKey();
    if (!key) return false;
    const selection = this.selection();
    if (selection?.key === key) return selection.allAccounts;
    try {
      return localStorage.getItem(key) === 'true';
    } catch {
      return false;
    }
  });

  selectAccountView(allAccounts: boolean): void {
    const key = this.storageKey();
    if (!key) return;
    this.selection.set({ key, allAccounts });
    try {
      localStorage.setItem(key, String(allAccounts));
    } catch {
      // Die Auswahl bleibt während der Sitzung nutzbar, wenn der Browser das Speichern sperrt.
    }
  }
}
