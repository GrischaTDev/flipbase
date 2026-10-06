import { ChangeDetectionStrategy, Component, computed, input, model, signal } from '@angular/core';
import { LucideX } from '@lucide/angular';
import {
  CustomSelectComponent,
  SelectOption,
} from '../../../../shared/components/custom-select/custom-select.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { VintedCategory } from '../../models/vinted-category.model';
import { buildVintedCategoryTree } from '../../models/vinted-category-tree';

interface CategoryLevel {
  parentId: number | null;
  selectedId: number | null;
  label: string;
  options: SelectOption<number | null>[];
}

/** Fachliche Zusammensetzung bestehender Auswahlfelder; lädt selbst keine Daten. */
@Component({
  selector: 'app-vinted-category-picker',
  imports: [CustomSelectComponent, ButtonComponent],
  templateUrl: './vinted-category-picker.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VintedCategoryPickerComponent {
  readonly categories = input<readonly VintedCategory[]>([]);
  readonly value = model<number | null>(null);
  readonly disabled = input(false);
  readonly directSearch = signal(false);
  readonly removeIcon = LucideX;
  readonly tree = computed(() => {
    try {
      return buildVintedCategoryTree(this.categories());
    } catch {
      return null;
    }
  });
  readonly selected = computed(() =>
    this.value() === null ? null : (this.tree()?.get(this.value()!) ?? null),
  );
  readonly missingSelection = computed(() => this.value() !== null && !this.selected());
  readonly allOptions = computed<SelectOption<number | null>[]>(() => [
    { value: null, label: 'Keine Kategorieeinschränkung' },
    ...(this.tree()?.search('') ?? []).map((entry) => ({ value: entry.id, label: entry.path })),
  ]);
  readonly levels = computed<CategoryLevel[]>(() => {
    const tree = this.tree();
    if (!tree) return [];
    const selected = this.selected();
    const chain = selected ? [...selected.ancestorIds, selected.id] : [];
    const result: CategoryLevel[] = [];
    let parentId: number | null = null;
    for (let level = 0; ; level += 1) {
      const children = tree.children(parentId);
      if (!children.length) break;
      result.push({
        parentId,
        selectedId: chain[level] ?? null,
        label: level === 0 ? 'Bereich' : `Unterkategorie ${level}`,
        options: [
          {
            value: null,
            label:
              parentId === null
                ? 'Keine Einschränkung'
                : 'Gesamter Bereich einschließlich Unterkategorien',
          },
          ...children.map((entry) => ({ value: entry.id, label: entry.title })),
        ],
      });
      if (chain[level] === undefined) break;
      parentId = chain[level]!;
    }
    return result;
  });

  choose(parentId: number | null, id: number | null): void {
    if (this.disabled()) return;
    if (id === null) {
      this.value.set(parentId);
      return;
    }
    if (this.tree()?.get(id)?.parentId === parentId) this.value.set(id);
  }

  chooseDirect(id: number | null): void {
    if (!this.disabled() && (id === null || this.tree()?.get(id))) this.value.set(id);
  }
}
