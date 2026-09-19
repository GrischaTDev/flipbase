import { Injectable, computed, inject, signal } from '@angular/core';
import { AuthService } from '../../../core/services/auth.service';
import { WorkspaceService } from '../../../core/services/workspace.service';

function createViewState() {
  return {
    searchQuery: signal(''),
    selectedCondition: signal('all'),
    selectedStatus: signal('all'),
    activePreset: signal('all'),
    filtersExpanded: signal(false),
    archiveView: signal<'active' | 'archive' | 'all'>('active'),
    stockView: signal<'stock' | 'sold' | 'all'>('stock'),
  };
}

/** Behält die Arbeitsansicht bei Detailbesuchen; Konten und Workspaces bleiben getrennt. */
@Injectable({ providedIn: 'root' })
export class InventoryViewStateService {
  private readonly auth = inject(AuthService);
  private readonly workspace = inject(WorkspaceService);
  private readonly views = new Map<string, ReturnType<typeof createViewState>>();

  readonly current = computed(() => {
    const account = this.auth.currentUser()?.id ?? 'anonymous';
    const key = JSON.stringify([account, this.workspace.currentWorkspace()?.id ?? null]);
    let view = this.views.get(key);
    if (!view) {
      view = createViewState();
      this.views.set(key, view);
    }
    return view;
  });
}
