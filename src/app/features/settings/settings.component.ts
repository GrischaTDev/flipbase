import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  LucideAngularModule,
  Settings,
  Download,
  Save,
  CheckCircle2,
  FileSpreadsheet,
  Database,
  Globe,
  DollarSign,
  Percent,
  Sliders,
  ShieldCheck,
} from 'lucide-angular';
import { WorkspaceService } from '../../core/services/workspace.service';
import { ExportService } from '../../core/services/export.service';
import { SalesService } from '../../core/services/sales.service';
import { PurchaseService } from '../../core/services/purchase.service';
import { InventoryService } from '../../core/services/inventory.service';

@Component({
  selector: 'app-settings',
  imports: [ReactiveFormsModule, TranslatePipe, LucideAngularModule],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsComponent {
  readonly workspaceService = inject(WorkspaceService);
  readonly exportService = inject(ExportService);
  readonly salesService = inject(SalesService);
  readonly purchaseService = inject(PurchaseService);
  readonly inventoryService = inject(InventoryService);
  readonly translate = inject(TranslateService);

  readonly settingsIcon = Settings;
  readonly downloadIcon = Download;
  readonly saveIcon = Save;
  readonly checkIcon = CheckCircle2;
  readonly csvIcon = FileSpreadsheet;
  readonly dbIcon = Database;
  readonly globeIcon = Globe;
  readonly dollarIcon = DollarSign;
  readonly percentIcon = Percent;
  readonly slidersIcon = Sliders;
  readonly shieldIcon = ShieldCheck;

  readonly isSaving = signal<boolean>(false);
  readonly saveSuccess = signal<boolean>(false);

  readonly form = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    currency: new FormControl('EUR', { nonNullable: true, validators: [Validators.required] }),
    min_roi_percent: new FormControl<number>(30, { nonNullable: true, validators: [Validators.required, Validators.min(0)] }),
    min_profit_amount: new FormControl<number>(15, { nonNullable: true, validators: [Validators.required, Validators.min(0)] }),
  });

  constructor() {
    effect(() => {
      const ws = this.workspaceService.currentWorkspace();
      if (ws) {
        this.form.patchValue({
          name: ws.name,
          currency: ws.currency || 'EUR',
          min_roi_percent: ws.min_roi_percent,
          min_profit_amount: ws.min_profit_amount,
        });
      }
    });
  }

  async onSaveSettings(): Promise<void> {
    const ws = this.workspaceService.currentWorkspace();
    if (!ws || this.form.invalid) return;

    this.isSaving.set(true);
    this.saveSuccess.set(false);

    const f = this.form.getRawValue();
    await this.workspaceService.updateWorkspaceSettings(ws.id, {
      name: f.name,
      min_roi_percent: f.min_roi_percent,
      min_profit_amount: f.min_profit_amount,
    });

    this.isSaving.set(false);
    this.saveSuccess.set(true);
    setTimeout(() => this.saveSuccess.set(false), 3000);
  }

  exportSalesCsv(): void {
    const csv = this.exportService.generateSalesCsv(this.salesService.sales());
    const date = new Date().toISOString().split('T')[0];
    this.exportService.downloadFile(csv, `reflip-verkaeufe-${date}.csv`, 'text/csv;charset=utf-8;');
  }

  exportPurchasesCsv(): void {
    const csv = this.exportService.generatePurchasesCsv(this.purchaseService.purchases());
    const date = new Date().toISOString().split('T')[0];
    this.exportService.downloadFile(csv, `reflip-einkaeufe-${date}.csv`, 'text/csv;charset=utf-8;');
  }

  exportInventoryCsv(): void {
    const csv = this.exportService.generateInventoryCsv(this.inventoryService.items());
    const date = new Date().toISOString().split('T')[0];
    this.exportService.downloadFile(csv, `reflip-inventar-${date}.csv`, 'text/csv;charset=utf-8;');
  }

  exportJsonBackup(): void {
    const json = this.exportService.generateJsonBackup(
      this.workspaceService.currentWorkspace(),
      this.purchaseService.purchases(),
      this.inventoryService.items(),
      this.salesService.sales()
    );
    const date = new Date().toISOString().split('T')[0];
    this.exportService.downloadFile(json, `reflip-backup-${date}.json`, 'application/json');
  }

  changeLanguage(lang: string): void {
    this.translate.use(lang);
  }
}
