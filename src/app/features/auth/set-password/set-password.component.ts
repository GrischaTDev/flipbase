import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import {
  AbstractControl,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  LucideDynamicIcon,
  LucideSparkles as Sparkles,
  LucideLock as Lock,
  LucideEye as Eye,
  LucideEyeOff as EyeOff,
  LucideCheckCircle2 as CheckCircle2,
  LucideAlertCircle as AlertCircle,
  LucideArrowLeft as ArrowLeft,
  LucideSun as Sun,
  LucideMoon as Moon,
  LucideKeyRound as KeyRound,
} from '@lucide/angular';
import { AuthService } from '../../../core/services/auth.service';
import { SupabaseService } from '../../../core/services/supabase.service';
import { ThemeService } from '../../../core/services/theme.service';
import { CustomCheckboxComponent } from '../../../shared/components/custom-checkbox/custom-checkbox.component';
import { NgOptimizedImage } from '@angular/common';
import { environment } from '../../../../environments/environment';
import { TermsModalComponent } from '../components/terms-modal/terms-modal.component';
import { PrivacyModalComponent } from '../components/privacy-modal/privacy-modal.component';

/** Validator to ensure password and confirmPassword match */
const passwordMatchValidator: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
  const password = control.get('password')?.value;
  const confirmPassword = control.get('confirmPassword')?.value;
  if (!password || !confirmPassword) return null;
  return password === confirmPassword ? null : { passwordMismatch: true };
};

@Component({
  selector: 'app-set-password',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    TranslatePipe,
    LucideDynamicIcon,
    CustomCheckboxComponent,
    NgOptimizedImage,
    TermsModalComponent,
    PrivacyModalComponent,
  ],
  templateUrl: './set-password.component.html',
  host: { class: 'block fb-admin' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SetPasswordComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly supabase = inject(SupabaseService);
  private readonly router = inject(Router);
  readonly themeService = inject(ThemeService);
  private readonly translate = inject(TranslateService);

  readonly logoIcon = Sparkles;
  readonly lockIcon = Lock;
  readonly keyIcon = KeyRound;
  readonly eyeIcon = Eye;
  readonly eyeOffIcon = EyeOff;
  readonly checkIcon = CheckCircle2;
  readonly alertIcon = AlertCircle;
  readonly arrowLeftIcon = ArrowLeft;
  readonly sunIcon = Sun;
  readonly moonIcon = Moon;

  readonly landingUrl = environment.landingUrl;
  readonly currentLanguage = signal<string>(this.translate.currentLang() || 'de');

  readonly showTermsModal = signal<boolean>(false);
  readonly showPrivacyModal = signal<boolean>(false);

  readonly isLoading = signal<boolean>(false);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);
  readonly isTokenInvalid = signal<boolean>(false);

  readonly showPassword = signal<boolean>(false);
  readonly showConfirmPassword = signal<boolean>(false);

  readonly greetingName = computed<string>(() => {
    const user = this.authService.currentUser();
    const firstName = user?.user_metadata?.['first_name'];
    const fullName = user?.user_metadata?.['full_name'];
    return (firstName || fullName || '').trim();
  });

  readonly form = new FormGroup(
    {
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
    { validators: [passwordMatchValidator] },
  );

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
      return {
        score: 1,
        labelKey: 'AUTH.PASSWORD_STRENGTH_WEAK',
        colorClass: 'bg-rose-500',
        widthClass: 'w-1/3',
      };
    }
    if (score === 2) {
      return {
        score: 2,
        labelKey: 'AUTH.PASSWORD_STRENGTH_MEDIUM',
        colorClass: 'bg-amber-500',
        widthClass: 'w-2/3',
      };
    }
    return {
      score: 3,
      labelKey: 'AUTH.PASSWORD_STRENGTH_STRONG',
      colorClass: 'bg-emerald-500',
      widthClass: 'w-full',
    };
  });

  constructor() {
    this.form.controls.password.valueChanges.subscribe((val) => {
      this.passwordValue.set(val || '');
    });
  }

  async ngOnInit(): Promise<void> {
    await this.authService.sessionReady;

    // Pruefe ob ein Fehler in der URL-Hash steht (z.B. token expired)
    const hash = typeof window !== 'undefined' ? window.location.hash : '';
    if (hash.includes('error=')) {
      this.isTokenInvalid.set(true);
      return;
    }

    // Nutzer muss authentifiziert sein (durch den Invite-Token via URL-Hash)
    if (!this.authService.isAuthenticated()) {
      // Kurze Verzoegerung, falls getSession noch verarbeitet wird
      await new Promise((resolve) => setTimeout(resolve, 300));
      if (!this.authService.isAuthenticated()) {
        this.isTokenInvalid.set(true);
      }
    }
  }

  switchLanguage(lang: string): void {
    this.currentLanguage.set(lang);
    this.translate.use(lang);
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

    const { password } = this.form.getRawValue();

    try {
      const { error } = await this.supabase.client.auth.updateUser({
        password,
        data: { beta_registration_completed: true },
      });

      if (error) {
        this.errorMessage.set(error.message);
        this.isLoading.set(false);
        return;
      }

      await this.authService.activatePendingBetaAccess();

      this.successMessage.set(this.translate.instant('AUTH.SET_PASSWORD_SUCCESS'));
      setTimeout(() => {
        void this.router.navigate(['/dashboard']);
      }, 1200);
    } catch (err: unknown) {
      this.errorMessage.set(
        err instanceof Error ? err.message : 'Passwort konnte nicht gespeichert werden.',
      );
      this.isLoading.set(false);
    }
  }
}
