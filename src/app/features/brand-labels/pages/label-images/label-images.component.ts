import { LabelRpcError } from '../../models/brand-label-rpc';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { LucidePencil, LucideUpload, LucideShieldOff, LucideCheck } from '@lucide/angular';
import { AuthService } from '../../../../core/services/auth.service';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import { PlatformOperatorService } from '../../../../core/services/platform-operator.service';
import { PageHeaderComponent } from '../../../../shared/components/page-header/page-header.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import { CardComponent } from '../../../../shared/components/card/card.component';
import { DataTableComponent } from '../../../../shared/components/data-table/data-table.component';
import { TextFieldComponent } from '../../../../shared/components/text-field/text-field.component';
import { LabelImageComponent } from '../../components/label-image/label-image.component';
import {
  LabelMediaService,
  type LabelAdminImage,
  type LabelImageUpload,
} from '../../services/label-media.service';

type MediaCommand =
  | { readonly kind: 'upload'; readonly upload: LabelImageUpload }
  | {
      readonly kind: 'permission';
      readonly image: LabelAdminImage;
      readonly status: 'approved' | 'revoked';
      readonly requestId: string;
    };
@Component({
  selector: 'app-label-images',
  imports: [
    ReactiveFormsModule,
    PageHeaderComponent,
    ButtonComponent,
    BadgeComponent,
    CardComponent,
    DataTableComponent,
    TextFieldComponent,
    LabelImageComponent,
  ],
  templateUrl: './label-images.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(window:beforeunload)': 'warnUnsaved($event)' },
})
export class LabelImagesComponent {
  private readonly service = inject(LabelMediaService);
  private readonly auth = inject(AuthService);
  private readonly workspace = inject(WorkspaceService);
  private readonly operator = inject(PlatformOperatorService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly scope = computed(() =>
    this.auth.currentUser()?.id && this.operator.operator()
      ? `${this.auth.currentUser()?.id}:${this.workspace.currentWorkspace()?.id ?? ''}`
      : null,
  );
  private readonly response = signal<{ scope: string; images: readonly LabelAdminImage[] } | null>(
    null,
  );
  readonly images = computed(() =>
    this.response()?.scope === this.scope() ? (this.response()?.images ?? []) : [],
  );
  readonly search = signal('');
  readonly visibleImages = computed(() =>
    this.images().filter((image) =>
      `${image.attribution} ${image.allowedUse}`
        .toLocaleLowerCase('de')
        .includes(this.search().toLocaleLowerCase('de')),
    ),
  );
  readonly selected = signal<LabelAdminImage | null>(null);
  readonly file = signal<File | null>(null);
  readonly pending = signal<MediaCommand | null>(null);
  readonly busy = signal(false);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly message = signal<string | null>(null);
  readonly form = new FormGroup({
    attribution: new FormControl('', { nonNullable: true }),
    allowedUse: new FormControl('', { nonNullable: true }),
  });
  readonly uploadIcon = LucideUpload;
  readonly editIcon = LucidePencil;
  readonly revokeIcon = LucideShieldOff;
  readonly approveIcon = LucideCheck;
  private generation = 0;
  constructor() {
    effect(() => {
      const scope = this.scope();
      untracked(() => {
        this.clear();
        void this.load(scope);
      });
    });
    this.destroyRef.onDestroy(() => {
      this.generation++;
      this.clear();
    });
  }
  private clear(): void {
    this.response.set(null);
    this.pending.set(null);
    this.selected.set(null);
    this.file.set(null);
    this.busy.set(false);
    this.error.set(null);
    this.message.set(null);
    this.search.set('');
    this.form.reset();
    this.form.disable();
  }
  private current(generation: number, scope: string): boolean {
    return !this.destroyRef.destroyed && this.scope() === scope && generation === this.generation;
  }
  async load(scope = this.scope()): Promise<void> {
    if (!scope) return;
    const generation = ++this.generation;
    this.loading.set(true);
    try {
      const images = await this.service.list();
      if (this.current(generation, scope)) {
        this.response.set({ scope, images });
        this.form.enable();
      }
    } catch (error) {
      if (this.current(generation, scope)) {
        this.response.set(null);
        if (error instanceof LabelRpcError && error.code === 'forbidden') this.clear();
        this.error.set('Die Bildverwaltung konnte nicht geladen werden.');
      }
    } finally {
      if (this.current(generation, scope)) this.loading.set(false);
    }
  }
  choose(event: Event): void {
    if (!this.scope() || this.busy() || this.pending()) return;
    const input = event.target;
    if (input instanceof HTMLInputElement) {
      this.file.set(input.files?.[0] ?? null);
      input.value = '';
      this.form.markAsDirty();
    }
    this.selected.set(null);
  }
  begin(image: LabelAdminImage): void {
    if (!this.scope() || this.busy() || this.pending()) return;
    if (this.form.dirty && !globalThis.confirm('Nicht gespeicherte Bildangaben verwerfen?')) return;
    this.file.set(null);
    this.selected.set(image);
    this.form.reset({ attribution: image.attribution, allowedUse: image.allowedUse });
    this.error.set(null);
  }
  async upload(): Promise<void> {
    const file = this.file();
    const scope = this.scope();
    if (!file || !scope || this.busy() || this.pending()) return;
    const generation = ++this.generation;
    this.busy.set(true);
    this.form.disable();
    this.error.set(null);
    try {
      const values = this.form.getRawValue();
      const upload = await this.service.prepare(file, values.attribution, values.allowedUse);
      if (!this.current(generation, scope)) return;
      this.pending.set(Object.freeze({ kind: 'upload', upload }));
      this.busy.set(false);
      await this.retry();
    } catch (error) {
      if (this.current(generation, scope)) {
        this.error.set(error instanceof Error ? error.message : 'Bitte prüfe das Bild.');
        this.form.enable();
      }
    } finally {
      if (this.current(generation, scope)) this.busy.set(false);
    }
  }
  async permission(
    image: LabelAdminImage,
    status: 'approved' | 'revoked',
    edit = false,
  ): Promise<void> {
    if (!this.scope() || this.busy() || this.pending()) return;
    if (
      !globalThis.confirm(
        status === 'revoked'
          ? 'Bildfreigabe widerrufen? Betroffene Labelreferenzen werden für Leser verborgen.'
          : 'Bildrechte bestätigen und Anzeige freigeben?',
      )
    )
      return;
    const values = edit ? this.form.getRawValue() : image;
    if (!values.attribution.trim() || !values.allowedUse.trim()) {
      this.error.set('Bitte gib Bildnachweis und erlaubte Verwendung an.');
      return;
    }
    this.pending.set(
      Object.freeze({
        kind: 'permission',
        image: Object.freeze({
          ...image,
          attribution: values.attribution,
          allowedUse: values.allowedUse,
        }),
        status,
        requestId: crypto.randomUUID(),
      }),
    );
    await this.retry();
  }
  async retry(): Promise<void> {
    const command = this.pending();
    const scope = this.scope();
    if (!command || !scope || this.busy()) return;
    const generation = ++this.generation;
    this.busy.set(true);
    this.form.disable();
    this.error.set(null);
    try {
      if (command.kind === 'upload') await this.service.upload(command.upload);
      else await this.service.setPermission(command.image, command.status, command.requestId);
      if (!this.current(generation, scope)) return;
      this.pending.set(null);
      this.file.set(null);
      this.selected.set(null);
      this.form.reset();
      this.message.set('Bildänderung gespeichert.');
      await this.load(scope);
    } catch (error) {
      if (this.current(generation, scope)) {
        if (error instanceof LabelRpcError && error.code === 'forbidden') this.clear();
        this.error.set(
          error instanceof Error ? error.message : 'Die Bildänderung ist nicht bestätigt.',
        );
      }
    } finally {
      if (scope === this.scope() && !this.destroyRef.destroyed) this.busy.set(false);
    }
  }
  async reload(): Promise<void> {
    if (
      this.busy() ||
      (this.hasUnsavedChanges() &&
        !globalThis.confirm('Antwortstatus neu laden und lokale Bildangaben verwerfen?'))
    )
      return;
    this.clear();
    await this.load();
  }
  hasUnsavedChanges(): boolean {
    return !!this.scope() && (this.form.dirty || !!this.file() || !!this.pending());
  }
  isSaving(): boolean {
    return this.busy();
  }
  warnUnsaved(event: BeforeUnloadEvent): void {
    if (this.hasUnsavedChanges()) {
      event.preventDefault();
      event.returnValue = '';
    }
  }
}
