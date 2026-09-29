import { ChangeDetectionStrategy, Component, inject, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import type { SaleTargetRouteState } from '../../../../core/models/sale-target.models';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { EntryPageLayoutComponent } from '../../../../shared/components/entry-page-layout/entry-page-layout.component';
import { SaleCreateModalComponent } from '../../components/sale-create-modal/sale-create-modal.component';

@Component({
  selector: 'app-sale-create',
  imports: [EntryPageLayoutComponent, ButtonComponent, SaleCreateModalComponent],
  templateUrl: './sale-create.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'block',
    '(window:beforeunload)': 'onBeforeUnload($event)',
  },
})
export class SaleCreateComponent {
  private readonly router = inject(Router);
  readonly entryForm = viewChild(SaleCreateModalComponent);
  readonly routeState = (this.router.getCurrentNavigation()?.extras.state ??
    globalThis.history?.state ??
    {}) as Partial<SaleTargetRouteState>;

  hasUnsavedChanges(): boolean {
    return this.entryForm()?.hasUnsavedChanges() ?? false;
  }

  isSaving(): boolean {
    return this.entryForm()?.isSaving() ?? false;
  }

  canSave(): boolean {
    return this.entryForm()?.canSave() ?? false;
  }

  save(): void {
    void this.entryForm()?.onSubmit();
  }

  onBeforeUnload(event: BeforeUnloadEvent): void {
    if (!this.hasUnsavedChanges() && !this.isSaving()) return;
    event.preventDefault();
  }

  returnToSales(): void {
    const returnUrl = this.routeState.returnUrl;
    const isInventoryRoute = returnUrl === '/inventory' || returnUrl?.startsWith('/inventory/');
    const isCatalogRoute = returnUrl === '/catalog' || returnUrl?.startsWith('/catalog?');
    void this.router.navigateByUrl(
      returnUrl && (isInventoryRoute || isCatalogRoute) ? returnUrl : '/sales',
    );
  }
}
