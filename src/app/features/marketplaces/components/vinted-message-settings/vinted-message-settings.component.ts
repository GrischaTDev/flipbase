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
import {
  messageNotificationCategorySettings,
  vintedNotificationCategories,
  type MessageNotificationSettings,
  type VintedNotificationCategory,
} from '../../models/marketplace-message-notifications';
import { MarketplaceMessageNotificationApiService } from '../../services/marketplace-message-notification-api.service';

@Component({
  selector: 'app-vinted-message-settings',
  imports: [ReactiveFormsModule, CustomCheckboxComponent, ButtonComponent, NoticeBannerComponent],
  templateUrl: './vinted-message-settings.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VintedMessageSettingsComponent {
  readonly account = input.required<AccountScope>();
  readonly settings = signal<MessageNotificationSettings | null>(null);
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly categories = vintedNotificationCategories;
  readonly categoryControls = {
    messages: this.createControl(),
    offers: this.createControl(),
    orders: this.createControl(),
    shipping: this.createControl(),
    payments: this.createControl(),
    feedback: this.createControl(),
    other: this.createControl(),
  };
  readonly enabledControl = this.categoryControls.messages;
  private readonly api = inject(MarketplaceMessageNotificationApiService);
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
        if (this.key === key) return;
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
        for (const { key } of this.categories) {
          if (disabled) this.categoryControls[key].disable({ emitEvent: false });
          else this.categoryControls[key].enable({ emitEvent: false });
        }
      });
    });
    for (const { key } of this.categories)
      this.categoryControls[key].valueChanges.pipe(takeUntilDestroyed()).subscribe((enabled) => {
        void this.save(key, enabled);
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
      this.updateControls(settings);
    } catch (error) {
      if (this.isCurrent(key, revision)) this.error.set(this.errorText(error));
    } finally {
      if (this.isCurrent(key, revision)) this.loading.set(false);
    }
  }

  private async save(category: VintedNotificationCategory, enabled: boolean): Promise<void> {
    const settings = this.settings();
    const key = this.key;
    if (!settings || !key || this.busy() || this.loading() || this.error()) return;
    const revision = ++this.revision;
    this.busy.set(true);
    try {
      const saved = await this.api.setCategorySettings(settings, category, enabled);
      if (!this.isCurrent(key, revision)) return;
      this.settings.set(saved);
      this.updateControls(saved);
    } catch (error) {
      if (!this.isCurrent(key, revision)) return;
      this.updateControls(settings);
      this.error.set(this.errorText(error));
    } finally {
      if (this.isCurrent(key, revision)) this.busy.set(false);
    }
  }

  private createControl(): FormControl<boolean> {
    return new FormControl({ value: false, disabled: true }, { nonNullable: true });
  }

  private updateControls(settings: MessageNotificationSettings): void {
    const categories = messageNotificationCategorySettings(settings);
    for (const { key } of this.categories)
      this.categoryControls[key].setValue(categories[key], { emitEvent: false });
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
      : 'Benachrichtigungen konnten nicht gespeichert werden.';
  }
}
