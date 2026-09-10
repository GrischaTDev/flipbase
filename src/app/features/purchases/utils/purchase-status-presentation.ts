import type { Purchase } from '../../../core/models/flipbase.models';
import type { BadgeTone } from '../../../shared/components/badge/badge.component';
import type { PurchaseStatusLabel } from '../models/purchase-presentation.models';

export interface PurchaseStatusPresentation {
  readonly label: PurchaseStatusLabel;
  readonly tone: BadgeTone;
}

export function getPurchaseStatusPresentation(purchase: Purchase): PurchaseStatusPresentation {
  const receivingStatus = purchase.receiving_status as string | undefined;
  switch (receivingStatus) {
    case 'partially_received':
      return { label: 'Teillieferung', tone: 'caution' };
    case 'received':
      return { label: 'Angekommen', tone: 'success' };
    case 'archived':
      return { label: 'Archiviert', tone: 'neutral' };
    case 'cancelled':
    case 'canceled':
      return { label: 'Storniert', tone: 'critical' };
  }

  if (purchase.shipment_status === 'arrived') {
    return { label: 'Angekommen', tone: 'success' };
  }
  if (receivingStatus === 'ordered') {
    return { label: 'Bestellt', tone: 'info' };
  }

  if (purchase.entry_status === 'finalized') {
    return { label: 'Abgeschlossen', tone: 'success' };
  }
  return { label: 'Entwurf', tone: 'caution' };
}
