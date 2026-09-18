import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import {
  LucideBuilding,
  LucideDynamicIcon,
  LucidePlus,
  LucideSave,
  LucideTrash2,
} from '@lucide/angular';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import {
  CustomSelectComponent,
  SelectOption,
} from '../../../../shared/components/custom-select/custom-select.component';
import { ToastService } from '../../../../shared/components/toast/toast.service';

@Component({
  selector: 'app-workspace-settings',
  imports: [ReactiveFormsModule, LucideDynamicIcon, CustomSelectComponent],
  templateUrl: './workspace-settings.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class WorkspaceSettingsComponent {
  readonly workspaceService = inject(WorkspaceService);
  private readonly router = inject(Router);
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
    await this.router.navigate(['/dashboard']);
  }
  onSwitchWorkspace(workspaceId: string): void {
    this.workspaceService.switchWorkspace(workspaceId);
  }
  async onDeleteWorkspace(workspaceId: string): Promise<void> {
    await this.router.navigate(['/settings/data'], {
      queryParams: { retentionWorkspace: workspaceId },
      fragment: 'retention-heading',
    });
  }
}
