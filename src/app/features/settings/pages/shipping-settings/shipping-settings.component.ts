import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import {
  AbstractControl,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { LucideDynamicIcon, LucideSave, LucideTruck } from '@lucide/angular';
import { FulfillmentService } from '../../../../core/services/fulfillment.service';
import { SyncStatusService } from '../../../../core/services/sync-status.service';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { TextFieldComponent } from '../../../../shared/components/text-field/text-field.component';
import { CustomCheckboxComponent } from '../../../../shared/components/custom-checkbox/custom-checkbox.component';

function trimmedRequired(control: AbstractControl<string>): ValidationErrors | null {
  return control.value.trim() ? null : { trimmedRequired: true };
}

@Component({
  selector: 'app-shipping-settings',
  imports: [ReactiveFormsModule, LucideDynamicIcon, TextFieldComponent, CustomCheckboxComponent],
  templateUrl: './shipping-settings.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class ShippingSettingsComponent {
  readonly fulfillmentService = inject(FulfillmentService);
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
    senderName: new FormControl('', { nonNullable: true, validators: [trimmedRequired] }),
    senderCompany: new FormControl('', { nonNullable: true }),
    senderStreet: new FormControl('', { nonNullable: true, validators: [trimmedRequired] }),
    senderHouseNumber: new FormControl('', {
      nonNullable: true,
      validators: [trimmedRequired],
    }),
    senderPostalCode: new FormControl('', {
      nonNullable: true,
      validators: [trimmedRequired],
    }),
    senderCity: new FormControl('', { nonNullable: true, validators: [trimmedRequired] }),
    senderCountry: new FormControl('', {
      nonNullable: true,
      validators: [trimmedRequired],
    }),
    senderEmail: new FormControl('', { nonNullable: true, validators: [Validators.email] }),
    senderPhone: new FormControl('', { nonNullable: true }),
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
            senderName: '',
            senderCompany: '',
            senderStreet: '',
            senderHouseNumber: '',
            senderPostalCode: '',
            senderCity: '',
            senderCountry: '',
            senderEmail: '',
            senderPhone: '',
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
    if (!workspaceId || this.isLoadingWorkspaceConfig() || this.fulfillmentService.loadError())
      return;
    if (this.carrierForm.invalid) {
      this.carrierForm.markAllAsTouched();
      return;
    }
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
        senderName: value.senderName.trim(),
        senderCompany: value.senderCompany.trim(),
        senderStreet: value.senderStreet.trim(),
        senderHouseNumber: value.senderHouseNumber.trim(),
        senderPostalCode: value.senderPostalCode.trim(),
        senderCity: value.senderCity.trim(),
        senderCountry: value.senderCountry.trim(),
        senderEmail: value.senderEmail.trim(),
        senderPhone: value.senderPhone.trim(),
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
  retryLoad(): void {
    const workspaceId = this.workspaceService.currentWorkspace()?.id;
    if (workspaceId) void this.fulfillmentService.loadFromSupabase(workspaceId);
  }

  fieldError(control: FormControl<string>, label: string): string | null {
    if (!control.touched && !control.dirty) return null;
    if (control.hasError('trimmedRequired')) return `${label} ist erforderlich.`;
    if (control.hasError('email')) return 'Bitte gib eine gültige E-Mail-Adresse ein.';
    return null;
  }
  private isCurrentSave(requestId: number, workspaceId: string): boolean {
    return (
      requestId === this.saveRequestId &&
      this.workspaceService.currentWorkspace()?.id === workspaceId
    );
  }
}
