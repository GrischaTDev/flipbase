import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import {
  LucideAngularModule,
  Search,
  Sparkles,
  Zap,
  Tag,
  Calculator,
  ExternalLink,
  PlusCircle,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  Sliders,
  History,
  ShieldCheck,
  Percent,
} from 'lucide-angular';
import {
  ResearchService,
  ResearchComparisonItem,
  ResearchSummary,
} from '../../core/services/research.service';

@Component({
  selector: 'app-research',
  imports: [
    RouterLink,
    ReactiveFormsModule,
    CurrencyPipe,
    DatePipe,
    TranslatePipe,
    LucideAngularModule,
  ],
  templateUrl: './research.component.html',
  styleUrl: './research.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResearchComponent {
  readonly researchService = inject(ResearchService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly searchIcon = Search;
  readonly sparklesIcon = Sparkles;
  readonly zapIcon = Zap;
  readonly tagIcon = Tag;
  readonly calcIcon = Calculator;
  readonly linkIcon = ExternalLink;
  readonly plusIcon = PlusCircle;
  readonly trendingIcon = TrendingUp;
  readonly alertIcon = AlertCircle;
  readonly checkIcon = CheckCircle2;
  readonly slidersIcon = Sliders;
  readonly historyIcon = History;
  readonly shieldIcon = ShieldCheck;
  readonly percentIcon = Percent;

  readonly searchForm = new FormGroup({
    query: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    condition: new FormControl('used', { nonNullable: true }),
    estimatedCost: new FormControl<number>(25.0, { nonNullable: true }),
  });

  readonly summary = signal<ResearchSummary | null>(null);
  readonly hasSearched = signal<boolean>(false);

  constructor() {
    // Check if query was passed via route query param (e.g. from Inventory Detail)
    this.route.queryParams.subscribe((params) => {
      const q = params['query'];
      if (q) {
        this.searchForm.patchValue({ query: q });
        this.onSearch();
      }
    });
  }

  async onSearch(): Promise<void> {
    const f = this.searchForm.getRawValue();
    if (!f.query.trim()) return;

    this.hasSearched.set(true);
    const { summary } = await this.researchService.executeResearch(
      f.query.trim(),
      f.condition,
      f.estimatedCost
    );
    this.summary.set(summary);
  }

  onToggleItem(item: ResearchComparisonItem): void {
    this.researchService.toggleExcludeItem(item.id);
    const f = this.searchForm.getRawValue();
    const updatedSummary = this.researchService.calculateSummary(
      this.researchService.currentComparisonItems(),
      f.estimatedCost
    );
    this.summary.set(updatedSummary);
  }

  openInDealCalculator(): void {
    const s = this.summary();
    const f = this.searchForm.getRawValue();
    if (!s) return;

    this.router.navigate(['/deal-calculator'], {
      queryParams: {
        itemTitle: f.query,
        buyPrice: f.estimatedCost,
        expectedPrice: s.medianPrice,
      },
    });
  }
}
