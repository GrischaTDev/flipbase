import { ChangeDetectionStrategy, Component, inject, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import type { SaleTargetRouteState } from '../../../../core/models/sale-target.models';
import { EntryPageLayoutComponent } from '../../../../shared/components/entry-page-layout/entry-page-layout.component';
import { SaleCreateModalComponent } from '../../components/sale-create-modal/sale-create-modal.component';

@Component({
  selector: 'app-sale-create',
  imports: [EntryPageLayoutComponent, SaleCreateModalComponent],
  templateUrl: './sale-create.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'block',
    '(window:beforeunload)': 'onBeforeUnload($event)',
  },
})
export class SaleCreateComponent {
  private readonly router = inject(Router);
  readonly entryForm = viewChild.required(SaleCreateModalComponent);
  readonly routeState = (this.router.getCurrentNavigation()?.extras.state ??
    globalThis.history?.state ??
    {}) as Partial<SaleTargetRouteState>;

  hasUnsavedChanges(): boolean {
    return this.entryForm()?.hasUnsavedChanges() ?? false;
  }

  isSaving(): boolean {
    return this.entryForm()?.isSaving() ?? false;
  }

  onBeforeUnload(event: BeforeUnloadEvent): void {
    if (!this.hasUnsavedChanges() && !this.isSaving()) return;
    event.preventDefault();
  }

  returnToSales(): void {
    const returnUrl = this.routeState.returnUrl;
    void this.router.navigateByUrl(returnUrl?.startsWith('/inventory') ? returnUrl : '/sales');
  }
}
