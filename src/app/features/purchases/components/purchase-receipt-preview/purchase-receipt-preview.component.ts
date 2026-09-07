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
import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import type { PurchaseReceiptSummary } from '../../models/purchase-presentation.models';

let nextReceiptPreviewId = 0;

@Component({
  selector: 'app-purchase-receipt-preview',
  imports: [RouterLink, BadgeComponent, ButtonComponent],
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
  private readonly previewId = `purchase-receipt-preview-${++nextReceiptPreviewId}`;

  readonly purchaseId = input.required<string>();
  readonly receipt = input.required<PurchaseReceiptSummary>();
  readonly knownReceipt = computed(() => {
    const receipt = this.receipt();
    return receipt.kind === 'known' ? receipt : null;
  });
  readonly isOpen = signal(false);
  readonly panelPosition = signal({ top: 0, left: 0 });

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
    const panelWidth = 288;
    const viewportPadding = 8;
    const left = Math.min(
      Math.max(viewportPadding, rect.right - panelWidth),
      window.innerWidth - panelWidth - viewportPadding,
    );
    const spaceBelow = window.innerHeight - rect.bottom;
    const top = spaceBelow >= 220 ? rect.bottom + 4 : Math.max(viewportPadding, rect.top - 220);
    this.panelPosition.set({ top, left });
    this.isOpen.set(true);
  }

  close(restoreFocus: boolean): void {
    if (!this.isOpen()) return;
    this.isOpen.set(false);
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
