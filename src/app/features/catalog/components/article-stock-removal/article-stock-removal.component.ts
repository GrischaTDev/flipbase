import { TextFieldComponent } from '../../../../shared/components/text-field/text-field.component';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ModalShellComponent } from '../../../../shared/components/modal-shell/modal-shell.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { NumberInputComponent } from '../../../../shared/components/number-input/number-input.component';
import { CustomSelectComponent } from '../../../../shared/components/custom-select/custom-select.component';
import {
  ConfirmDialogService,
  type DialogAnfrage,
} from '../../../../shared/components/confirm-dialog/confirm-dialog.service';
import { ArticleLifecycleService } from '../../services/article-lifecycle.service';
import type { ArticleKind } from '../../models/article-row';

export interface StockRemovalTarget {
  readonly workspaceId: string;
  readonly kind: ArticleKind;
  readonly id: string;
  readonly title: string;
  readonly onHand: number | null;
}

@Component({
  selector: 'app-article-stock-removal',
  imports: [
    TextFieldComponent,
    ReactiveFormsModule,
    ModalShellComponent,
    ButtonComponent,
    NumberInputComponent,
    CustomSelectComponent,
  ],
  templateUrl: './article-stock-removal.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ArticleStockRemovalComponent {
  readonly target = input.required<StockRemovalTarget>();
  readonly closed = output<void>();
  readonly removed = output<void>();
  private readonly lifecycle = inject(ArticleLifecycleService);
  private readonly confirmation = inject(ConfirmDialogService);
  private readonly destroyRef = inject(DestroyRef);
  private pendingConfirmation: DialogAnfrage | null = null;
  readonly saving = signal(false);
  readonly completed = signal(false);
  readonly archived = signal(false);
  readonly error = signal<string | null>(null);
  readonly reasons = [
    { value: 'damage', label: 'Beschädigt / nicht mehr verkaufbar' },
    { value: 'loss', label: 'Verloren / fehlt im Lager' },
    { value: 'correction', label: 'Bestand falsch erfasst' },
  ] as const;
  readonly form = new FormGroup({
    quantity: new FormControl(1, {
      nonNullable: true,
      validators: [
        Validators.required,
        Validators.min(1),
        (control) => (Number.isInteger(control.value) ? null : { integer: true }),
      ],
    }),
    reason: new FormControl<'damage' | 'loss' | 'correction'>('damage', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    notes: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(1000)] }),
  });

  constructor() {
    this.destroyRef.onDestroy(() => {
      if (this.pendingConfirmation && this.confirmation.anfrage() === this.pendingConfirmation)
        this.confirmation.antworte(false);
    });
  }

  close(): void {
    if (!this.saving() && !this.pendingConfirmation) this.closed.emit();
  }

  async submit(): Promise<void> {
    if (this.saving() || this.pendingConfirmation || this.completed()) return;
    const target = this.target();
    const value = this.form.getRawValue();
    if (this.form.invalid || (target.onHand !== null && value.quantity > target.onHand)) {
      this.error.set('Gib eine ganze Stückzahl zwischen 1 und dem vorhandenen Bestand ein.');
      return;
    }
    this.error.set(null);
    try {
      if (value.reason === 'loss') {
        const request: DialogAnfrage = {
          titel: 'Bestandsverlust bestätigen',
          text: `Du buchst ${value.quantity} Stück von „${target.title}“ aus.\nGrund: Verloren / fehlt im Lager.\n${
            target.onHand === null
              ? ''
              : `Der Lagerbestand sinkt von ${target.onHand} auf ${target.onHand - value.quantity} Stück.\n`
          }Es entsteht kein Verkauf. Einkauf und Kosten bleiben erhalten.`,
          bestaetigenText: 'Verlust buchen',
          gefahr: true,
        };
        this.pendingConfirmation = request;
        const confirmed = await this.confirmation.frage(request);
        this.pendingConfirmation = null;
        if (!confirmed || this.destroyRef.destroyed) return;
        const currentValue = this.form.getRawValue();
        if (
          this.target() !== target ||
          currentValue.quantity !== value.quantity ||
          currentValue.reason !== value.reason ||
          currentValue.notes !== value.notes
        ) {
          this.error.set('Die Angaben haben sich geändert. Prüfe den Bestandsabgang erneut.');
          return;
        }
      }
      this.saving.set(true);
      this.form.disable();
      await this.lifecycle.removeStock(
        target.workspaceId,
        target.kind,
        target.id,
        value.quantity,
        value.reason,
        value.notes,
      );
      this.completed.set(true);
      this.removed.emit();
    } catch (error: unknown) {
      this.error.set(
        error instanceof Error ? error.message : 'Bestand konnte nicht entfernt werden.',
      );
    } finally {
      this.pendingConfirmation = null;
      this.saving.set(false);
      if (!this.completed()) this.form.enable();
    }
  }

  async archive(): Promise<void> {
    if (this.saving()) return;
    const target = this.target();
    this.saving.set(true);
    this.error.set(null);
    try {
      await this.lifecycle.setArchived(target.workspaceId, target.kind, target.id, true);
      this.archived.set(true);
      this.removed.emit();
    } catch (error: unknown) {
      this.error.set(
        error instanceof Error ? error.message : 'Artikel konnte nicht archiviert werden.',
      );
    } finally {
      this.saving.set(false);
    }
  }
}
