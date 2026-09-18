import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  LucideBuilding,
  LucideDynamicIcon,
  LucidePlus,
  LucideSave,
  LucideTrash2,
} from '@lucide/angular';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.service';
import {
  CustomSelectComponent,
  SelectOption,
} from '../../../../shared/components/custom-select/custom-select.component';
import { ToastService } from '../../../../shared/components/toast/toast.service';

@Component({
  selector: 'app-workspace-settings',
  imports: [ReactiveFormsModule, LucideDynamicIcon, CustomSelectComponent, BadgeComponent],
  templateUrl: './workspace-settings.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class WorkspaceSettingsComponent {
  readonly workspaceService = inject(WorkspaceService);
  private readonly dialog = inject(ConfirmDialogService);
  private readonly toast = inject(ToastService);

  readonly buildingIcon = LucideBuilding;
  readonly plusIcon = LucidePlus;
  readonly saveIcon = LucideSave;
  readonly trashIcon = LucideTrash2;
  readonly taxModeOptions: readonly SelectOption<string>[] = [
    { value: 'diff_25a', label: '§ 25a Differenzbesteuerung (Gebrauchtwaren)' },
    { value: 'kleinunternehmer_19', label: '§ 19 Kleinunternehmer (0% USt)' },
    { value: 'regular_19', label: '19% Regelbesteuerung (Standard)' },
  ];

  readonly settingsForm = new FormGroup({
    workspaceName: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    currency: new FormControl('EUR', { nonNullable: true }),
    taxMode: new FormControl('diff_25a', { nonNullable: true }),
    minRoiPercent: new FormControl(20, { nonNullable: true, validators: [Validators.min(0)] }),
    minProfitAmount: new FormControl(10, { nonNullable: true, validators: [Validators.min(0)] }),
  });
  readonly newWorkspaceName = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required],
  });
  readonly isSaving = signal(false);
  readonly isCreatingWorkspace = signal(false);
  readonly workspaceActionId = signal<string | null>(null);

  constructor() {
    effect(() => {
      const workspace = this.workspaceService.currentWorkspace();
      if (workspace)
        this.settingsForm.patchValue({
          workspaceName: workspace.name,
          currency: workspace.currency || 'EUR',
          taxMode: workspace.tax_mode || 'diff_25a',
          minRoiPercent: workspace.min_roi_percent,
          minProfitAmount: workspace.min_profit_amount,
        });
    });
  }

  async onSaveSettings(): Promise<void> {
    if (this.settingsForm.invalid) return;
    const workspace = this.workspaceService.currentWorkspace();
    if (!workspace) return;
    this.isSaving.set(true);
    const value = this.settingsForm.getRawValue();
    const { error } = await this.workspaceService.updateWorkspaceSettings(workspace.id, {
      name: value.workspaceName,
      min_roi_percent: value.minRoiPercent,
      min_profit_amount: value.minProfitAmount,
    });
    this.isSaving.set(false);
    if (!error) this.toast.success('Einstellungen wurden gespeichert.');
  }

  async onCreateWorkspace(): Promise<void> {
    if (this.newWorkspaceName.invalid) return;
    const name = this.newWorkspaceName.value.trim();
    if (!name) return;
    this.isCreatingWorkspace.set(true);
    const { error } = await this.workspaceService.createWorkspace(name);
    this.isCreatingWorkspace.set(false);
    if (error) return;
    this.newWorkspaceName.reset();
    this.toast.success('Workspace wurde erstellt.');
  }

  onSwitchWorkspace(workspaceId: string): void {
    if (this.workspaceActionId()) return;
    this.workspaceService.switchWorkspace(workspaceId);
  }

  async onDeleteWorkspace(workspaceId: string): Promise<void> {
    if (this.workspaceActionId()) return;
    const workspace = this.workspaceService.workspaces().find((entry) => entry.id === workspaceId);
    if (!workspace) return;

    const confirmed = await this.dialog.frage({
      titel: 'Workspace löschen?',
      text:
        '„' +
        workspace.name +
        '“ wird endgültig gelöscht, wenn er keine aufbewahrungsrelevanten Geschäftsdaten enthält. Diese Aktion kann nicht rückgängig gemacht werden.',
      bestaetigenText: 'Workspace löschen',
      gefahr: true,
    });
    if (!confirmed) return;

    this.workspaceActionId.set(workspaceId);
    try {
      const result = await this.workspaceService.deleteWorkspace(workspaceId);
      if (result.success) {
        this.toast.success('Workspace wurde gelöscht.');
        return;
      }
      if (!result.retentionBlocked) {
        if (!result.reportedBySyncStatus) {
          this.toast.error('Workspace konnte nicht gelöscht werden.');
        }
        return;
      }

      const archiveConfirmed = await this.dialog.frage({
        titel: 'Workspace kann nicht gelöscht werden',
        text:
          '„' +
          workspace.name +
          '“ enthält aufbewahrungsrelevante Geschäftsdaten oder Prüfprotokolle und muss deshalb erhalten bleiben. Du kannst ihn stattdessen archivieren. Er bleibt dann lesbar, neue Geschäftsdaten werden aber gesperrt. Ein Datenexport ist optional unter „Daten & Protokolle“ verfügbar.',
        bestaetigenText: 'Workspace archivieren',
        abbrechenText: 'Abbrechen',
      });
      if (!archiveConfirmed) return;

      const archiveResult = await this.workspaceService.archiveWorkspace(workspaceId);
      if (archiveResult.error) {
        this.toast.error('Workspace konnte nicht archiviert werden.', archiveResult.error.message);
        return;
      }
      this.toast.success('Workspace wurde archiviert.');
    } catch (error) {
      this.toast.error('Workspace konnte nicht gelöscht werden.', this.errorMessage(error));
    } finally {
      if (this.workspaceActionId() === workspaceId) this.workspaceActionId.set(null);
    }
  }

  async onRestoreWorkspace(workspaceId: string): Promise<void> {
    if (this.workspaceActionId()) return;
    this.workspaceActionId.set(workspaceId);
    try {
      const result = await this.workspaceService.restoreWorkspace(workspaceId);
      if (result.error) {
        this.toast.error(
          'Workspace konnte nicht wiederhergestellt werden.',
          result.error.message,
        );
        return;
      }
      this.toast.success('Workspace wurde wiederhergestellt.');
    } catch (error) {
      this.toast.error(
        'Workspace konnte nicht wiederhergestellt werden.',
        this.errorMessage(error),
      );
    } finally {
      if (this.workspaceActionId() === workspaceId) this.workspaceActionId.set(null);
    }
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Unbekannter Fehler';
  }
}
