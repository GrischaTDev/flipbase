import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { LucideCreditCard, LucideDynamicIcon, LucideLandmark, LucideSave } from '@lucide/angular';
import { StoreService } from '../../../../core/services/store.service';
import { SyncStatusService } from '../../../../core/services/sync-status.service';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import { ToastService } from '../../../../shared/components/toast/toast.service';

@Component({
  selector: 'app-store-settings',
  imports: [ReactiveFormsModule, LucideDynamicIcon],
  templateUrl: './store-settings.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class StoreSettingsComponent {
  private readonly storeService = inject(StoreService);
  private readonly workspaceService = inject(WorkspaceService);
  private readonly toast = inject(ToastService);
  private readonly syncStatus = inject(SyncStatusService);
  readonly cardIcon = LucideCreditCard;
  readonly bankIcon = LucideLandmark;
  readonly saveIcon = LucideSave;
  readonly paymentForm = new FormGroup({
    stripeEnabled: new FormControl(true),
    stripePublishableKey: new FormControl(''),
    paypalEnabled: new FormControl(true),
    paypalEmail: new FormControl(''),
    bankTransferEnabled: new FormControl(true),
    bankName: new FormControl(''),
    bankIban: new FormControl(''),
    bankBic: new FormControl(''),
    bankAccountHolder: new FormControl(''),
    cashOnPickupEnabled: new FormControl(true),
  });
  readonly isLoadingWorkspaceConfig = signal(true);
  readonly isSavingPaymentConfig = signal(false);
  constructor() {
    effect(() => {
      const workspaceId = this.workspaceService.currentWorkspace()?.id ?? null;
      if (!workspaceId || this.storeService.loadedWorkspaceId() !== workspaceId) {
        this.isLoadingWorkspaceConfig.set(workspaceId !== null);
        this.paymentForm.reset(
          {
            stripeEnabled: false,
            stripePublishableKey: '',
            paypalEnabled: false,
            paypalEmail: '',
            bankTransferEnabled: false,
            bankName: '',
            bankIban: '',
            bankBic: '',
            bankAccountHolder: '',
            cashOnPickupEnabled: false,
          },
          { emitEvent: false },
        );
        return;
      }
      this.paymentForm.patchValue(this.storeService.storeSettings().payments, { emitEvent: false });
      this.isLoadingWorkspaceConfig.set(false);
    });
  }
  async onSavePaymentConfig(): Promise<void> {
    const workspaceId = this.workspaceService.currentWorkspace()?.id;
    if (!workspaceId || this.isLoadingWorkspaceConfig()) return;
    const value = this.paymentForm.getRawValue();
    this.isSavingPaymentConfig.set(true);
    try {
      const result = await this.storeService.updatePaymentsConfig({
        stripeEnabled: !!value.stripeEnabled,
        stripePublishableKey: value.stripePublishableKey?.trim() || '',
        paypalEnabled: !!value.paypalEnabled,
        paypalEmail: value.paypalEmail?.trim() || '',
        bankTransferEnabled: !!value.bankTransferEnabled,
        bankIban: value.bankIban?.trim() || '',
        bankBic: value.bankBic?.trim() || '',
        bankAccountHolder: value.bankAccountHolder?.trim() || '',
        cashOnPickupEnabled: !!value.cashOnPickupEnabled,
      });
      if (this.workspaceService.currentWorkspace()?.id !== workspaceId) return;
      if (result.error || !result.data) {
        const error = result.error ?? new Error('Keine bestätigten Zahlungsmethoden.');
        if (!result.reportedBySyncStatus)
          this.toast.error('Zahlungsmethoden konnten nicht gespeichert werden.', error.message);
        return;
      }
      this.toast.success('Zahlungsmethoden wurden gespeichert.');
    } catch (reason: unknown) {
      const error = reason instanceof Error ? reason : new Error('Unbekannter Fehler');
      if (!this.syncStatus.istZentralGemeldet(error))
        this.toast.error('Zahlungsmethoden konnten nicht gespeichert werden.', error.message);
    } finally {
      this.isSavingPaymentConfig.set(false);
    }
  }
}
