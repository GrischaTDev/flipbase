import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { LucideDynamicIcon, LucideSave, LucideTruck } from '@lucide/angular';
import { FulfillmentService } from '../../../../core/services/fulfillment.service';
import { SyncStatusService } from '../../../../core/services/sync-status.service';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import { ToastService } from '../../../../shared/components/toast/toast.service';

@Component({
  selector: 'app-shipping-settings',
  imports: [ReactiveFormsModule, LucideDynamicIcon],
  templateUrl: './shipping-settings.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class ShippingSettingsComponent {
  private readonly fulfillmentService = inject(FulfillmentService);
  private readonly workspaceService = inject(WorkspaceService);
  private readonly toast = inject(ToastService);
  private readonly syncStatus = inject(SyncStatusService);
  readonly truckIcon = LucideTruck;
  readonly saveIcon = LucideSave;
  readonly carrierForm = new FormGroup({
    dhlEnabled: new FormControl(true),
    dhlEkp: new FormControl(''),
    dhlApiKey: new FormControl(''),
    hermesEnabled: new FormControl(true),
    hermesClientId: new FormControl(''),
    hermesApiKey: new FormControl(''),
  });
  readonly isLoadingWorkspaceConfig = signal(true);
  readonly isSavingCarrierConfig = signal(false);
  private saveRequestId = 0;
  private saveWorkspaceId: string | null = null;
  constructor() {
    effect(() => {
      const workspaceId = this.workspaceService.currentWorkspace()?.id ?? null;
      if (workspaceId !== this.saveWorkspaceId) {
        this.saveWorkspaceId = workspaceId;
        this.saveRequestId += 1;
        this.isSavingCarrierConfig.set(false);
      }
      if (!workspaceId || this.fulfillmentService.loadedWorkspaceId() !== workspaceId) {
        this.isLoadingWorkspaceConfig.set(workspaceId !== null);
        this.carrierForm.reset(
          {
            dhlEnabled: false,
            dhlEkp: '',
            dhlApiKey: '',
            hermesEnabled: false,
            hermesClientId: '',
            hermesApiKey: '',
          },
          { emitEvent: false },
        );
        return;
      }
      this.carrierForm.patchValue(this.fulfillmentService.carrierConfig(), { emitEvent: false });
      this.isLoadingWorkspaceConfig.set(false);
    });
  }
  async onSaveCarrierConfig(): Promise<void> {
    const workspaceId = this.workspaceService.currentWorkspace()?.id;
    if (!workspaceId || this.isLoadingWorkspaceConfig()) return;
    const value = this.carrierForm.getRawValue();
    const requestId = ++this.saveRequestId;
    this.isSavingCarrierConfig.set(true);
    try {
      const result = await this.fulfillmentService.updateCarrierConfig({
        dhlEnabled: !!value.dhlEnabled,
        dhlEkp: value.dhlEkp?.trim() || '',
        dhlApiKey: value.dhlApiKey?.trim() || '',
        hermesEnabled: !!value.hermesEnabled,
        hermesClientId: value.hermesClientId?.trim() || '',
        hermesApiKey: value.hermesApiKey?.trim() || '',
      });
      if (!this.isCurrentSave(requestId, workspaceId)) return;
      if (result.error || !result.data) {
        const error = result.error ?? new Error('Keine bestätigte Carrier-Konfiguration.');
        if (!result.reportedBySyncStatus)
          this.toast.error('Versanddienstleister konnten nicht gespeichert werden.', error.message);
        return;
      }
      this.toast.success('Versanddienstleister wurden gespeichert.');
    } catch (reason: unknown) {
      if (!this.isCurrentSave(requestId, workspaceId)) return;
      const error = reason instanceof Error ? reason : new Error('Unbekannter Fehler');
      if (!this.syncStatus.istZentralGemeldet(error))
        this.toast.error('Versanddienstleister konnten nicht gespeichert werden.', error.message);
    } finally {
      if (this.isCurrentSave(requestId, workspaceId)) this.isSavingCarrierConfig.set(false);
    }
  }
  private isCurrentSave(requestId: number, workspaceId: string): boolean {
    return (
      requestId === this.saveRequestId &&
      this.workspaceService.currentWorkspace()?.id === workspaceId
    );
  }
}
