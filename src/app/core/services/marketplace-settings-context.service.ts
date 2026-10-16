import { Injectable, effect, inject, untracked } from '@angular/core';
import { AuthService } from './auth.service';
import { WorkspaceService } from './workspace.service';
import { MarketplaceSettingsService } from './marketplace-settings.service';

/** Bindet die persönliche Auswahl an die Anmeldung, unabhängig von geöffneten Seiten. */
@Injectable({ providedIn: 'root' })
export class MarketplaceSettingsContextService {
  private readonly auth = inject(AuthService);
  private readonly workspace = inject(WorkspaceService);
  private readonly settings = inject(MarketplaceSettingsService);
  constructor() {
    effect(() => {
      const userId = this.auth.currentUser()?.id;
      const workspace = this.workspace.currentWorkspace();
      untracked(() => {
        if (!userId || !workspace || workspace.archived_at) this.settings.reset();
        else void this.settings.load(userId, workspace.id);
      });
    });
  }
}
