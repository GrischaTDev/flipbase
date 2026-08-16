import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { LucideAngularModule, UserPlus, Sparkles, Mail, Lock, User } from 'lucide-angular';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-register',
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe, LucideAngularModule],
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

  readonly isLoading = signal<boolean>(false);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);

  readonly form = new FormGroup({
    fullName: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(2)] }),
    email: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.email] }),
    password: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(6)] }),
  });

  async onSubmit(): Promise<void> {
    if (this.form.invalid) return;

    this.isLoading.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null);

    const { fullName, email, password } = this.form.getRawValue();
    const { error } = await this.authService.signUp(email, password, fullName);

    this.isLoading.set(false);

    if (error) {
      this.errorMessage.set(error.message);
    } else {
      this.successMessage.set('Registrierung erfolgreich!');
      setTimeout(() => {
        this.router.navigate(['/dashboard']);
      }, 1000);
    }
  }
}
