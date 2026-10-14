import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { LucideBell, LucideDynamicIcon, LucideSend, LucideVolume2 } from '@lucide/angular';
import { SyncStatusService } from '../../../../core/services/sync-status.service';
import { WebPushService } from '../../../../core/services/web-push.service';
import { WebhookService } from '../../../../core/services/webhook.service';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import { CustomCheckboxComponent } from '../../../../shared/components/custom-checkbox/custom-checkbox.component';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { TextFieldComponent } from '../../../../shared/components/text-field/text-field.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { WebPushCategory, WebPushDeviceStatus } from '../../../../core/models/web-push.models';

@Component({
  selector: 'app-notification-settings',
  imports: [
    ReactiveFormsModule,
    LucideDynamicIcon,
    CustomCheckboxComponent,
    TextFieldComponent,
    ButtonComponent,
  ],
  templateUrl: './notification-settings.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class NotificationSettingsComponent {
  readonly webPushService = inject(WebPushService);
  readonly webhookService = inject(WebhookService);
  private readonly workspaceService = inject(WorkspaceService);
  private readonly toast = inject(ToastService);
  private readonly syncStatus = inject(SyncStatusService);
  readonly bellIcon = LucideBell;
  readonly sendIcon = LucideSend;
  readonly volumeIcon = LucideVolume2;
  readonly pushCategories: { key: WebPushCategory; label: string }[] = [
    { key: 'message', label: 'Neue Marktplatznachrichten' },
    { key: 'order', label: 'Neue Bestellungen' },
    { key: 'favorite', label: 'Neue Favoriten für deine Vinted-Inserate' },
    { key: 'connection', label: 'Kontoverbindung braucht deine Anmeldung' },
  ];
  readonly pushStatusText = computed(() => {
    const labels: Record<WebPushDeviceStatus, string> = {
      unsupported: 'Dieser Browser unterstützt Push nicht.',
      home_app_required: 'Starte die Home-Bildschirm-App, um Push zu aktivieren.',
      permission_required: 'Dieses Gerät ist noch nicht aktiviert.',
      denied: 'Die Browserfreigabe wurde abgelehnt.',
      checking: 'Gerätebindung wird geprüft …',
      disabled: 'Push ist derzeit nicht freigegeben.',
      ready: 'Dieses Gerät kann aktiviert werden.',
      registering: 'Gerät wird registriert …',
      pending: 'Die Aktivierung oder Kategorienbestätigung ist noch ausstehend.',
      active: 'Dieses Gerät ist für Push aktiviert.',
      revoke_pending: 'Der Serverwiderruf ist noch ausstehend.',
      error: 'Die Gerätebindung konnte nicht geprüft werden.',
    };
    return labels[this.webPushService.deviceStatus()];
  });
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
  private saveRequestId = 0;
  private saveWorkspaceId: string | null = null;
  constructor() {
    effect(() => {
      const workspaceId = this.workspaceService.currentWorkspace()?.id ?? null;
      if (workspaceId !== this.saveWorkspaceId) {
        this.saveWorkspaceId = workspaceId;
        this.saveRequestId += 1;
        this.isSavingWebhookConfig.set(false);
      }
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
      this.webhookForm.patchValue(
        {
          ...value,
          discordWebhookUrl: '',
          telegramBotToken: '',
          telegramChatId: '',
          customWebhookUrl: '',
        },
        { emitEvent: false },
      );
      this.isLoadingWorkspaceConfig.set(false);
    });
  }
  async onRequestPushPermission(): Promise<void> {
    const granted = await this.webPushService.requestPermission();
    if (granted) this.toast.success('Dieses Gerät wurde für Push aktiviert.');
    else
      this.toast.error(
        'Dieses Gerät konnte nicht aktiviert werden.',
        this.webPushService.deviceMessage() || 'Prüfe die Browserfreigabe und versuche es erneut.',
      );
  }
  async onTestWebPush(): Promise<void> {
    this.isTestingPush.set(true);
    const sent = await this.webPushService.sendTestNotification();
    this.isTestingPush.set(false);
    if (sent) this.toast.success('Test zur Zustellung übergeben.');
    else
      this.toast.error(
        'Test konnte nicht zur Zustellung übergeben werden.',
        this.webPushService.deviceMessage() || 'Bitte versuche es erneut.',
      );
  }
  async onDeactivateDevice(): Promise<void> {
    try {
      if (await this.webPushService.deactivateDevice())
        this.toast.success('Dieses Gerät wurde deaktiviert.');
      else this.toast.info('Deaktivierung noch ausstehend.', this.webPushService.deviceMessage());
    } catch {
      this.toast.error('Die Deaktivierung konnte nicht lokal gesichert werden.');
    }
  }
  async onToggleCategory(category: WebPushCategory, enabled: boolean): Promise<void> {
    const categories = this.webPushService
      .categories()
      .filter((candidate) => candidate !== category);
    if (enabled) categories.push(category);
    if (!this.webPushService.isActive()) {
      this.webPushService.selectCategories(categories);
      return;
    }
    if (await this.webPushService.saveCategories(categories))
      this.toast.success('Push-Kategorien wurden gespeichert.');
    else
      this.toast.error(
        'Push-Kategorien konnten nicht gespeichert werden.',
        this.webPushService.deviceMessage(),
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
    const requestId = ++this.saveRequestId;
    this.isSavingWebhookConfig.set(true);
    try {
      const result = await this.saveWebhookConfig();
      if (!this.isCurrentSave(requestId, workspaceId)) return;
      if (result.error || !result.data) {
        const error = result.error ?? new Error('Keine bestätigte Webhook-Konfiguration.');
        if (!result.reportedBySyncStatus)
          this.toast.error('Webhook-Konfiguration konnte nicht gespeichert werden.', error.message);
        return;
      }
      this.toast.success('Webhook-Konfiguration wurde gespeichert.');
    } catch (reason: unknown) {
      if (!this.isCurrentSave(requestId, workspaceId)) return;
      const error = reason instanceof Error ? reason : new Error('Unbekannter Fehler');
      if (!this.syncStatus.istZentralGemeldet(error))
        this.toast.error('Webhook-Konfiguration konnte nicht gespeichert werden.', error.message);
    } finally {
      if (this.isCurrentSave(requestId, workspaceId)) this.isSavingWebhookConfig.set(false);
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
  async clearWebhookCredentials(channel: 'discord' | 'telegram' | 'custom'): Promise<void> {
    const result = await this.webhookService.updateConfig({ clearCredentials: [channel] });
    if (result.error) this.toast.error('Zugangsdaten konnten nicht gelöscht werden.');
    else this.toast.success('Zugangsdaten wurden gelöscht.');
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
  private isCurrentSave(requestId: number, workspaceId: string): boolean {
    return (
      requestId === this.saveRequestId &&
      this.workspaceService.currentWorkspace()?.id === workspaceId
    );
  }
}
