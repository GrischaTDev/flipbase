import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { AbstractControl, FormControl, FormGroup, ReactiveFormsModule, ValidationErrors, ValidatorFn, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { LucideAngularModule, UserPlus, Sparkles, Mail, Lock, User, Eye, EyeOff, CheckCircle2, ShieldCheck, AlertCircle } from 'lucide-angular';
import { AuthService } from '../../../core/services/auth.service';
import { CustomCheckboxComponent } from '../../../shared/components/custom-checkbox/custom-checkbox.component';

/** Validator to ensure password and confirmPassword match */
const passwordMatchValidator: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
  const password = control.get('password')?.value;
  const confirmPassword = control.get('confirmPassword')?.value;
  if (!password || !confirmPassword) return null;
  return password === confirmPassword ? null : { passwordMismatch: true };
};

@Component({
  selector: 'app-register',
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe, LucideAngularModule, CustomCheckboxComponent],
  templateUrl: './register.component.html',
  styleUrl: './register.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RegisterComponent {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  readonly registerIcon = UserPlus;
  readonly logoIcon = Sparkles;
  readonly mailIcon = Mail;
  readonly lockIcon = Lock;
  readonly userIcon = User;
  readonly eyeIcon = Eye;
  readonly eyeOffIcon = EyeOff;
  readonly checkIcon = CheckCircle2;
  readonly shieldIcon = ShieldCheck;
  readonly alertIcon = AlertCircle;

  readonly isLoading = signal<boolean>(false);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);

  readonly showPassword = signal<boolean>(false);
  readonly showConfirmPassword = signal<boolean>(false);

  readonly form = new FormGroup(
    {
      fullName: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(2)] }),
      email: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.email] }),
      password: new FormControl('', {
        nonNullable: true,
        validators: [Validators.required, Validators.minLength(8)],
      }),
      confirmPassword: new FormControl('', {
        nonNullable: true,
        validators: [Validators.required],
      }),
      acceptTerms: new FormControl(false, {
        nonNullable: true,
        validators: [Validators.requiredTrue],
      }),
    },
    { validators: [passwordMatchValidator] }
  );

  // Dynamic Password Strength calculation
  readonly passwordValue = signal<string>('');

  readonly passwordStrength = computed<{
    score: number;
    labelKey: string;
    colorClass: string;
    widthClass: string;
  }>(() => {
    const val = this.passwordValue();
    if (!val || val.length < 4) {
      return { score: 0, labelKey: '', colorClass: 'bg-transparent', widthClass: 'w-0' };
    }

    let score = 0;
    if (val.length >= 8) score++;
    if (/[a-z]/.test(val) && /[A-Z]/.test(val)) score++;
    if (/\d/.test(val) || /[^A-Za-z0-9]/.test(val)) score++;

    if (score <= 1) {
      return { score: 1, labelKey: 'AUTH.PASSWORD_STRENGTH_WEAK', colorClass: 'bg-rose-500', widthClass: 'w-1/3' };
    }
    if (score === 2) {
      return { score: 2, labelKey: 'AUTH.PASSWORD_STRENGTH_MEDIUM', colorClass: 'bg-amber-500', widthClass: 'w-2/3' };
    }
    return { score: 3, labelKey: 'AUTH.PASSWORD_STRENGTH_STRONG', colorClass: 'bg-emerald-500', widthClass: 'w-full' };
  });

  constructor() {
    this.form.controls.password.valueChanges.subscribe((val) => {
      this.passwordValue.set(val || '');
    });
  }

  toggleShowPassword(): void {
    this.showPassword.update((v) => !v);
  }

  toggleShowConfirmPassword(): void {
    this.showConfirmPassword.update((v) => !v);
  }

  get isPasswordMismatch(): boolean {
    return (
      this.form.hasError('passwordMismatch') &&
      this.form.controls.confirmPassword.touched &&
      this.form.controls.confirmPassword.value.length > 0
    );
  }

  get isPasswordMatch(): boolean {
    return (
      !this.form.hasError('passwordMismatch') &&
      this.form.controls.confirmPassword.value.length > 0 &&
      this.form.controls.password.value.length >= 8
    );
  }

  async onSubmit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null);

    const { fullName, email, password } = this.form.getRawValue();
    const { error } = await this.authService.signUp(email, password, fullName);

    this.isLoading.set(false);

    if (error) {
      this.errorMessage.set(error.message);
    } else {
      this.successMessage.set('Registrierung erfolgreich! Du wirst weitergeleitet...');
      setTimeout(() => {
        this.router.navigate(['/dashboard']);
      }, 1200);
    }
  }
}
