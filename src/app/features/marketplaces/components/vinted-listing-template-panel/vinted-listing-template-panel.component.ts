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
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { CardComponent } from '../../../../shared/components/card/card.component';
import { CustomSelectComponent } from '../../../../shared/components/custom-select/custom-select.component';
import { CustomCheckboxComponent } from '../../../../shared/components/custom-checkbox/custom-checkbox.component';
import { TextFieldComponent } from '../../../../shared/components/text-field/text-field.component';
import { NoticeBannerComponent } from '../../../../shared/components/notice-banner/notice-banner.component';
import { VintedListingTemplateService } from '../../services/vinted-listing-template.service';
import {
  applyVintedListingTemplate,
  type VintedListingContent,
  type VintedListingContentField,
  type VintedListingTemplateFields,
} from '../../models/vinted-listing-content';
import type { VintedListingTemplate } from '../../models/vinted-listing-draft';

const fieldGroups: readonly {
  key: string;
  label: string;
  fields: readonly VintedListingContentField[];
  display: VintedListingContentField;
}[] = [
  { key: 'title', label: 'Titel', fields: ['title'], display: 'title' },
  { key: 'description', label: 'Beschreibung', fields: ['description'], display: 'description' },
  {
    key: 'category',
    label: 'Kategorie',
    fields: ['categoryId', 'categoryLabel'],
    display: 'categoryLabel',
  },
  { key: 'brand', label: 'Marke', fields: ['brandId', 'brandLabel'], display: 'brandLabel' },
  { key: 'size', label: 'Größe', fields: ['sizeId', 'sizeLabel'], display: 'sizeLabel' },
  {
    key: 'condition',
    label: 'Zustand',
    fields: ['conditionId', 'conditionLabel'],
    display: 'conditionLabel',
  },
  { key: 'colors', label: 'Farben', fields: ['colorIds', 'colorLabels'], display: 'colorLabels' },
  {
    key: 'materials',
    label: 'Materialien',
    fields: ['materialIds', 'materialLabels'],
    display: 'materialLabels',
  },
  {
    key: 'price',
    label: 'Verkaufspreis',
    fields: ['priceCents', 'currency'],
    display: 'priceCents',
  },
];
@Component({
  selector: 'app-vinted-listing-template-panel',
  templateUrl: './vinted-listing-template-panel.component.html',
  imports: [
    ReactiveFormsModule,
    ButtonComponent,
    CardComponent,
    CustomSelectComponent,
    CustomCheckboxComponent,
    TextFieldComponent,
    NoticeBannerComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VintedListingTemplatePanelComponent {
  readonly workspaceId = input.required<string>();
  readonly content = input.required<VintedListingContent>();
  readonly disabled = input(false);
  readonly applied = output<VintedListingContent>();
  private readonly api = inject(VintedListingTemplateService);
  private readonly destroyRef = inject(DestroyRef);
  readonly templates = signal<readonly VintedListingTemplate[]>([]);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly notice = signal<string | null>(null);
  readonly selection = new FormControl<string | null>(null);
  readonly selectedId = signal<string | null>(null);
  readonly name = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.maxLength(100), Validators.pattern(/.*\S.*/)],
  });
  readonly fields = fieldGroups.map((group) => ({
    ...group,
    control: new FormControl(group.key === 'title' || group.key === 'description', {
      nonNullable: true,
    }),
  }));
  readonly options = computed(() =>
    this.templates().map((template) => ({ value: template.id, label: template.name })),
  );
  readonly preview = computed(() => {
    const template = this.templates().find((template) => template.id === this.selectedId());
    return template ? applyVintedListingTemplate(this.content(), template.fields) : null;
  });
  readonly previewRows = computed(() => {
    const preview = this.preview();
    return preview
      ? fieldGroups
          .filter((group) => group.fields.some((field) => preview.changedFields.includes(field)))
          .map((group) => ({
            label: group.label,
            before: this.display(group.display, this.content()),
            after: this.display(group.display, preview.content),
          }))
      : [];
  });
  private generation = 0;
  constructor() {
    effect(() => {
      const workspaceId = this.workspaceId();
      untracked(() => void this.load(workspaceId));
    });
    effect(() => {
      const disabled = this.disabled() || this.saving();
      untracked(() => {
        for (const control of [
          this.name,
          this.selection,
          ...this.fields.map((field) => field.control),
        ]) {
          if (disabled) control.disable({ emitEvent: false });
          else control.enable({ emitEvent: false });
        }
      });
    });
    this.selection.valueChanges.pipe(takeUntilDestroyed()).subscribe((id) => {
      this.selectedId.set(id);
      this.notice.set(null);
    });
    this.destroyRef.onDestroy(() => this.generation++);
  }
  async save(): Promise<void> {
    if (this.disabled() || this.saving() || this.name.invalid) return;
    const workspaceId = this.workspaceId(),
      generation = this.generation;
    const entries = this.fields
      .filter((group) => group.control.value)
      .flatMap((group) => group.fields.map((field) => [field, this.content()[field]]));
    if (!entries.length) {
      this.error.set('Wähle mindestens ein Feld für Deine Vorlage.');
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      const template = await this.api.save(
        workspaceId,
        this.name.value,
        Object.fromEntries(entries) as VintedListingTemplateFields,
      );
      if (!this.current(generation, workspaceId)) return;
      this.templates.update((templates) =>
        [template, ...templates.filter((entry) => entry.id !== template.id)].sort((left, right) =>
          left.name.localeCompare(right.name, 'de'),
        ),
      );
      this.notice.set(`Die Vorlage „${template.name}“ wurde gespeichert.`);
      this.name.reset('');
    } catch (error) {
      if (this.current(generation, workspaceId))
        this.error.set(
          error instanceof Error ? error.message : 'Die Vorlage konnte nicht gespeichert werden.',
        );
    } finally {
      if (this.current(generation, workspaceId)) this.saving.set(false);
    }
  }
  apply(): void {
    const preview = this.preview();
    if (!this.disabled() && preview) {
      this.applied.emit(preview.content);
      this.selection.setValue(null);
      this.notice.set('Die ausgewählten Vorlagenfelder wurden übernommen.');
    }
  }
  private current(generation: number, workspaceId: string): boolean {
    return (
      !this.destroyRef.destroyed &&
      generation === this.generation &&
      workspaceId === this.workspaceId()
    );
  }
  private async load(workspaceId: string): Promise<void> {
    const generation = ++this.generation;
    this.templates.set([]);
    this.selection.setValue(null);
    this.error.set(null);
    this.notice.set(null);
    this.loading.set(true);
    this.saving.set(false);
    try {
      const templates = await this.api.list(workspaceId);
      if (this.current(generation, workspaceId)) this.templates.set(templates);
    } catch (error) {
      if (this.current(generation, workspaceId))
        this.error.set(
          error instanceof Error ? error.message : 'Die Vorlagen konnten nicht geladen werden.',
        );
    } finally {
      if (this.current(generation, workspaceId)) this.loading.set(false);
    }
  }
  private display(field: VintedListingContentField, content: VintedListingContent): string {
    const value = content[field];
    if (field === 'priceCents')
      return value === null
        ? 'Nicht angegeben'
        : `${(Number(value) / 100).toFixed(2).replace('.', ',')} €`;
    return Array.isArray(value)
      ? value.join(', ') || 'Nicht angegeben'
      : typeof value === 'string' && value
        ? value
        : 'Nicht angegeben';
  }
}
