import { ChangeDetectionStrategy, Component, inject, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { EntryPageLayoutComponent } from '../../../../shared/components/entry-page-layout/entry-page-layout.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { PurchaseEntryFormComponent } from '../../components/purchase-entry-form/purchase-entry-form.component';
import { PurchaseProductReturnService } from '../../services/purchase-product-return.service';

@Component({
  selector: 'app-purchase-create',
  imports: [EntryPageLayoutComponent, ButtonComponent, PurchaseEntryFormComponent],
  templateUrl: './purchase-create.component.html',
  host: {
    class: 'block',
    '(window:beforeunload)': 'onBeforeUnload($event)',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PurchaseCreateComponent {
  private readonly router = inject(Router);
  private readonly productReturn = inject(PurchaseProductReturnService);
  readonly entryForm = viewChild.required(PurchaseEntryFormComponent);

  hasUnsavedChanges(): boolean {
    return this.entryForm()?.hasUnsavedChanges() ?? false;
  }

  isSaving(): boolean {
    return this.entryForm()?.isSaving() ?? false;
  }

  canNavigateTo(url: string): boolean {
    return this.productReturn.isCatalogHandoff(url);
  }

  canSaveDraft(): boolean {
    return this.entryForm()?.canSaveDraft() ?? false;
  }

  saveDraft(): void {
    void this.entryForm()?.onSubmit();
  }

  onBeforeUnload(event: BeforeUnloadEvent): void {
    if (!this.hasUnsavedChanges()) return;
    event.preventDefault();
  }

  returnToPurchases(): void {
    void this.router.navigate(['/purchases']);
  }

  openPurchase(purchaseId: string): void {
    void this.router.navigate(['/purchases', purchaseId]);
  }
}
