import { InventoryItem, Sale } from './reflip.models';
import { Invoice } from './invoice.models';

export type ReturnReason =
  | 'defective'
  | 'wrong_item'
  | 'buyer_remorse'
  | 'not_as_described'
  | 'lost_in_transit'
  | 'other';

export type RestockAction = 'restock_ready' | 'restock_repair' | 'write_off' | 'keep_with_buyer';

export interface ReturnRecord {
  id: string;
  workspace_id: string;
  sale_id: string;
  inventory_item_id: string;
  credit_note_number: string;
  return_date: string;
  reason: ReturnReason;
  refund_amount: number;
  is_full_refund: boolean;
  restock_action: RestockAction;
  buyer_name?: string;
  notes?: string;
  created_at: string;
  sale?: Sale;
  inventory_item?: InventoryItem;
  creditNoteInvoice?: Invoice;
}
