import '@angular/compiler';
import { signal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import { Purchase } from '../../../core/models/flipbase.models';
import { PurchaseSelfReceiptService } from './purchase-self-receipt.service';
import { CompanyDocumentError } from '../../../core/models/company-document.models';

const companyParty = {
  name: 'Anna Beispiel',
  company: 'Mein Laden',
  street: 'Hauptweg 8',
  postalCode: '12345',
  city: 'Bonn',
  country: 'DE',
  taxId: '12/345/678',
};

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
  const getDocumentParty = vi.fn(async () => companyParty);
  const currentWorkspace = signal({ id: purchase.workspace_id, name: 'Mein Laden' });
  Object.assign(service, {
    company: { getDocumentParty },
    purchases: { getPurchaseById: vi.fn(async () => purchase) },
    workspaces: { currentWorkspace },
    documents: {
      loadForPurchase: vi.fn(async () => undefined),
      loadError: signal<string | null>(null),
      documents,
      upload,
    },
  });
  return { service, upload, getDocumentParty, currentWorkspace };
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
      companyParty,
      purchase.workspace_id,
    );
  });

  it('blocks a new receipt with incomplete company data before upload', async () => {
    const { service, upload, getDocumentParty } = setup();
    getDocumentParty.mockRejectedValue(new CompanyDocumentError(['legalName']));
    expect((await service.ensureForFinalizedPurchase(purchase.id)).error).toBeInstanceOf(
      CompanyDocumentError,
    );
    expect(upload).not.toHaveBeenCalled();
  });

  it('stops an old workspace response before uploading the PDF', async () => {
    const { service, upload, getDocumentParty, currentWorkspace } = setup();
    getDocumentParty.mockImplementation(async () => {
      currentWorkspace.set({ id: 'other-workspace', name: 'Andere Firma' });
      return companyParty;
    });
    expect((await service.ensureForFinalizedPurchase(purchase.id)).error?.message).toContain(
      'Workspace',
    );
    expect(upload).not.toHaveBeenCalled();
  });

  it('returns upload failure so the user can retry', async () => {
    const error = new Error('Storage nicht erreichbar');
    const { service } = setup(false, error);
    expect(await service.ensureForFinalizedPurchase(purchase.id)).toEqual({ error });
  });
});
