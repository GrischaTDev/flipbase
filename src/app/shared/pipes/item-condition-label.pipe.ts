import { Pipe, PipeTransform } from '@angular/core';
import type { ItemCondition } from '../../core/models/flipbase.models';

const ITEM_CONDITION_LABELS: Record<ItemCondition, string> = {
  new: 'Neu',
  like_new: 'Wie neu',
  very_good: 'Sehr gut',
  used: 'Gebraucht',
  heavily_used: 'Stark gebraucht',
  defective: 'Defekt / Ersatzteil',
};

@Pipe({ name: 'itemConditionLabel' })
export class ItemConditionLabelPipe implements PipeTransform {
  transform(value: ItemCondition | null | undefined): string {
    return value === null || value === undefined ? '' : ITEM_CONDITION_LABELS[value];
  }
}
