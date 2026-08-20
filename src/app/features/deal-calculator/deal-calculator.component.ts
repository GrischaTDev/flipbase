import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { CurrencyPipe } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import {
  LucideAngularModule,
  Calculator,
  TrendingUp,
  Sparkles,
  ShieldCheck,
  Zap,
  ArrowRight,
  Info,
  Camera,
} from 'lucide-angular';
import {
  ProfitEngineService,
  DealEvaluationResult,
} from '../../core/services/profit-engine.service';
import { WorkspaceService } from '../../core/services/workspace.service';
import { BarcodeLookupService } from '../../core/services/barcode-lookup.service';
import { BarcodeScannerComponent } from '../../shared/components/barcode-scanner/barcode-scanner.component';

@Component({
  selector: 'app-deal-calculator',
  imports: [
    ReactiveFormsModule,
    CurrencyPipe,
    TranslatePipe,
    LucideAngularModule,
    BarcodeScannerComponent,
  ],
  templateUrl: './deal-calculator.component.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DealCalculatorComponent {
  private readonly profitEngine = inject(ProfitEngineService);
  private readonly workspaceService = inject(WorkspaceService);
  private readonly barcodeLookup = inject(BarcodeLookupService);

  readonly calcIcon = Calculator;
  readonly trendingIcon = TrendingUp;
  readonly sparklesIcon = Sparkles;
  readonly shieldIcon = ShieldCheck;
  readonly zapIcon = Zap;
  readonly arrowIcon = ArrowRight;
  readonly infoIcon = Info;
  readonly cameraIcon = Camera;

  readonly isScanningBarcode = signal<boolean>(false);

  readonly form = new FormGroup({
    productTitle: new FormControl('Cube Acid Mountainbike 29"', { nonNullable: true }),
    askingPrice: new FormControl<number>(25, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(0)],
    }),
    fairMarketValue: new FormControl<number>(70, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(0)],
    }),
    estimatedCosts: new FormControl<number>(8, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(0)],
    }),
    condition: new FormControl('used', { nonNullable: true }),
  });

  // State triggered calculation
  readonly evaluation = signal<DealEvaluationResult | null>(null);

  constructor() {
    this.runCalculation();
  }

  async onBarcodeScanned(ean: string): Promise<void> {
    this.isScanningBarcode.set(false);
    const info = await this.barcodeLookup.lookupByEan(ean);
    if (info) {
      this.form.patchValue({
        productTitle: info.title,
        fairMarketValue: info.estimatedPrice || this.form.get('fairMarketValue')?.value,
      });
      this.runCalculation();
    }
  }

  runCalculation(): void {
    const raw = this.form.getRawValue();
    const ws = this.workspaceService.currentWorkspace();
    const minRoi = ws?.min_roi_percent ?? 30;
    const minProfit = ws?.min_profit_amount ?? 15;

    const result = this.profitEngine.evaluateDeal(
      raw.askingPrice,
      raw.fairMarketValue,
      raw.estimatedCosts,
      minRoi,
      minProfit,
      88,
    );

    this.evaluation.set(result);
  }

  getScoreColorClass(score: number): string {
    if (score >= 86) return 'text-emerald-500 bg-emerald-500/10 border-emerald-500/30';
    if (score >= 71) return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
    if (score >= 51) return 'text-amber-500 bg-amber-500/10 border-amber-500/20';
    if (score >= 31) return 'text-orange-500 bg-orange-500/10 border-orange-500/20';
    return 'text-rose-500 bg-rose-500/10 border-rose-500/20';
  }
}
