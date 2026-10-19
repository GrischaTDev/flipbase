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
import { CurrencyPipe, DatePipe } from '@angular/common';
import { LucideLink2 } from '@lucide/angular';
import type { BankTransaction } from '../../../../core/models/bank-reconciliation.models';
import { ModalShellComponent } from '../../../../shared/components/modal-shell/modal-shell.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import {
  CustomSelectComponent,
  type SelectOption,
} from '../../../../shared/components/custom-select/custom-select.component';
import { CustomCheckboxComponent } from '../../../../shared/components/custom-checkbox/custom-checkbox.component';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { BankAssignmentService } from '../../services/bank-assignment.service';
import {
  bankAssignmentDifference,
  type BankAssignmentTarget,
  type BankAssignmentType,
} from '../../models/bank-assignment.models';

@Component({
  selector: 'app-bank-assignment-dialog',
  imports: [
    CurrencyPipe,
    DatePipe,
    ModalShellComponent,
    ButtonComponent,
    CustomSelectComponent,
    CustomCheckboxComponent,
  ],
  providers: [BankAssignmentService],
  templateUrl: './bank-assignment-dialog.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BankAssignmentDialogComponent {
  readonly transaction = input.required<BankTransaction>();
  readonly closed = output<void>();
  private readonly assignments = inject(BankAssignmentService);
  private readonly toast = inject(ToastService);
  private readonly context = this.assignments.captureContext();
  private requestId = 0;
  private destroyed = false;
  readonly assignIcon = LucideLink2;
  readonly type = signal<BankAssignmentType>('sale');
  readonly targets = signal<readonly BankAssignmentTarget[]>([]);
  readonly selectedKey = signal<string | null>(null);
  readonly differenceConfirmed = signal(false);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly contextValid = computed(() => this.assignments.isCurrentContext(this.context));
  readonly typeOptions = computed<readonly SelectOption<BankAssignmentType>[]>(() =>
    this.transaction().amount > 0
      ? [
          { value: 'sale', label: 'Verkauf' },
          { value: 'store_order', label: 'Shopbestellung' },
        ]
      : [
          { value: 'operating_expense', label: 'Betriebsausgabe' },
          { value: 'purchase', label: 'Einkauf' },
        ],
  );
  private readonly amountFormat = new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
  });
  readonly targetOptions = computed<readonly SelectOption<string>[]>(() =>
    this.targets().map((target) => ({
      value: target.key,
      label: target.title + ' · ' + this.amountFormat.format(target.amount),
      description: [target.date.split('-').reverse().join('.'), target.name]
        .filter(Boolean)
        .join(' · '),
      searchText: [target.title, target.reference, target.name, target.amount].join(' '),
    })),
  );
  readonly selected = computed(
    () => this.targets().find((target) => target.key === this.selectedKey()) ?? null,
  );
  readonly difference = computed(() => {
    const target = this.selected();
    return target ? bankAssignmentDifference(this.transaction().amount, target.amount) : 0;
  });
  readonly canSave = computed(
    () =>
      this.contextValid() &&
      !this.loading() &&
      !this.saving() &&
      !!this.selected() &&
      (this.difference() === 0 || this.differenceConfirmed()),
  );
  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.requestId++;
    });
    effect(() => {
      const tx = this.transaction();
      untracked(() => {
        const type = tx.match?.targetType;
        this.type.set(
          type && this.typeOptions().some((option) => option.value === type)
            ? (type as BankAssignmentType)
            : tx.amount > 0
              ? 'sale'
              : 'operating_expense',
        );
        void this.load(tx.match ? tx.match.targetType + ':' + tx.match.targetId : null);
      });
    });
  }
  changeType(type: BankAssignmentType | null): void {
    if (!type || !this.typeOptions().some((option) => option.value === type) || this.saving())
      return;
    this.type.set(type);
    void this.load();
  }
  select(key: string | null): void {
    this.selectedKey.set(key);
    this.differenceConfirmed.set(false);
    this.error.set(null);
  }
  async load(initialKey: string | null = null): Promise<void> {
    const requestId = ++this.requestId;
    this.targets.set([]);
    this.selectedKey.set(null);
    this.differenceConfirmed.set(false);
    this.error.set(null);
    this.loading.set(true);
    try {
      if (this.transaction().currency !== 'EUR')
        throw new Error('Es können derzeit nur Bankbewegungen in EUR zugeordnet werden.');
      const targets = await this.assignments.loadTargets(
        this.transaction(),
        this.type(),
        this.context,
      );
      if (requestId !== this.requestId || this.destroyed) return;
      this.targets.set(targets);
      this.selectedKey.set(targets.some((target) => target.key === initialKey) ? initialKey : null);
    } catch (error: unknown) {
      if (requestId === this.requestId && !this.destroyed)
        this.error.set(
          error instanceof Error ? error.message : 'Die Auswahl konnte nicht geladen werden.',
        );
    } finally {
      if (requestId === this.requestId && !this.destroyed) this.loading.set(false);
    }
  }
  close(): void {
    if (!this.saving()) this.closed.emit();
  }
  async save(): Promise<void> {
    const selected = this.selected();
    if (!this.canSave() || !selected) return;
    this.saving.set(true);
    this.error.set(null);
    try {
      await this.assignments.assign(
        this.transaction(),
        selected,
        this.context,
        this.differenceConfirmed(),
      );
      if (!this.destroyed) {
        this.toast.success('Bankbewegung wurde zugeordnet.');
        this.closed.emit();
      }
    } catch (error: unknown) {
      if (!this.destroyed)
        this.error.set(
          error instanceof Error ? error.message : 'Die Zuordnung konnte nicht gespeichert werden.',
        );
    } finally {
      if (!this.destroyed) this.saving.set(false);
    }
  }
}
