import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  input,
} from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { LucideExternalLink, LucideLink2, LucideRefreshCw, LucideUnlink } from '@lucide/angular';
import { AuthService } from '../../../../core/services/auth.service';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { CardComponent } from '../../../../shared/components/card/card.component';
import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import { DataTableComponent } from '../../../../shared/components/data-table/data-table.component';
import { PageHeaderComponent } from '../../../../shared/components/page-header/page-header.component';
import { EbayAccountStore } from '../../services/ebay-account.store';

@Component({
  selector: 'app-ebay-account',
  imports: [
    DatePipe,
    DecimalPipe,
    ButtonComponent,
    CardComponent,
    BadgeComponent,
    DataTableComponent,
    PageHeaderComponent,
  ],
  providers: [EbayAccountStore],
  templateUrl: './ebay-account.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0' },
})
export class EbayAccountComponent {
  readonly showData = input(false);
  readonly store = inject(EbayAccountStore);
  readonly workspace = inject(WorkspaceService);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  readonly connectIcon = LucideLink2;
  readonly disconnectIcon = LucideUnlink;
  readonly refreshIcon = LucideRefreshCw;
  readonly externalLinkIcon = LucideExternalLink;

  constructor() {
    effect(() => {
      const user = this.auth.currentUser();
      const workspace = this.workspace.currentWorkspace();
      void this.store.initialize(
        user && workspace && !workspace.archived_at ? workspace.id : null,
        this.showData(),
      );
    });
    inject(DestroyRef).onDestroy(() => this.store.reset(null));
  }
  callbackMessage(): string | null {
    const params = this.route.snapshot.queryParamMap;
    const workspaceId = params.get('workspace');
    if (workspaceId && workspaceId !== this.workspace.currentWorkspace()?.id)
      return 'Die eBay-Anmeldung gehört zu einem anderen Workspace. Wechsle zu diesem Workspace, um den Verbindungsstatus zu prüfen.';
    const result = params.get('ebay_result');
    // Der Rückgabewert ist nur ein Hinweis; der bestätigte Status kommt vom Server.
    if (result === 'connected')
      return 'Deine eBay-Anmeldung wurde abgeschlossen. Der aktuelle Verbindungsstatus steht unten.';
    if (result === 'denied')
      return 'Du hast die eBay-Freigabe abgebrochen. Du kannst dein Konto erneut verbinden.';
    if (result === 'failed')
      return 'Die eBay-Anmeldung konnte nicht bestätigt werden. Starte die Verbindung erneut.';
    return null;
  }
  async connect(): Promise<void> {
    const url = await this.store.connect();
    if (url) window.location.assign(url);
  }
  refresh(): void {
    const workspaceId = this.workspace.currentWorkspace()?.id;
    if (!this.auth.currentUser() || !workspaceId || this.workspace.currentWorkspace()?.archived_at)
      return;
    void this.store.initialize(workspaceId, this.showData());
  }
  paymentLabel(status: string): string {
    const labels: Record<string, string> = {
      PAID: 'Bezahlt',
      PENDING: 'Zahlung ausstehend',
      FAILED: 'Zahlung fehlgeschlagen',
      FULLY_REFUNDED: 'Erstattet',
      PARTIALLY_REFUNDED: 'Teilweise erstattet',
    };
    return labels[status] ?? 'Zahlungsstatus unbekannt';
  }
  fulfillmentLabel(status: string): string {
    const labels: Record<string, string> = {
      FULFILLED: 'Versandt',
      NOT_STARTED: 'Noch nicht versandt',
      IN_PROGRESS: 'Versand läuft',
    };
    return labels[status] ?? 'Versandstatus unbekannt';
  }
  cancellationLabel(status: string | null): string | null {
    if (!status || status === 'NONE_REQUESTED') return null;
    const labels: Record<string, string> = {
      CANCELED: 'Storniert',
      IN_PROGRESS: 'Stornierung läuft',
      REJECTED: 'Stornierung abgelehnt',
      REQUESTED: 'Stornierung angefragt',
    };
    return labels[status] ?? 'Stornierungsstatus prüfen';
  }
}
