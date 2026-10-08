import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { FormControl, FormGroup } from '@angular/forms';
import type { LabelAdminBrand, LabelAdminLine } from '../../models/brand-label-admin-brands';

@Component({
  selector: 'app-label-brands',
  templateUrl: './label-brands.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LabelBrandsComponent {
  readonly form = new FormGroup({
    name: new FormControl('', { nonNullable: true }),
    slug: new FormControl('', { nonNullable: true }),
    aliases: new FormControl('', { nonNullable: true }),
  });
  readonly view = signal<{ phase: string; brands: readonly LabelAdminBrand[]; error: string | null }>({ phase: 'loading', brands: [], error: null });
  readonly editor = signal<{ kind: 'brand' | 'line' } | null>(null);
  readonly saving = signal(false);
  readonly unresolved = signal(false);
  readonly search = signal('');
  readonly message = signal<string | null>(null);
  beginBrand(_brand?: LabelAdminBrand): void {}
  beginLine(_brand: LabelAdminBrand, _line?: LabelAdminLine): void {}
  async save(): Promise<void> {}
  async retry(): Promise<void> {}
  async reload(): Promise<void> {}
  close(): void {}
  hasUnsavedChanges(): boolean { return false; }
}
