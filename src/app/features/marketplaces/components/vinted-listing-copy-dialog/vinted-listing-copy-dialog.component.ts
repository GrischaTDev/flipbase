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
import { AuthService } from '../../../../core/services/auth.service';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { CustomCheckboxComponent } from '../../../../shared/components/custom-checkbox/custom-checkbox.component';
import { CustomSelectComponent } from '../../../../shared/components/custom-select/custom-select.component';
import { ModalShellComponent } from '../../../../shared/components/modal-shell/modal-shell.component';
import { NoticeBannerComponent } from '../../../../shared/components/notice-banner/notice-banner.component';
import { TextFieldComponent } from '../../../../shared/components/text-field/text-field.component';
import type { VintedListingContent } from '../../models/vinted-listing-content';
import {
  categoryCopyFields,
  copyVintedListingFields,
  vintedListingCopyFields,
  vintedListingCopyValue,
  type VintedListingCopyField,
} from '../../models/vinted-listing-copy';
import { MarketplaceAccountStore } from '../../services/marketplace-account.store';
import {
  VintedListingCopySourceService,
  type VintedListingCopyCursor,
  type VintedListingCopySource,
  type VintedListingCopySourceKind,
} from '../../services/vinted-listing-copy-source.service';

export interface VintedListingCopySelection {
  readonly content: VintedListingContent;
  readonly fields: readonly VintedListingCopyField[];
}

@Component({
  selector: 'app-vinted-listing-copy-dialog',
  imports: [
    ButtonComponent,
    CustomCheckboxComponent,
    CustomSelectComponent,
    ModalShellComponent,
    NoticeBannerComponent,
    TextFieldComponent,
  ],
  templateUrl: './vinted-listing-copy-dialog.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VintedListingCopyDialogComponent {
  readonly workspaceId = input.required<string>();
  readonly content = input.required<VintedListingContent>();
  readonly targetDraftId = input<string | null>(null);
  readonly targetEntryId = input<string | null>(null);
  readonly targetConnectionId = input<string | null>(null);
  readonly allowCategory = input(true);
  readonly allowedFields = input<readonly VintedListingCopyField[]>(
    vintedListingCopyFields.map((field) => field.key),
  );
  readonly disabled = input(false);
  readonly applied = output<VintedListingCopySelection>();
  readonly applyError = input<string | null>(null);
  readonly closed = output<void>();
  private readonly api = inject(VintedListingCopySourceService);
  private readonly store = inject(MarketplaceAccountStore);
  private readonly auth = inject(AuthService);
  private readonly workspace = inject(WorkspaceService);
  private readonly destroyRef = inject(DestroyRef);
  readonly kind = signal<VintedListingCopySourceKind>('local');
  readonly requestedAccount = signal<string | null>(null);
  readonly search = signal('');
  private readonly query = signal('');
  readonly sources = signal<readonly VintedListingCopySource[]>([]);
  readonly selectedKey = signal<string | null>(null);
  readonly sourceContent = signal<VintedListingContent | null>(null);
  private readonly sourceFields = signal<readonly VintedListingCopyField[]>([]);
  readonly cursor = signal<VintedListingCopyCursor | null>(null);
  readonly loading = signal(false);
  readonly reading = signal(false);
  readonly error = signal<string | null>(null);
  readonly selectedFields = signal<readonly VintedListingCopyField[]>([]);
  readonly kindOptions = [
    { value: 'local', label: 'Flipbase-Entwurf' },
    { value: 'listing', label: 'Bestehendes Inserat' },
    { value: 'provider_draft', label: 'Vinted-Entwurf' },
  ];
  readonly accountOptions = computed(() =>
    this.store
      .connections()
      .map((account) => ({ value: account.connectionId, label: account.displayName })),
  );
  readonly connectionId = computed(
    () =>
      this.accountOptions().find((account) => account.value === this.requestedAccount())?.value ??
      this.accountOptions().find((account) => account.value === this.targetConnectionId())?.value ??
      this.accountOptions()[0]?.value ??
      null,
  );
  readonly options = computed(() =>
    (this.listContext() === this.context() ? this.sources() : [])
      .filter((source) =>
        source.kind === 'local'
          ? source.id !== this.targetDraftId()
          : source.id !== this.targetEntryId() || source.connectionId !== this.targetConnectionId(),
      )
      .map((source) => ({ value: source.key, label: source.title })),
  );
  private readonly scope = computed(() => {
    const user = this.auth.currentUser(),
      workspace = this.workspace.currentWorkspace();
    return user &&
      workspace &&
      workspace.id === this.workspaceId() &&
      !workspace.archived_at &&
      this.store.canManage()
      ? JSON.stringify([
          user.id,
          workspace.id,
          this.targetDraftId(),
          this.targetEntryId(),
          this.targetConnectionId(),
        ])
      : null;
  });
  private readonly context = computed(() =>
    JSON.stringify([
      this.scope(),
      this.kind(),
      this.connectionId(),
      this.query(),
      this.kind() === 'local'
        ? null
        : this.store
            .connections()
            .filter((account) => account.connectionId === this.connectionId())
            .map((account) => [account.externalAccountId, account.executionMode, account.status]),
    ]),
  );
  readonly rows = computed(() => {
    const source = this.readContext() === this.context() ? this.sourceContent() : null;
    return source
      ? vintedListingCopyFields
          .filter(
            (group) =>
              (group.key !== 'category' || this.allowCategory()) &&
              this.allowedFields().includes(group.key) &&
              this.sourceFields().includes(group.key),
          )
          .map((group) => ({
            ...group,
            value: vintedListingCopyValue(source, group.key),
            blocked:
              categoryCopyFields.includes(group.key) &&
              source.categoryId !== this.content().categoryId &&
              (!this.allowCategory() || !this.selectedFields().includes('category')),
          }))
      : [];
  });
  readonly canApply = computed(
    () =>
      !!this.scope() &&
      !!this.sourceContent() &&
      this.readContext() === this.context() &&
      !this.disabled() &&
      !this.loading() &&
      !this.reading() &&
      this.selectedFields().length > 0 &&
      this.selectedFields().every((field) => this.rows().some((row) => row.key === field)) &&
      !this.rows().some((row) => row.blocked && this.selectedFields().includes(row.key)),
  );
  private readonly readContext = signal<string | null>(null);
  private readonly listContext = signal<string | null>(null);
  private generation = 0;
  private readGeneration = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  constructor() {
    effect(() => {
      const context = this.context();
      untracked(() => void this.load(false, context));
    });
    this.destroyRef.onDestroy(() => {
      this.generation++;
      this.readGeneration++;
      clearTimeout(this.timer);
    });
  }
  setKind(value: string | null): void {
    if (value === 'local' || value === 'listing' || value === 'provider_draft')
      this.kind.set(value);
  }
  setSearch(value: string): void {
    this.search.set(value.slice(0, 160));
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.query.set(this.search().trim()), 250);
  }
  toggle(field: VintedListingCopyField, checked: boolean): void {
    this.selectedFields.update((fields) =>
      checked
        ? [...new Set([...fields, field])]
        : fields.filter(
            (value) =>
              value !== field &&
              !(
                field === 'category' &&
                this.sourceContent()?.categoryId !== this.content().categoryId &&
                categoryCopyFields.includes(value)
              ),
          ),
    );
  }
  async load(more = false, context = this.context()): Promise<void> {
    if (more && (this.loading() || !this.cursor())) return;
    const generation = ++this.generation,
      cursor = more ? this.cursor() : undefined;
    if (!more) {
      this.sources.set([]);
      this.selectedKey.set(null);
      this.sourceContent.set(null);
      this.selectedFields.set([]);
      this.cursor.set(null);
      this.readGeneration++;
      this.reading.set(false);
    }
    this.error.set(null);
    if (!this.scope()) {
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    try {
      const page = await this.api.list(
        this.workspaceId(),
        this.kind(),
        this.connectionId(),
        this.query(),
        cursor ?? undefined,
      );
      if (!this.current(generation, context)) return;
      this.listContext.set(context);
      this.sources.update((sources) => [
        ...new Map(
          [...(more ? sources : []), ...page.items].map((source) => [source.key, source]),
        ).values(),
      ]);
      this.cursor.set(page.nextCursor);
    } catch (error) {
      if (this.current(generation, context))
        this.error.set(
          error instanceof Error ? error.message : 'Quellen konnten nicht geladen werden.',
        );
    } finally {
      if (this.current(generation, context)) this.loading.set(false);
    }
  }
  async select(key: string | null): Promise<void> {
    const source = this.sources().find((source) => source.key === key),
      context = this.context(),
      generation = ++this.readGeneration;
    this.selectedKey.set(key);
    this.sourceContent.set(null);
    this.selectedFields.set([]);
    this.error.set(null);
    this.reading.set(false);
    if (!source || !this.scope() || !this.options().some((option) => option.value === key)) return;
    this.reading.set(true);
    try {
      const result = await this.api.read(this.workspaceId(), source);
      if (
        !this.destroyRef.destroyed &&
        generation === this.readGeneration &&
        context === this.context() &&
        this.scope()
      ) {
        this.readContext.set(context);
        this.sourceContent.set(result.content);
        this.sourceFields.set(result.fields);
      }
    } catch (error) {
      if (generation === this.readGeneration && context === this.context() && this.scope())
        this.error.set(
          error instanceof Error ? error.message : 'Quelldaten konnten nicht gelesen werden.',
        );
    } finally {
      if (generation === this.readGeneration && context === this.context()) this.reading.set(false);
    }
  }
  apply(): void {
    if (!this.canApply()) return;
    try {
      this.applied.emit({
        content: copyVintedListingFields(
          this.content(),
          this.sourceContent()!,
          this.selectedFields(),
        ),
        fields: [...this.selectedFields()],
      });
    } catch (error) {
      this.error.set(
        error instanceof Error ? error.message : 'Die Angaben konnten nicht übernommen werden.',
      );
    }
  }
  private current(generation: number, context: string): boolean {
    return (
      !this.destroyRef.destroyed &&
      generation === this.generation &&
      context === this.context() &&
      !!this.scope()
    );
  }
}
