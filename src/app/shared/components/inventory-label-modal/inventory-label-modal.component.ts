import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import {
  LucideDynamicIcon,
  LucidePrinter as Printer,
  LucideX as X,
  LucideTag as Tag,
  LucideQrCode as QrCode,
  LucideBarcode as Barcode,
  LucideSliders as Sliders,
  LucideCheckCircle2 as CheckCircle2,
} from '@lucide/angular';
import { InventoryItem } from '../../../core/models/flipbase.models';
import { CustomCheckboxComponent } from '../custom-checkbox/custom-checkbox.component';
import { ModalDialogDirective } from '../../../shared/directives/modal-dialog.directive';
import { BarcodeComponent } from '../barcode/barcode.component';

export type LabelFormat = 'compact' | 'standard' | 'large';

@Component({
  selector: 'app-inventory-label-modal',
  imports: [
    BarcodeComponent,
    ModalDialogDirective,
    CurrencyPipe,
    DatePipe,
    LucideDynamicIcon,
    CustomCheckboxComponent,
  ],
  templateUrl: './inventory-label-modal.component.html',
  styleUrl: './inventory-label-modal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InventoryLabelModalComponent {
  readonly items = input.required<InventoryItem[]>();
  readonly closed = output<void>();

  readonly printerIcon = Printer;
  readonly closeIcon = X;
  readonly tagIcon = Tag;
  readonly qrIcon = QrCode;
  readonly barcodeIcon = Barcode;
  readonly slidersIcon = Sliders;
  readonly checkIcon = CheckCircle2;

  readonly selectedFormat = signal<LabelFormat>('standard');
  readonly showQrCode = signal<boolean>(true);
  readonly showBarcode = signal<boolean>(true);
  readonly showPrice = signal<boolean>(true);
  readonly showDate = signal<boolean>(true);

  setFormat(fmt: LabelFormat): void {
    this.selectedFormat.set(fmt);
  }

  toggleQrCode(): void {
    this.showQrCode.update((v) => !v);
  }

  toggleBarcode(): void {
    this.showBarcode.update((v) => !v);
  }

  togglePrice(): void {
    this.showPrice.update((v) => !v);
  }

  toggleDate(): void {
    this.showDate.update((v) => !v);
  }

  getConditionLabel(cond?: string): string {
    switch (cond) {
      case 'new':
        return 'Neu (OVP)';
      case 'like_new':
        return 'Wie neu';
      case 'very_good':
        return 'Sehr gut';
      case 'good':
        return 'Gut';
      case 'acceptable':
        return 'Akzeptabel';
      case 'defective':
        return 'Defekt';
      default:
        return cond || 'Gebraucht';
    }
  }

  printLabels(): void {
    window.print();
  }
}
