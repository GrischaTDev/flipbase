import { TaxMode } from './reflip.models';

export interface InvoiceItem {
  sku?: string;
  title: string;
  condition?: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

export interface InvoiceParty {
  name: string;
  company?: string;
  street: string;
  postalCode: string;
  city: string;
  country: string;
  email?: string;
  phone?: string;
  taxId?: string; // Steuernummer
  vatId?: string; // USt-IdNr.
  iban?: string;
  bic?: string;
  bankName?: string;
}

export interface Invoice {
  id: string;
  invoiceNumber: string; // e.g. 'RE-2026-0042'
  orderNumber: string;
  invoiceDate: string;
  deliveryDate: string;
  seller: InvoiceParty;
  buyer: InvoiceParty;
  items: InvoiceItem[];
  subtotal: number;
  shippingCost: number;
  total: number;
  taxMode: TaxMode;
  taxClause: string;
  paymentMethod: string;
  paymentStatus: 'paid' | 'pending';
  paymentDueDate?: string;
  notes?: string;
}

export interface EmailConfirmation {
  id: string;
  to: string;
  recipientName: string;
  subject: string;
  sentAt: string;
  status: 'sent' | 'draft';
  invoiceNumber: string;
  orderNumber: string;
}
