import '@angular/compiler';
import { signal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import { Purchase } from '../../../core/models/flipbase.models';
import { PurchaseSelfReceiptService } from './purchase-self-receipt.service';

const purchase = {
  id: '11111111-1111-4111-8111-111111111111',
  workspace_id: '22222222-2222-4222-8222-222222222222',
  type: 'single',
  cost_allocation_mode: 'even',
  receipt_mode: 'self',
  entry_status: 'finalized',
  finalized_at: '2026-09-23T10:00:00.000Z',
  record_number: 'E-17',
  purchase_date: '2026-09-23',
  purchase_price: 25,
  purchase_lines: [],
  costs: [],
  title: 'Jacke',
} satisfies Purchase;

function setup(existing = false, uploadError: Error | null = null) {
  const documents = signal(
    existing
      ? [
          {
            purchase_id: purchase.id,
            document_type: 'self_receipt',
            source_finalized_at: purchase.finalized_at,
          },
        ]
      : [],
  );
  const upload = vi.fn(async () => ({ data: null, error: uploadError }));
  const service = Object.create(PurchaseSelfReceiptService.prototype) as PurchaseSelfReceiptService;
  Object.assign(service, {
    purchases: { getPurchaseById: vi.fn(async () => purchase) },
    workspaces: { currentWorkspace: signal({ id: purchase.workspace_id, name: 'Mein Laden' }) },
    documents: {
      loadForPurchase: vi.fn(async () => undefined),
      loadError: signal<string | null>(null),
      documents,
      upload,
    },
  });
  return { service, upload };
}

describe('PurchaseSelfReceiptService', () => {
  it('skips a receipt already stored for the same finalization', async () => {
    const { service, upload } = setup(true);
    expect(await service.ensureForFinalizedPurchase(purchase.id)).toEqual({ error: null });
    expect(upload).not.toHaveBeenCalled();
  });

  it('uploads a PDF tied to the finalization timestamp', async () => {
    const { service, upload } = setup();
    expect(await service.ensureForFinalizedPurchase(purchase.id)).toEqual({ error: null });
    expect(upload).toHaveBeenCalledWith(
      purchase.id,
      expect.objectContaining({ name: 'Eigenbeleg-E-17.pdf', type: 'application/pdf' }),
      'self_receipt',
      purchase.finalized_at,
    );
  });

  it('returns upload failure so the user can retry', async () => {
    const error = new Error('Storage nicht erreichbar');
    const { service } = setup(false, error);
    expect(await service.ensureForFinalizedPurchase(purchase.id)).toEqual({ error });
  });
});
