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
import { ModalShellComponent } from '../../../../shared/components/modal-shell/modal-shell.component';
import { NoticeBannerComponent } from '../../../../shared/components/notice-banner/notice-banner.component';
import { TextFieldComponent } from '../../../../shared/components/text-field/text-field.component';
import { VintedBrandSearchService } from '../../../platform-admin/services/vinted-brand-search.service';
import type { VintedBrand } from '../../../platform-admin/models/vinted-brand.model';
import {
  validVintedListingBrand,
  type VintedListingBrandSelection,
} from '../../models/vinted-listing-brand-selection';

@Component({
  selector: 'app-vinted-listing-brand-dialog',
  templateUrl: './vinted-listing-brand-dialog.component.html',
  imports: [
    ReactiveFormsModule,
    ButtonComponent,
    ModalShellComponent,
    NoticeBannerComponent,
    TextFieldComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VintedListingBrandDialogComponent {
  readonly scopeKey = input.required<string>();
  readonly workspaceId = input.required<string>();
  readonly initialLabel = input('');
  readonly disabled = input(false);
  readonly selected = output<VintedListingBrandSelection>();
  readonly closed = output<void>();
  readonly query = new FormControl('', {
    nonNullable: true,
    validators: [Validators.maxLength(100)],
  });
  readonly results = signal<readonly VintedBrand[]>([]);
  readonly loading = signal(false);
  readonly searched = signal(false);
  readonly error = signal<string | null>(null);
  private readonly api = inject(VintedBrandSearchService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly binding = computed(() => JSON.stringify([this.scopeKey(), this.workspaceId()]));
  private loadedBinding: string | null = null;
  private generation = 0;
  private closing = false;

  constructor() {
    effect(() => {
      const binding = this.binding();
      const label = this.initialLabel();
      untracked(() => {
        if (this.loadedBinding === binding) return;
        this.loadedBinding = binding;
        this.closing = false;
        this.query.setValue(label === 'Keine Marke' ? '' : label, { emitEvent: false });
        this.invalidate();
      });
    });
    this.query.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.invalidate());
    this.destroyRef.onDestroy(() => this.generation++);
  }

  async search(): Promise<void> {
    const binding = this.binding();
    if (this.closing || this.disabled() || this.loading() || binding !== this.loadedBinding) return;
    if (this.query.invalid) {
      this.error.set('Kürze Deine Suche auf höchstens 100 Zeichen.');
      return;
    }
    const keyword = this.query.value.trim();
    if (!keyword) {
      this.error.set('Gib einen Markennamen ein oder wähle „Keine Marke“.');
      return;
    }
    const generation = ++this.generation;
    this.results.set([]);
    this.searched.set(false);
    this.loading.set(true);
    this.error.set(null);
    try {
      const results = await this.api.search(keyword, this.workspaceId());
      if (!this.current(generation, binding)) return;
      const choices = new Map<number, VintedBrand>();
      for (const brand of results) {
        if (!validVintedListingBrand({ brandId: brand.id, brandLabel: brand.name })) continue;
        if (choices.has(brand.id) && choices.get(brand.id)!.name !== brand.name)
          throw new Error(
            'Die Markensuche hat widersprüchliche Ergebnisse geliefert. Versuche es erneut.',
          );
        choices.set(brand.id, brand);
      }
      this.results.set([...choices.values()].slice(0, 20));
      this.searched.set(true);
    } catch (error) {
      if (this.current(generation, binding))
        this.error.set(
          error instanceof Error
            ? error.message
            : 'Die Vinted-Marken konnten nicht geladen werden. Versuche es erneut.',
        );
    } finally {
      if (this.current(generation, binding)) this.loading.set(false);
    }
  }

  choose(brand: VintedBrand): void {
    if (
      !this.canChoose() ||
      !this.results().some((value) => value.id === brand.id && value.name === brand.name)
    )
      return;
    this.selected.emit({ brandId: brand.id, brandLabel: brand.name });
  }
  chooseNoBrand(): void {
    if (this.canChoose()) this.selected.emit({ brandId: null, brandLabel: 'Keine Marke' });
  }
  close(): void {
    if (this.closing) return;
    this.closing = true;
    this.invalidate();
    this.closed.emit();
  }
  private canChoose(): boolean {
    return (
      !this.closing &&
      !this.destroyRef.destroyed &&
      !this.disabled() &&
      !this.loading() &&
      this.loadedBinding === this.binding()
    );
  }
  private current(generation: number, binding: string): boolean {
    return (
      !this.destroyRef.destroyed && generation === this.generation && binding === this.binding()
    );
  }
  private invalidate(): void {
    this.generation++;
    this.results.set([]);
    this.loading.set(false);
    this.searched.set(false);
    this.error.set(null);
  }
}
