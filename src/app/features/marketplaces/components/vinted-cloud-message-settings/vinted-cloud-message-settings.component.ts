import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { AuthService } from '../../../../core/services/auth.service';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { NoticeBannerComponent } from '../../../../shared/components/notice-banner/notice-banner.component';
import type { AccountScope } from '../../models/marketplace.models';
import type { MarketplaceMessagePermission } from '../../models/vinted-messaging-response';
import { VintedMessagingApiService } from '../../services/vinted-messaging-api.service';

@Component({
  selector: 'app-vinted-cloud-message-settings',
  imports: [ButtonComponent, NoticeBannerComponent],
  templateUrl: './vinted-cloud-message-settings.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VintedCloudMessageSettingsComponent {
  readonly account = input.required<AccountScope>();
  readonly permission = signal<MarketplaceMessagePermission | null>(null);
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  private readonly api = inject(VintedMessagingApiService);
  private readonly auth = inject(AuthService);
  private readonly workspace = inject(WorkspaceService);
  private key: string | null = null;
  private revision = 0;
  private destroyed = false;

  constructor() {
    effect(() => {
      const account = this.account();
      const workspace = this.workspace.currentWorkspace();
      const userId = this.auth.currentUser()?.id;
      const key =
        userId && workspace?.id === account.workspaceId && !workspace.archived_at
          ? JSON.stringify([userId, account.workspaceId, account.connectionId])
          : null;
      untracked(() => {
        this.key = key;
        this.revision++;
        this.permission.set(null);
        this.error.set(null);
        this.busy.set(false);
        this.loading.set(!!key);
        if (key) void this.reload();
      });
    });
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.revision++;
    });
  }

  async reload(): Promise<void> {
    const key = this.key;
    if (!key || this.destroyed || this.busy()) return;
    const revision = ++this.revision;
    this.loading.set(true);
    this.error.set(null);
    try {
      const permission = await this.api.readPermission(this.account());
      if (this.isCurrent(key, revision)) this.permission.set(permission);
    } catch {
      if (this.isCurrent(key, revision))
        this.error.set('Die Einstellung für den Nachrichtenversand konnte nicht geladen werden.');
    } finally {
      if (this.isCurrent(key, revision)) this.loading.set(false);
    }
  }

  async revoke(): Promise<void> {
    const key = this.key;
    const permission = this.permission();
    if (
      !key ||
      !permission?.allowed ||
      permission.executionMode !== 'cloud' ||
      this.loading() ||
      this.busy() ||
      this.error()
    )
      return;
    const revision = ++this.revision;
    this.busy.set(true);
    try {
      const revoked = await this.api.revokeCloud(this.account(), permission.authorizationVersion);
      if (this.isCurrent(key, revision)) this.permission.set(revoked);
    } catch {
      if (this.isCurrent(key, revision))
        this.error.set(
          'Der Nachrichtenversand konnte nicht deaktiviert werden. Lade die Einstellung erneut.',
        );
    } finally {
      if (this.isCurrent(key, revision)) this.busy.set(false);
    }
  }

  private isCurrent(key: string, revision: number): boolean {
    const account = this.account();
    const workspace = this.workspace.currentWorkspace();
    return (
      !this.destroyed &&
      revision === this.revision &&
      this.key === key &&
      !workspace?.archived_at &&
      workspace?.id === account.workspaceId &&
      JSON.stringify([this.auth.currentUser()?.id, account.workspaceId, account.connectionId]) ===
        key
    );
  }
}
