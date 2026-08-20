import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import {
  LucideAngularModule,
  Store,
  Users,
  Plus,
  Trash2,
  CheckCircle2,
  Building,
} from 'lucide-angular';
import { SourcesService } from '../../core/services/sources.service';
import { SuppliersService } from '../../core/services/suppliers.service';

@Component({
  selector: 'app-sources',
  imports: [ReactiveFormsModule, TranslatePipe, LucideAngularModule],
  templateUrl: './sources.component.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SourcesComponent {
  readonly sourcesService = inject(SourcesService);
  readonly suppliersService = inject(SuppliersService);

  readonly storeIcon = Store;
  readonly usersIcon = Users;
  readonly plusIcon = Plus;
  readonly trashIcon = Trash2;
  readonly checkIcon = CheckCircle2;
  readonly buildingIcon = Building;

  readonly activeTab = signal<'sources' | 'suppliers'>('sources');
  readonly isAddingSource = signal<boolean>(false);
  readonly isAddingSupplier = signal<boolean>(false);

  readonly sourceForm = new FormGroup({
    name: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(2)],
    }),
  });

  readonly supplierForm = new FormGroup({
    name: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(2)],
    }),
    contact_info: new FormControl(''),
    notes: new FormControl(''),
  });

  async onAddSource(): Promise<void> {
    if (this.sourceForm.invalid) return;
    const name = this.sourceForm.getRawValue().name.trim();
    await this.sourcesService.createSource(name);
    this.sourceForm.reset({ name: '' });
    this.isAddingSource.set(false);
  }

  async onDeleteSource(sourceId: string): Promise<void> {
    if (confirm('Möchtest du diese Einkaufsquelle wirklich löschen?')) {
      await this.sourcesService.deleteSource(sourceId);
    }
  }

  async onAddSupplier(): Promise<void> {
    if (this.supplierForm.invalid) return;
    const { name, contact_info, notes } = this.supplierForm.getRawValue();
    await this.suppliersService.createSupplier(name, contact_info || undefined, notes || undefined);
    this.supplierForm.reset({ name: '', contact_info: '', notes: '' });
    this.isAddingSupplier.set(false);
  }

  async onDeleteSupplier(supplierId: string): Promise<void> {
    if (confirm('Möchtest du diesen Lieferanten wirklich löschen?')) {
      await this.suppliersService.deleteSupplier(supplierId);
    }
  }
}
