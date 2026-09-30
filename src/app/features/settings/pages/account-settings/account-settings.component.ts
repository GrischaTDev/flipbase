import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import {
  AbstractControl,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { LucideKeyRound, LucideLogOut } from '@lucide/angular';
import { AuthService } from '../../../../core/services/auth.service';
import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { CardComponent } from '../../../../shared/components/card/card.component';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.service';
import { ModalShellComponent } from '../../../../shared/components/modal-shell/modal-shell.component';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { TextFieldComponent } from '../../../../shared/components/text-field/text-field.component';

function passwordsMatch(control: AbstractControl): ValidationErrors | null {
  const newPassword = control.get('newPassword')?.value;
  const confirmPassword = control.get('confirmPassword')?.value;
  if (!newPassword || !confirmPassword) return null;
  return newPassword === confirmPassword ? null : { passwordMismatch: true };
}

@Component({
  selector: 'app-account-settings',
  imports: [
    ReactiveFormsModule,
    BadgeComponent,
    ButtonComponent,
    CardComponent,
    ModalShellComponent,
    TextFieldComponent,
  ],
  templateUrl: './account-settings.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class AccountSettingsComponent {
  readonly auth = inject(AuthService);
  private readonly dialog = inject(ConfirmDialogService);
  private readonly toast = inject(ToastService);

  readonly keyIcon = LucideKeyRound;
  readonly logoutIcon = LucideLogOut;

  readonly profileForm = new FormGroup({
    fullName: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(2)],
    }),
  });
  readonly passwordForm = new FormGroup(
    {
      currentPassword: new FormControl('', {
        nonNullable: true,
        validators: [Validators.required],
      }),
      newPassword: new FormControl('', {
        nonNullable: true,
        validators: [Validators.required, Validators.minLength(10)],
      }),
      confirmPassword: new FormControl('', {
        nonNullable: true,
        validators: [Validators.required],
      }),
    },
    { validators: passwordsMatch },
  );

  readonly isSavingProfile = signal(false);
  readonly isSigningOutEverywhere = signal(false);
  readonly isPasswordModalOpen = signal(false);
  readonly isChangingPassword = signal(false);
  readonly passwordError = signal<string | null>(null);

  readonly accountEmail = computed(() => this.auth.currentUser()?.email ?? '—');
  readonly initials = computed(() => {
    const identity =
      this.auth.profile()?.full_name?.trim() ||
      this.auth.userName().trim() ||
      this.auth.currentUser()?.email?.split('@')[0]?.trim() ||
      '';
    const words = identity.split(/\s+/u).filter(Boolean).slice(0, 2);
    const letters = words
      .map((word) => Array.from(word)[0] ?? '')
      .join('')
      .toLocaleUpperCase('de-DE');
    return letters || '?';
  });

  constructor() {
    effect(() => {
      const profileName = this.auth.profile()?.full_name?.trim() || this.auth.userName().trim();
      const control = this.profileForm.controls.fullName;
      if (profileName && control.pristine && control.value !== profileName) {
        control.setValue(profileName, { emitEvent: false });
      }
    });
  }

  async onSaveProfile(): Promise<void> {
    if (this.profileForm.invalid || this.isSavingProfile()) return;
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

    const confirmedName =
      this.auth.profile()?.full_name?.trim() || this.profileForm.controls.fullName.value.trim();
    this.profileForm.controls.fullName.setValue(confirmedName, { emitEvent: false });
    this.profileForm.controls.fullName.markAsPristine();
    this.toast.success('Profil wurde gespeichert.');
  }

  openPasswordModal(): void {
    this.passwordForm.reset({
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    });
    this.passwordError.set(null);
    this.isPasswordModalOpen.set(true);
  }

  closePasswordModal(): void {
    if (this.isChangingPassword()) return;
    this.isPasswordModalOpen.set(false);
    this.passwordError.set(null);
    this.passwordForm.reset({
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    });
  }

  newPasswordError(): string | null {
    const control = this.passwordForm.controls.newPassword;
    if (!control.dirty && !control.touched) return null;
    if (control.hasError('required')) return 'Bitte gib ein neues Passwort ein.';
    if (control.hasError('minlength')) return 'Das neue Passwort muss mindestens 10 Zeichen lang sein.';
    return null;
  }

  confirmPasswordError(): string | null {
    const control = this.passwordForm.controls.confirmPassword;
    if (!control.dirty && !control.touched) return null;
    if (control.hasError('required')) return 'Bitte wiederhole das neue Passwort.';
    if (this.passwordForm.hasError('passwordMismatch')) return 'Passwörter stimmen nicht überein.';
    return null;
  }

  async onChangePassword(): Promise<void> {
    if (this.passwordForm.invalid || this.isChangingPassword()) {
      this.passwordForm.markAllAsTouched();
      return;
    }

    this.isChangingPassword.set(true);
    this.passwordError.set(null);
    const value = this.passwordForm.getRawValue();
    try {
      const result = await this.auth.changePassword(value.currentPassword, value.newPassword);
      if (result.error) {
        this.passwordError.set(result.error.message);
        return;
      }

      this.toast.success('Passwort wurde geändert.');
      this.isPasswordModalOpen.set(false);
      this.passwordForm.reset({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      });
    } finally {
      this.isChangingPassword.set(false);
    }
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
