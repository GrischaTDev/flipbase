import { ChangeDetectionStrategy, Component, effect, inject, untracked } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { AuthService } from '../../../../core/services/auth.service';
import { AppDisplayPreferencesService } from '../../../../core/services/app-display-preferences.service';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { CardComponent } from '../../../../shared/components/card/card.component';
import { CustomCheckboxComponent } from '../../../../shared/components/custom-checkbox/custom-checkbox.component';
import { FormFieldComponent } from '../../../../shared/components/form-field/form-field.component';

@Component({
  selector: 'app-app-settings',
  imports: [
    ReactiveFormsModule,
    ButtonComponent,
    CardComponent,
    CustomCheckboxComponent,
    FormFieldComponent,
  ],
  templateUrl: './app-settings.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class AppSettingsComponent {
  readonly preferences = inject(AppDisplayPreferencesService);
  private readonly auth = inject(AuthService);
  readonly form = new FormGroup({
    enabled: new FormControl(this.preferences.actionOverviewEnabled(), { nonNullable: true }),
    workspaceSwitcherEnabled: new FormControl(this.preferences.workspaceSwitcherEnabled(), {
      nonNullable: true,
    }),
  });
  private editingUserId: string | null = null;
  private wasSaving = false;

  constructor() {
    effect(() => {
      const userId = this.auth.currentUser()?.id ?? null;
      const enabled = this.preferences.actionOverviewEnabled();
      const workspaceSwitcherEnabled = this.preferences.workspaceSwitcherEnabled();
      const saving = this.preferences.saving();
      const error = this.preferences.error();
      untracked(() => {
        if (userId !== this.editingUserId || (this.wasSaving && !saving && !error)) {
          this.form.reset({ enabled, workspaceSwitcherEnabled });
          this.editingUserId = userId;
        } else {
          if (this.form.controls.enabled.pristine) this.form.controls.enabled.setValue(enabled);
          if (this.form.controls.workspaceSwitcherEnabled.pristine)
            this.form.controls.workspaceSwitcherEnabled.setValue(workspaceSwitcherEnabled);
        }
        this.wasSaving = saving;
      });
    });
  }

  save(): void {
    if (this.editingUserId !== (this.auth.currentUser()?.id ?? null)) return;
    if (this.preferences.saving()) return;
    this.preferences.save({
      ...(this.form.controls.enabled.dirty
        ? { actionOverviewEnabled: this.form.controls.enabled.value }
        : {}),
      ...(this.form.controls.workspaceSwitcherEnabled.dirty
        ? { workspaceSwitcherEnabled: this.form.controls.workspaceSwitcherEnabled.value }
        : {}),
    });
  }
}
