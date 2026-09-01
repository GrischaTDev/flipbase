import { Pipe, PipeTransform } from '@angular/core';
import type { PurchaseType } from '../../core/models/flipbase.models';

const PURCHASE_TYPE_LABELS: Record<PurchaseType, string> = {
  single: 'Normaler Einkauf',
  mystery_pack: 'Mystery Box',
  lot: 'Konvolut',
  pallet: 'Palette',
};

@Pipe({ name: 'purchaseTypeLabel' })
export class PurchaseTypeLabelPipe implements PipeTransform {
  transform(value: PurchaseType | null | undefined): string {
    return value === null || value === undefined ? '' : PURCHASE_TYPE_LABELS[value];
  }
}
