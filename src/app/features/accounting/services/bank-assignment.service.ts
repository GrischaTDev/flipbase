import { Injectable, inject } from '@angular/core';
import { AuthService } from '../../../core/services/auth.service';
import { WorkspaceService } from '../../../core/services/workspace.service';
import { SalesService } from '../../../core/services/sales.service';
import { PurchaseService } from '../../../core/services/purchase.service';
import { StoreService } from '../../../core/services/store.service';
import { ExpenseService } from '../../../core/services/expense.service';
import { BankReconciliationService } from '../../../core/services/bank-reconciliation.service';
import type { BankTransaction } from '../../../core/models/bank-reconciliation.models';
import {
  buildBankAssignmentTargets,
  bankAssignmentDifference,
  type BankAssignmentTarget,
  type BankAssignmentType,
} from '../models/bank-assignment.models';

export interface BankAssignmentContext {
  readonly workspaceId: string;
  readonly userId: string;
}

@Injectable({ providedIn: 'root' })
export class BankAssignmentService {
  private readonly workspace = inject(WorkspaceService);
  private readonly auth = inject(AuthService);
  private readonly sales = inject(SalesService);
  private readonly purchases = inject(PurchaseService);
  private readonly store = inject(StoreService);
  private readonly expenses = inject(ExpenseService);
  private readonly bank = inject(BankReconciliationService);

  captureContext(): BankAssignmentContext {
    return {
      workspaceId: this.workspace.currentWorkspace()?.id ?? '',
      userId: this.auth.currentUser()?.id ?? '',
    };
  }
  isCurrentContext(context: BankAssignmentContext): boolean {
    return (
      !!context.workspaceId &&
      !!context.userId &&
      context.workspaceId === this.workspace.currentWorkspace()?.id &&
      context.userId === this.auth.currentUser()?.id
    );
  }
  private assertContext(context: BankAssignmentContext): void {
    if (!this.isCurrentContext(context))
      throw new Error(
        'Dein Arbeitsbereich oder Deine Anmeldung hat sich geändert. Öffne die Zuordnung erneut.',
      );
  }
  async loadTargets(
    tx: BankTransaction,
    type: BankAssignmentType,
    context: BankAssignmentContext,
  ): Promise<BankAssignmentTarget[]> {
    this.assertContext(context);
    const workspaceId = context.workspaceId;
    if (type === 'sale') {
      await this.sales.loadSales(workspaceId);
      if (this.sales.loadError() || this.sales.loadedWorkspaceId() !== workspaceId)
        throw new Error('Verkäufe konnten nicht geladen werden.');
    } else if (type === 'purchase') {
      await this.purchases.loadPurchases(workspaceId);
      if (this.purchases.loadError() || this.purchases.loadedWorkspaceId() !== workspaceId)
        throw new Error('Einkäufe konnten nicht geladen werden.');
    } else if (type === 'operating_expense') {
      if (!(await this.expenses.load())) throw new Error('Ausgaben konnten nicht geladen werden.');
    } else {
      await this.store.loadFromSupabase(workspaceId);
      if (this.store.loadedWorkspaceId() !== workspaceId)
        throw new Error('Shopbestellungen konnten nicht geladen werden.');
    }
    this.assertContext(context);
    const targets = buildBankAssignmentTargets(tx, workspaceId, {
      sales: type === 'sale' ? this.sales.sales() : [],
      purchases: type === 'purchase' ? this.purchases.purchases() : [],
      expenses: type === 'operating_expense' ? this.expenses.expenses() : [],
      orders: type === 'store_order' ? this.store.orders() : [],
      storeWorkspaceId: this.store.loadedWorkspaceId(),
      storeCurrency: type === 'store_order' ? this.store.storeSettings().currency : 'EUR',
    });
    return targets.filter(
      (target) =>
        !this.bank
          .transactions()
          .some(
            (other) =>
              other.id !== tx.id &&
              (other.status === 'matched' || other.status === 'booked') &&
              other.match?.targetType === target.type &&
              other.match.targetId === target.id,
          ),
    );
  }
  async assign(
    snapshot: BankTransaction,
    selected: BankAssignmentTarget,
    context: BankAssignmentContext,
    differenceConfirmed: boolean,
  ): Promise<void> {
    this.assertContext(context);
    const current = this.bank.transactions().find((tx) => tx.id === snapshot.id);
    if (
      !current ||
      !['pending', 'matched'].includes(current.status) ||
      current.amount !== snapshot.amount ||
      current.currency !== snapshot.currency
    )
      throw new Error('Die Bankbewegung hat sich geändert. Öffne die Zuordnung erneut.');
    const targets = await this.loadTargets(current, selected.type, context);
    const refreshed = this.bank.transactions().find((tx) => tx.id === snapshot.id);
    if (
      !refreshed ||
      !['pending', 'matched'].includes(refreshed.status) ||
      refreshed.amount !== snapshot.amount ||
      refreshed.currency !== snapshot.currency
    )
      throw new Error('Die Bankbewegung hat sich geändert. Öffne die Zuordnung erneut.');
    const target = targets.find((target) => target.key === selected.key);
    if (!target || target.amount !== selected.amount)
      throw new Error(
        'Der Eintrag ist nicht mehr verfügbar oder wurde geändert. Aktualisiere die Auswahl.',
      );
    if (bankAssignmentDifference(refreshed.amount, target.amount) !== 0 && !differenceConfirmed)
      throw new Error('Bitte bestätige zuerst den abweichenden Betrag.');
    this.assertContext(context);
    const result = await this.bank.manualAssign(current.id, {
      targetType: target.type,
      targetId: target.id,
      targetReference: target.reference,
      targetName: target.name || target.title,
      targetAmount: target.amount,
      confidence: 100,
      confidenceLabel: 'manual',
      reason: 'Manuell zugeordnet',
    });
    this.assertContext(context);
    if (!result.success) throw new Error(result.message);
  }
}
