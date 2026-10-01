import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import {
  LucideExternalLink,
  LucideLink2,
  LucideRefreshCw,
  LucideUnlink,
  LucideClipboardCheck,
} from '@lucide/angular';
import { AuthService } from '../../../../core/services/auth.service';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { CardComponent } from '../../../../shared/components/card/card.component';
import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import { DataTableComponent } from '../../../../shared/components/data-table/data-table.component';
import { PageHeaderComponent } from '../../../../shared/components/page-header/page-header.component';
import type { EbayListing } from '../../../../../../supabase/functions/_shared/ebay-contracts';
import { EbayArticleMappingComponent } from '../ebay-article-mapping/ebay-article-mapping.component';
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
    EbayArticleMappingComponent,
  ],
  providers: [EbayAccountStore],
  templateUrl: './ebay-account.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0' },
})
export class EbayAccountComponent {
  readonly showData = input(false);
  readonly selectedListing = signal<EbayListing | null>(null);
  readonly store = inject(EbayAccountStore);
  readonly workspace = inject(WorkspaceService);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly injector = inject(Injector);
  private readonly mappingPanel = viewChild<ElementRef<HTMLElement>>('mappingPanel');
  private mappingTrigger: HTMLElement | null = null;
  readonly connectIcon = LucideLink2;
  readonly disconnectIcon = LucideUnlink;
  readonly refreshIcon = LucideRefreshCw;
  readonly externalLinkIcon = LucideExternalLink;
  readonly reviewIcon = LucideClipboardCheck;

  constructor() {
    effect(() => {
      const user = this.auth.currentUser();
      const workspace = this.workspace.currentWorkspace();
      untracked(
        () =>
          void this.store.initialize(
            user && workspace && !workspace.archived_at ? workspace.id : null,
            this.showData(),
          ),
      );
    });
    effect(() => {
      this.store.connection();
      this.selectedListing.set(null);
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
  openMapping(listing: EbayListing, event: MouseEvent): void {
    this.mappingTrigger = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
    this.selectedListing.set(listing);
    afterNextRender(
      () => {
        const panel = this.mappingPanel()?.nativeElement;
        panel?.focus();
        panel?.scrollIntoView?.({ block: 'nearest' });
      },
      { injector: this.injector },
    );
  }
  closeMapping(): void {
    this.selectedListing.set(null);
    if (this.mappingTrigger?.isConnected) this.mappingTrigger.focus();
    this.mappingTrigger = null;
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
  orderReviewLink(connectionId: string, orderId: string): string {
    return `/sales/ebay/${encodeURIComponent(connectionId)}/${encodeURIComponent(orderId)}`;
  }
  bookingLabel(orderId: string): string {
    const booking = this.store.orderBookings()[orderId];
    if (booking?.status === 'imported') return 'Gebucht';
    if (booking?.status === 'recorded_elsewhere') return 'Manuell gebucht';
    if (booking?.status === 'unrecorded') return 'Noch nicht gebucht';
    return this.store.bookingStatusesLoading()
      ? 'Buchungsstatus wird geprüft'
      : 'Buchungsstatus ungeprüft';
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
