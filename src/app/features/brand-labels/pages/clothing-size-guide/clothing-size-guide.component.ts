import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { LucideBookOpen, LucideRotateCcw } from '@lucide/angular';
import { PageHeaderComponent } from '../../../../shared/components/page-header/page-header.component';
import { CardComponent } from '../../../../shared/components/card/card.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import { DataTableComponent } from '../../../../shared/components/data-table/data-table.component';
import { CustomSearchInputComponent } from '../../../../shared/components/custom-search-input/custom-search-input.component';
import { CustomSelectComponent } from '../../../../shared/components/custom-select/custom-select.component';
import { NumberInputComponent } from '../../../../shared/components/number-input/number-input.component';
import {
  decodeSizeLabel,
  filterGuideTables,
  readMeasurementError,
  type GuideAudience,
  type GuideCategory,
  type GuideFilters,
  type GuideKind,
  type MeasureKey,
} from '../../models/clothing-size-guide';
import { CLOTHING_SIZE_TABLES } from '../../models/clothing-size-catalog';
import { PublishedSizeReferencesComponent } from './published-size-references.component';

@Component({
  selector: 'app-clothing-size-guide',
  imports: [
    PageHeaderComponent,
    CardComponent,
    ButtonComponent,
    BadgeComponent,
    DataTableComponent,
    CustomSearchInputComponent,
    CustomSelectComponent,
    NumberInputComponent,
    PublishedSizeReferencesComponent,
  ],
  templateUrl: './clothing-size-guide.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ClothingSizeGuideComponent {
  readonly pageIcon = LucideBookOpen;
  readonly resetIcon = LucideRotateCcw;
  readonly category = signal<GuideCategory | ''>('');
  readonly audience = signal<GuideAudience | ''>('');
  readonly brand = signal('');
  readonly query = signal('');
  readonly measurements = signal<GuideFilters['measurements']>({});
  readonly tolerance = signal<number | null>(1);
  readonly publishedBrands = signal<readonly string[]>([]);
  readonly categoryOptions = [
    { value: '', label: 'Alle Kleidungsarten' },
    { value: 'trousers', label: 'Hosen & Jeans' },
    { value: 'tops', label: 'Oberteile & Jacken' },
  ];
  readonly audienceOptions = [
    { value: '', label: 'Damen & Herren' },
    { value: 'women', label: 'Damen' },
    { value: 'men', label: 'Herren' },
    { value: 'unisex', label: 'Unisex' },
  ];
  readonly brandOptions = computed(() => [
    { value: '', label: 'Alle Marken / Systeme' },
    ...Array.from(
      new Set([...CLOTHING_SIZE_TABLES.map((table) => table.brand), ...this.publishedBrands()]),
    )
      .sort((first, second) => first.localeCompare(second, 'de'))
      .map((brand) => ({ value: brand, label: brand })),
  ]);
  readonly measurementFields: readonly {
    key: MeasureKey;
    label: string;
    category: GuideCategory;
  }[] = [
    { key: 'waistFlat', label: 'Bundweite, flach', category: 'trousers' },
    { key: 'inseam', label: 'Innenbeinlänge', category: 'trousers' },
    { key: 'outseam', label: 'Außenbeinlänge', category: 'trousers' },
    { key: 'chestFlat', label: 'Brustweite, flach', category: 'tops' },
  ];
  readonly visibleMeasurementFields = computed(() =>
    this.measurementFields.filter(
      (field) => !this.category() || field.category === this.category(),
    ),
  );
  readonly filters = computed<GuideFilters>(() => ({
    category: this.category(),
    audience: this.audience(),
    brand: this.brand(),
    query: this.query(),
    measurements: this.measurements(),
    tolerance: this.tolerance() ?? Number.NaN,
  }));
  readonly measurementError = computed(() => readMeasurementError(this.filters()));
  readonly hasMeasurements = computed(() =>
    Object.values(this.measurements()).some((measurement) => measurement != null),
  );
  readonly hasSizeMeasurements = computed(
    () => this.measurements().waistFlat != null || this.measurements().chestFlat != null,
  );
  readonly hasLengthMeasurement = computed(() => this.measurements().inseam != null);
  readonly filtersActive = computed(
    () =>
      !!this.category() ||
      !!this.audience() ||
      !!this.brand() ||
      !!this.query().trim() ||
      this.hasMeasurements() ||
      this.tolerance() !== 1,
  );
  readonly decodedLabel = computed(() => decodeSizeLabel(this.query()));
  readonly visibleTables = computed(() => filterGuideTables(CLOTHING_SIZE_TABLES, this.filters()));
  readonly groups = computed(() => {
    const sections: readonly { title: string; description: string; kinds: readonly GuideKind[] }[] =
      [
        {
          title: 'Allgemeine Größenübersicht',
          description:
            'XS, S, M und weitere Größen neben EU/DE, UK, US und ungefähren Kleidungsmaßen.',
          kinds: ['orientation'],
        },
        {
          title: 'Labelgrößen vergleichen',
          description:
            'EU/DE, UK, US und Buchstabengrößen nach Hersteller. Körpermaße dienen hier nur dem Nachschlagen eines Labels und werden nicht mit Deiner gemessenen Ware verglichen.',
          kinds: ['conversion', 'body'],
        },
        {
          title: 'Jeanslängen und besondere Größen',
          description:
            'Inch-Angaben, Kurz- und Langgrößen sowie weitere Größenreihen. Die Bedeutung bleibt an das jeweilige System gebunden.',
          kinds: ['length', 'special'],
        },
      ];
    return sections
      .map((section) => ({
        ...section,
        tables: this.visibleTables()
          .filter((entry) => section.kinds.includes(entry.table.kind))
          .sort(
            (first, second) =>
              Number(first.table.category === 'tops') - Number(second.table.category === 'tops'),
          ),
      }))
      .filter((section) => section.tables.length > 0);
  });
  readonly rowCount = computed(() =>
    this.visibleTables().reduce((total, entry) => total + entry.rows.length, 0),
  );
  readonly sizeEstimateCount = computed(() =>
    this.visibleTables()
      .filter((entry) => entry.table.kind === 'orientation')
      .reduce((total, entry) => total + entry.matchedRowIds.length, 0),
  );
  readonly lengthMatchCount = computed(() =>
    this.visibleTables()
      .filter((entry) => entry.table.kind === 'length')
      .reduce((total, entry) => total + entry.matchedRowIds.length, 0),
  );
  readonly audienceNames: Record<GuideAudience, string> = {
    women: 'Damen',
    men: 'Herren',
    unisex: 'Unisex',
  };
  readonly kindNames: Record<GuideKind, string> = {
    orientation: 'Richtbereiche',
    body: 'Körpermaße · nur Label-Nachschlagen',
    conversion: 'Größenvergleich',
    length: 'Längen / Inch',
    special: 'Besondere Größen',
  };

  setCategory(selected: string | null): void {
    if (selected !== '' && selected !== 'trousers' && selected !== 'tops') return;
    this.category.set(selected);
    this.measurements.update((measurements) =>
      Object.fromEntries(
        Object.entries(measurements).filter(([key]) =>
          this.measurementFields.some(
            (field) => field.key === key && (!selected || field.category === selected),
          ),
        ),
      ),
    );
  }

  setAudience(selected: string | null): void {
    if (selected === '' || selected === 'women' || selected === 'men' || selected === 'unisex')
      this.audience.set(selected);
  }

  setMeasurement(key: MeasureKey, measurement: number | null): void {
    this.measurements.update((measurements) => ({ ...measurements, [key]: measurement }));
  }

  formatCentimeters(centimeters: number): string {
    return centimeters.toLocaleString('de-DE', { maximumFractionDigits: 2 });
  }

  resetFilters(): void {
    this.category.set('');
    this.audience.set('');
    this.brand.set('');
    this.query.set('');
    this.measurements.set({});
    this.tolerance.set(1);
  }
}
