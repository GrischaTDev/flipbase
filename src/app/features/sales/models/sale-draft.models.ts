import type { SaleCostCategory, ShippingMode } from '../../../core/models/flipbase.models';

/** Gespeicherter Stand der Verkaufserfassung; enthält keine Buchung und keine Reservierung. */
export interface SaleDraftSnapshot {
  readonly version: 1;
  readonly lines: readonly {
    /** Gleiche Kennung wie im Formular, z. B. `free:Pullover` oder eine Bestandsauswahl. */
    readonly target: string;
    readonly quantity: number;
    readonly unitSalePrice: number;
    readonly purchaseId: string | null;
  }[];
  readonly platform: string;
  readonly saleDate: string;
  readonly platformFee: number | null;
  readonly shippingCost: number | null;
  readonly shippingRevenue: number;
  readonly shippingMode: ShippingMode | 'unknown';
  readonly additionalCosts: readonly {
    readonly category: SaleCostCategory;
    readonly description: string;
    readonly amount: number;
  }[];
  readonly externalOrderId: string;
  readonly buyerNotes: string;
}

export interface SaleDraft {
  readonly id: string;
  readonly workspaceId: string;
  readonly title: string;
  readonly saleAmount: number;
  readonly updatedAt: string;
  readonly snapshot: SaleDraftSnapshot;
}

export function readSaleDraftSnapshot(value: unknown): SaleDraftSnapshot | null {
  if (!value || typeof value !== 'object') return null;
  const draft = value as Partial<SaleDraftSnapshot>;
  if (draft.version !== 1 || !Array.isArray(draft.lines) || !Array.isArray(draft.additionalCosts))
    return null;
  return draft as SaleDraftSnapshot;
}
