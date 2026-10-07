import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { CustomSelectComponent } from '../../../../shared/components/custom-select/custom-select.component';
import { AuthService } from '../../../../core/services/auth.service';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { LoadingIndicatorComponent } from '../../../../shared/components/loading-indicator/loading-indicator.component';
import { ModalShellComponent } from '../../../../shared/components/modal-shell/modal-shell.component';
import { NoticeBannerComponent } from '../../../../shared/components/notice-banner/notice-banner.component';
import { TextFieldComponent } from '../../../../shared/components/text-field/text-field.component';
import type { MarketplaceConnection } from '../../models/marketplace.models';
import { MarketplaceAccountStore } from '../../services/marketplace-account.store';
import { MarketplaceCloudSetupStore } from '../../services/marketplace-cloud-setup.store';
import { VintedLocalExtensionBridge } from '../../services/vinted-local-extension-bridge';
import { LucideLink2 } from '@lucide/angular';
import { MarketplaceBrowserTestComponent } from '../marketplace-browser-test/marketplace-browser-test.component';

@Component({
  selector: 'app-marketplace-accounts',
  imports: [
    ReactiveFormsModule,
    ButtonComponent,
    LoadingIndicatorComponent,
    ModalShellComponent,
    NoticeBannerComponent,
    TextFieldComponent,
    CustomSelectComponent,
    MarketplaceBrowserTestComponent,
  ],
  templateUrl: './marketplace-accounts.component.html',
  providers: [MarketplaceCloudSetupStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0' },
})
export class MarketplaceAccountsComponent {
  readonly store = inject(MarketplaceAccountStore);
  readonly cloud = inject(MarketplaceCloudSetupStore);
  readonly extension = inject(VintedLocalExtensionBridge);
  readonly loginPreviewActive = signal(false);
  protected readonly loginIcon = LucideLink2;
  private readonly router = inject(Router);
  private readonly workspace = inject(WorkspaceService);
  private readonly auth = inject(AuthService);
  private dialogRevision = 0;
  private destroyed = false;
  private readonly checkingContext = signal<string | null>(null);
  // Beim Neuladen ist der Zugriff kurz unbekannt; der bestätigte Dialogkontext bleibt bestehen.
  private readonly canKeepDialogOpen = computed(
    () =>
      !this.workspace.currentWorkspace()?.archived_at &&
      (this.store.canManage() || this.store.loading()),
  );
  readonly checkingCloud = computed(
    () => this.canKeepDialogOpen() && this.checkingContext() === this.context(),
  );
  readonly platforms = [{ value: 'vinted', label: 'Vinted' }];
  readonly connectionMethods = computed(() => [
    { value: 'local', label: 'Lokale Erweiterung' },
    ...(this.cloud.canSetup() ? [{ value: 'cloud', label: 'Cloudbrowser' }] : []),
  ]);
  private readonly context = computed(() =>
    JSON.stringify([this.auth.currentUser()?.id, this.workspace.currentWorkspace()?.id]),
  );
  private readonly dialogState = signal<{
    context: string;
    connectionId: string | null;
    mode: 'create' | 'rename' | 'login' | 'delete';
    newAccount: boolean;
    cloudSetupId?: string;
  } | null>(null);
  readonly dialog = computed(() =>
    this.canKeepDialogOpen() && this.dialogState()?.context === this.context()
      ? this.dialogState()
      : null,
  );
  readonly dialogConnection = computed(
    () =>
      this.store.connections().find((item) => item.connectionId === this.dialog()?.connectionId) ??
      null,
  );
  readonly name = new FormControl('', {
    nonNullable: true,
    validators: [
      Validators.required,
      Validators.maxLength(120),
      Validators.pattern(/^(?!\s*$)[^\p{Cc}]+$/u),
    ],
  });
  readonly connectionMethod = new FormControl<'local' | 'cloud'>('local', { nonNullable: true });
  private readonly selectedMethod = toSignal(this.connectionMethod.valueChanges, {
    initialValue: this.connectionMethod.value,
  });
  readonly form = new FormGroup({ name: this.name, connectionMethod: this.connectionMethod });
  readonly submitted = signal(false);
  readonly controlsDisabled = computed(
    () => this.store.loading() || !this.store.canManage() || this.store.busy() || this.cloud.busy(),
  );
  readonly creationBlocked = computed(
    () =>
      this.dialog()?.mode === 'create' &&
      (this.store.remainingSlots() === 0 ||
        (this.selectedMethod() === 'local' && this.extension.localAccount() != null)),
  );

  constructor() {
    effect(() => {
      if (this.controlsDisabled()) this.form.disable({ emitEvent: false });
      else this.form.enable({ emitEvent: false });
    });
    effect(() => {
      const context = this.context();
      if (
        (this.dialogState() || this.checkingContext()) &&
        (!this.canKeepDialogOpen() ||
          (this.dialogState() && this.dialogState()?.context !== context) ||
          (this.checkingContext() && this.checkingContext() !== context))
      )
        this.closeDialog();
    });
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.dialogRevision++;
    });
  }
  openDialog(connection?: MarketplaceConnection, method: 'local' | 'cloud' = 'local'): void {
    if (this.controlsDisabled()) return;
    if (connection && !this.hasConnection(connection)) return;
    this.dialogRevision++;
    this.checkingContext.set(null);
    this.cloud.clearError();
    this.name.reset(connection?.displayName ?? '');
    this.connectionMethod.reset(method);
    if (!connection && method === 'local') this.extension.checkInstallation();
    this.submitted.set(false);
    this.store.clearMutationError();
    this.dialogState.set({
      context: this.context(),
      connectionId: connection?.connectionId ?? null,
      mode: connection ? 'rename' : 'create',
      newAccount: !connection,
    });
  }
  async openLogin(connection: MarketplaceConnection): Promise<void> {
    if (
      this.controlsDisabled() ||
      !this.hasConnection(connection) ||
      connection.status === 'paused' ||
      connection.status === 'blocked'
    )
      return;
    const context = this.context();
    const revision = ++this.dialogRevision;
    if (connection.executionMode === 'local') {
      await this.router.navigate(['/marketplaces/vinted/local-connect', connection.connectionId]);
      return;
    }
    this.store.clearMutationError();
    await this.store.selectConnection(connection.connectionId);
    if (
      !this.isCurrent(context, revision) ||
      this.store.selectedConnection()?.connectionId !== connection.connectionId
    )
      return;
    this.dialogState.set({
      context,
      connectionId: connection.connectionId,
      mode: 'login',
      newAccount: false,
    });
  }
  openDelete(connection: MarketplaceConnection): void {
    if (this.controlsDisabled() || !this.hasConnection(connection)) return;
    this.dialogRevision++;
    this.store.clearMutationError();
    this.dialogState.set({
      context: this.context(),
      connectionId: connection.connectionId,
      mode: 'delete',
      newAccount: false,
    });
  }
  async confirmDelete(): Promise<void> {
    if (this.controlsDisabled()) return;
    const dialog = this.dialog();
    if (!dialog || dialog.mode !== 'delete' || !dialog.connectionId || this.store.busy()) return;
    if ((await this.store.deleteConnection(dialog.connectionId)) && this.dialogState() === dialog)
      this.closeDialog();
  }
  closeDialog(): void {
    this.dialogRevision++;
    void this.cloud.cancel();
    this.checkingContext.set(null);
    this.loginPreviewActive.set(false);
    this.dialogState.set(null);
    this.name.reset();
    this.submitted.set(false);
  }
  async save(): Promise<void> {
    if (this.controlsDisabled()) return;
    this.submitted.set(true);
    const dialog = this.dialog();
    if (
      !dialog ||
      dialog.mode === 'login' ||
      dialog.mode === 'delete' ||
      this.name.invalid ||
      this.store.busy() ||
      this.cloud.busy()
    )
      return;
    if (dialog.mode === 'create') {
      if (this.creationBlocked()) return;
      if (this.connectionMethod.value === 'local') {
        const connectionId = await this.store.createConnection(this.name.value);
        if (!connectionId || this.dialog() !== dialog || !this.store.canManage()) return;
        this.closeDialog();
        await this.router.navigate(['/marketplaces/vinted/local-connect', connectionId]);
        return;
      }
      await this.beginCloud({ displayName: this.name.value.trim() }, dialog);
      return;
    }
    if (
      dialog.connectionId &&
      (await this.store.renameConnection(dialog.connectionId, this.name.value)) &&
      this.dialog() === dialog
    )
      this.closeDialog();
  }

  connectionCreated(connectionId: string): void {
    const dialog = this.dialog();
    if (dialog?.mode === 'login' && dialog.newAccount && !dialog.connectionId)
      this.dialogState.set({ ...dialog, connectionId });
  }

  async upgrade(connection: MarketplaceConnection): Promise<void> {
    if (
      !this.store.canManage() ||
      !this.hasConnection(connection) ||
      connection.status === 'paused' ||
      connection.status === 'blocked' ||
      !this.cloud.canSetup() ||
      this.store.busy() ||
      this.cloud.busy()
    )
      return;
    await this.beginCloud(
      { connectionId: connection.connectionId },
      {
        context: this.context(),
        connectionId: connection.connectionId,
        mode: 'login',
        newAccount: false,
      },
    );
  }
  private async beginCloud(
    target: { connectionId: string } | { displayName: string },
    dialog: NonNullable<ReturnType<typeof this.dialog>>,
  ): Promise<void> {
    if (this.controlsDisabled()) return;
    const context = this.context();
    const revision = ++this.dialogRevision;
    this.checkingContext.set(context);
    try {
      const setup = await this.cloud.begin(target);
      if (!this.isCurrent(context, revision)) return;
      if (setup?.state === 'completed') {
        this.dialogState.set(null);
        await this.router.navigate(['/marketplaces/vinted/overview']);
        return;
      }
      if (setup)
        this.dialogState.set({
          ...dialog,
          connectionId: setup.connectionId,
          mode: 'login',
          cloudSetupId: setup.setupId,
        });
    } finally {
      if (!this.destroyed && revision === this.dialogRevision) this.checkingContext.set(null);
    }
  }
  private isCurrent(context: string, revision: number): boolean {
    return (
      !this.destroyed &&
      this.store.canManage() &&
      context === this.context() &&
      revision === this.dialogRevision
    );
  }
  private hasConnection(connection: MarketplaceConnection): boolean {
    return this.store
      .connections()
      .some(
        (existing) =>
          existing.connectionId === connection.connectionId &&
          existing.workspaceId === connection.workspaceId,
      );
  }
}
