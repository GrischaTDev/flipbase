import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import {
  AbstractControl,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { RouterLink } from '@angular/router';
import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { CardComponent } from '../../../../shared/components/card/card.component';
import { DataTableComponent } from '../../../../shared/components/data-table/data-table.component';
import { NumberInputComponent } from '../../../../shared/components/number-input/number-input.component';
import {
  VINTED_FEED_SETTING_LIMITS,
  VintedFeedCapacity,
  VintedFeedSource,
  sourceAgeLabel,
  sourceCoverageStatus,
  sourceKindLabel,
} from '../../models/vinted-feed-sources';
import { VintedFeedSourcesService } from '../../services/vinted-feed-sources.service';

export const VINTED_FEED_SOURCES_REFRESH_MS = 30_000;

function wholeNumber(control: AbstractControl): ValidationErrors | null {
  const value = control.value as number | null;
  return value === null || Number.isInteger(value) ? null : { wholeNumber: true };
}

function limitValidators(limits: { min: number; max: number }) {
  return [Validators.required, Validators.min(limits.min), Validators.max(limits.max), wholeNumber];
}

@Component({
  selector: 'app-vinted-feed-sources-card',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    BadgeComponent,
    ButtonComponent,
    CardComponent,
    DataTableComponent,
    NumberInputComponent,
  ],
  templateUrl: './vinted-feed-sources-card.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VintedFeedSourcesCardComponent {
  private readonly api = inject(VintedFeedSourcesService);
  private readonly destroyRef = inject(DestroyRef);
  private loadRequest: Promise<void> | null = null;

  readonly limits = VINTED_FEED_SETTING_LIMITS;
  readonly capacity = signal<VintedFeedCapacity | null>(null);
  readonly loading = signal(false);
  readonly loadError = signal<string | null>(null);
  readonly saving = signal(false);
  readonly saveError = signal<string | null>(null);
  readonly saveAttempted = signal(false);
  readonly now = signal(Date.now());

  readonly settingsForm = new FormGroup({
    maxCategorySources: new FormControl<number | null>(
      null,
      limitValidators(VINTED_FEED_SETTING_LIMITS.maxCategorySources),
    ),
    categoryPollIntervalSeconds: new FormControl<number | null>(
      null,
      limitValidators(VINTED_FEED_SETTING_LIMITS.categoryPollIntervalSeconds),
    ),
  });

  readonly sources = computed(() => this.capacity()?.sources ?? []);

  constructor() {
    void this.load();
    const timer = setInterval(() => void this.load(), VINTED_FEED_SOURCES_REFRESH_MS);
    this.destroyRef.onDestroy(() => clearInterval(timer));
  }

  /** Lädt Quellen und Auslastung; parallele Aufrufe teilen sich eine Anfrage. */
  load(): Promise<void> {
    if (this.loadRequest) return this.loadRequest;
    if (this.destroyRef.destroyed) return Promise.resolve();
    this.loadRequest = this.readAll().finally(() => {
      this.loadRequest = null;
    });
    return this.loadRequest;
  }

  private async readAll(): Promise<void> {
    this.loading.set(true);
    try {
      const capacity = await this.api.capacity();
      if (this.destroyRef.destroyed) return;
      this.now.set(Date.now());
      this.capacity.set(capacity);
      this.loadError.set(null);
      if (this.settingsForm.pristine && !this.saving()) this.fillSettings(capacity);
    } catch (error) {
      if (this.destroyRef.destroyed) return;
      this.now.set(Date.now());
      this.loadError.set(errorMessage(error, 'Die Vinted-Quellen konnten nicht geladen werden.'));
    } finally {
      if (!this.destroyRef.destroyed) this.loading.set(false);
    }
  }

  private fillSettings(capacity: VintedFeedCapacity): void {
    this.settingsForm.reset({
      maxCategorySources: capacity.maxCategorySources,
      categoryPollIntervalSeconds: capacity.categoryPollIntervalSeconds,
    });
  }

  fieldError(control: 'maxCategorySources' | 'categoryPollIntervalSeconds'): string | null {
    const field = this.settingsForm.controls[control];
    if (!field.invalid || !(this.saveAttempted() || field.touched)) return null;
    const { min, max } = this.limits[control];
    return `Bitte gib eine ganze Zahl von ${min} bis ${max} ein.`;
  }

  async saveSettings(): Promise<void> {
    if (this.saving()) return;
    this.saveAttempted.set(true);
    this.settingsForm.markAllAsTouched();
    const { maxCategorySources, categoryPollIntervalSeconds } = this.settingsForm.getRawValue();
    if (
      this.settingsForm.invalid ||
      maxCategorySources === null ||
      categoryPollIntervalSeconds === null
    )
      return;
    this.saving.set(true);
    this.saveError.set(null);
    try {
      await this.api.saveSettings({ maxCategorySources, categoryPollIntervalSeconds });
      if (this.destroyRef.destroyed) return;
      this.saveAttempted.set(false);
      this.settingsForm.markAsPristine();
      this.settingsForm.markAsUntouched();
      this.capacity.update((current) =>
        current ? { ...current, maxCategorySources, categoryPollIntervalSeconds } : current,
      );
    } catch (error) {
      if (!this.destroyRef.destroyed)
        this.saveError.set(
          errorMessage(error, 'Die Einstellungen konnten nicht gespeichert werden.'),
        );
    } finally {
      if (!this.destroyRef.destroyed) this.saving.set(false);
    }
  }

  kindLabel(source: VintedFeedSource): string {
    return sourceKindLabel(source.kind);
  }

  coverage(source: VintedFeedSource) {
    return sourceCoverageStatus(source.coverage);
  }

  age(source: VintedFeedSource): string {
    return sourceAgeLabel(source.lastSuccessAt, this.now());
  }
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}
