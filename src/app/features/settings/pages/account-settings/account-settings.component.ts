import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { LucideDynamicIcon, LucideUser, LucideLogOut } from '@lucide/angular';
import { AuthService } from '../../../../core/services/auth.service';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.service';
import { ToastService } from '../../../../shared/components/toast/toast.service';

@Component({
  selector: 'app-account-settings',
  imports: [ReactiveFormsModule, LucideDynamicIcon],
  templateUrl: './account-settings.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class AccountSettingsComponent {
  readonly auth = inject(AuthService);
  private readonly dialog = inject(ConfirmDialogService);
  private readonly toast = inject(ToastService);
  readonly userIcon = LucideUser;
  readonly logoutIcon = LucideLogOut;
  readonly profileForm = new FormGroup({
    fullName: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(2)],
    }),
  });
  readonly isSavingProfile = signal(false);
  readonly isSigningOutEverywhere = signal(false);

  constructor() {
    effect(() => {
      const profile = this.auth.profile();
      if (profile?.full_name)
        this.profileForm.patchValue({ fullName: profile.full_name }, { emitEvent: false });
    });
  }

  async onSaveProfile(): Promise<void> {
    if (this.profileForm.invalid) return;
    this.isSavingProfile.set(true);
    const { error, reportedBySyncStatus } = await this.auth.aktualisiereProfil(
      this.profileForm.getRawValue().fullName,
    );
    this.isSavingProfile.set(false);
    if (error) {
      if (!reportedBySyncStatus)
        this.toast.error('Profil konnte nicht gespeichert werden.', error.message);
      return;
    }
    this.toast.success('Profil wurde gespeichert.');
  }

  async onSignOutEverywhere(): Promise<void> {
    const confirmed = await this.dialog.frage({
      titel: 'Von allen Geräten abmelden?',
      text: 'Alle offenen Sitzungen werden beendet – auch auf deinem Handy und auf fremden Rechnern. Du musst dich überall neu anmelden.',
      bestaetigenText: 'Überall abmelden',
      gefahr: true,
    });
    if (!confirmed) return;
    this.isSigningOutEverywhere.set(true);
    try {
      await this.auth.abmeldenUeberall();
    } finally {
      this.isSigningOutEverywhere.set(false);
    }
  }
}
