import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { LucideBell, LucideDynamicIcon, LucideSend, LucideVolume2 } from '@lucide/angular';
import { SyncStatusService } from '../../../../core/services/sync-status.service';
import { WebPushService } from '../../../../core/services/web-push.service';
import { WebhookService } from '../../../../core/services/webhook.service';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import { CustomCheckboxComponent } from '../../../../shared/components/custom-checkbox/custom-checkbox.component';
import { ToastService } from '../../../../shared/components/toast/toast.service';

@Component({
  selector: 'app-notification-settings',
  imports: [ReactiveFormsModule, LucideDynamicIcon, CustomCheckboxComponent],
  templateUrl: './notification-settings.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class NotificationSettingsComponent {
  readonly webPushService = inject(WebPushService);
  private readonly webhookService = inject(WebhookService);
  private readonly workspaceService = inject(WorkspaceService);
  private readonly toast = inject(ToastService);
  private readonly syncStatus = inject(SyncStatusService);
  readonly bellIcon = LucideBell;
  readonly sendIcon = LucideSend;
  readonly volumeIcon = LucideVolume2;
  readonly webhookForm = new FormGroup({
    discordEnabled: new FormControl(this.webhookService.config().discordEnabled),
    discordWebhookUrl: new FormControl(this.webhookService.config().discordWebhookUrl || ''),
    telegramEnabled: new FormControl(this.webhookService.config().telegramEnabled),
    telegramBotToken: new FormControl(this.webhookService.config().telegramBotToken || ''),
    telegramChatId: new FormControl(this.webhookService.config().telegramChatId || ''),
    customWebhookEnabled: new FormControl(this.webhookService.config().customWebhookEnabled),
    customWebhookUrl: new FormControl(this.webhookService.config().customWebhookUrl || ''),
    notifyOnSale: new FormControl(this.webhookService.config().notifyOnSale),
    notifyOnPurchase: new FormControl(this.webhookService.config().notifyOnPurchase),
    soundEnabled: new FormControl(this.webhookService.config().soundEnabled),
  });
  readonly isLoadingWorkspaceConfig = signal(true);
  readonly isSavingWebhookConfig = signal(false);
  readonly isTestingWebhook = signal(false);
  readonly isTestingPush = signal(false);
  constructor() {
    effect(() => {
      const workspaceId = this.workspaceService.currentWorkspace()?.id ?? null;
      if (!workspaceId || this.webhookService.loadedWorkspaceId() !== workspaceId) {
        this.isLoadingWorkspaceConfig.set(workspaceId !== null);
        this.webhookForm.reset(
          {
            discordEnabled: false,
            discordWebhookUrl: '',
            telegramEnabled: false,
            telegramBotToken: '',
            telegramChatId: '',
            customWebhookEnabled: false,
            customWebhookUrl: '',
            notifyOnSale: true,
            notifyOnPurchase: true,
            soundEnabled: true,
          },
          { emitEvent: false },
        );
        return;
      }
      const value = this.webhookService.config();
      this.webhookForm.patchValue(value, { emitEvent: false });
      this.isLoadingWorkspaceConfig.set(false);
    });
  }
  async onRequestPushPermission(): Promise<void> {
    const granted = await this.webPushService.requestPermission();
    if (granted) this.toast.success('Browser-Benachrichtigungen wurden aktiviert.');
    else
      this.toast.error(
        'Browser-Benachrichtigungen konnten nicht aktiviert werden.',
        'Berechtigung wurde im Browser verweigert oder blockiert.',
      );
  }
  async onTestWebPush(): Promise<void> {
    this.isTestingPush.set(true);
    const sent = await this.webPushService.sendTestNotification();
    this.isTestingPush.set(false);
    if (sent) this.toast.success('Test-Benachrichtigung wurde versendet.');
    else
      this.toast.error(
        'Test-Benachrichtigung konnte nicht versendet werden.',
        'Push konnte nicht angezeigt werden. Bitte Berechtigung im Browser prüfen.',
      );
  }
  onTogglePushSetting(
    key:
      | 'enabled'
      | 'notifyOnShopOrder'
      | 'notifyOnFulfillment'
      | 'notifyOnMarginAlert'
      | 'soundEnabled',
    value: boolean,
  ): void {
    this.webPushService.updateSettings({ [key]: value });
    this.toast.success('Benachrichtigungseinstellung wurde gespeichert.');
  }
  async onSaveWebhookConfig(): Promise<void> {
    const workspaceId = this.workspaceService.currentWorkspace()?.id;
    if (!workspaceId || this.isLoadingWorkspaceConfig()) return;
    this.isSavingWebhookConfig.set(true);
    try {
      const result = await this.saveWebhookConfig();
      if (this.workspaceService.currentWorkspace()?.id !== workspaceId) return;
      if (result.error || !result.data) {
        const error = result.error ?? new Error('Keine bestätigte Webhook-Konfiguration.');
        if (!result.reportedBySyncStatus)
          this.toast.error('Webhook-Konfiguration konnte nicht gespeichert werden.', error.message);
        return;
      }
      this.toast.success('Webhook-Konfiguration wurde gespeichert.');
    } catch (reason: unknown) {
      const error = reason instanceof Error ? reason : new Error('Unbekannter Fehler');
      if (!this.syncStatus.istZentralGemeldet(error))
        this.toast.error('Webhook-Konfiguration konnte nicht gespeichert werden.', error.message);
    } finally {
      this.isSavingWebhookConfig.set(false);
    }
  }
  async testWebhook(channel: 'discord' | 'telegram' | 'custom'): Promise<void> {
    const workspaceId = this.workspaceService.currentWorkspace()?.id;
    if (!workspaceId || this.isLoadingWorkspaceConfig()) return;
    this.isTestingWebhook.set(true);
    try {
      const configResult = await this.saveWebhookConfig();
      if (this.workspaceService.currentWorkspace()?.id !== workspaceId) return;
      if (configResult.error || !configResult.data) {
        if (!configResult.reportedBySyncStatus)
          this.toast.error(
            'Webhook-Konfiguration konnte nicht gespeichert werden.',
            configResult.error?.message,
          );
        return;
      }
      const result = await this.webhookService.sendTestNotification(channel);
      if (result.success) this.toast.success('Test-Webhook wurde versendet.');
      else this.toast.error('Test-Webhook konnte nicht versendet werden.', result.message);
    } catch (reason: unknown) {
      const error = reason instanceof Error ? reason : new Error('Unbekannter Fehler');
      if (!this.syncStatus.istZentralGemeldet(error))
        this.toast.error('Test-Webhook konnte nicht versendet werden.', error.message);
    } finally {
      this.isTestingWebhook.set(false);
    }
  }
  private saveWebhookConfig(): ReturnType<WebhookService['updateConfig']> {
    const value = this.webhookForm.getRawValue();
    return this.webhookService.updateConfig({
      discordEnabled: !!value.discordEnabled,
      discordWebhookUrl: value.discordWebhookUrl?.trim() || '',
      telegramEnabled: !!value.telegramEnabled,
      telegramBotToken: value.telegramBotToken?.trim() || '',
      telegramChatId: value.telegramChatId?.trim() || '',
      customWebhookEnabled: !!value.customWebhookEnabled,
      customWebhookUrl: value.customWebhookUrl?.trim() || '',
      notifyOnSale: !!value.notifyOnSale,
      notifyOnPurchase: !!value.notifyOnPurchase,
      soundEnabled: !!value.soundEnabled,
    });
  }
}
