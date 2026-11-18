import { Injectable, inject, signal } from '@angular/core';
import { AuthService } from '../../../core/services/auth.service';
import { SupabaseService } from '../../../core/services/supabase.service';
import { ToastService } from '../../../shared/components/toast/toast.service';
import type { AccountScope } from '../models/marketplace.models';
import type { MarketplaceEntry } from '../models/marketplace-read.models';
import {
  parseVintedShippingLabelRow,
  vintedShippingLabelErrorMessage,
  vintedShippingLabelFileName,
  type VintedShippingLabel,
} from '../models/vinted-shipping-label';
import { MarketplaceBrowserTestApiService } from './marketplace-browser-test-api.service';

const signedUrlSeconds = 120;

/** Versandscheine des gewählten Vinted-Kontos: Liste, Anfordern und Öffnen der privaten Kopie. */
@Injectable({ providedIn: 'root' })
export class VintedShippingLabelStore {
  private readonly client = inject(SupabaseService).client;
  private readonly auth = inject(AuthService);
  private readonly api = inject(MarketplaceBrowserTestApiService);
  private readonly toast = inject(ToastService);
  private readonly scope = signal<AccountScope | null>(null);
  private revision = 0;

  readonly labels = signal<readonly VintedShippingLabel[]>([]);
  readonly loading = signal(false);
  readonly loadError = signal<string | null>(null);
  /** Verkäufe (Eintrags-ID), deren Versandschein gerade angefordert wird. */
  readonly requesting = signal<ReadonlySet<string>>(new Set());
  findForSale(sale: MarketplaceEntry): VintedShippingLabel | null {
    // Die Verkaufsliste liefert die Versandnummer. Einzelabrufe kennen auch die Transaktion.
    const { shipmentId, externalId: transactionId } = sale;
    if (!shipmentId && !transactionId) return null;
    const matches = this.labels().filter(
      (label) =>
        label.workspaceId === sale.workspaceId &&
        label.connectionId === sale.connectionId &&
        (!transactionId || label.transactionId === transactionId) &&
        (!shipmentId || label.shipmentId === shipmentId),
    );
    return matches.length === 1 ? (matches[0] ?? null) : null;
  }

  async load(scope: AccountScope): Promise<void> {
    const revision = ++this.revision;
    this.scope.set(scope);
    this.loading.set(true);
    this.loadError.set(null);
    try {
      const { data, error } = await this.client
        .from('marketplace_shipping_labels')
        .select(
          'id,workspace_id,connection_id,external_transaction_id,external_shipment_id,external_conversation_id,title,carrier_name,label_type,storage_path,mime_type,requested_by_flipbase,fetched_at',
        )
        .eq('workspace_id', scope.workspaceId)
        .eq('connection_id', scope.connectionId)
        .order('fetched_at', { ascending: false })
        .limit(200);
      if (revision !== this.revision) return;
      if (error) throw error;
      this.labels.set(
        (data ?? []).flatMap((row: unknown) => {
          const label = parseVintedShippingLabelRow(row);
          return label ? [label] : [];
        }),
      );
    } catch {
      if (revision === this.revision) {
        this.labels.set([]);
        this.loadError.set('Die Versandscheine konnten nicht geladen werden.');
      }
    } finally {
      if (revision === this.revision) this.loading.set(false);
    }
  }

  /** Fordert den Versandschein an (oder holt den vorhandenen) und lädt danach die Liste neu. */
  async request(sale: MarketplaceEntry): Promise<void> {
    if (this.requesting().has(sale.id)) return;
    const scope = { workspaceId: sale.workspaceId, connectionId: sale.connectionId };
    this.requesting.update((ids) => new Set(ids).add(sale.id));
    try {
      const token = this.auth.session()?.access_token;
      if (!token) throw new Error('Bitte melde Dich erneut an.');
      const result = await this.api.requestShippingLabel(scope, sale.id, token);
      if (result.outcome === 'failed')
        this.toast.error(vintedShippingLabelErrorMessage(result.errorCode));
      else if (result.outcome === 'pending')
        this.toast.info('Vinted erstellt den Versandschein noch. Hol ihn gleich noch einmal ab.');
      const current = this.scope();
      if (current?.workspaceId === scope.workspaceId && current.connectionId === scope.connectionId)
        await this.load(scope);
    } catch (error) {
      this.toast.error(
        error instanceof Error && error.message
          ? error.message
          : 'Der Versandschein konnte nicht abgerufen werden.',
      );
    } finally {
      this.requesting.update((ids) => {
        const next = new Set(ids);
        next.delete(sale.id);
        return next;
      });
    }
  }

  /** Öffnet die private Kopie im Browser; das Fenster entsteht vor dem Abruf gegen Pop-up-Sperren. */
  async open(label: VintedShippingLabel): Promise<void> {
    const target = window.open('', '_blank');
    try {
      const url = await this.signedUrl(label, false);
      if (target) {
        target.opener = null;
        target.location.href = url;
      } else window.location.assign(url);
    } catch (error) {
      target?.close();
      throw error;
    }
  }

  async download(label: VintedShippingLabel): Promise<void> {
    const link = document.createElement('a');
    link.href = await this.signedUrl(label, true);
    link.download = vintedShippingLabelFileName(label);
    link.rel = 'noopener';
    document.body.append(link);
    link.click();
    link.remove();
  }

  private async signedUrl(label: VintedShippingLabel, download: boolean): Promise<string> {
    const { data, error } = await this.client.storage
      .from('marketplace-shipping-labels')
      .createSignedUrl(
        label.storagePath,
        signedUrlSeconds,
        download ? { download: vintedShippingLabelFileName(label) } : undefined,
      );
    if (error || !data?.signedUrl)
      throw new Error('Der Versandschein konnte nicht geöffnet werden.');
    return data.signedUrl;
  }
}
