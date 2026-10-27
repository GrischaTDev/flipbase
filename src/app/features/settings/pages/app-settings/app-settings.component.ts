import { ChangeDetectionStrategy, Component, effect, inject, untracked } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { AuthService } from '../../../../core/services/auth.service';
import { ActionOverviewPreferencesService } from '../../../../core/services/action-overview-preferences.service';
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
  readonly preferences = inject(ActionOverviewPreferencesService);
  private readonly auth = inject(AuthService);
  readonly form = new FormGroup({
    enabled: new FormControl(this.preferences.enabled(), { nonNullable: true }),
  });
  private editingUserId: string | null = null;
  private wasSaving = false;

  constructor() {
    effect(() => {
      const userId = this.auth.currentUser()?.id ?? null;
      const enabled = this.preferences.enabled();
      const saving = this.preferences.saving();
      const error = this.preferences.error();
      untracked(() => {
        if (
          userId !== this.editingUserId ||
          this.form.pristine ||
          (this.wasSaving && !saving && !error)
        ) {
          this.form.reset({ enabled });
          this.editingUserId = userId;
        }
        this.wasSaving = saving;
      });
    });
  }

  save(): void {
    if (this.editingUserId !== (this.auth.currentUser()?.id ?? null)) return;
    if (!this.preferences.saving()) this.preferences.setEnabled(this.form.controls.enabled.value);
  }
}
