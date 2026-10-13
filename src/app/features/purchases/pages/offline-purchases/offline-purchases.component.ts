import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { FormArray, FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { OfflinePurchaseDraftStore } from '../../services/offline-purchase-draft.store';
import {
  OfflinePurchaseContext,
  OfflinePurchaseDraft,
  OfflinePurchaseContent,
} from '../../models/offline-purchase-draft.models';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { TextFieldComponent } from '../../../../shared/components/text-field/text-field.component';
import { NumberInputComponent } from '../../../../shared/components/number-input/number-input.component';
import { DatePickerComponent } from '../../../../shared/components/date-picker/date-picker.component';
import {
  CustomSelectComponent,
  SelectOption,
} from '../../../../shared/components/custom-select/custom-select.component';
import { ItemCondition } from '../../../../core/models/flipbase.models';
import { downloadOfflinePurchases } from '../../utils/offline-purchase-export';
import { ConfirmDialogComponent } from '../../../../shared/components/confirm-dialog/confirm-dialog.component';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.service';

@Component({
  selector: 'app-offline-purchases',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    ButtonComponent,
    TextFieldComponent,
    NumberInputComponent,
    DatePickerComponent,
    CustomSelectComponent,
    ConfirmDialogComponent,
  ],
  templateUrl: './offline-purchases.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'block min-h-dvh bg-fb-main text-fb-text-primary',
    '(window:beforeunload)': 'beforeUnload($event)',
    '(window:storage)': 'onStorageChange($event)',
  },
})
export class OfflinePurchasesComponent {
  private readonly store = inject(OfflinePurchaseDraftStore);
  private readonly dialog = inject(ConfirmDialogService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  readonly context = signal<OfflinePurchaseContext | null>(null);
  readonly drafts = signal<OfflinePurchaseDraft[]>([]);
  readonly selected = signal<OfflinePurchaseDraft | null>(null);
  readonly message = signal('Lokaler Speicher wird geprüft …');
  readonly error = signal<string | null>(null);
  readonly saving = signal(false);
  readonly dirty = signal(false);
  private timer: ReturnType<typeof setTimeout> | null = null;
  private editing = false;
  private saveAgain = false;
  private generation = 0;
  readonly conditionOptions: SelectOption<ItemCondition>[] = [
    { value: 'new', label: 'Neu / OVP' },
    { value: 'like_new', label: 'Wie neu' },
    { value: 'very_good', label: 'Sehr gut' },
    { value: 'used', label: 'Gebraucht' },
    { value: 'heavily_used', label: 'Stark gebraucht' },
    { value: 'defective', label: 'Defekt' },
  ];
  readonly form = new FormGroup({
    draftName: new FormControl('', { nonNullable: true }),
    purchaseDate: new FormControl('', { nonNullable: true }),
    sellerNote: new FormControl('', { nonNullable: true }),
    notes: new FormControl('', { nonNullable: true }),
    lines: new FormArray([this.lineGroup()]),
  });
  constructor() {
    void this.load();
    this.form.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      if (this.editing || !this.selected()) return;
      this.dirty.set(true);
      this.message.set('Noch nicht auf diesem Gerät gespeichert.');
      if (this.timer) clearTimeout(this.timer);
      this.timer = setTimeout(() => void this.save(), 500);
    });
    this.destroyRef.onDestroy(() => {
      this.generation++;
      if (this.timer) clearTimeout(this.timer);
    });
  }
  private lineGroup() {
    return new FormGroup({
      lineId: new FormControl<string>(crypto.randomUUID(), { nonNullable: true }),
      title: new FormControl('', { nonNullable: true }),
      ean: new FormControl('', { nonNullable: true }),
      condition: new FormControl<ItemCondition>('used', { nonNullable: true }),
      quantity: new FormControl(1, { nonNullable: true }),
      unitPrice: new FormControl<number | null>(null),
    });
  }
  async load(): Promise<void> {
    try {
      this.context.set(await this.store.activeContext());
      this.drafts.set(await this.store.list());
      this.message.set('Lokale Einkaufsentwürfe sind auf diesem Gerät verfügbar.');
    } catch (reason) {
      this.context.set(null);
      this.selected.set(null);
      this.error.set(
        reason instanceof Error ? reason.message : 'Der lokale Speicher ist nicht verfügbar.',
      );
    }
  }
  async create(): Promise<void> {
    if (this.dirty()) await this.save();
    if (this.dirty() || this.saving()) return;
    const now = new Date();
    const purchaseDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    try {
      const draft = await this.store.create({
        draftName: '',
        purchaseDate,
        sellerNote: '',
        notes: '',
        lines: [],
      });
      this.open(draft);
      await this.load();
    } catch (reason) {
      this.fail(reason);
    }
  }
  open(draft: OfflinePurchaseDraft): void {
    if (this.saving() || this.dirty()) {
      this.error.set('Speichere zuerst deine aktuellen Eingaben oder exportiere sie.');
      return;
    }
    this.editing = true;
    this.selected.set(draft);
    this.form.controls.lines.clear({ emitEvent: false });
    for (const line of draft.content.lines) {
      const row = this.lineGroup();
      row.setValue({
        lineId: line.lineId,
        title: line.title,
        quantity: line.quantity,
        condition: line.condition,
        ean: line.ean ?? '',
        unitPrice: line.unitPriceCents === null ? null : line.unitPriceCents / 100,
      });
      this.form.controls.lines.push(row, { emitEvent: false });
    }
    this.form.patchValue({ ...draft.content, lines: [] }, { emitEvent: false });
    this.form.markAsPristine();
    this.dirty.set(false);
    this.error.set(null);
    this.message.set('Auf diesem Gerät gespeichert.');
    this.editing = false;
  }
  addLine(): void {
    if (this.form.controls.lines.length < 100) this.form.controls.lines.push(this.lineGroup());
  }
  removeLine(index: number): void {
    this.form.controls.lines.removeAt(index);
  }
  private content(): OfflinePurchaseContent {
    const form = this.form.getRawValue();
    for (const line of form.lines) {
      if (line.unitPrice === null) continue;
      const scaled = line.unitPrice * 100;
      if (
        !Number.isFinite(scaled) ||
        Math.abs(scaled - Math.round(scaled)) > Number.EPSILON * Math.max(1, Math.abs(scaled)) * 8
      )
        throw new Error('Gib Preise mit höchstens zwei Nachkommastellen an.');
    }
    return {
      draftName: form.draftName,
      purchaseDate: form.purchaseDate,
      sellerNote: form.sellerNote,
      notes: form.notes,
      lines: form.lines.map((line) => ({
        lineId: line.lineId,
        title: line.title,
        ean: line.ean.trim() || null,
        condition: line.condition,
        quantity: line.quantity,
        unitPriceCents: line.unitPrice === null ? null : Math.round(line.unitPrice * 100),
      })),
    };
  }
  async save(): Promise<void> {
    if (this.saving()) {
      this.saveAgain = true;
      return;
    }
    const draft = this.selected();
    if (!draft || !this.dirty()) return;
    const sequence = this.generation;
    this.saving.set(true);
    this.error.set(null);
    try {
      const content = this.content();
      const saved = await this.store.save(draft.draftId, draft.revision, content);
      if (sequence !== this.generation) return;
      this.selected.set(saved);
      this.drafts.update((drafts) =>
        drafts.map((entry) => (entry.draftId === saved.draftId ? saved : entry)),
      );
      const unchanged = JSON.stringify(this.content()) === JSON.stringify(content);
      this.dirty.set(!unchanged);
      this.message.set(
        unchanged ? 'Auf diesem Gerät gespeichert.' : 'Neuere Eingaben werden noch gespeichert …',
      );
      if (!unchanged) this.saveAgain = true;
    } catch (reason) {
      this.fail(reason);
    } finally {
      this.saving.set(false);
      if (this.saveAgain && !this.error()) {
        this.saveAgain = false;
        void this.save();
      }
    }
  }
  async remove(draft: OfflinePurchaseDraft): Promise<void> {
    if (this.dirty() || this.saving()) return;
    if (
      !(await this.dialog.frage({
        titel: 'Lokalen Entwurf verwerfen?',
        text: 'Exportiere diesen Entwurf vorher, wenn du ihn behalten möchtest. Das Verwerfen entfernt ihn von diesem Gerät.',
        bestaetigenText: 'Entwurf verwerfen',
        gefahr: true,
      }))
    )
      return;
    try {
      await this.store.remove(draft.draftId);
      if (this.selected()?.draftId === draft.draftId) this.selected.set(null);
      await this.load();
    } catch (reason) {
      this.fail(reason);
    }
  }
  async export(): Promise<void> {
    try {
      const selected = this.selected();
      const recovery =
        this.dirty() && selected ? { draftId: selected.draftId, content: this.content() } : null;
      downloadOfflinePurchases(await this.store.exportCurrent(recovery));
    } catch (reason) {
      this.fail(reason);
    }
  }
  async review(): Promise<void> {
    await this.save();
    const draft = this.selected();
    if (!draft || this.dirty() || this.saving()) return;
    await this.router.navigate(['/purchases/new'], { queryParams: { localDraft: draft.draftId } });
  }
  onStorageChange(event: StorageEvent): void {
    if (event.key === 'flipbase_purchase_context_locked' && event.newValue === 'locked') {
      this.generation++;
      this.selected.set(null);
      this.drafts.set([]);
      this.context.set(null);
      this.error.set('Der lokale Kontext wurde gesperrt. Melde dich erneut online an.');
    }
  }
  hasUnsavedChanges(): boolean {
    return this.dirty();
  }
  isSaving(): boolean {
    return this.saving();
  }
  beforeUnload(event: BeforeUnloadEvent): void {
    if (this.dirty() || this.saving()) event.preventDefault();
  }
  private fail(reason: unknown): void {
    this.error.set(
      reason instanceof Error
        ? reason.message
        : 'Die lokale Sicherung ist fehlgeschlagen. Deine Eingaben sind noch im Formular.',
    );
  }
}
