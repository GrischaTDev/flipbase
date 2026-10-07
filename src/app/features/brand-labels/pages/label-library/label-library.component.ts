import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { LucideBookOpen, LucideRotateCcw, LucideSearch } from '@lucide/angular';
import { PageHeaderComponent } from '../../../../shared/components/page-header/page-header.component';
import { CardComponent } from '../../../../shared/components/card/card.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { TextFieldComponent } from '../../../../shared/components/text-field/text-field.component';
import {
  CustomSelectComponent,
  type SelectOption,
} from '../../../../shared/components/custom-select/custom-select.component';
import { ProductThumbnailComponent } from '../../../../shared/components/product-thumbnail/product-thumbnail.component';
import { normalizeLabelFilters, labelFiltersToQueryParams } from '../../models/brand-label-filters';
import type { LabelCard } from '../../models/brand-label.models';
import { BrandLabelReaderState } from '../../services/brand-label-reader-state';

@Component({
  selector: 'app-label-library',
  imports: [
    ReactiveFormsModule,
    PageHeaderComponent,
    CardComponent,
    ButtonComponent,
    TextFieldComponent,
    CustomSelectComponent,
    ProductThumbnailComponent,
  ],
  providers: [BrandLabelReaderState],
  templateUrl: './label-library.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LabelLibraryComponent {
  readonly state = inject(BrandLabelReaderState);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly currentYear = new Date().getFullYear();
  readonly bookIcon = LucideBookOpen;
  readonly searchIcon = LucideSearch;
  readonly resetIcon = LucideRotateCcw;
  readonly queryParams = signal<Record<string, string>>({});
  readonly form = new FormGroup({
    brand: new FormControl('', { nonNullable: true }),
    query: new FormControl('', { nonNullable: true }),
    decade: new FormControl('', { nonNullable: true }),
    kind: new FormControl('', { nonNullable: true }),
  });
  // Inhaltsumfang des Piloten, keine behauptete Verfügbarkeit bestimmter Nike-Labels.
  readonly brandOptions: readonly SelectOption<string>[] = [
    { value: '', label: 'Alle Marken' },
    { value: 'nike', label: 'Nike' },
  ];
  readonly kindOptions: readonly SelectOption<string>[] = [
    { value: '', label: 'Alle Labelarten' },
    { value: 'neck-label', label: 'Nackenlabel' },
    { value: 'care-size-label', label: 'Pflege- und Größenlabel' },
  ];
  readonly decadeOptions: readonly SelectOption<string>[] = [
    { value: '', label: 'Alle Zeiträume' },
    { value: 'unknown', label: 'Nicht datiert' },
    ...Array.from({ length: Math.floor(this.currentYear / 10) - 190 + 1 }, (_, index) => {
      const year = 1900 + index * 10;
      return { value: String(year), label: `${year}er` };
    }).reverse(),
  ];

  constructor() {
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      const filter = normalizeLabelFilters(
        {
          brand: params.get('brand') ?? undefined,
          q: params.get('q') ?? undefined,
          decade: params.get('decade') ?? undefined,
          kind: params.get('kind') ?? undefined,
        },
        this.currentYear,
      );
      this.form.setValue(
        {
          brand: filter.brandSlug ?? '',
          query: filter.query,
          decade: filter.decade === null ? '' : String(filter.decade),
          kind: filter.kind ?? '',
        },
        { emitEvent: false },
      );
      this.queryParams.set(labelFiltersToQueryParams(filter));
      this.state.search(filter);
    });
  }
  applyFilters(): void {
    const value = this.form.getRawValue();
    const filter = normalizeLabelFilters(
      { brand: value.brand, q: value.query, decade: value.decade, kind: value.kind },
      this.currentYear,
    );
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: labelFiltersToQueryParams(filter),
    });
  }
  resetFilters(): void {
    this.form.setValue({ brand: '', query: '', decade: '', kind: '' }, { emitEvent: false });
    this.applyFilters();
  }
  detailLink(card: LabelCard): string {
    return `/tools/brand-labels/${encodeURIComponent(card.brandSlug)}/${encodeURIComponent(card.labelSlug)}`;
  }
}
