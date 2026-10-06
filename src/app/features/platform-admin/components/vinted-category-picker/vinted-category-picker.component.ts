import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  model,
  untracked,
} from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { LucideX } from '@lucide/angular';
import { CategoryPickerComponent } from '../../../../shared/components/category-picker/category-picker.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { VintedCategory } from '../../models/vinted-category.model';
import { buildVintedCategoryTree } from '../../models/vinted-category-tree';
import { vintedCategorySource } from '../../models/vinted-category-source';

/** Verwendet denselben Picker wie das Artikelanlegen, aber ausschließlich Vinted-Kategorien. */
@Component({
  selector: 'app-vinted-category-picker',
  imports: [CategoryPickerComponent, ButtonComponent, ReactiveFormsModule],
  templateUrl: './vinted-category-picker.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VintedCategoryPickerComponent {
  readonly categories = input<readonly VintedCategory[]>([]);
  readonly value = model<number | null>(null);
  readonly disabled = input(false);
  readonly selection = new FormControl<string | null>(null);
  readonly removeIcon = LucideX;
  readonly source = computed(() => {
    try {
      return vintedCategorySource(this.categories());
    } catch {
      return null;
    }
  });
  readonly missingSelection = computed(() => {
    if (this.value() === null) return false;
    try {
      return !buildVintedCategoryTree(this.categories()).get(this.value()!);
    } catch {
      return true;
    }
  });

  constructor() {
    effect(() => {
      const value = this.value();
      const disabled = this.disabled();
      untracked(() => {
        this.selection.setValue(value === null ? null : String(value), { emitEvent: false });
        if (disabled) this.selection.disable({ emitEvent: false });
        else this.selection.enable({ emitEvent: false });
      });
    });
    this.selection.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((value) => this.chooseDirect(value === null ? null : Number(value)));
  }

  chooseDirect(id: number | null): void {
    if (this.disabled()) return;
    if (id === null || this.categories().some((row) => row.id === id)) this.value.set(id);
  }
}
