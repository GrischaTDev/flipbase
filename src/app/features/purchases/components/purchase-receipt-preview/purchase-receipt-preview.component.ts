import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideChevronDown } from '@lucide/angular';
import { CatalogService } from '../../../../core/services/catalog.service';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { ProductThumbnailComponent } from '../../../../shared/components/product-thumbnail/product-thumbnail.component';
import type { PurchaseReceiptSummary } from '../../models/purchase-presentation.models';
import { PurchaseReceiptPreviewStateService } from '../../services/purchase-receipt-preview-state.service';

let nextReceiptPreviewId = 0;

@Component({
  selector: 'app-purchase-receipt-preview',
  imports: [RouterLink, ButtonComponent, ProductThumbnailComponent],
  templateUrl: './purchase-receipt-preview.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'relative inline-block',
    '(document:click)': 'onDocumentClick($event)',
    '(document:keydown.escape)': 'close(true)',
  },
})
export class PurchaseReceiptPreviewComponent {
  private readonly elementRef = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly catalogService = inject(CatalogService);
  private readonly workspaceService = inject(WorkspaceService);
  private readonly previewState = inject(PurchaseReceiptPreviewStateService);
  private readonly previewId = `purchase-receipt-preview-${++nextReceiptPreviewId}`;

  readonly purchaseId = input.required<string>();
  readonly receipt = input.required<PurchaseReceiptSummary>();
  readonly knownReceipt = computed(() => {
    const receipt = this.receipt();
    return receipt.kind === 'known' ? receipt : null;
  });
  readonly isOpen = computed(() => this.previewState.openPreviewId() === this.previewId);
  readonly panelPosition = signal({
    top: null as number | null,
    bottom: null as number | null,
    left: 0,
    maxHeight: 0,
  });
  readonly imageUrls = computed(() =>
    this.catalogService.loadedWorkspaceId() === this.workspaceService.currentWorkspace()?.id
      ? this.catalogService.imageUrls()
      : {},
  );

  readonly chevronIcon = LucideChevronDown;
  readonly panelId = this.previewId;

  toggle(event: MouseEvent): void {
    event.stopPropagation();
    if (this.isOpen()) {
      this.close(false);
      return;
    }

    const trigger = event.currentTarget;
    if (!(trigger instanceof HTMLElement)) return;
    const rect = trigger.getBoundingClientRect();
    const viewportPadding = 8;
    const panelWidth = Math.min(416, window.innerWidth - viewportPadding * 2);
    const left = Math.min(
      Math.max(viewportPadding, rect.right - panelWidth),
      window.innerWidth - panelWidth - viewportPadding,
    );
    const spaceBelow = window.innerHeight - rect.bottom - viewportPadding - 4;
    const spaceAbove = rect.top - viewportPadding - 4;
    const openBelow = spaceBelow >= spaceAbove;
    this.panelPosition.set({
      top: openBelow ? rect.bottom + 4 : null,
      bottom: openBelow ? null : window.innerHeight - rect.top + 4,
      left,
      maxHeight: Math.max(0, openBelow ? spaceBelow : spaceAbove),
    });
    this.previewState.open(this.previewId);
    const workspaceId = this.workspaceService.currentWorkspace()?.id;
    if (workspaceId && this.catalogService.loadedWorkspaceId() !== workspaceId) {
      void this.catalogService.loadProducts(workspaceId);
    }
  }

  onImageFailed(productId: string | null): void {
    if (productId) this.catalogService.invalidateProductImage(productId);
  }

  close(restoreFocus: boolean): void {
    if (!this.isOpen()) return;
    this.previewState.close(this.previewId);
    if (!restoreFocus) return;
    queueMicrotask(() => this.elementRef.nativeElement.querySelector('button')?.focus());
  }

  onDocumentClick(event: MouseEvent): void {
    if (!this.isOpen()) return;
    const target = event.target;
    if (target instanceof Node && this.elementRef.nativeElement.contains(target)) return;
    this.close(false);
  }
}
