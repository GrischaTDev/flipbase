import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { NoticeBannerComponent } from '../../../../shared/components/notice-banner/notice-banner.component';
import { TextFieldComponent } from '../../../../shared/components/text-field/text-field.component';
import { CustomSelectComponent } from '../../../../shared/components/custom-select/custom-select.component';
import { CustomCheckboxComponent } from '../../../../shared/components/custom-checkbox/custom-checkbox.component';
import { ModalShellComponent } from '../../../../shared/components/modal-shell/modal-shell.component';
import { ProductThumbnailComponent } from '../../../../shared/components/product-thumbnail/product-thumbnail.component';
import { LucidePencil } from '@lucide/angular';
import type {
  VintedProfileDetails,
  VintedProfilePhoto,
  VintedProfileOption,
} from '../../models/vinted-profile-edit.models';
import { prepareVintedProfilePhoto } from '../../services/vinted-profile-photo';
import {
  VintedEditUnconfirmedError,
  VintedProfileConflictError,
} from '../../services/marketplace-browser-test-api.service';
import { MarketplaceAccountStore } from '../../services/marketplace-account.store';

@Component({
  selector: 'app-vinted-profile-editor',
  imports: [
    ReactiveFormsModule,
    ButtonComponent,
    NoticeBannerComponent,
    TextFieldComponent,
    CustomSelectComponent,
    CustomCheckboxComponent,
    ModalShellComponent,
    ProductThumbnailComponent,
  ],
  templateUrl: './vinted-profile-editor.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VintedProfileEditorComponent {
  readonly connectionId = input.required<string>();
  readonly store = inject(MarketplaceAccountStore);
  private readonly builder = inject(FormBuilder);
  readonly form = this.builder.nonNullable.group({
    about: ['', [Validators.maxLength(2000)]],
    cityId: [''],
    showCity: [true],
    language: ['', Validators.required],
  });
  readonly citySearch = this.builder.nonNullable.control('', [
    Validators.minLength(2),
    Validators.maxLength(80),
  ]);
  readonly original = signal<VintedProfileDetails | null>(null);
  readonly cities = signal<readonly VintedProfileOption[]>([]);
  readonly photo = signal<VintedProfilePhoto | null>(null);
  readonly preview = signal<string | null>(null);
  readonly requiresReload = signal(false);
  readonly cachePending = signal(false);
  readonly citySearched = signal(false);
  readonly pencilIcon = LucidePencil;
  readonly cityOptions = computed(() =>
    this.cities().map((city) => ({ value: city.id, label: city.label })),
  );
  readonly languageOptions = computed(
    () =>
      this.original()?.languages.map((language) => ({
        value: language.id,
        label: language.label,
      })) ?? [],
  );
  readonly editing = signal(false);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly saved = signal(false);

  constructor() {
    effect(() => {
      this.connectionId();
      untracked(() => {
        this.editing.set(false);
        this.saved.set(false);
        this.error.set(null);
        this.original.set(null);
        this.photo.set(null);
        this.preview.set(null);
        this.requiresReload.set(false);
        this.cachePending.set(false);
      });
    });
  }

  async open(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    this.saved.set(false);
    const connectionId = this.connectionId();
    try {
      const profile = await this.store.readProfileDetails(connectionId);
      if (
        this.connectionId() !== connectionId ||
        this.store.selectedConnection()?.connectionId !== connectionId
      )
        return;
      this.original.set(profile);
      this.form.reset({
        about: profile.about,
        cityId: '',
        showCity: profile.showCity,
        language: profile.language,
      });
      this.citySearch.reset('');
      this.cities.set([]);
      this.photo.set(null);
      this.preview.set(null);
      this.requiresReload.set(false);
      this.cachePending.set(false);
      this.citySearched.set(false);
      this.editing.set(true);
    } catch (error) {
      if (this.connectionId() === connectionId)
        this.error.set(
          error instanceof Error
            ? error.message
            : 'Das Profilformular konnte nicht geladen werden.',
        );
    } finally {
      this.busy.set(false);
    }
  }

  async save(): Promise<void> {
    const original = this.original();
    if (!original || this.form.invalid || this.busy() || this.requiresReload()) return;
    this.busy.set(true);
    this.error.set(null);
    const connectionId = this.connectionId();
    try {
      const fields = this.form.getRawValue();
      const city = this.cities().find((option) => option.id === fields.cityId);
      if (fields.cityId && !city) throw new Error('Wähle eine Stadt aus der Liste.');
      const photo = this.photo();
      const result = await this.store.saveProfileDetails(
        connectionId,
        {
          about: fields.about,
          city: city?.label ?? original.city,
          ...(city ? { cityId: city.id } : {}),
          showCity: fields.showCity,
          language: fields.language,
          ...(photo ? { photo } : {}),
        },
        original,
      );
      if (!this.isCurrent(connectionId)) return;
      this.cachePending.set(result.cachePending);
      this.editing.set(false);
      this.saved.set(true);
    } catch (error) {
      if (this.isCurrent(connectionId)) {
        this.requiresReload.set(
          error instanceof VintedEditUnconfirmedError ||
            error instanceof VintedProfileConflictError,
        );
        this.error.set(
          error instanceof Error
            ? error.message
            : 'Die Profiländerung konnte nicht bestätigt werden.',
        );
      }
    } finally {
      this.busy.set(false);
    }
  }

  close(): void {
    if (!this.busy()) this.editing.set(false);
  }

  async reload(): Promise<void> {
    this.editing.set(false);
    await this.open();
  }

  async searchCities(): Promise<void> {
    if (this.busy() || this.citySearch.invalid || this.citySearch.value.trim().length < 2) return;
    this.busy.set(true);
    this.error.set(null);
    const connectionId = this.connectionId();
    try {
      const cities = await this.store.searchProfileCities(
        connectionId,
        this.citySearch.value.trim(),
      );
      if (!this.isCurrent(connectionId)) return;
      this.cities.set(cities);
      this.form.controls.cityId.setValue('');
      this.citySearched.set(true);
    } catch (error) {
      if (this.isCurrent(connectionId))
        this.error.set(
          error instanceof Error ? error.message : 'Die Städte konnten nicht geladen werden.',
        );
    } finally {
      this.busy.set(false);
    }
  }

  async selectPhoto(event: Event): Promise<void> {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || this.busy()) return;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const connectionId = this.connectionId();
    this.busy.set(true);
    this.error.set(null);
    try {
      const prepared = await prepareVintedProfilePhoto(file);
      if (!this.isCurrent(connectionId)) return;
      this.photo.set(prepared.photo);
      this.preview.set(prepared.preview);
    } catch (error) {
      if (this.isCurrent(connectionId))
        this.error.set(
          error instanceof Error ? error.message : 'Das Profilbild konnte nicht geladen werden.',
        );
    } finally {
      this.busy.set(false);
    }
  }

  private isCurrent(connectionId: string): boolean {
    return (
      this.connectionId() === connectionId &&
      this.store.selectedConnection()?.connectionId === connectionId
    );
  }
}
