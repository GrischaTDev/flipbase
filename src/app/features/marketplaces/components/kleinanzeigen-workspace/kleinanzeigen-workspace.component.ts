import { DatePipe, NgTemplateOutlet } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
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
import { KleinanzeigenActionStore } from '../../services/kleinanzeigen-action.store';
import { overviewAccountKey } from '../../models/marketplace-overview-normalization';
@Component({
  selector: 'app-kleinanzeigen-workspace',
  imports: [
    NgTemplateOutlet,
    DatePipe,
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
  readonly page =
    (inject(ActivatedRoute).snapshot.data['page'] as string | undefined) ?? 'listings';
  readonly pageTitle =
    this.page === 'overview'
      ? 'Kleinanzeigen · Übersicht'
      : this.page === 'connection'
        ? 'Kleinanzeigen · Kontoverbindung'
        : 'Kleinanzeigen · Inserate';
  readonly kleinanzeigenAccount = viewChild(KleinanzeigenAccountsComponent);
  readonly workspace = inject(WorkspaceService);
  private readonly auth = inject(AuthService);
  private readonly actions = inject(KleinanzeigenActionStore);
  private refreshContext: string | null = null;
  readonly store = inject(MarketplaceOverviewStore);
  readonly storeIcon = LucideStore;
  readonly addIcon = LucidePlus;
  readonly adding = signal(false);
  readonly managing = signal<MarketplaceOverviewAccount | null>(null);
  readonly accountKey = overviewAccountKey;
  readonly accounts = computed(() => this.store.platforms().flatMap((group) => group.accounts));
  readonly activeCount = computed(() =>
    this.accounts().some((account) => account.activeCount === null)
      ? null
      : this.accounts().reduce((total, account) => total + (account.activeCount ?? 0), 0),
  );
  constructor() {
    effect(() => {
      const userId = this.auth.currentUser()?.id;
      const workspace = this.workspace.currentWorkspace();
      this.adding.set(false);
      this.managing.set(null);
      if (userId && workspace && !workspace.archived_at)
        untracked(() => void this.reloadListings());
    });
    // Die Erweiterung aktualisiert den Anbieterbestand; hier werden nur gespeicherte Stände gelesen.
    const refresh = () => {
      if (
        document.visibilityState !== 'hidden' &&
        !this.adding() &&
        !this.managing() &&
        !this.actions.runningCount() &&
        !Object.values(this.store.sections()).some(
          (section) => section.selection.length || section.loading,
        )
      )
        void this.reloadListings();
    };
    const timer = setInterval(refresh, 60_000);
    window.addEventListener('focus', refresh);
    inject(DestroyRef).onDestroy(() => {
      clearInterval(timer);
      window.removeEventListener('focus', refresh);
    });
  }
  async reloadListings(): Promise<void> {
    const workspace = this.workspace.currentWorkspace();
    const userId = this.auth.currentUser()?.id;
    if (!workspace || workspace.archived_at || !userId) return;
    const context = JSON.stringify([userId, workspace.id]);
    if (this.refreshContext === context) return;
    this.refreshContext = context;
    try {
      if (this.store.platforms().length) await this.store.refreshPlatform('kleinanzeigen');
      else await this.store.load(workspace.id, ['kleinanzeigen']);
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
          .filter((account) => this.page === 'listings' && !this.store.section(account)?.expanded)
          .map((account) => this.store.expand(account)),
      );
    } finally {
      if (this.refreshContext === context) this.refreshContext = null;
    }
  }
}
