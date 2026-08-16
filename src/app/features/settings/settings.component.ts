import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { LucideAngularModule, Settings, Target, Check, AlertCircle } from 'lucide-angular';
import { WorkspaceService } from '../../core/services/workspace.service';

@Component({
  selector: 'app-settings',
  imports: [ReactiveFormsModule, TranslatePipe, LucideAngularModule],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsComponent {
  readonly workspaceService = inject(WorkspaceService);

  readonly settingsIcon = Settings;
  readonly targetIcon = Target;
  readonly checkIcon = Check;
  readonly alertIcon = AlertCircle;

  readonly isSaving = signal<boolean>(false);
  readonly statusMessage = signal<string | null>(null);

  readonly form = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    min_roi_percent: new FormControl<number>(30, { nonNullable: true, validators: [Validators.required, Validators.min(0)] }),
    min_profit_amount: new FormControl<number>(15, { nonNullable: true, validators: [Validators.required, Validators.min(0)] }),
  });

  constructor() {
    effect(() => {
      const ws = this.workspaceService.currentWorkspace();
      if (ws) {
        this.form.patchValue({
          name: ws.name,
          min_roi_percent: ws.min_roi_percent,
          min_profit_amount: ws.min_profit_amount,
        });
      }
    });
  }

  async onSave(): Promise<void> {
    const ws = this.workspaceService.currentWorkspace();
    if (!ws || this.form.invalid) return;

    this.isSaving.set(true);
    this.statusMessage.set(null);

    const val = this.form.getRawValue();
    const { error } = await this.workspaceService.updateWorkspaceSettings(ws.id, val);

    this.isSaving.set(false);

    if (error) {
      this.statusMessage.set('Fehler beim Speichern: ' + error.message);
    } else {
      this.statusMessage.set('Einstellungen erfolgreich gespeichert!');
      setTimeout(() => this.statusMessage.set(null), 3000);
    }
  }
}
