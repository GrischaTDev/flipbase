import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import { PurchaseService } from '../../../../core/services/purchase.service';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { EntryPageLayoutComponent } from '../../../../shared/components/entry-page-layout/entry-page-layout.component';
import { PurchaseEntryFormComponent } from '../../components/purchase-entry-form/purchase-entry-form.component';

@Component({
  selector: 'app-purchase-edit',
  imports: [ButtonComponent, EntryPageLayoutComponent, PurchaseEntryFormComponent],
  templateUrl: './purchase-edit.component.html',
  host: {
    class: 'block',
    '(window:beforeunload)': 'onBeforeUnload($event)',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PurchaseEditComponent {
  readonly id = input.required<string>();
  readonly purchaseService = inject(PurchaseService);
  private readonly workspaceService = inject(WorkspaceService);
  private readonly router = inject(Router);
  readonly entryForm = viewChild(PurchaseEntryFormComponent);
  readonly purchase = computed(() => {
    const purchase = this.purchaseService.selectedPurchase();
    return purchase?.id === this.id() ? purchase : null;
  });

  constructor() {
    effect(() => {
      const purchaseId = this.id();
      const workspaceId = this.workspaceService.currentWorkspace()?.id;
      if (purchaseId && workspaceId) void this.purchaseService.getPurchaseById(purchaseId);
    });
  }

  hasUnsavedChanges(): boolean {
    return this.entryForm()?.hasUnsavedChanges() ?? false;
  }

  isSaving(): boolean {
    return this.entryForm()?.isSaving() ?? false;
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

  returnToPurchase(): void {
    void this.router.navigate(['/purchases', this.id()]);
  }
}
