import type { InventoryItem } from '../../../core/models/flipbase.models';
import type { BadgeTone } from '../../../shared/components/badge/badge.component';
import type {
  ListingContent,
  ListingStatus,
  ListingTargetKind,
  ListingValidationError,
} from './listing.models';

export const LISTING_LIMITS = {
  title: 65,
  description: 4_000,
  price: 99_999_999,
  postalCode: 5,
} as const;

const PREPARABLE_STATUSES = new Set<InventoryItem['status']>([
  'received',
  'needs_review',
  'researched',
  'ready',
  'listed',
  'returned',
]);

export type ListingEligibility =
  { readonly allowed: true } | { readonly allowed: false; readonly reason: string };

export function canPrepareListing(
  item:
    | Pick<InventoryItem, 'status' | 'archived_at'>
    | {
        readonly targetKind?: ListingTargetKind;
        readonly status?: InventoryItem['status'];
        readonly archived_at?: string | null;
        readonly archivedAt?: string | null;
        readonly availableQuantity?: number;
      },
): ListingEligibility {
  const archived = 'archivedAt' in item ? item.archivedAt : item.archived_at;
  if (archived) {
    return { allowed: false, reason: 'Der Artikel ist archiviert.' };
  }
  if ('targetKind' in item && item.targetKind === 'catalog_product') {
    if (item.availableQuantity !== undefined && item.availableQuantity <= 0) {
      return { allowed: false, reason: 'Kein verfügbarer Bestand für dieses Produkt vorhanden.' };
    }
    return { allowed: true };
  }

  const status = item.status;
  if (status && PREPARABLE_STATUSES.has(status)) {
    return { allowed: true };
  }

  const reasons: Partial<Record<InventoryItem['status'], string>> = {
    reserved: 'Der Artikel ist reserviert.',
    sold: 'Der Artikel wurde bereits verkauft.',
    defective: 'Der Artikel ist als defekt markiert.',
    archived: 'Der Artikel ist archiviert.',
  };

  return {
    allowed: false,
    reason: (status && reasons[status]) ?? 'Dieser Artikel kann nicht inseriert werden.',
  };
}

export function listingStatusLabel(status: ListingStatus): string {
  return { prepared: 'Vorbereitet', online: 'Online', ended: 'Beendet' }[status];
}

export function listingStatusTone(status: ListingStatus): BadgeTone {
  const tones: Record<ListingStatus, BadgeTone> = {
    prepared: 'caution',
    online: 'success',
    ended: 'neutral',
  };
  return tones[status];
}

export function validateListingContent(content: ListingContent): ListingValidationError[] {
  const errors: ListingValidationError[] = [];
  const title = content.title.trim();

  if (!title || title.length > LISTING_LIMITS.title) {
    errors.push({ field: 'title', message: 'Der Titel muss 1 bis 65 Zeichen enthalten.' });
  }

  if (content.description.length > LISTING_LIMITS.description) {
    errors.push({
      field: 'description',
      message: 'Die Beschreibung darf höchstens 4.000 Zeichen enthalten.',
    });
  }

  if (
    !Number.isFinite(content.price) ||
    content.price < 0 ||
    content.price > LISTING_LIMITS.price
  ) {
    errors.push({ field: 'price', message: 'Der Preis muss zwischen 0 und 99.999.999 € liegen.' });
  }

  if (
    content.shippingPrice !== null &&
    (!Number.isFinite(content.shippingPrice) || content.shippingPrice < 0)
  ) {
    errors.push({ field: 'shippingPrice', message: 'Versandkosten dürfen nicht negativ sein.' });
  }

  if (content.shippingType === 'pickup' && content.shippingPrice !== null) {
    errors.push({
      field: 'shippingPrice',
      message: 'Bei Abholung dürfen keine Versandkosten gespeichert sein.',
    });
  }

  if (content.postalCode !== null && !/^\d{5}$/.test(content.postalCode)) {
    errors.push({
      field: 'postalCode',
      message: 'Die Postleitzahl muss aus fünf Ziffern bestehen.',
    });
  }

  return errors;
}
