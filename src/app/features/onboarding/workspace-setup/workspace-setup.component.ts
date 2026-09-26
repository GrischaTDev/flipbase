import { NgOptimizedImage } from '@angular/common';
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
import { Router } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AuthService } from '../../../core/services/auth.service';
import { WorkspaceService } from '../../../core/services/workspace.service';
import { ButtonComponent } from '../../../shared/components/button/button.component';
import { TextFieldComponent } from '../../../shared/components/text-field/text-field.component';
import { BetaDiscordBannerComponent } from '../../beta-discord/components/beta-discord-banner/beta-discord-banner.component';

const workspaceNameLengthValidator: ValidatorFn = (
  control: AbstractControl,
): ValidationErrors | null => {
  const value = typeof control.value === 'string' ? control.value.trim() : '';
  return value.length >= 2 && value.length <= 100 ? null : { workspaceNameLength: true };
};

@Component({
  selector: 'app-workspace-setup',
  imports: [
    NgOptimizedImage,
    ReactiveFormsModule,
    TranslatePipe,
    ButtonComponent,
    TextFieldComponent,
    BetaDiscordBannerComponent,
  ],
  templateUrl: './workspace-setup.component.html',
  host: { class: 'block fb-admin' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkspaceSetupComponent implements OnInit {
  private readonly workspaceService = inject(WorkspaceService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly translate = inject(TranslateService);

  readonly isLoading = signal(false);
  readonly isSaving = signal(false);
  readonly errorMessage = signal<string | null>(null);

  readonly incompleteWorkspace = computed(
    () =>
      this.workspaceService
        .workspaces()
        .find((workspace) => workspace.setup_completed_at === null) ?? null,
  );

  readonly canRetryLoad = computed(
    () =>
      this.workspaceService.loadError() !== null || this.workspaceService.workspaces().length === 0,
  );

  readonly form = new FormGroup({
    workspaceName: new FormControl('', {
      nonNullable: true,
      validators: [
        Validators.required,
        Validators.minLength(2),
        Validators.maxLength(100),
        workspaceNameLengthValidator,
      ],
    }),
  });

  submitDisabled(): boolean {
    return (
      this.form.invalid ||
      this.isLoading() ||
      this.isSaving() ||
      this.incompleteWorkspace() === null
    );
  }

  async ngOnInit(): Promise<void> {
    await this.retryLoad();
  }

  async retryLoad(): Promise<void> {
    this.isLoading.set(true);
    this.errorMessage.set(null);

    try {
      await this.workspaceService.ensureLoaded();

      if (this.workspaceService.loadError()) {
        this.errorMessage.set(this.translate.instant('WORKSPACE.SETUP_LOAD_ERROR'));
        return;
      }

      if (!this.incompleteWorkspace()) {
        if (this.workspaceService.workspaces().length > 0) {
          await this.router.navigate(['/dashboard']);
        } else {
          this.errorMessage.set(this.translate.instant('WORKSPACE.SETUP_MISSING_ERROR'));
        }
      }
    } catch {
      this.errorMessage.set(this.translate.instant('WORKSPACE.SETUP_LOAD_ERROR'));
    } finally {
      this.isLoading.set(false);
    }
  }

  async onSubmit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const workspace = this.incompleteWorkspace();
    if (!workspace) {
      this.errorMessage.set(this.translate.instant('WORKSPACE.SETUP_MISSING_ERROR'));
      return;
    }

    this.isSaving.set(true);
    this.errorMessage.set(null);
    const normalizedName = this.form.controls.workspaceName.value.trim();

    try {
      const { error } = await this.workspaceService.completeInitialSetup(
        workspace.id,
        normalizedName,
      );
      if (error) {
        this.errorMessage.set(error.message);
        return;
      }

      await this.router.navigate(['/dashboard']);
    } catch (cause: unknown) {
      this.errorMessage.set(
        cause instanceof Error
          ? cause.message
          : this.translate.instant('WORKSPACE.SETUP_SAVE_ERROR'),
      );
    } finally {
      this.isSaving.set(false);
    }
  }

  async signOut(): Promise<void> {
    await this.authService.signOut();
  }
}
