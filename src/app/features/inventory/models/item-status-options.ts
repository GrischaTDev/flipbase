import type { ItemStatus } from '../../../core/models/flipbase.models';

export type EditableItemStatus = Exclude<ItemStatus, 'sold'>;

export const editableItemStatusLabels = {
  received: 'Auf Lager',
  needs_review: 'Prüfung nötig',
  researched: 'Recherchiert',
  ready: 'Bereit',
  listed: 'Gelistet',
  reserved: 'Reserviert',
  returned: 'Retourniert',
  archived: 'Archiviert',
  defective: 'Defekt / Ersatzteil',
} satisfies Record<EditableItemStatus, string>;

const editableItemStatusOrder = [
  'received',
  'needs_review',
  'researched',
  'ready',
  'listed',
  'reserved',
  'returned',
  'archived',
  'defective',
] as const satisfies readonly EditableItemStatus[];

export const editableItemStatusOptions = editableItemStatusOrder.map((value) => ({
  value,
  label: editableItemStatusLabels[value],
}));
