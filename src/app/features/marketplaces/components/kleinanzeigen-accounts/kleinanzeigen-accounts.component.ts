import { AuthService } from '../../../../core/services/auth.service';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { LucideRefreshCw, LucideLink, LucideUnplug } from '@lucide/angular';
import { CardComponent } from '../../../../shared/components/card/card.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import { NoticeBannerComponent } from '../../../../shared/components/notice-banner/notice-banner.component';
import { CustomCheckboxComponent } from '../../../../shared/components/custom-checkbox/custom-checkbox.component';
import { LoadingIndicatorComponent } from '../../../../shared/components/loading-indicator/loading-indicator.component';
import { ModalShellComponent } from '../../../../shared/components/modal-shell/modal-shell.component';
import { KleinanzeigenAccountService } from '../../services/kleinanzeigen-account.service';
import { KleinanzeigenAccountActionsService } from '../../services/kleinanzeigen-account-actions.service';
import { KleinanzeigenExtensionBridge } from '../../services/kleinanzeigen-extension-bridge';
import type {
  KleinanzeigenAccount,
  KleinanzeigenBinding,
} from '../../../../../../supabase/functions/_shared/kleinanzeigen-contracts';
@Component({
  selector: 'app-kleinanzeigen-accounts',
  imports: [
    DatePipe,
    ReactiveFormsModule,
    CardComponent,
    ButtonComponent,
    BadgeComponent,
    NoticeBannerComponent,
    CustomCheckboxComponent,
    LoadingIndicatorComponent,
    ModalShellComponent,
  ],
  providers: [KleinanzeigenExtensionBridge, KleinanzeigenAccountActionsService],
  templateUrl: './kleinanzeigen-accounts.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0' },
})
export class KleinanzeigenAccountsComponent {
  readonly workspaceId = input.required<string>();
  readonly changed = output<void>();
  private readonly auth = inject(AuthService);
  private readonly api = inject(KleinanzeigenAccountService);
  private readonly actions = inject(KleinanzeigenAccountActionsService);
  readonly extension = inject(KleinanzeigenExtensionBridge);
  readonly accounts = signal<readonly KleinanzeigenAccount[]>([]);
  readonly canManage = signal(false);
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly notice = signal<string | null>(null);
  readonly localBinding = signal<KleinanzeigenBinding | null | undefined>(undefined);
  readonly profileIssue = signal<string | null>(null);
  readonly disconnecting = signal<KleinanzeigenAccount | null>(null);
  readonly publishPermission = new FormControl(false, { nonNullable: true });
  readonly refreshIcon = LucideRefreshCw;
  readonly linkIcon = LucideLink;
  readonly unplugIcon = LucideUnplug;
  private contextVersion = 0;
  private loadVersion = 0;
  private destroyed = false;
  constructor() {
    this.extension.checkInstallation();
    effect(() => {
      const workspaceId = this.workspaceId();
      const userId = this.auth.currentUser()?.id;
      untracked(() => {
        this.contextVersion++;
        this.loadVersion++;
        this.actions.cancel();
        this.accounts.set([]);
        this.canManage.set(false);
        this.busy.set(false);
        this.error.set(null);
        this.notice.set(null);
        this.disconnecting.set(null);
        this.localBinding.set(undefined);
        this.profileIssue.set(null);
        this.publishPermission.setValue(false);
        if (userId) void this.reload(workspaceId);
      });
    });
    effect(() => {
      const workspaceId = this.workspaceId();
      const available = this.extension.capabilities().accounts;
      untracked(() => {
        if (available) void this.readProfile(workspaceId);
        else this.localBinding.set(undefined);
      });
    });
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.contextVersion++;
      this.loadVersion++;
      this.actions.cancel();
    });
  }
  private current(context: number): boolean {
    return !this.destroyed && context === this.contextVersion;
  }
  async reload(workspaceId = this.workspaceId()): Promise<void> {
    const version = ++this.loadVersion;
    this.loading.set(true);
    try {
      const result = await this.api.readAccounts(workspaceId);
      if (this.destroyed || version !== this.loadVersion || workspaceId !== this.workspaceId())
        return;
      this.accounts.set(result.accounts);
      this.canManage.set(result.canManage);
    } catch (error) {
      if (!this.destroyed && version === this.loadVersion)
        this.error.set(
          error instanceof Error
            ? error.message
            : 'Die Kleinanzeigen-Konten konnten nicht geladen werden.',
        );
    } finally {
      if (!this.destroyed && version === this.loadVersion) this.loading.set(false);
    }
  }
  private async readProfile(workspaceId: string): Promise<void> {
    const context = this.contextVersion;
    try {
      const binding = await this.extension.status(workspaceId);
      if (!this.current(context)) return;
      if (binding && binding.workspaceId !== workspaceId)
        throw new Error('Die lokale Kontobindung gehört zu einem anderen Arbeitsbereich.');
      this.localBinding.set(binding);
      this.profileIssue.set(null);
    } catch (error) {
      if (!this.current(context)) return;
      this.localBinding.set(undefined);
      this.profileIssue.set(
        error instanceof Error
          ? error.message
          : 'Das lokale Browserprofil konnte nicht geprüft werden.',
      );
    }
  }
  private known(account: KleinanzeigenAccount): boolean {
    return (
      account.workspaceId === this.workspaceId() &&
      this.accounts().some((row) => row.connectionId === account.connectionId)
    );
  }
  isBound(account: KleinanzeigenAccount): boolean {
    const binding = this.localBinding();
    return (
      !!binding &&
      binding.workspaceId === account.workspaceId &&
      binding.connectionId === account.connectionId &&
      binding.externalAccountId === account.externalAccountId &&
      binding.generation === account.localGrant?.generation
    );
  }
  canSync(account: KleinanzeigenAccount): boolean {
    return (
      !this.busy() &&
      this.extension.capabilities().sync &&
      this.isBound(account) &&
      account.localGrant?.active === true
    );
  }
  async connect(): Promise<void> {
    if (
      this.busy() ||
      !this.canManage() ||
      !this.extension.capabilities().accounts ||
      this.localBinding() !== null
    )
      return;
    const context = this.contextVersion;
    const workspaceId = this.workspaceId();
    const publish = this.publishPermission.value;
    this.busy.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      const binding = await this.actions.connect(workspaceId, publish);
      if (!this.current(context)) return;
      this.localBinding.set(binding);
      this.notice.set('Kontoverbindung freigegeben. Du kannst die Inserate jetzt abgleichen.');
      await this.reload(workspaceId);
      if (this.current(context)) this.changed.emit();
    } catch (error) {
      if (this.current(context))
        this.error.set(
          error instanceof Error ? error.message : 'Die Kontoverbindung wurde nicht bestätigt.',
        );
    } finally {
      if (this.current(context)) this.busy.set(false);
    }
  }
  async synchronize(account: KleinanzeigenAccount): Promise<void> {
    if (!this.known(account) || !this.canSync(account)) return;
    const context = this.contextVersion;
    this.busy.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      const result = await this.actions.synchronize(account);
      if (!this.current(context)) return;
      this.notice.set(result.itemCount + ' Inserate vollständig abgeglichen.');
      await this.reload();
      if (this.current(context)) this.changed.emit();
    } catch (error) {
      if (this.current(context))
        this.error.set(
          error instanceof Error ? error.message : 'Der Abgleich wurde nicht bestätigt.',
        );
    } finally {
      if (this.current(context)) this.busy.set(false);
    }
  }
  async confirmDisconnect(): Promise<void> {
    const account = this.disconnecting();
    if (!account || !this.known(account) || this.busy()) return;
    const context = this.contextVersion;
    this.busy.set(true);
    this.error.set(null);
    try {
      const result = await this.actions.disconnect(account);
      if (!this.current(context)) return;
      this.disconnecting.set(null);
      if (this.localBinding()?.connectionId === account.connectionId)
        this.localBinding.set(result === 'unavailable' ? undefined : null);
      this.notice.set(
        result === 'unavailable'
          ? 'Die Freigabe ist widerrufen. Die lokale Erweiterung war nicht erreichbar; ihre bisherige Freigabe kann nicht mehr verwendet werden.'
          : 'Die Kontoverbindung ist getrennt. Deine gespeicherten Inserate bleiben erhalten.',
      );
      await this.reload();
      if (this.current(context)) this.changed.emit();
    } catch (error) {
      if (this.current(context))
        this.error.set(
          error instanceof Error ? error.message : 'Die Verbindung konnte nicht getrennt werden.',
        );
    } finally {
      if (this.current(context)) this.busy.set(false);
    }
  }
  accountTypeLabel(account: KleinanzeigenAccount): string {
    return account.accountType === 'private'
      ? 'Privat'
      : account.accountType === 'commercial'
        ? 'Gewerblich'
        : 'Kontotyp unbekannt';
  }
  accountStatusLabel(account: KleinanzeigenAccount): string {
    return account.status === 'disconnected'
      ? 'Nicht verbunden'
      : !account.localGrant?.active
        ? 'Freigabe erneuern'
        : !account.lastSyncedAt
          ? 'Noch kein Abgleich'
          : 'Verbunden';
  }
}
