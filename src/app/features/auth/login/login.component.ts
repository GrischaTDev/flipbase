import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { LucideAngularModule, LogIn, Sparkles, Mail, Lock, Zap } from 'lucide-angular';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe, LucideAngularModule],
  templateUrl: './login.component.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginComponent {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly loginIcon = LogIn;
  readonly logoIcon = Sparkles;
  readonly mailIcon = Mail;
  readonly lockIcon = Lock;
  readonly zapIcon = Zap;

  readonly isLoading = signal<boolean>(false);
  readonly errorMessage = signal<string | null>(null);

  readonly form = new FormGroup({
    email: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.email] }),
    password: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(6)] }),
  });

  /** Ob der Demo-Modus in dieser Umgebung angeboten wird. */
  readonly isDemoModeAllowed = this.authService.isDemoModeAllowed;

  onDemoLogin(): void {
    this.authService.enterDemoMode();
  }

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
