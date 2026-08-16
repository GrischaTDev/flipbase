import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { CurrencyPipe } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import { LucideAngularModule, Search, Sparkles, TrendingUp, CheckCircle, ExternalLink } from 'lucide-angular';
import { ProfitEngineService } from '../../core/services/profit-engine.service';
import { ResearchComparable } from '../../core/models/reflip.models';

@Component({
  selector: 'app-research',
  imports: [ReactiveFormsModule, CurrencyPipe, TranslatePipe, LucideAngularModule],
  templateUrl: './research.component.html',
  styleUrl: './research.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResearchComponent {
  private readonly profitEngine = inject(ProfitEngineService);

  readonly searchIcon = Search;
  readonly sparklesIcon = Sparkles;
  readonly trendingIcon = TrendingUp;
  readonly checkIcon = CheckCircle;
  readonly linkIcon = ExternalLink;

  readonly isSearching = signal<boolean>(false);

  readonly searchForm = new FormGroup({
    query: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
  });

  readonly sampleComparables = signal<ResearchComparable[]>([
    {
      title: 'Bosch Akkuschrauber GSR 18V-55 Solo im L-Boxx',
      platform: 'kleinanzeigen',
      price: 69.00,
      condition: 'Sehr gut',
      is_sold: true,
      sold_at: '2026-08-10',
      similarity_score: 95,
      url: '#',
    },
    {
      title: 'Bosch Professional GSR 18V-55 Akku Bohrschrauber',
      platform: 'ebay',
      price: 74.50,
      condition: 'Gebraucht',
      is_sold: true,
      sold_at: '2026-08-12',
      similarity_score: 90,
      url: '#',
    },
    {
      title: 'Bosch GSR 18V-55 Akkuschrauber neuwertig',
      platform: 'vinted',
      price: 70.00,
      condition: 'Wie neu',
      is_sold: false,
      listed_at: '2026-08-14',
      similarity_score: 85,
      url: '#',
    },
  ]);

  onSearch(): void {
    if (this.searchForm.invalid) return;
    this.isSearching.set(true);
    setTimeout(() => {
      this.isSearching.set(false);
    }, 500);
  }
}
