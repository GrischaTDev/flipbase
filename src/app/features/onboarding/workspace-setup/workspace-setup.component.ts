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
import { ActivatedRoute, Router } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { WorkspaceService } from '../../../core/services/workspace.service';
import { ButtonComponent } from '../../../shared/components/button/button.component';
import { TextFieldComponent } from '../../../shared/components/text-field/text-field.component';
import { BetaRegistrationProgressComponent } from '../components/beta-registration-progress/beta-registration-progress.component';

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
    BetaRegistrationProgressComponent,
  ],
  templateUrl: './workspace-setup.component.html',
  host: { class: 'block fb-admin' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkspaceSetupComponent implements OnInit {
  private readonly workspaceService = inject(WorkspaceService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly translate = inject(TranslateService);

  readonly isLoading = signal(false);
  readonly isSaving = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly isReview = signal(false);

  readonly incompleteWorkspace = computed(
    () =>
      this.workspaceService
        .workspaces()
        .find((workspace) => workspace.setup_completed_at === null) ?? null,
  );
  readonly workspaceToEdit = computed(() =>
    this.isReview()
      ? (this.workspaceService
          .workspaces()
          .find((workspace) => workspace.setup_completed_at !== null) ?? null)
      : this.incompleteWorkspace(),
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
      this.form.invalid || this.isLoading() || this.isSaving() || this.workspaceToEdit() === null
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
      this.isReview.set(
        this.route.snapshot.queryParamMap.get('review') === '1' &&
          this.incompleteWorkspace() === null &&
          this.workspaceService
            .workspaces()
            .some((workspace) => workspace.setup_completed_at !== null),
      );

      if (this.workspaceService.loadError()) {
        this.errorMessage.set(this.translate.instant('WORKSPACE.SETUP_LOAD_ERROR'));
        return;
      }

      const workspace = this.workspaceToEdit();
      if (workspace) {
        if (this.isReview()) this.form.controls.workspaceName.setValue(workspace.name);
      } else {
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

    const workspace = this.workspaceToEdit();
    if (!workspace) {
      this.errorMessage.set(this.translate.instant('WORKSPACE.SETUP_MISSING_ERROR'));
      return;
    }

    this.isSaving.set(true);
    this.errorMessage.set(null);
    const normalizedName = this.form.controls.workspaceName.value.trim();

    try {
      if (this.isReview() && normalizedName === workspace.name) {
        await this.router.navigate(['/onboarding/discord']);
        return;
      }
      const { error } = this.isReview()
        ? await this.workspaceService.updateWorkspaceSettings(workspace.id, {
            name: normalizedName,
          })
        : await this.workspaceService.completeInitialSetup(workspace.id, normalizedName);
      if (error) {
        this.errorMessage.set(error.message);
        return;
      }

      await this.router.navigate(['/onboarding/discord']);
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
}
