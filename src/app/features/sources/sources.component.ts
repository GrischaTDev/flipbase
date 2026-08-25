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
import { ConfirmDialogService } from '../../shared/components/confirm-dialog/confirm-dialog.service';
import { ToastService } from '../../shared/components/toast/toast.service';
import { SyncStatusService } from '../../core/services/sync-status.service';

@Component({
  selector: 'app-sources',
  imports: [ReactiveFormsModule, TranslatePipe, LucideDynamicIcon],
  templateUrl: './sources.component.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SourcesComponent {
  private readonly dialog = inject(ConfirmDialogService);
  private readonly toast = inject(ToastService);
  private readonly syncStatus = inject(SyncStatusService);
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
    let ergebnis: Awaited<ReturnType<SourcesService['createSource']>>;
    try {
      ergebnis = await this.sourcesService.createSource(name);
    } catch (ursache: unknown) {
      ergebnis = { data: null, error: this.alsError(ursache) };
    }
    const { data, error } = ergebnis;
    if (error || !data) {
      const ursache = error ?? new Error('Die Quelle wurde nicht zurückgegeben.');
      this.meldung.set(ursache.message);
      this.meldeFehlerWennNichtSynchronisiert('Quelle konnte nicht angelegt werden.', ursache);
      return;
    }
    this.sourceForm.reset({ name: '' });
    this.isAddingSource.set(false);
    this.toast.success('Quelle wurde angelegt.');
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
      this.meldeFehlerWennNichtSynchronisiert('Quelle konnte nicht gespeichert werden.', error);
      return;
    }
    this.bearbeiteQuelle.set(null);
    this.toast.success('Quelle wurde gespeichert.');
  }

  async archiviereQuelle(id: string, archivieren: boolean): Promise<void> {
    this.meldung.set(null);
    const { error } = await this.sourcesService.setSourceArchiviert(id, archivieren);
    if (error) {
      this.meldung.set(error.message);
      this.meldeFehlerWennNichtSynchronisiert(
        archivieren
          ? 'Quelle konnte nicht archiviert werden.'
          : 'Quelle konnte nicht wiederhergestellt werden.',
        error,
      );
      return;
    }
    this.toast.success(
      archivieren ? 'Quelle wurde archiviert.' : 'Quelle wurde wiederhergestellt.',
    );
  }

  async onDeleteSource(sourceId: string): Promise<void> {
    this.meldung.set(null);
    const bestaetigt = await this.dialog.frage({
      titel: 'Quelle löschen?',
      text: 'Die Quelle wird endgültig entfernt. Das geht nur, wenn kein Einkauf mehr auf sie verweist.',
      bestaetigenText: 'Löschen',
      gefahr: true,
    });
    if (!bestaetigt) {
      return;
    }
    const { error } = await this.sourcesService.deleteSource(sourceId);
    if (error) {
      this.meldung.set(error.message);
      this.meldeFehlerWennNichtSynchronisiert('Quelle konnte nicht gelöscht werden.', error);
      return;
    }
    this.toast.success('Quelle wurde gelöscht.');
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
    let ergebnis: Awaited<ReturnType<SuppliersService['createSupplier']>>;
    try {
      ergebnis = await this.suppliersService.createSupplier(
        name,
        contact_info || undefined,
        notes || undefined,
      );
    } catch (ursache: unknown) {
      ergebnis = { data: null, error: this.alsError(ursache) };
    }
    const { data, error } = ergebnis;
    if (error || !data) {
      const ursache = error ?? new Error('Der Lieferant wurde nicht zurückgegeben.');
      this.meldung.set(ursache.message);
      this.meldeFehlerWennNichtSynchronisiert('Lieferant konnte nicht angelegt werden.', ursache);
      return;
    }
    this.supplierForm.reset({ name: '', contact_info: '', notes: '' });
    this.isAddingSupplier.set(false);
    this.toast.success('Lieferant wurde angelegt.');
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
      this.meldeFehlerWennNichtSynchronisiert('Lieferant konnte nicht gespeichert werden.', error);
      return;
    }
    this.bearbeiteLieferant.set(null);
    this.toast.success('Lieferant wurde gespeichert.');
  }

  async archiviereLieferant(id: string, archivieren: boolean): Promise<void> {
    this.meldung.set(null);
    const { error } = await this.suppliersService.setSupplierArchiviert(id, archivieren);
    if (error) {
      this.meldung.set(error.message);
      this.meldeFehlerWennNichtSynchronisiert(
        archivieren
          ? 'Lieferant konnte nicht archiviert werden.'
          : 'Lieferant konnte nicht wiederhergestellt werden.',
        error,
      );
      return;
    }
    this.toast.success(
      archivieren ? 'Lieferant wurde archiviert.' : 'Lieferant wurde wiederhergestellt.',
    );
  }

  async onDeleteSupplier(supplierId: string): Promise<void> {
    this.meldung.set(null);
    const bestaetigt = await this.dialog.frage({
      titel: 'Lieferant löschen?',
      text: 'Der Lieferant wird endgültig entfernt. Das geht nur, wenn kein Einkauf mehr auf ihn verweist.',
      bestaetigenText: 'Löschen',
      gefahr: true,
    });
    if (!bestaetigt) {
      return;
    }
    const { error } = await this.suppliersService.deleteSupplier(supplierId);
    if (error) {
      this.meldung.set(error.message);
      this.meldeFehlerWennNichtSynchronisiert('Lieferant konnte nicht gelöscht werden.', error);
      return;
    }
    this.toast.success('Lieferant wurde gelöscht.');
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

  private meldeFehlerWennNichtSynchronisiert(title: string, error: Error): void {
    if (!this.syncStatus.istZentralGemeldet(error)) this.toast.error(title, error.message);
  }

  private alsError(ursache: unknown): Error {
    return ursache instanceof Error ? ursache : new Error('Die Aktion ist fehlgeschlagen.');
  }
}
