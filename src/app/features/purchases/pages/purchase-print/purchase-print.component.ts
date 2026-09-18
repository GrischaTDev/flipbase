import { CurrencyPipe, DatePipe, Location } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { LucideArrowLeft, LucideDynamicIcon, LucidePrinter } from '@lucide/angular';
import { Purchase } from '../../../../core/models/flipbase.models';
import { PurchaseDocumentService } from '../../../../core/services/purchase-document.service';
import { PurchaseService } from '../../../../core/services/purchase.service';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import { buildPurchasePrintModel } from '../../utils/purchase-print';

@Component({
  selector: 'app-purchase-print',
  imports: [CurrencyPipe, DatePipe, LucideDynamicIcon],
  templateUrl: './purchase-print.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class PurchasePrintComponent {
  private readonly location = inject(Location);
  private readonly purchaseService = inject(PurchaseService);
  private readonly documentService = inject(PurchaseDocumentService);
  private readonly workspaceService = inject(WorkspaceService);

  readonly id = input.required<string>();

  readonly printIcon = LucidePrinter;
  readonly backIcon = LucideArrowLeft;
  readonly generatedAt = signal(new Date().toISOString());
  readonly isLoading = signal(false);
  readonly error = signal<string | null>(null);
  private readonly purchase = signal<Purchase | null>(null);
  private loadSequence = 0;

  readonly workspace = computed(() => this.workspaceService.currentWorkspace());
  readonly documentsError = computed(() => this.documentService.loadError());
  readonly model = computed(() => {
    const purchase = this.purchase();
    if (!purchase) return null;
    return buildPurchasePrintModel(
      purchase,
      this.purchaseService.purchaseLines(),
      this.documentService.documents(),
    );
  });

  constructor() {
    effect(() => {
      const purchaseId = this.id();
      const workspaceId = this.workspaceService.currentWorkspace()?.id;
      if (purchaseId && workspaceId) untracked(() => void this.load(purchaseId));
    });
  }

  print(): void {
    window.print();
  }

  back(): void {
    this.location.back();
  }

  private async load(purchaseId: string): Promise<void> {
    const sequence = ++this.loadSequence;
    this.isLoading.set(true);
    this.error.set(null);
    try {
      const [purchase] = await Promise.all([
        this.purchaseService.getPurchaseById(purchaseId),
        this.documentService.loadForPurchase(purchaseId),
      ]);
      if (sequence !== this.loadSequence) return;
      this.purchase.set(purchase);
      this.generatedAt.set(new Date().toISOString());
      if (!purchase) this.error.set('Der Einkauf wurde nicht gefunden.');
    } catch (error) {
      if (sequence !== this.loadSequence) return;
      this.purchase.set(null);
      this.error.set(
        error instanceof Error ? error.message : 'Der Einkauf konnte nicht geladen werden.',
      );
    } finally {
      if (sequence === this.loadSequence) this.isLoading.set(false);
    }
  }
}
