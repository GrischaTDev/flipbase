import type { Purchase } from '../../../core/models/flipbase.models';
import type { BadgeTone } from '../../../shared/components/badge/badge.component';
import type { PurchaseStatusLabel } from '../models/purchase-presentation.models';

export interface PurchaseStatusPresentation {
  readonly label: PurchaseStatusLabel;
  readonly tone: BadgeTone;
}

export function getPurchaseStatusPresentation(purchase: Purchase): PurchaseStatusPresentation {
  const receivingStatus = purchase.receiving_status as string | undefined;
  if (receivingStatus === 'archived') return { label: 'Archiviert', tone: 'neutral' };
  if (receivingStatus === 'cancelled' || receivingStatus === 'canceled') {
    return { label: 'Storniert', tone: 'critical' };
  }
  if (purchase.entry_status === 'finalized') {
    return { label: 'Abgeschlossen', tone: 'success' };
  }
  if (receivingStatus === 'partially_received') {
    return { label: 'Teillieferung', tone: 'caution' };
  }
  if (receivingStatus === 'received' || purchase.shipment_status === 'arrived') {
    return { label: 'Angekommen', tone: 'brand' };
  }
  if (receivingStatus === 'ordered') return { label: 'Bestellt', tone: 'info' };
  return { label: 'Entwurf', tone: 'caution' };
}
