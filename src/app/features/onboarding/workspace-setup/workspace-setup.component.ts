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
import { WorkspaceAccessService } from '../../../core/services/workspace-access.service';
import { WorkspaceShopService } from '../../../core/services/workspace-shop.service';
import { ButtonComponent } from '../../../shared/components/button/button.component';
import { TextFieldComponent } from '../../../shared/components/text-field/text-field.component';
import { CustomCheckboxComponent } from '../../../shared/components/custom-checkbox/custom-checkbox.component';
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
    CustomCheckboxComponent,
    BetaRegistrationProgressComponent,
  ],
  templateUrl: './workspace-setup.component.html',
  host: { class: 'block fb-admin' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkspaceSetupComponent implements OnInit {
  private readonly workspaceService = inject(WorkspaceService);
  private readonly access = inject(WorkspaceAccessService);
  private readonly shop = inject(WorkspaceShopService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly translate = inject(TranslateService);

  readonly isLoading = signal(false);
  readonly isSaving = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly isReview = signal(false);
  readonly accessibleWorkspaces = computed(() =>
    this.workspaceService
      .workspaces()
      .filter((workspace) =>
        this.access
          .access()
          .some((row) => row.workspace_id === workspace.id && row.access_status === 'active'),
      ),
  );

  readonly incompleteWorkspace = computed(
    () =>
      this.accessibleWorkspaces().find((workspace) => workspace.setup_completed_at === null) ??
      null,
  );
  readonly workspaceToEdit = computed(() =>
    this.isReview()
      ? (this.accessibleWorkspaces().find((workspace) => workspace.setup_completed_at !== null) ??
        null)
      : this.incompleteWorkspace(),
  );

  /** Nur Workspaces mit Shop-Berechtigung (später das große Paket) sehen die Auswahl. */
  readonly shopChoiceVisible = computed(() => this.workspaceToEdit()?.shop_entitled === true);

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
    shopEnabled: new FormControl(false, { nonNullable: true }),
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
      await this.access.refresh();
      await this.workspaceService.ensureLoaded();
      this.isReview.set(
        this.route.snapshot.queryParamMap.get('review') === '1' &&
          this.incompleteWorkspace() === null &&
          this.accessibleWorkspaces().some((workspace) => workspace.setup_completed_at !== null),
      );

      if (this.workspaceService.loadError()) {
        this.errorMessage.set(this.translate.instant('WORKSPACE.SETUP_LOAD_ERROR'));
        return;
      }

      const workspace = this.workspaceToEdit();
      if (workspace) {
        if (this.isReview()) this.form.controls.workspaceName.setValue(workspace.name);
        this.form.controls.shopEnabled.setValue(workspace.shop_enabled ?? false);
      } else {
        if (this.workspaceService.workspaces().length > 0) {
          await this.router.navigate([
            this.accessibleWorkspaces().length ? '/dashboard' : '/beta-ended',
          ]);
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

  /** Neue Workspaces starten ohne Shop; nur eine abweichende Auswahl wird gespeichert. */
  private async saveShopChoice(workspaceId: string): Promise<boolean> {
    if (!this.shopChoiceVisible()) return true;
    const wanted = this.form.controls.shopEnabled.value;
    const saved =
      this.workspaceService.workspaces().find((row) => row.id === workspaceId) ??
      this.workspaceToEdit();
    if (!saved || (saved.shop_enabled ?? false) === wanted) return true;
    if (await this.shop.setEnabled(wanted, saved)) return true;
    this.errorMessage.set(
      this.shop.error() ?? this.translate.instant('WORKSPACE.SETUP_SHOP_SAVE_ERROR'),
    );
    return false;
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
      if (!this.isReview() || normalizedName !== workspace.name) {
        const { error } = this.isReview()
          ? await this.workspaceService.updateWorkspaceSettings(workspace.id, {
              name: normalizedName,
            })
          : await this.workspaceService.completeInitialSetup(workspace.id, normalizedName);
        if (error) {
          this.errorMessage.set(error.message);
          return;
        }
      }
      if (!(await this.saveShopChoice(workspace.id))) return;

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
