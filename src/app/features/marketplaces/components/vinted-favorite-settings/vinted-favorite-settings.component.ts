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
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { AuthService } from '../../../../core/services/auth.service';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import { CustomCheckboxComponent } from '../../../../shared/components/custom-checkbox/custom-checkbox.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { NoticeBannerComponent } from '../../../../shared/components/notice-banner/notice-banner.component';
import type { AccountScope } from '../../models/marketplace.models';
import type { FavoriteNotificationSettings } from '../../models/marketplace-favorite-notifications';
import { MarketplaceFavoriteNotificationApiService } from '../../services/marketplace-favorite-notification-api.service';

@Component({
  selector: 'app-vinted-favorite-settings',
  imports: [ReactiveFormsModule, CustomCheckboxComponent, ButtonComponent, NoticeBannerComponent],
  templateUrl: './vinted-favorite-settings.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VintedFavoriteSettingsComponent {
  readonly account = input.required<AccountScope>();
  readonly settings = signal<FavoriteNotificationSettings | null>(null);
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly enabledControl = new FormControl(
    { value: false, disabled: true },
    { nonNullable: true },
  );
  private readonly api = inject(MarketplaceFavoriteNotificationApiService);
  private readonly auth = inject(AuthService);
  private readonly workspace = inject(WorkspaceService);
  private revision = 0;
  private destroyed = false;
  private key: string | null = null;

  constructor() {
    effect(() => {
      const account = this.account();
      const userId = this.auth.currentUser()?.id;
      const workspace = this.workspace.currentWorkspace();
      const key =
        userId && workspace?.id === account.workspaceId && !workspace.archived_at
          ? JSON.stringify([userId, account.workspaceId, account.connectionId])
          : null;
      untracked(() => {
        this.key = key;
        this.revision++;
        this.settings.set(null);
        this.error.set(null);
        this.busy.set(false);
        this.loading.set(!!key);
        if (key) void this.reload();
      });
    });
    effect(() => {
      const disabled = this.loading() || this.busy() || !!this.error() || !this.settings();
      untracked(() => {
        if (disabled) this.enabledControl.disable({ emitEvent: false });
        else this.enabledControl.enable({ emitEvent: false });
      });
    });
    this.enabledControl.valueChanges.pipe(takeUntilDestroyed()).subscribe((enabled) => {
      void this.save(enabled);
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
      const settings = await this.api.readSettings(this.account());
      if (!this.isCurrent(key, revision)) return;
      this.settings.set(settings);
      this.enabledControl.setValue(settings.enabled, { emitEvent: false });
    } catch (error) {
      if (this.isCurrent(key, revision)) this.error.set(this.errorText(error));
    } finally {
      if (this.isCurrent(key, revision)) this.loading.set(false);
    }
  }

  private async save(enabled: boolean): Promise<void> {
    const settings = this.settings();
    const key = this.key;
    if (!settings || !key || this.busy() || this.loading() || this.error()) return;
    const revision = ++this.revision;
    this.busy.set(true);
    try {
      const saved = await this.api.setSettings(settings, enabled);
      if (!this.isCurrent(key, revision)) return;
      this.settings.set(saved);
      this.enabledControl.setValue(saved.enabled, { emitEvent: false });
    } catch (error) {
      if (!this.isCurrent(key, revision)) return;
      this.enabledControl.setValue(settings.enabled, { emitEvent: false });
      this.error.set(this.errorText(error));
    } finally {
      if (this.isCurrent(key, revision)) this.busy.set(false);
    }
  }

  private isCurrent(key: string, revision: number): boolean {
    const account = this.account();
    return (
      !this.destroyed &&
      this.revision === revision &&
      this.key === key &&
      this.workspace.currentWorkspace()?.id === account.workspaceId &&
      JSON.stringify([this.auth.currentUser()?.id, account.workspaceId, account.connectionId]) ===
        key
    );
  }
  private errorText(error: unknown): string {
    return error instanceof Error
      ? error.message
      : 'Favoritenmeldungen konnten nicht gespeichert werden.';
  }
}
