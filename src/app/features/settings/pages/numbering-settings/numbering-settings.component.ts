import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import { NumberingService } from '../../services/numbering.service';
import {
  defaultNumberSeries,
  NumberedEntity,
  NumberSeries,
  previewNumberSeries,
} from '../../models/numbering.models';
import {
  CustomSelectComponent,
  SelectOption,
} from '../../../../shared/components/custom-select/custom-select.component';
import { CustomCheckboxComponent } from '../../../../shared/components/custom-checkbox/custom-checkbox.component';
import { NumberInputComponent } from '../../../../shared/components/number-input/number-input.component';
import { TextFieldComponent } from '../../../../shared/components/text-field/text-field.component';

@Component({
  selector: 'app-numbering-settings',
  imports: [
    ReactiveFormsModule,
    CustomSelectComponent,
    CustomCheckboxComponent,
    NumberInputComponent,
    TextFieldComponent,
  ],
  templateUrl: './numbering-settings.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block', '(window:beforeunload)': 'beforeUnload($event)' },
})
export class NumberingSettingsComponent {
  readonly separatorOptions: readonly SelectOption<string>[] = [
    { value: ' ', label: 'Leerzeichen' },
    { value: '-', label: 'Bindestrich' },
    { value: '/', label: 'Schrägstrich' },
    { value: '.', label: 'Punkt' },
    { value: '', label: 'Keines' },
  ];
  private readonly workspace = inject(WorkspaceService);
  private readonly numbering = inject(NumberingService);
  private readonly destroyRef = inject(DestroyRef);
  private requestVersion = 0;
  private loadedWorkspaceId: string | null = null;
  private series: NumberSeries[] = [];
  readonly entity = signal<NumberedEntity>('purchase');
  readonly isLoading = signal(false);
  readonly isSaving = signal(false);
  readonly canEdit = signal(false);
  readonly error = signal('');
  readonly success = signal('');
  readonly dirty = signal(false);
  readonly form = new FormGroup({
    label: new FormControl('Einkäufe', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(80)],
    }),
    prefix: new FormControl('B', { nonNullable: true, validators: [Validators.maxLength(30)] }),
    separator: new FormControl(' ', { nonNullable: true }),
    include_year: new FormControl(true, { nonNullable: true }),
    minimum_digits: new FormControl(2, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(1), Validators.max(12)],
    }),
    start_value: new FormControl(1, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(1), Validators.max(999999999999)],
    }),
    reset_yearly: new FormControl(false, { nonNullable: true }),
    timezone: new FormControl('Europe/Berlin', {
      nonNullable: true,
      validators: [Validators.required],
    }),
  });
  private readonly formValue = signal(this.form.getRawValue());
  readonly previews = computed(() =>
    previewNumberSeries(this.formValue(), this.formValue().timezone),
  );
  readonly invalidReset = computed(
    () => this.formValue().reset_yearly && !this.formValue().include_year,
  );

  constructor() {
    this.form.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.formValue.set(this.form.getRawValue());
      this.dirty.set(this.form.dirty);
      this.success.set('');
    });
    effect(() => {
      const id = this.workspace.currentWorkspace()?.id ?? null;
      this.loadedWorkspaceId = id;
      void this.load(id);
    });
  }

  hasUnsavedChanges(): boolean {
    return this.dirty();
  }
  beforeUnload(event: BeforeUnloadEvent): void {
    if (this.hasUnsavedChanges() || this.isSaving()) event.preventDefault();
  }

  async load(id = this.loadedWorkspaceId): Promise<void> {
    const version = ++this.requestVersion;
    this.isLoading.set(true);
    this.canEdit.set(false);
    this.error.set('');
    this.series = [];
    this.resetForm('Europe/Berlin');
    if (!id) {
      this.isLoading.set(false);
      return;
    }
    try {
      const result = await this.numbering.load(id);
      if (version !== this.requestVersion) return;
      this.series = result.series;
      this.canEdit.set(result.can_edit);
      this.resetForm(result.timezone);
    } catch {
      if (version === this.requestVersion)
        this.error.set('Nummernkreise konnten nicht geladen werden. Bitte erneut versuchen.');
    } finally {
      if (version === this.requestVersion) this.isLoading.set(false);
    }
  }

  selectEntity(entity: NumberedEntity): void {
    if (this.isSaving() || entity === this.entity()) return;
    if (this.dirty() && !globalThis.confirm('Ungespeicherte Änderungen verwerfen?')) return;
    this.entity.set(entity);
    this.resetForm(this.savedTimezone);
    this.error.set('');
    this.success.set('');
  }

  discard(): void {
    this.resetForm(this.savedTimezone);
  }
  private savedTimezone = 'Europe/Berlin';
  private resetForm(timezone: string): void {
    this.savedTimezone = timezone;
    const config =
      this.series.find((item) => item.entity_type === this.entity()) ??
      defaultNumberSeries(this.entity());
    this.form.reset({ ...config, timezone });
    this.formValue.set(this.form.getRawValue());
    this.dirty.set(false);
  }

  async save(): Promise<void> {
    if (
      !this.canEdit() ||
      this.isSaving() ||
      this.form.invalid ||
      this.invalidReset() ||
      !this.previews().length
    )
      return;
    const id = this.loadedWorkspaceId;
    if (!id) return;
    const request = this.requestVersion;
    const entity = this.entity();
    const { timezone, ...configuration } = this.form.getRawValue();
    const version = this.series.find((item) => item.entity_type === entity)?.version ?? 0;
    this.isSaving.set(true);
    this.error.set('');
    try {
      const saved = await this.numbering.save(id, entity, configuration, timezone, version);
      if (request !== this.requestVersion) return;
      this.series = [...this.series.filter((item) => item.entity_type !== entity), saved];
      this.resetForm(timezone);
      this.success.set('Nummernkreis gespeichert. Bereits vergebene Nummern bleiben unverändert.');
    } catch (error: unknown) {
      if (request === this.requestVersion)
        this.error.set(
          error && typeof error === 'object' && 'message' in error
            ? String(error.message)
            : 'Speichern fehlgeschlagen. Bitte erneut versuchen.',
        );
    } finally {
      this.isSaving.set(false);
    }
  }
}
