import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { LucideStore, LucidePlus } from '@lucide/angular';
import { AuthService } from '../../../../core/services/auth.service';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import { PageHeaderComponent } from '../../../../shared/components/page-header/page-header.component';
import { ModalShellComponent } from '../../../../shared/components/modal-shell/modal-shell.component';
import type { MarketplaceOverviewAccount } from '../../models/marketplace-overview.models';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { CardComponent } from '../../../../shared/components/card/card.component';
import { KleinanzeigenAccountsComponent } from '../kleinanzeigen-accounts/kleinanzeigen-accounts.component';
import { MarketplaceListingSectionComponent } from '../marketplace-listing-section/marketplace-listing-section.component';
import { MarketplaceOverviewStore } from '../../services/marketplace-overview.store';
import { overviewAccountKey } from '../../models/marketplace-overview-normalization';
@Component({
  selector: 'app-kleinanzeigen-workspace',
  imports: [
    NgTemplateOutlet,
    PageHeaderComponent,
    ModalShellComponent,
    ButtonComponent,
    CardComponent,
    KleinanzeigenAccountsComponent,
    MarketplaceListingSectionComponent,
  ],
  providers: [MarketplaceOverviewStore],
  templateUrl: './kleinanzeigen-workspace.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0' },
})
export class KleinanzeigenWorkspaceComponent {
  readonly kleinanzeigenAccount = viewChild(KleinanzeigenAccountsComponent);
  readonly workspace = inject(WorkspaceService);
  private readonly auth = inject(AuthService);
  readonly store = inject(MarketplaceOverviewStore);
  readonly storeIcon = LucideStore;
  readonly addIcon = LucidePlus;
  readonly adding = signal(false);
  readonly managing = signal<MarketplaceOverviewAccount | null>(null);
  readonly accountKey = overviewAccountKey;
  constructor() {
    effect(() => {
      const userId = this.auth.currentUser()?.id;
      const workspace = this.workspace.currentWorkspace();
      this.adding.set(false);
      this.managing.set(null);
      if (userId && workspace && !workspace.archived_at)
        untracked(() => void this.reloadListings());
    });
  }
  async reloadListings(): Promise<void> {
    const workspace = this.workspace.currentWorkspace();
    const userId = this.auth.currentUser()?.id;
    if (!workspace || workspace.archived_at || !userId) return;
    await this.store.load(workspace.id, ['kleinanzeigen']);
    if (
      this.workspace.currentWorkspace()?.id !== workspace.id ||
      this.auth.currentUser()?.id !== userId
    )
      return;
    const managed = this.managing();
    if (
      managed &&
      !this.store
        .platforms()
        .some((group) =>
          group.accounts.some((account) => account.connectionId === managed.connectionId),
        )
    )
      this.managing.set(null);
    await Promise.all(
      this.store
        .platforms()
        .flatMap((group) => group.accounts)
        .filter((account) => !this.store.section(account)?.expanded)
        .map((account) => this.store.expand(account)),
    );
  }
}
