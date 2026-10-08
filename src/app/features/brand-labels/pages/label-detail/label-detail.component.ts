import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { LucideArrowLeft, LucideTag } from '@lucide/angular';
import { PageHeaderComponent } from '../../../../shared/components/page-header/page-header.component';
import { CardComponent } from '../../../../shared/components/card/card.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { LabelImageComponent } from '../../components/label-image/label-image.component';
import { labelFiltersToQueryParams, normalizeLabelFilters } from '../../models/brand-label-filters';
import type { LabelInterval, LabelEvidenceLevel } from '../../models/brand-label.models';
import { BrandLabelReaderState } from '../../services/brand-label-reader-state';

@Component({
  selector: 'app-label-detail',
  imports: [DatePipe, PageHeaderComponent, CardComponent, ButtonComponent, LabelImageComponent],
  providers: [BrandLabelReaderState],
  templateUrl: './label-detail.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LabelDetailComponent {
  readonly state = inject(BrandLabelReaderState);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly tagIcon = LucideTag;
  readonly backIcon = LucideArrowLeft;
  readonly backQueryParams = signal<Record<string, string>>({});
  readonly evidenceLabels: Readonly<Record<LabelEvidenceLevel, string>> = {
    'well-supported': 'Gut belegt',
    'partially-supported': 'Teilweise belegt',
    undated: 'Nicht datiert',
  };

  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      this.state.show(params.get('brand') ?? '', params.get('label') ?? '');
    });
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      this.backQueryParams.set(
        labelFiltersToQueryParams(
          normalizeLabelFilters(
            {
              brand: params.get('brand') ?? undefined,
              q: params.get('q') ?? undefined,
              decade: params.get('decade') ?? undefined,
              kind: params.get('kind') ?? undefined,
            },
            new Date().getFullYear(),
          ),
        ),
      );
    });
  }
  intervalLabel(interval: LabelInterval): string {
    if (interval.startYear === null && interval.endYear === null) return 'Nicht datiert';
    if (interval.startYear === null) return `Bis ${interval.endYear}`;
    if (interval.endYear === null) return `Ab ${interval.startYear}`;
    return interval.startYear === interval.endYear
      ? String(interval.startYear)
      : `${interval.startYear}–${interval.endYear}`;
  }
  sourceAnchor(sourceId: string): string {
    return `${this.router.url.split('#', 1)[0]}#label-source-${encodeURIComponent(sourceId)}`;
  }
}
