import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { TaxMode } from '../../../../core/models/flipbase.models';
import {
  CompanyLegalForm,
  CompanyProfileInput,
  CompanyRequiredField,
  WorkspaceCompanyProfile,
} from '../../../../core/models/company-profile.models';
import { CompanyProfileService } from '../../../../core/services/company-profile.service';
import { WorkspaceContextLockService } from '../../../../core/services/workspace-context-lock.service';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { CardComponent } from '../../../../shared/components/card/card.component';
import { CustomCheckboxComponent } from '../../../../shared/components/custom-checkbox/custom-checkbox.component';
import {
  CustomSelectComponent,
  SelectOption,
} from '../../../../shared/components/custom-select/custom-select.component';
import { TextFieldComponent } from '../../../../shared/components/text-field/text-field.component';
import { ToastService } from '../../../../shared/components/toast/toast.service';

type CompanyFormValue = CompanyProfileInput & { readonly taxMode: TaxMode };

function compactMaxLength(maxLength: number) {
  return (control: AbstractControl<string>): ValidationErrors | null => {
    const compact = control.value.replace(/\s+/gu, '');
    return compact.length <= maxLength ? null : { compactMaxLength: { maxLength } };
  };
}

@Component({
  selector: 'app-company-settings',
  imports: [
    ReactiveFormsModule,
    BadgeComponent,
    ButtonComponent,
    CardComponent,
    CustomCheckboxComponent,
    CustomSelectComponent,
    TextFieldComponent,
  ],
  templateUrl: './company-settings.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'block',
    '(window:beforeunload)': 'beforeUnload($event)',
  },
})
export class CompanySettingsComponent {
  readonly company = inject(CompanyProfileService);
  private readonly workspace = inject(WorkspaceService);
  private readonly workspaceContext = inject(WorkspaceContextLockService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  readonly legalFormOptions: readonly SelectOption<CompanyLegalForm>[] = [
    { value: 'sole_proprietorship', label: 'Einzelunternehmen' },
    { value: 'gbr', label: 'GbR' },
    { value: 'ug', label: 'UG (haftungsbeschränkt)' },
    { value: 'gmbh', label: 'GmbH' },
    { value: 'other', label: 'Sonstige' },
  ];
  readonly taxModeOptions: readonly SelectOption<TaxMode>[] = [
    { value: 'diff_25a', label: '§ 25a Differenzbesteuerung (Gebrauchtwaren)' },
    { value: 'kleinunternehmer_19', label: '§ 19 Kleinunternehmer (0% USt)' },
    { value: 'regular_19', label: '19% Regelbesteuerung (Standard)' },
  ];

  readonly form = new FormGroup({
    companyName: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(200)],
    }),
    legalName: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(200)],
    }),
    legalForm: new FormControl<CompanyLegalForm | null>(null),
    email: new FormControl('', {
      nonNullable: true,
      validators: [Validators.email, Validators.maxLength(320)],
    }),
    phone: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(50)],
    }),
    website: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(500)],
    }),
    street: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(200)],
    }),
    houseNumber: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(30)],
    }),
    postalCode: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(20)],
    }),
    city: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(120)],
    }),
    countryCode: new FormControl('', {
      nonNullable: true,
      validators: [Validators.pattern(/^[A-Za-z]{2}$/u)],
    }),
    mailingAddressEnabled: new FormControl(false, { nonNullable: true }),
    mailingStreet: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(200)],
    }),
    mailingHouseNumber: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(30)],
    }),
    mailingPostalCode: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(20)],
    }),
    mailingCity: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(120)],
    }),
    mailingCountryCode: new FormControl('', {
      nonNullable: true,
      validators: [Validators.pattern(/^[A-Za-z]{2}$/u)],
    }),
    taxMode: new FormControl<TaxMode>('diff_25a', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    taxNumber: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(50)],
    }),
    vatId: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(32)],
    }),
    taxOffice: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(160)],
    }),
    federalState: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(100)],
    }),
    bankAccountHolder: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(200)],
    }),
    bankName: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(160)],
    }),
    iban: new FormControl('', {
      nonNullable: true,
      validators: [compactMaxLength(34)],
    }),
    bic: new FormControl('', {
      nonNullable: true,
      validators: [compactMaxLength(11)],
    }),
  });

  readonly isSavingState = signal(false);
  readonly isLogoBusy = signal(false);
  private readonly formValue = signal(this.form.getRawValue());
  private confirmedSnapshot: string | null = null;
  private confirmedWorkspaceId: string | null = null;
  private releaseWorkspaceLock: (() => void) | null = null;
  readonly mailingAddressEnabled = computed(() => this.formValue().mailingAddressEnabled);
  readonly hasCurrentProfile = computed(() => {
    const workspaceId = this.workspace.currentWorkspace()?.id;
    return (
      !!workspaceId &&
      this.company.loadedWorkspaceId() === workspaceId &&
      this.company.profile()?.workspaceId === workspaceId
    );
  });

  readonly missingRequiredFields = computed<readonly CompanyRequiredField[]>(() => {
    const value = this.formValue();
    const missing: CompanyRequiredField[] = [];
    if (!value.legalName.trim()) missing.push('legalName');
    if (!value.street.trim()) missing.push('street');
    if (!value.houseNumber.trim()) missing.push('houseNumber');
    if (!value.postalCode.trim()) missing.push('postalCode');
    if (!value.city.trim()) missing.push('city');
    if (!value.countryCode.trim()) missing.push('countryCode');
    if (!this.taxModeOptions.some((option) => option.value === value.taxMode)) {
      missing.push('taxMode');
    }
    if (!value.taxNumber.trim() && !value.vatId.trim()) missing.push('taxIdentifier');
    return missing;
  });
  readonly isDocumentReady = computed(() => this.missingRequiredFields().length === 0);

  constructor() {
    this.form.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.formValue.set(this.form.getRawValue());
      this.syncWorkspaceLock();
    });

    effect(() => {
      const profile = this.company.profile();
      const taxMode = this.company.taxMode();
      const loadedWorkspaceId = this.company.loadedWorkspaceId();
      const workspaceId = this.workspace.currentWorkspace()?.id;
      if (
        !profile ||
        !taxMode ||
        !workspaceId ||
        loadedWorkspaceId !== workspaceId ||
        profile.workspaceId !== workspaceId
      ) {
        this.confirmedSnapshot = null;
        this.confirmedWorkspaceId = null;
        this.form.disable({ emitEvent: false });
        this.releaseLock();
        return;
      }

      const profileChangedWorkspace =
        this.confirmedSnapshot === null || profile.workspaceId !== this.confirmedWorkspaceId;
      if (profileChangedWorkspace || !this.hasUnsavedChanges()) {
        this.applyConfirmedState(profile, taxMode, this.company.canEdit());
      } else if (!this.company.canEdit()) {
        this.form.disable({ emitEvent: false });
      }
    });

    this.destroyRef.onDestroy(() => this.releaseLock());
  }

  hasUnsavedChanges(): boolean {
    if (this.confirmedSnapshot === null || !this.company.canEdit()) return false;
    return this.snapshot(this.form.getRawValue()) !== this.confirmedSnapshot;
  }

  isSaving(): boolean {
    return this.isSavingState() || this.isLogoBusy();
  }

  beforeUnload(event: BeforeUnloadEvent): void {
    if (this.hasUnsavedChanges() || this.isSaving()) event.preventDefault();
  }

  async retryLoad(): Promise<void> {
    const workspaceId = this.workspace.currentWorkspace()?.id;
    if (workspaceId) await this.company.load(workspaceId);
  }

  async save(): Promise<void> {
    if (!this.company.canEdit() || this.isSavingState()) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const value = this.form.getRawValue();
    this.isSavingState.set(true);
    try {
      const result = await this.company.save(this.toProfileInput(value), value.taxMode);
      if (result.error || !result.data) {
        if (!result.reportedBySyncStatus) {
          this.toast.error(
            'Unternehmensdaten konnten nicht gespeichert werden.',
            result.error?.message,
          );
        }
        return;
      }

      this.applyConfirmedState(
        this.company.profile() ?? result.data,
        this.company.taxMode() ?? value.taxMode,
        this.company.canEdit(),
      );
      this.toast.success('Unternehmensdaten wurden gespeichert.');
    } finally {
      this.isSavingState.set(false);
    }
  }

  discard(): void {
    const profile = this.company.profile();
    const taxMode = this.company.taxMode();
    if (!profile || !taxMode) return;
    this.applyConfirmedState(profile, taxMode, this.company.canEdit());
  }

  async onLogoSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file || !this.company.canEdit() || this.isLogoBusy()) return;

    this.isLogoBusy.set(true);
    try {
      const result = await this.company.replaceLogo(file);
      if (result.error) {
        if (!result.reportedBySyncStatus) {
          this.toast.error('Logo konnte nicht gespeichert werden.', result.error.message);
        }
        return;
      }
      this.toast.success('Unternehmenslogo wurde gespeichert.');
    } finally {
      input.value = '';
      this.isLogoBusy.set(false);
    }
  }

  async removeLogo(): Promise<void> {
    if (!this.company.canEdit() || this.isLogoBusy()) return;
    this.isLogoBusy.set(true);
    try {
      const result = await this.company.removeLogo();
      if (result.error) {
        if (!result.reportedBySyncStatus) {
          this.toast.error('Logo konnte nicht entfernt werden.', result.error.message);
        }
        return;
      }
      this.toast.success('Unternehmenslogo wurde entfernt.');
    } finally {
      this.isLogoBusy.set(false);
    }
  }

  private applyConfirmedState(
    profile: WorkspaceCompanyProfile,
    taxMode: TaxMode,
    canEdit: boolean,
  ): void {
    const value = this.valueFromProfile(profile, taxMode);
    if (canEdit) this.form.enable({ emitEvent: false });
    else this.form.disable({ emitEvent: false });
    this.form.reset(value, { emitEvent: false });
    this.formValue.set(this.form.getRawValue());
    this.confirmedSnapshot = this.snapshot(this.form.getRawValue());
    this.confirmedWorkspaceId = profile.workspaceId;
    this.releaseLock();
  }

  private valueFromProfile(profile: WorkspaceCompanyProfile, taxMode: TaxMode): CompanyFormValue {
    return {
      companyName: profile.companyName ?? '',
      legalName: profile.legalName ?? '',
      legalForm: profile.legalForm,
      email: profile.email ?? '',
      phone: profile.phone ?? '',
      website: profile.website ?? '',
      street: profile.street ?? '',
      houseNumber: profile.houseNumber ?? '',
      postalCode: profile.postalCode ?? '',
      city: profile.city ?? '',
      countryCode: profile.countryCode ?? '',
      mailingAddressEnabled: profile.mailingAddressEnabled,
      mailingStreet: profile.mailingStreet ?? '',
      mailingHouseNumber: profile.mailingHouseNumber ?? '',
      mailingPostalCode: profile.mailingPostalCode ?? '',
      mailingCity: profile.mailingCity ?? '',
      mailingCountryCode: profile.mailingCountryCode ?? '',
      taxMode,
      taxNumber: profile.taxNumber ?? '',
      vatId: profile.vatId ?? '',
      taxOffice: profile.taxOffice ?? '',
      federalState: profile.federalState ?? '',
      bankAccountHolder: profile.bankAccountHolder ?? '',
      bankName: profile.bankName ?? '',
      iban: profile.iban ?? '',
      bic: profile.bic ?? '',
    };
  }

  private toProfileInput(value: CompanyFormValue): CompanyProfileInput {
    return {
      companyName: value.companyName,
      legalName: value.legalName,
      legalForm: value.legalForm,
      email: value.email,
      phone: value.phone,
      website: value.website,
      street: value.street,
      houseNumber: value.houseNumber,
      postalCode: value.postalCode,
      city: value.city,
      countryCode: value.countryCode,
      mailingAddressEnabled: value.mailingAddressEnabled,
      mailingStreet: value.mailingStreet,
      mailingHouseNumber: value.mailingHouseNumber,
      mailingPostalCode: value.mailingPostalCode,
      mailingCity: value.mailingCity,
      mailingCountryCode: value.mailingCountryCode,
      taxNumber: value.taxNumber,
      vatId: value.vatId,
      taxOffice: value.taxOffice,
      federalState: value.federalState,
      bankAccountHolder: value.bankAccountHolder,
      bankName: value.bankName,
      iban: value.iban,
      bic: value.bic,
    };
  }

  private snapshot(value: CompanyFormValue): string {
    return JSON.stringify(value);
  }

  private syncWorkspaceLock(): void {
    if (this.hasUnsavedChanges()) {
      if (!this.releaseWorkspaceLock) {
        this.releaseWorkspaceLock = this.workspaceContext.acquire();
      }
      return;
    }
    this.releaseLock();
  }

  private releaseLock(): void {
    this.releaseWorkspaceLock?.();
    this.releaseWorkspaceLock = null;
  }
}
