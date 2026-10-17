import { CategoryPickerComponent } from '../../../../shared/components/category-picker/category-picker.component';
import { kleinanzeigenCategories } from '../../models/kleinanzeigen-categories';
import { kleinanzeigenCategoryPath } from '../../../../../../supabase/functions/_shared/kleinanzeigen-form-contracts';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { FormControl, FormRecord, ReactiveFormsModule } from '@angular/forms';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { NoticeBannerComponent } from '../../../../shared/components/notice-banner/notice-banner.component';
import type { Listing } from '../../../listings/models/listing.models';
import type { KleinanzeigenDraftInput } from '../../models/kleinanzeigen-transfer-mapping';
import type {
  KleinanzeigenProviderSchema,
  KleinanzeigenCategoryChoice,
} from '../../../../../../supabase/functions/_shared/kleinanzeigen-form-contracts';
import { KleinanzeigenAccountService } from '../../services/kleinanzeigen-account.service';
import { KleinanzeigenExtensionBridge } from '../../services/kleinanzeigen-extension-bridge';
import { KleinanzeigenFormSchemaService } from '../../services/kleinanzeigen-form-schema.service';
import type { KleinanzeigenListingJobScope } from '../../services/kleinanzeigen-listing-job.service';
import { KleinanzeigenListingFieldsComponent } from '../kleinanzeigen-listing-fields/kleinanzeigen-listing-fields.component';
import { KleinanzeigenPublicationPanelComponent } from '../kleinanzeigen-publication-panel/kleinanzeigen-publication-panel.component';
import { retainKleinanzeigenCategoryFields } from '../../models/kleinanzeigen-category-fields';
import { validateKleinanzeigenPublication } from '../../models/kleinanzeigen-provider-schema';
export interface KleinanzeigenCategorySelection {
  readonly categoryId: string | null;
  readonly categoryFields: Readonly<Record<string, string>>;
  readonly schemaRevision: string | null;
}
@Component({
  selector: 'app-kleinanzeigen-transfer-target',
  imports: [
    ButtonComponent,
    CategoryPickerComponent,
    ReactiveFormsModule,
    NoticeBannerComponent,
    KleinanzeigenListingFieldsComponent,
    KleinanzeigenPublicationPanelComponent,
  ],
  providers: [KleinanzeigenExtensionBridge, KleinanzeigenFormSchemaService],
  templateUrl: './kleinanzeigen-transfer-target.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class KleinanzeigenTransferTargetComponent {
  readonly listing = input.required<Listing>();
  readonly content = input.required<KleinanzeigenDraftInput>();
  readonly photoCount = input(0);
  readonly unsaved = input(false);
  readonly fieldsChanged = output<KleinanzeigenCategorySelection>();
  readonly confirmed = output<void>();
  private readonly accounts = inject(KleinanzeigenAccountService);
  private readonly workspace = inject(WorkspaceService);
  private readonly schemas = inject(KleinanzeigenFormSchemaService);
  readonly extension = inject(KleinanzeigenExtensionBridge);
  readonly publicationScope = signal<KleinanzeigenListingJobScope | null>(null);
  readonly publicationAllowed = signal(false);
  readonly scope = signal<KleinanzeigenListingJobScope | null>(null);
  readonly targetName = signal('');
  readonly error = signal<string | null>(null);
  readonly busy = signal(false);
  readonly schemaLoadFailed = signal(false);
  readonly schema = signal<KleinanzeigenProviderSchema | null>(null);
  readonly schemaRevision = signal<string | null>(null);
  readonly choices = signal<readonly KleinanzeigenCategoryChoice[]>([]);
  readonly label = signal('');
  readonly categorySource = kleinanzeigenCategories;
  readonly categorySelection = new FormControl<string | null>(null);
  readonly selectedGroup = signal('');
  readonly methods = signal<readonly string[]>([]);
  readonly attributes = new FormRecord<FormControl<string>>({});
  readonly shippingGroup = new FormControl('', { nonNullable: true });
  private generation = 0;
  private loadingFields = false;
  readonly categoryOptions = computed(() =>
    this.choices().map((value) => ({
      value: value.path,
      label: value.label + (value.isParent ? ' …' : ''),
    })),
  );
  readonly publicationIssues = computed(() =>
    this.schema()
      ? validateKleinanzeigenPublication(
          this.content(),
          this.schema(),
          this.listing().transferImagesComplete ? this.photoCount() : 0,
        ).map((value) => value.message)
      : ['Prüfe die aktuellen Kleinanzeigen-Kategorieangaben.'],
  );
  constructor() {
    effect(() => {
      const disabled = this.busy();
      untracked(() => {
        if (disabled) this.categorySelection.disable({ emitEvent: false });
        else this.categorySelection.enable({ emitEvent: false });
      });
    });
    const destroy = inject(DestroyRef);
    const subscriptions = [
      this.categorySelection.valueChanges.subscribe((path) => void this.selectCategory(path)),
      this.attributes.valueChanges.subscribe(() => this.emitFields()),
      this.shippingGroup.valueChanges.subscribe((value) => {
        this.selectedGroup.set(value);
        this.methods.set([]);
        this.emitFields();
      }),
    ];
    destroy.onDestroy(() => {
      subscriptions.forEach((value) => value.unsubscribe());
      this.generation++;
      this.schemas.cancel();
    });
    this.extension.checkInstallation();
    effect(() => {
      const listing = this.listing();
      const ws = this.workspace.currentWorkspace();
      untracked(() => {
        this.generation++;
        this.schemas.cancel();
        this.error.set(null);
        this.schemaLoadFailed.set(false);
        this.schema.set(null);
        this.schemaRevision.set(listing.schemaRevision ?? null);
        this.choices.set([]);
        this.label.set(listing.categoryId ?? '');
        this.categorySelection.setValue(listing.categoryId ?? null, { emitEvent: false });
        this.busy.set(false);
        this.scope.set(null);
        this.publicationScope.set(null);
        this.publicationAllowed.set(false);
        this.targetName.set('');
        if (listing.workspaceId === ws?.id && !ws.archived_at && listing.targetConnectionId)
          void this.loadAccount(listing, this.generation);
      });
    });
  }
  private async loadAccount(listing: Listing, generation: number): Promise<void> {
    try {
      const accounts = await this.accounts.readAccounts(listing.workspaceId);
      if (generation !== this.generation) return;
      const account = accounts.canManage
        ? accounts.accounts.find((value) => value.connectionId === listing.targetConnectionId)
        : null;
      this.targetName.set(account?.displayName ?? '');
      if (account) {
        this.publicationScope.set({
          workspaceId: account.workspaceId,
          connectionId: account.connectionId,
          externalAccountId: account.externalAccountId,
          generation: account.localGrant?.generation ?? 0,
          accountType: account.accountType,
        });
        this.publicationAllowed.set(
          account.status === 'connected' &&
            account.accountType === 'private' &&
            account.localGrant?.active === true &&
            account.localGrant.canPublish,
        );
      }
      if (
        account?.status === 'connected' &&
        account.accountType === 'private' &&
        account.localGrant?.active
      )
        this.scope.set({
          workspaceId: account.workspaceId,
          connectionId: account.connectionId,
          externalAccountId: account.externalAccountId,
          generation: account.localGrant.generation,
          accountType: account.accountType,
        });
      if (
        this.scope() &&
        listing.categoryId &&
        this.categorySource.getCategory(listing.categoryId)?.isLeaf
      )
        await this.browse(listing.categoryId);
    } catch {
      if (generation === this.generation)
        this.error.set('Das Zielkonto konnte nicht geprüft werden.');
    }
  }
  async selectCategory(path: string | null): Promise<void> {
    if (this.busy()) return;
    const previousFields = this.content().categoryFields;
    this.schema.set(null);
    this.schemaLoadFailed.set(false);
    this.schemaRevision.set(null);
    this.error.set(null);
    for (const key of Object.keys(this.attributes.controls))
      this.attributes.removeControl(key, { emitEvent: false });
    this.selectedGroup.set('');
    this.methods.set([]);
    this.shippingGroup.setValue('', { emitEvent: false });
    this.emitFields();
    if (!path) return;
    if (!this.categorySource.getCategory(path)?.isLeaf) {
      this.error.set('Wähle eine vollständige Unterkategorie.');
      return;
    }
    if (!kleinanzeigenCategoryPath(path)) {
      this.error.set(
        'Diese Kategorie ist im Baum vorhanden. Ihre automatische Übergabe wird noch nicht unterstützt.',
      );
      return;
    }
    await this.browse(path, previousFields);
  }
  async browse(path: string, previousFields?: Readonly<Record<string, string>>): Promise<void> {
    const scope = this.scope();
    if (!scope || this.busy()) return;
    const generation = this.generation;
    this.busy.set(true);
    this.error.set(null);
    this.schemaLoadFailed.set(false);
    try {
      const result = await this.schemas.browse(scope, path);
      if (generation !== this.generation) return;
      this.choices.set(result.choices);
      this.categorySelection.setValue(path, { emitEvent: false });
      this.label.set(result.categoryLabel);
      this.schema.set(result.schema);
      this.schemaRevision.set(result.schemaRevision);
      this.loadingFields = true;
      for (const key of Object.keys(this.attributes.controls))
        this.attributes.removeControl(key, { emitEvent: false });
      const values = result.schema
        ? retainKleinanzeigenCategoryFields(
            previousFields ?? this.content().categoryFields,
            result.schema,
          )
        : {};
      for (const field of result.schema?.fields ?? [])
        this.attributes.addControl(
          field.key,
          new FormControl(values[field.key] ?? '', { nonNullable: true }),
          { emitEvent: false },
        );
      this.shippingGroup.setValue(values['ad-shipping-package-size'] ?? '', { emitEvent: false });
      this.selectedGroup.set(this.shippingGroup.value);
      this.methods.set(JSON.parse(values['ad-shipping-options'] ?? '[]') as string[]);
      this.loadingFields = false;
      this.emitFields();
    } catch (error) {
      if (generation === this.generation) {
        this.schemaLoadFailed.set(true);
        this.error.set(
          error instanceof Error
            ? error.message
            : 'Die Eigenschaften konnten nicht geladen werden.',
        );
      }
    } finally {
      this.loadingFields = false;
      if (generation === this.generation) this.busy.set(false);
    }
  }
  chooseMethods(values: readonly string[]): void {
    this.methods.set(values);
    this.emitFields();
  }
  private emitFields(): void {
    if (this.loadingFields) return;
    const categoryFields: Record<string, string> = { ...this.attributes.getRawValue() };
    if (this.content().shippingType === 'both' && this.selectedGroup() && this.methods().length) {
      categoryFields['ad-shipping-package-size'] = this.selectedGroup();
      categoryFields['ad-shipping-options'] = JSON.stringify(this.methods());
    }
    this.fieldsChanged.emit({
      categoryId: this.schema()?.categoryPath ?? this.categorySelection.value,
      categoryFields,
      schemaRevision: this.schemaRevision(),
    });
  }
}
