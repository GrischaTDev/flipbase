import { ItemCondition } from '../models/flipbase.models';

export const PRODUCT_CONDITIONS: readonly {
  readonly value: ItemCondition;
  readonly label: string;
}[] = [
  { value: 'new', label: 'Neu' },
  { value: 'like_new', label: 'Wie neu' },
  { value: 'very_good', label: 'Sehr gut' },
  { value: 'used', label: 'Gebraucht' },
  { value: 'heavily_used', label: 'Stark gebraucht' },
  { value: 'defective', label: 'Defekt / Ersatzteil' },
];
