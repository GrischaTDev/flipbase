import { ChangeDetectionStrategy, Component, inject, viewChild } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { PurchaseEntryFormComponent } from '../../components/purchase-entry-form/purchase-entry-form.component';

@Component({
  selector: 'app-purchase-create',
  imports: [RouterLink, PurchaseEntryFormComponent],
  templateUrl: './purchase-create.component.html',
  host: {
    class: 'block',
    '(window:beforeunload)': 'onBeforeUnload($event)',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PurchaseCreateComponent {
  private readonly router = inject(Router);
  readonly entryForm = viewChild.required(PurchaseEntryFormComponent);

  hasUnsavedChanges(): boolean {
    return this.entryForm()?.hasUnsavedChanges() ?? false;
  }

  isSaving(): boolean {
    return this.entryForm()?.isSubmitting() ?? false;
  }

  onBeforeUnload(event: BeforeUnloadEvent): void {
    if (!this.hasUnsavedChanges()) return;
    event.preventDefault();
  }

  returnToPurchases(): void {
    void this.router.navigate(['/purchases']);
  }
}
