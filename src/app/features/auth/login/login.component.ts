import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  LucideDynamicIcon,
  LucideLogIn as LogIn,
  LucideSparkles as Sparkles,
  LucideMail as Mail,
  LucideLock as Lock,
  LucideArrowLeft as ArrowLeft,
  LucideSun as Sun,
  LucideMoon as Moon,
} from '@lucide/angular';
import { AuthService } from '../../../core/services/auth.service';
import { ThemeService } from '../../../core/services/theme.service';
import { NgOptimizedImage } from '@angular/common';
import { environment } from '../../../../environments/environment';
import { ButtonComponent } from '../../../shared/components/button/button.component';
import { TextFieldComponent } from '../../../shared/components/text-field/text-field.component';

@Component({
  selector: 'app-login',
  imports: [
    ReactiveFormsModule,
    TranslatePipe,
    LucideDynamicIcon,
    NgOptimizedImage,
    ButtonComponent,
    TextFieldComponent,
  ],
  templateUrl: './login.component.html',
  host: { class: 'block fb-admin' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginComponent {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  readonly themeService = inject(ThemeService);
  private readonly translate = inject(TranslateService);

  readonly loginIcon = LogIn;
  readonly logoIcon = Sparkles;
  readonly mailIcon = Mail;
  readonly lockIcon = Lock;
  readonly arrowLeftIcon = ArrowLeft;
  readonly sunIcon = Sun;
  readonly moonIcon = Moon;

  readonly landingUrl = environment.landingUrl;
  readonly currentLanguage = signal<string>(this.translate.currentLang() || 'de');

  switchLanguage(lang: string): void {
    this.currentLanguage.set(lang);
    this.translate.use(lang);
  }

  readonly isLoading = signal<boolean>(false);
  readonly errorMessage = signal<string | null>(null);

  readonly form = new FormGroup({
    email: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.email],
    }),
    password: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(6)],
    }),
  });

  /** Zielseite, auf die der Guard umgeleitet hat – sonst das Dashboard. */
  private redirectTarget(): string {
    return this.route.snapshot.queryParamMap.get('redirectTo') || '/dashboard';
  }

  async onSubmit(): Promise<void> {
    if (this.form.invalid) return;

    this.isLoading.set(true);
    this.errorMessage.set(null);

    const { email, password } = this.form.getRawValue();
    const { error } = await this.authService.signIn(email, password);

    this.isLoading.set(false);

    if (error) {
      this.errorMessage.set(error.message);
    } else {
      this.router.navigateByUrl(this.redirectTarget());
    }
  }
}
