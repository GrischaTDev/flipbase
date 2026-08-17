import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
  signal,
} from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import {
  LucideAngularModule,
  Printer,
  X,
  Tag,
  QrCode,
  Barcode,
  Sliders,
  CheckCircle2,
} from 'lucide-angular';
import { InventoryItem } from '../../../core/models/reflip.models';

export type LabelFormat = 'compact' | 'standard' | 'large';

@Component({
  selector: 'app-inventory-label-modal',
  imports: [CurrencyPipe, DatePipe, LucideAngularModule],
  templateUrl: './inventory-label-modal.component.html',
  styleUrl: './inventory-label-modal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InventoryLabelModalComponent {
  readonly items = input.required<InventoryItem[]>();
  readonly close = output<void>();

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
