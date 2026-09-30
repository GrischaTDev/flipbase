import { Injectable, inject } from '@angular/core';
import { PurchaseDocumentService } from '../../../core/services/purchase-document.service';
import { PurchaseService } from '../../../core/services/purchase.service';
import { WorkspaceService } from '../../../core/services/workspace.service';
import { CompanyProfileService } from '../../../core/services/company-profile.service';
import { buildSelfReceiptContent, createSelfReceiptPdf } from './purchase-self-receipt-pdf';

@Injectable({ providedIn: 'root' })
export class PurchaseSelfReceiptService {
  private readonly purchases = inject(PurchaseService);
  private readonly documents = inject(PurchaseDocumentService);
  private readonly workspaces = inject(WorkspaceService);
  private readonly company = inject(CompanyProfileService);

  async ensureForFinalizedPurchase(purchaseId: string): Promise<{ error: Error | null }> {
    const purchase = await this.purchases.getPurchaseById(purchaseId);
    const workspace = this.workspaces.currentWorkspace();
    if (!purchase || !workspace || purchase.workspace_id !== workspace.id) {
      return { error: new Error('Der Einkauf konnte nicht geladen werden.') };
    }
    if (purchase.receipt_mode !== 'self') return { error: null };
    if (purchase.entry_status !== 'finalized' || !purchase.finalized_at) {
      return { error: new Error('Der Eigenbeleg kann erst nach dem Abschluss erstellt werden.') };
    }

    await this.documents.loadForPurchase(purchaseId);
    if (this.workspaces.currentWorkspace()?.id !== workspace.id) {
      return { error: new Error('Der Workspace wurde während der Belegerstellung gewechselt.') };
    }
    if (this.documents.loadError()) {
      return {
        error: new Error(this.documents.loadError() ?? 'Belege konnten nicht geladen werden.'),
      };
    }
    if (
      this.documents
        .documents()
        .some(
          (document) =>
            document.purchase_id === purchaseId &&
            document.document_type === 'self_receipt' &&
            document.source_finalized_at === purchase.finalized_at,
        )
    ) {
      return { error: null };
    }

    try {
      const companyParty = await this.company.getDocumentParty(workspace.id);
      if (this.workspaces.currentWorkspace()?.id !== workspace.id) {
        throw new Error('Der Workspace wurde während der Belegerstellung gewechselt.');
      }
      let content = buildSelfReceiptContent(purchase, companyParty, new Date());
      let logo: Blob | null = null;
      if (companyParty.logoPath) {
        try {
          logo = await this.company.getDocumentLogoBlob(workspace.id, companyParty.logoPath);
        } catch {
          /* Fehlende Bilddateien verhindern keinen Eigenbeleg. */
        }
        if (!logo) {
          content = {
            ...content,
            lines: [...content.lines, 'Das gespeicherte Unternehmenslogo ist nicht verfügbar.'],
          };
        }
      }
      const bytes = await createSelfReceiptPdf(content, logo);
      const fileName = (purchase.record_number ?? purchase.id).replace(/[^a-zA-Z0-9_-]/gu, '_');
      const file = new File([new Uint8Array(bytes)], `Eigenbeleg-${fileName}.pdf`, {
        type: 'application/pdf',
      });
      const { error } = await this.documents.upload(
        purchaseId,
        file,
        'self_receipt',
        purchase.finalized_at,
        companyParty,
        workspace.id,
      );
      if (error?.message.includes('duplicate key')) {
        await this.documents.loadForPurchase(purchaseId);
        if (
          this.documents
            .documents()
            .some(
              (document) =>
                document.purchase_id === purchaseId &&
                document.document_type === 'self_receipt' &&
                document.source_finalized_at === purchase.finalized_at,
            )
        ) {
          return { error: null };
        }
      }
      return { error };
    } catch (cause: unknown) {
      return {
        error:
          cause instanceof Error ? cause : new Error('Eigenbeleg konnte nicht erstellt werden.'),
      };
    }
  }
}
