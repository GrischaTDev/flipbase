import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { CustomCheckboxComponent } from '../../../../shared/components/custom-checkbox/custom-checkbox.component';
import {
  CustomSelectComponent,
  type SelectOption,
} from '../../../../shared/components/custom-select/custom-select.component';
import { ModalShellComponent } from '../../../../shared/components/modal-shell/modal-shell.component';
import { NoticeBannerComponent } from '../../../../shared/components/notice-banner/notice-banner.component';
import {
  parseVintedListingCategoryFields,
  type VintedListingCategoryFields,
  type VintedListingChoice,
} from '../../models/vinted-listing-category-fields';
import type { VintedListingContent } from '../../models/vinted-listing-content';
import {
  buildVintedListingFieldSelection,
  type VintedListingFieldSelection,
} from '../../models/vinted-listing-field-selection';
import { VintedListingCategoryService } from '../../services/vinted-listing-category.service';

type SingleField = 'size' | 'condition' | 'package';
type MultipleField = 'color' | 'material';
const singles = [
  { name: 'size', control: 'sizeId', label: 'Größe' },
  { name: 'condition', control: 'conditionId', label: 'Zustand' },
  { name: 'package', control: 'packageSizeId', label: 'Paketgröße' },
] as const;
const multiples = [
  { name: 'color', label: 'Farben', maximum: 2 },
  { name: 'material', label: 'Materialien', maximum: 3 },
] as const;

@Component({
  selector: 'app-vinted-listing-fields-dialog',
  templateUrl: './vinted-listing-fields-dialog.component.html',
  imports: [
    ReactiveFormsModule,
    ButtonComponent,
    CustomCheckboxComponent,
    CustomSelectComponent,
    ModalShellComponent,
    NoticeBannerComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VintedListingFieldsDialogComponent {
  readonly scopeKey = input.required<string>();
  readonly connectionId = input.required<string>();
  readonly categoryId = input.required<number>();
  readonly content = input.required<VintedListingContent>();
  readonly disabled = input(false);
  readonly selected = output<VintedListingFieldSelection>();
  readonly closed = output<void>();
  readonly schema = signal<VintedListingCategoryFields | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly initialContent = signal<VintedListingContent | null>(null);
  readonly form = new FormGroup({
    sizeId: new FormControl<number | null>(null),
    conditionId: new FormControl<number | null>(null),
    packageSizeId: new FormControl<number | null>(null),
  });
  readonly colorIds = signal<readonly number[]>([]);
  readonly materialIds = signal<readonly number[]>([]);
  readonly singleFields = computed(() =>
    singles.filter((field) => this.schema()?.fields.some((value) => value.field === field.name)),
  );
  readonly multipleFields = computed(() =>
    multiples.filter((field) => this.schema()?.fields.some((value) => value.field === field.name)),
  );
  readonly canApply = computed(() => !!this.schema() && !this.loading() && !this.disabled());
  private readonly api = inject(VintedListingCategoryService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly binding = computed(() =>
    JSON.stringify([this.scopeKey(), this.connectionId(), this.categoryId()]),
  );
  private loadedBinding: string | null = null;
  private generation = 0;
  private closing = false;

  constructor() {
    effect(() => {
      const binding = this.binding();
      untracked(() => {
        if (binding === this.loadedBinding) return;
        this.loadedBinding = binding;
        this.closing = false;
        this.generation++;
        this.loading.set(false);
        this.schema.set(null);
        this.initialContent.set(this.content());
        void this.load();
      });
    });
    this.destroyRef.onDestroy(() => this.generation++);
  }
  async load(): Promise<void> {
    const binding = this.binding();
    if (
      this.closing ||
      this.destroyRef.destroyed ||
      this.disabled() ||
      this.loading() ||
      binding !== this.loadedBinding
    )
      return;
    const generation = ++this.generation;
    const categoryId = this.categoryId();
    this.schema.set(null);
    this.error.set(null);
    this.loading.set(true);
    try {
      const schema = parseVintedListingCategoryFields(
        await this.api.read(this.connectionId(), categoryId),
        categoryId,
      );
      if (!this.current(generation, binding)) return;
      this.schema.set(schema);
      this.prefill(schema);
    } catch (error) {
      if (this.current(generation, binding))
        this.error.set(
          error instanceof Error
            ? error.message
            : 'Die Vinted-Angaben konnten nicht geladen werden. Versuche es erneut.',
        );
    } finally {
      if (this.current(generation, binding)) this.loading.set(false);
    }
  }
  choices(field: SingleField | MultipleField): readonly VintedListingChoice[] {
    return (
      this.schema()
        ?.fields.find((value) => value.field === field)
        ?.choices.filter((choice) => !choice.disabled) ?? []
    );
  }
  singleOptions(field: SingleField): readonly SelectOption<number | null>[] {
    return [
      { value: null, label: 'Noch nicht festgelegt' },
      ...this.choices(field).map((choice) => ({ value: choice.id, label: choice.label })),
    ];
  }
  selectedIds(field: MultipleField): readonly number[] {
    return field === 'color' ? this.colorIds() : this.materialIds();
  }
  toggle(field: MultipleField, id: number | null, checked: boolean): void {
    if (
      !this.canApply() ||
      this.closing ||
      this.loadedBinding !== this.binding() ||
      id === null ||
      !this.choices(field).some((choice) => choice.id === id)
    )
      return;
    const state = field === 'color' ? this.colorIds : this.materialIds;
    const maximum = field === 'color' ? 2 : 3;
    if (checked && !state().includes(id) && state().length >= maximum) {
      this.error.set(`Wähle höchstens ${maximum} ${field === 'color' ? 'Farben' : 'Materialien'}.`);
      return;
    }
    this.error.set(null);
    state.update((values) =>
      checked
        ? values.includes(id)
          ? values
          : [...values, id]
        : values.filter((value) => value !== id),
    );
  }
  previousLabel(field: SingleField | MultipleField): string {
    const content = this.initialContent();
    if (!content) return '';
    switch (field) {
      case 'size':
        return content.sizeLabel;
      case 'condition':
        return content.conditionLabel;
      case 'color':
        return content.colorLabels.join(', ');
      case 'material':
        return content.materialLabels.join(', ');
      case 'package':
        return content.packageSizeId === null ? '' : 'Bereits festgelegt';
    }
  }
  apply(): void {
    const schema = this.schema();
    if (
      !schema ||
      !this.canApply() ||
      this.closing ||
      this.destroyRef.destroyed ||
      this.binding() !== this.loadedBinding
    )
      return;
    try {
      const selection = buildVintedListingFieldSelection(schema, {
        ...this.form.getRawValue(),
        colorIds: this.colorIds(),
        materialIds: this.materialIds(),
      });
      this.error.set(null);
      this.selected.emit(selection);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Die Auswahl ist ungültig.');
    }
  }
  close(): void {
    if (this.closing) return;
    this.closing = true;
    this.generation++;
    this.schema.set(null);
    this.loading.set(false);
    this.closed.emit();
  }
  private current(generation: number, binding: string): boolean {
    return (
      !this.closing &&
      !this.destroyRef.destroyed &&
      generation === this.generation &&
      binding === this.binding()
    );
  }
  private prefill(schema: VintedListingCategoryFields): void {
    const content = this.initialContent();
    const choices = (field: SingleField | MultipleField) =>
      schema.fields.find((value) => value.field === field)?.choices ?? [];
    // Namen sind nur eine Eingabehilfe; Kennungen entstehen erst nach ausdrücklicher Übernahme.
    const known = (
      field: SingleField | MultipleField,
      id: number | null,
      label: string,
    ): number | null => {
      const matching = choices(field).filter(
        (choice) => !choice.disabled && choice.label === label && (id === null || choice.id === id),
      );
      return matching.length === 1 ? matching[0].id : null;
    };
    const many = (
      field: MultipleField,
      ids: readonly number[],
      labels: readonly string[],
      maximum: number,
    ): readonly number[] => {
      const selected = labels
        .map((label, index) => known(field, ids[index] ?? null, label))
        .filter((id): id is number => id !== null);
      return selected.length <= maximum && new Set(selected).size === selected.length
        ? selected
        : [];
    };
    this.form.reset(
      {
        sizeId: content ? known('size', content.sizeId, content.sizeLabel) : null,
        conditionId: content
          ? known('condition', content.conditionId, content.conditionLabel)
          : null,
        packageSizeId:
          choices('package').find(
            (choice) => !choice.disabled && choice.id === content?.packageSizeId,
          )?.id ?? null,
      },
      { emitEvent: false },
    );
    this.colorIds.set(content ? many('color', content.colorIds, content.colorLabels, 2) : []);
    this.materialIds.set(
      content ? many('material', content.materialIds, content.materialLabels, 3) : [],
    );
  }
}
