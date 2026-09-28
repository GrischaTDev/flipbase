import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { CustomSelectComponent } from '../../../../shared/components/custom-select/custom-select.component';
import {
  LucideLogIn,
  LucidePencil,
  LucidePause,
  LucidePlay,
  LucidePlus,
  LucideTrash2,
} from '@lucide/angular';
import { AuthService } from '../../../../core/services/auth.service';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { CardComponent } from '../../../../shared/components/card/card.component';
import { DataTableComponent } from '../../../../shared/components/data-table/data-table.component';
import { ModalShellComponent } from '../../../../shared/components/modal-shell/modal-shell.component';
import { NoticeBannerComponent } from '../../../../shared/components/notice-banner/notice-banner.component';
import { TableActionButtonComponent } from '../../../../shared/components/table-action-button/table-action-button.component';
import { TextFieldComponent } from '../../../../shared/components/text-field/text-field.component';
import type { MarketplaceConnection } from '../../models/marketplace.models';
import {
  MARKETPLACE_CONNECTION_LABELS,
  MARKETPLACE_CONNECTION_TONES,
} from '../../models/marketplace-presentation';
import { MarketplaceAccountStore } from '../../services/marketplace-account.store';
import { MarketplaceBrowserTestComponent } from '../marketplace-browser-test/marketplace-browser-test.component';

@Component({
  selector: 'app-marketplace-accounts',
  imports: [
    DatePipe,
    ReactiveFormsModule,
    BadgeComponent,
    ButtonComponent,
    CardComponent,
    DataTableComponent,
    ModalShellComponent,
    NoticeBannerComponent,
    TableActionButtonComponent,
    TextFieldComponent,
    CustomSelectComponent,
    MarketplaceBrowserTestComponent,
  ],
  templateUrl: './marketplace-accounts.component.html',
  providers: [MarketplaceAccountStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0' },
})
export class MarketplaceAccountsComponent {
  readonly store = inject(MarketplaceAccountStore);
  private readonly workspace = inject(WorkspaceService);
  private readonly auth = inject(AuthService);
  readonly platforms = [{ value: 'vinted', label: 'Vinted' }];
  private readonly context = computed(() =>
    JSON.stringify([this.auth.currentUser()?.id, this.workspace.currentWorkspace()?.id]),
  );
  private readonly dialogState = signal<{
    context: string;
    connectionId: string | null;
    mode: 'create' | 'rename' | 'login' | 'delete';
    newAccount: boolean;
  } | null>(null);
  readonly dialog = computed(() =>
    this.dialogState()?.context === this.context() ? this.dialogState() : null,
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
  readonly form = new FormGroup({ name: this.name });
  readonly submitted = signal(false);
  readonly labels = MARKETPLACE_CONNECTION_LABELS;
  readonly tones = MARKETPLACE_CONNECTION_TONES;
  readonly connectedAccounts = computed(() =>
    this.store.connections().filter((account) => account.externalAccountId !== null),
  );
  readonly pendingAccounts = computed(() =>
    this.store.connections().filter((account) => account.externalAccountId === null),
  );
  readonly addIcon = LucidePlus;
  readonly loginIcon = LucideLogIn;
  readonly editIcon = LucidePencil;
  readonly pauseIcon = LucidePause;
  readonly resumeIcon = LucidePlay;
  readonly deleteIcon = LucideTrash2;

  constructor() {
    effect(() => {
      if (this.store.busy()) this.name.disable({ emitEvent: false });
      else this.name.enable({ emitEvent: false });
    });
    effect(() => {
      const context = this.context();
      if (this.dialogState() && this.dialogState()?.context !== context) this.closeDialog();
    });
  }
  openDialog(connection?: MarketplaceConnection): void {
    if (!this.store.canManage() || this.store.busy()) return;
    this.name.reset(connection?.displayName ?? '');
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
    if (!this.store.canManage() || this.store.busy()) return;
    this.store.clearMutationError();
    await this.store.selectConnection(connection.connectionId);
    if (
      !this.store.canManage() ||
      this.store.selectedConnection()?.connectionId !== connection.connectionId
    )
      return;
    this.dialogState.set({
      context: this.context(),
      connectionId: connection.connectionId,
      mode: 'login',
      newAccount: false,
    });
  }
  openDelete(connection: MarketplaceConnection): void {
    if (!this.store.canManage() || this.store.busy()) return;
    this.store.clearMutationError();
    this.dialogState.set({
      context: this.context(),
      connectionId: connection.connectionId,
      mode: 'delete',
      newAccount: false,
    });
  }
  async confirmDelete(): Promise<void> {
    const dialog = this.dialog();
    if (!dialog || dialog.mode !== 'delete' || !dialog.connectionId || this.store.busy()) return;
    if ((await this.store.deleteConnection(dialog.connectionId)) && this.dialogState() === dialog)
      this.closeDialog();
  }
  closeDialog(): void {
    this.dialogState.set(null);
    this.name.reset();
    this.submitted.set(false);
  }
  async save(): Promise<void> {
    this.submitted.set(true);
    const dialog = this.dialog();
    if (
      !dialog ||
      dialog.mode === 'login' ||
      dialog.mode === 'delete' ||
      this.name.invalid ||
      this.store.busy()
    )
      return;
    if (dialog.mode === 'create') {
      this.dialogState.set({ ...dialog, mode: 'login' });
      return;
    }
    if (
      dialog.connectionId &&
      (await this.store.renameConnection(dialog.connectionId, this.name.value))
    )
      this.closeDialog();
  }

  connectionCreated(connectionId: string): void {
    const dialog = this.dialog();
    if (dialog?.mode === 'login' && dialog.newAccount && !dialog.connectionId)
      this.dialogState.set({ ...dialog, connectionId });
  }
}
