import { ChangeDetectionStrategy, Component, inject, signal, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { AiVisualScanResult } from '../../../../core/services/ai-assistant.service';
import { ProductDialogComponent } from '../../../catalog/components/product-dialog/product-dialog.component';
import { CreateCatalogProductInput } from '../../../../core/services/catalog.service';

interface ItemCreateRouteState {
  readonly aiResult?: AiVisualScanResult;
  readonly barcode?: string;
}

@Component({
  selector: 'app-item-create',
  imports: [ProductDialogComponent],
  templateUrl: './item-create.component.html',
  host: { class: 'block', '(window:beforeunload)': 'onBeforeUnload($event)' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ItemCreateComponent {
  private readonly router = inject(Router);
  private readonly entryForm = viewChild(ProductDialogComponent);
  private readonly saved = signal(false);
  private readonly routeState = (window.history.state ?? {}) as ItemCreateRouteState;
  readonly initialProduct: Partial<Omit<CreateCatalogProductInput, 'workspaceId'>> | null = this
    .routeState.aiResult
    ? {
        title: this.routeState.aiResult.title,
        brand: this.routeState.aiResult.brand,
        model: this.routeState.aiResult.model,
        category: this.routeState.aiResult.category,
        condition: this.routeState.aiResult.condition,
        conditionNotes: this.routeState.aiResult.conditionNotes,
        ean: this.routeState.aiResult.suggestedEan,
      }
    : this.routeState.barcode
      ? { ean: this.routeState.barcode }
      : null;

  hasUnsavedChanges(): boolean {
    return !this.saved() && (!!this.entryForm()?.form.dirty || !!this.entryForm()?.images().length);
  }
  isSaving(): boolean {
    return this.entryForm()?.saving() ?? false;
  }
  onBeforeUnload(event: BeforeUnloadEvent): void {
    if (this.hasUnsavedChanges()) event.preventDefault();
  }
  itemCreated(): void {
    this.saved.set(true);
    this.returnToInventory();
  }
  returnToInventory(): void {
    void this.router.navigate(['/inventory']);
  }
}
