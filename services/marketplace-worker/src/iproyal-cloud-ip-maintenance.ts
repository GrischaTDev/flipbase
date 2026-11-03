import type { CloudIpRenewalResult } from './iproyal-cloud-ip-renewal.ts';

type CloudIpMaintenanceEvent =
  | { event: 'cloud_ip_inventory_unavailable' | 'cloud_ip_renewal_unavailable' }
  | ({ event: 'cloud_ip_renewal_reconciled' } & CloudIpRenewalResult);

interface MaintenanceOptions {
  refreshInventory?: () => Promise<void>;
  reconcileRenewal?: () => Promise<CloudIpRenewalResult>;
  report: (event: CloudIpMaintenanceEvent) => void;
  now?: () => number;
}

/** Hält die gespeicherte IP-Laufzeit getrennt von der automatischen Bezahlung aktuell. */
export class IpRoyalCloudIpMaintenance {
  private dueAt = 0;
  private pending?: Promise<void>;
  private readonly options: MaintenanceOptions;

  constructor(options: MaintenanceOptions) {
    this.options = options;
  }

  reconcile(): Promise<void> {
    if (this.pending) return this.pending;
    const now = (this.options.now ?? Date.now)();
    if (now < this.dueAt) return Promise.resolve();
    this.dueAt = now + 600_000;
    this.pending = this.synchronize().finally(() => {
      this.pending = undefined;
    });
    return this.pending;
  }

  private async synchronize(): Promise<void> {
    try {
      await this.options.refreshInventory?.();
    } catch {
      this.options.report({ event: 'cloud_ip_inventory_unavailable' });
    }
    if (!this.options.reconcileRenewal) return;
    try {
      const result = await this.options.reconcileRenewal();
      if (result.enabled || result.disabled || result.failed)
        this.options.report({ event: 'cloud_ip_renewal_reconciled', ...result });
    } catch {
      this.options.report({ event: 'cloud_ip_renewal_unavailable' });
    }
  }
}

/** Ein Neustart darf noch veraltete Ablaufdaten nicht vor dem ersten Abgleich auswerten. */
export async function startMarketplaceDispatchAfterCloudIpRefresh(
  maintenance: Pick<IpRoyalCloudIpMaintenance, 'reconcile'>,
  dispatcher: { start(): void } | undefined,
): Promise<void> {
  await maintenance.reconcile();
  dispatcher?.start();
}
