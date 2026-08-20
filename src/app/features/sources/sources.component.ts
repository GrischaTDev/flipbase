import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import {
  LucideDynamicIcon,
  LucideStore as Store,
  LucideUsers as Users,
  LucidePlus as Plus,
  LucideTrash2 as Trash2,
  LucideCheckCircle2 as CheckCircle2,
  LucideBuilding as Building,
  LucidePencil as Pencil,
  LucideArchive as Archive,
  LucideArchiveRestore as ArchiveRestore,
  LucideX as X,
  LucideCheck as Check,
  LucideAlertTriangle as AlertTriangle,
} from '@lucide/angular';
import { SourcesService } from '../../core/services/sources.service';
import { SuppliersService } from '../../core/services/suppliers.service';
import { istArchiviert } from '../../core/services/stammdaten-filter';

@Component({
  selector: 'app-sources',
  imports: [ReactiveFormsModule, TranslatePipe, LucideDynamicIcon],
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
  readonly pencilIcon = Pencil;
  readonly archiveIcon = Archive;
  readonly archiveRestoreIcon = ArchiveRestore;
  readonly xIcon = X;
  readonly checkSmallIcon = Check;
  readonly warnIcon = AlertTriangle;

  readonly activeTab = signal<'sources' | 'suppliers'>('sources');
  readonly isAddingSource = signal<boolean>(false);
  readonly isAddingSupplier = signal<boolean>(false);

  /** Kennung des Eintrags, der gerade bearbeitet wird - sonst null. */
  readonly bearbeiteQuelle = signal<string | null>(null);
  readonly bearbeiteLieferant = signal<string | null>(null);

  /**
   * Meldung, wenn eine Aktion abgelehnt wurde - etwa das Löschen einer Quelle,
   * an der noch Einkäufe hängen. Vorher verschwanden solche Fehler wortlos.
   */
  readonly meldung = signal<string | null>(null);

  /** Für das Template, damit dort keine Vergleichslogik steht. */
  readonly istArchiviert = istArchiviert;

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

  /** Getrenntes Formular fürs Bearbeiten, damit das Anlegen unberührt bleibt. */
  readonly editForm = new FormGroup({
    name: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(2)],
    }),
    contact_info: new FormControl(''),
    notes: new FormControl(''),
  });

  // ---------------------------------------------------------------- Quellen

  async onAddSource(): Promise<void> {
    if (this.sourceForm.invalid) return;
    const name = this.sourceForm.getRawValue().name.trim();
    await this.sourcesService.createSource(name);
    this.sourceForm.reset({ name: '' });
    this.isAddingSource.set(false);
  }

  starteQuelleBearbeiten(id: string, name: string): void {
    this.meldung.set(null);
    this.bearbeiteLieferant.set(null);
    this.bearbeiteQuelle.set(id);
    this.editForm.reset({ name, contact_info: '', notes: '' });
  }

  async speichereQuelle(id: string): Promise<void> {
    if (this.editForm.controls.name.invalid) return;
    const { error } = await this.sourcesService.updateSource(id, {
      name: this.editForm.getRawValue().name,
    });
    if (error) {
      this.meldung.set(error.message);
      return;
    }
    this.bearbeiteQuelle.set(null);
  }

  async archiviereQuelle(id: string, archivieren: boolean): Promise<void> {
    this.meldung.set(null);
    const { error } = await this.sourcesService.setSourceArchiviert(id, archivieren);
    if (error) this.meldung.set(error.message);
  }

  async onDeleteSource(sourceId: string): Promise<void> {
    this.meldung.set(null);
    if (!confirm('Diese Quelle endgültig löschen? Das geht nur, wenn kein Einkauf daran hängt.')) {
      return;
    }
    const { error } = await this.sourcesService.deleteSource(sourceId);
    if (error) this.meldung.set(error.message);
  }

  async schalteArchivierteQuellen(): Promise<void> {
    this.meldung.set(null);
    this.sourcesService.zeigeArchivierte.update((v) => !v);
    await this.sourcesService.neuLaden();
  }

  // ------------------------------------------------------------ Lieferanten

  async onAddSupplier(): Promise<void> {
    if (this.supplierForm.invalid) return;
    const { name, contact_info, notes } = this.supplierForm.getRawValue();
    await this.suppliersService.createSupplier(name, contact_info || undefined, notes || undefined);
    this.supplierForm.reset({ name: '', contact_info: '', notes: '' });
    this.isAddingSupplier.set(false);
  }

  starteLieferantBearbeiten(
    id: string,
    name: string,
    kontakt: string | null | undefined,
    notizen: string | null | undefined,
  ): void {
    this.meldung.set(null);
    this.bearbeiteQuelle.set(null);
    this.bearbeiteLieferant.set(id);
    this.editForm.reset({ name, contact_info: kontakt ?? '', notes: notizen ?? '' });
  }

  async speichereLieferant(id: string): Promise<void> {
    if (this.editForm.controls.name.invalid) return;
    const werte = this.editForm.getRawValue();
    const { error } = await this.suppliersService.updateSupplier(id, {
      name: werte.name,
      contact_info: werte.contact_info || null,
      notes: werte.notes || null,
    });
    if (error) {
      this.meldung.set(error.message);
      return;
    }
    this.bearbeiteLieferant.set(null);
  }

  async archiviereLieferant(id: string, archivieren: boolean): Promise<void> {
    this.meldung.set(null);
    const { error } = await this.suppliersService.setSupplierArchiviert(id, archivieren);
    if (error) this.meldung.set(error.message);
  }

  async onDeleteSupplier(supplierId: string): Promise<void> {
    this.meldung.set(null);
    if (
      !confirm('Diesen Lieferanten endgültig löschen? Das geht nur, wenn kein Einkauf daran hängt.')
    ) {
      return;
    }
    const { error } = await this.suppliersService.deleteSupplier(supplierId);
    if (error) this.meldung.set(error.message);
  }

  async schalteArchivierteLieferanten(): Promise<void> {
    this.meldung.set(null);
    this.suppliersService.zeigeArchivierte.update((v) => !v);
    await this.suppliersService.neuLaden();
  }

  brichBearbeitenAb(): void {
    this.bearbeiteQuelle.set(null);
    this.bearbeiteLieferant.set(null);
    this.meldung.set(null);
  }
}
