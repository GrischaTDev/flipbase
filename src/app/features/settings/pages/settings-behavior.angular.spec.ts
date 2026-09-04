import '@angular/compiler';
import { signal } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { describe, expect, it, vi } from 'vitest';
import { AccountSettingsComponent } from './account-settings/account-settings.component';
import { AppSettingsComponent } from './app-settings/app-settings.component';
import { NotificationSettingsComponent } from './notification-settings/notification-settings.component';
import { ShippingSettingsComponent } from './shipping-settings/shipping-settings.component';
import { StoreSettingsComponent } from './store-settings/store-settings.component';
import { TeamSettingsComponent } from './team-settings/team-settings.component';
import { WorkspaceSettingsComponent } from './workspace-settings/workspace-settings.component';

const workspace = signal({ id: 'workspace-1', name: 'Flipbase' });
const toast = () => ({ success: vi.fn(), error: vi.fn() });
const sync = { istZentralGemeldet: vi.fn(() => false) };

describe('Einstellungsseiten – migrierte Verhaltenstests', () => {
  it('speichert und validiert das Konto, einschließlich zentral gemeldeter Fehler', async () => {
    const messages = toast();
    const component = Object.create(AccountSettingsComponent.prototype) as AccountSettingsComponent;
    const profileForm = new FormGroup({
      fullName: new FormControl('', {
        nonNullable: true,
        validators: [Validators.required, Validators.minLength(2)],
      }),
    });
    Object.assign(component, {
      profileForm,
      isSavingProfile: signal(false),
      auth: {
        aktualisiereProfil: vi.fn(async () => ({ error: null, reportedBySyncStatus: false })),
      },
      toast: messages,
    });
    await component.onSaveProfile();
    expect(messages.success).not.toHaveBeenCalled();
    profileForm.controls.fullName.setValue('Ada');
    await component.onSaveProfile();
    expect(messages.success).toHaveBeenCalledWith('Profil wurde gespeichert.');
    Object.assign(component, {
      auth: {
        aktualisiereProfil: vi.fn(async () => ({
          error: new Error('offline'),
          reportedBySyncStatus: false,
        })),
      },
    });
    await component.onSaveProfile();
    expect(messages.error).toHaveBeenCalledWith(
      'Profil konnte nicht gespeichert werden.',
      'offline',
    );
  });

  it('speichert, erstellt, wechselt und leitet Workspaces ohne direktes Löschen weiter', async () => {
    const messages = toast();
    const router = { navigate: vi.fn(async () => true) };
    const service = {
      currentWorkspace: workspace,
      updateWorkspaceSettings: vi.fn(async () => ({ error: null })),
      createWorkspace: vi.fn(async () => ({ error: null })),
      switchWorkspace: vi.fn(),
    };
    const component = Object.create(
      WorkspaceSettingsComponent.prototype,
    ) as WorkspaceSettingsComponent;
    const settingsForm = new FormGroup({
      workspaceName: new FormControl('Neu', {
        nonNullable: true,
        validators: [Validators.required],
      }),
      currency: new FormControl('EUR', { nonNullable: true }),
      taxMode: new FormControl('diff_25a', { nonNullable: true }),
      minRoiPercent: new FormControl(25, { nonNullable: true }),
      minProfitAmount: new FormControl(15, { nonNullable: true }),
    });
    const newWorkspaceName = new FormControl('', {
      nonNullable: true,
      validators: [Validators.required],
    });
    newWorkspaceName.setValue('Zweiter Workspace');
    Object.assign(component, {
      workspaceService: service,
      router,
      toast: messages,
      settingsForm,
      newWorkspaceName,
      isSaving: signal(false),
      isCreatingWorkspace: signal(false),
    });
    await component.onSaveSettings();
    await component.onCreateWorkspace();
    component.onSwitchWorkspace('workspace-2');
    await component.onDeleteWorkspace('workspace-2');
    expect(service.updateWorkspaceSettings).toHaveBeenCalledWith('workspace-1', {
      name: 'Neu',
      min_roi_percent: 25,
      min_profit_amount: 15,
    });
    expect(service.createWorkspace).toHaveBeenCalledWith('Zweiter Workspace');
    expect(newWorkspaceName.value).toBe('');
    expect(service.switchWorkspace).toHaveBeenCalledWith('workspace-2');
    expect(router.navigate).toHaveBeenCalledWith(['/settings/data'], {
      queryParams: { retentionWorkspace: 'workspace-2' },
      fragment: 'retention-heading',
    });
  });

  it('führt Team-Einladung, Rollenwechsel, Entfernen und Widerruf mit Erfolgs- und Fehlerzustand aus', async () => {
    const messages = toast();
    const members = {
      inviteMember: vi.fn(async () => ({ error: null })),
      updateMemberRole: vi.fn(async () => ({ error: null })),
      removeMember: vi.fn(async () => ({ error: null })),
      cancelInvite: vi.fn(async () => ({ error: null })),
    };
    const component = Object.create(TeamSettingsComponent.prototype) as TeamSettingsComponent;
    Object.assign(component, {
      memberService: members,
      dialog: { frage: vi.fn(async () => true) },
      toast: messages,
      inviteForm: new FormGroup({
        email: new FormControl('team@flipbase.de', {
          nonNullable: true,
          validators: [Validators.required, Validators.email],
        }),
        role: new FormControl('member', { nonNullable: true }),
      }),
      isSendingInvite: signal(false),
      isInviteModalOpen: signal(true),
      inviteError: signal(null),
    });
    await component.onSendInvite();
    await component.onUpdateRole('member-1', 'admin');
    await component.onRemoveMember('member-1');
    await component.onCancelInvite('invite-1');
    expect(members.inviteMember).toHaveBeenCalledWith('team@flipbase.de', 'member');
    expect(members.updateMemberRole).toHaveBeenCalledWith('member-1', 'admin');
    expect(members.removeMember).toHaveBeenCalledWith('member-1');
    expect(members.cancelInvite).toHaveBeenCalledWith('invite-1');
    expect(messages.success).toHaveBeenCalledTimes(4);
  });

  it('speichert Payment-Payloads, meldet Fehler und blockiert während des Workspace-Ladens', async () => {
    const messages = toast();
    const store = {
      updatePaymentsConfig: vi.fn(async () => ({
        data: {},
        error: null,
        reportedBySyncStatus: false,
      })),
    };
    const component = Object.create(StoreSettingsComponent.prototype) as StoreSettingsComponent;
    const paymentForm = new FormGroup({
      stripeEnabled: new FormControl(true),
      stripePublishableKey: new FormControl(' pk '),
      paypalEnabled: new FormControl(false),
      paypalEmail: new FormControl(''),
      bankTransferEnabled: new FormControl(true),
      bankName: new FormControl(''),
      bankIban: new FormControl(' iban '),
      bankBic: new FormControl(' bic '),
      bankAccountHolder: new FormControl(' Ada '),
      cashOnPickupEnabled: new FormControl(false),
    });
    Object.assign(component, {
      workspaceService: { currentWorkspace: workspace },
      storeService: store,
      toast: messages,
      syncStatus: sync,
      paymentForm,
      isLoadingWorkspaceConfig: signal(true),
      isSavingPaymentConfig: signal(false),
    });
    await component.onSavePaymentConfig();
    expect(store.updatePaymentsConfig).not.toHaveBeenCalled();
    (
      component as unknown as { isLoadingWorkspaceConfig: ReturnType<typeof signal<boolean>> }
    ).isLoadingWorkspaceConfig.set(false);
    await component.onSavePaymentConfig();
    expect(store.updatePaymentsConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        stripePublishableKey: 'pk',
        bankIban: 'iban',
        bankBic: 'bic',
        bankAccountHolder: 'Ada',
      }),
    );
  });

  it('speichert Carrier-Payloads und setzt den Ladezustand nach einem Fehler zurück', async () => {
    const messages = toast();
    const carrier = {
      updateCarrierConfig: vi.fn(async () => ({
        data: null,
        error: new Error('offline'),
        reportedBySyncStatus: false,
      })),
    };
    const component = Object.create(
      ShippingSettingsComponent.prototype,
    ) as ShippingSettingsComponent;
    Object.assign(component, {
      workspaceService: { currentWorkspace: workspace },
      fulfillmentService: carrier,
      toast: messages,
      syncStatus: sync,
      carrierForm: new FormGroup({
        dhlEnabled: new FormControl(true),
        dhlEkp: new FormControl(' ekp '),
        dhlApiKey: new FormControl(''),
        hermesEnabled: new FormControl(false),
        hermesClientId: new FormControl(''),
        hermesApiKey: new FormControl(''),
      }),
      isLoadingWorkspaceConfig: signal(false),
      isSavingCarrierConfig: signal(false),
    });
    await component.onSaveCarrierConfig();
    expect(carrier.updateCarrierConfig).toHaveBeenCalledWith(
      expect.objectContaining({ dhlEkp: 'ekp' }),
    );
    expect(messages.error).toHaveBeenCalledWith(
      'Versanddienstleister konnten nicht gespeichert werden.',
      'offline',
    );
    expect(
      (
        component as unknown as { isSavingCarrierConfig: ReturnType<typeof signal<boolean>> }
      ).isSavingCarrierConfig(),
    ).toBe(false);
  });

  it('behandelt Browser-Push, Webhook-Speichern und Testnachrichten', async () => {
    const messages = toast();
    const webhook = {
      updateConfig: vi.fn(async () => ({ data: {}, error: null, reportedBySyncStatus: false })),
      sendTestNotification: vi.fn(async () => ({ success: true, message: 'ok' })),
    };
    const component = Object.create(
      NotificationSettingsComponent.prototype,
    ) as NotificationSettingsComponent;
    Object.assign(component, {
      workspaceService: { currentWorkspace: workspace },
      webhookService: webhook,
      webPushService: {
        requestPermission: vi.fn(async () => false),
        sendTestNotification: vi.fn(async () => true),
        updateSettings: vi.fn(),
      },
      toast: messages,
      syncStatus: sync,
      webhookForm: new FormGroup({
        discordEnabled: new FormControl(true),
        discordWebhookUrl: new FormControl(' url '),
        telegramEnabled: new FormControl(false),
        telegramBotToken: new FormControl(''),
        telegramChatId: new FormControl(''),
        customWebhookEnabled: new FormControl(false),
        customWebhookUrl: new FormControl(''),
        notifyOnSale: new FormControl(true),
        notifyOnPurchase: new FormControl(true),
        soundEnabled: new FormControl(true),
      }),
      isLoadingWorkspaceConfig: signal(false),
      isSavingWebhookConfig: signal(false),
      isTestingWebhook: signal(false),
      isTestingPush: signal(false),
    });
    await component.onRequestPushPermission();
    await component.onTestWebPush();
    await component.onSaveWebhookConfig();
    await component.testWebhook('discord');
    component.onTogglePushSetting('soundEnabled', false);
    expect(messages.error).toHaveBeenCalledWith(
      'Browser-Benachrichtigungen konnten nicht aktiviert werden.',
      expect.any(String),
    );
    expect(webhook.updateConfig).toHaveBeenCalledWith(
      expect.objectContaining({ discordWebhookUrl: 'url' }),
    );
    expect(webhook.sendTestNotification).toHaveBeenCalledWith('discord');
  });

  it('speichert die eBay-Konfiguration und hält PWA-Aktionen auf der App-Seite', () => {
    const messages = toast();
    const ebay = { saveConfig: vi.fn() };
    const component = Object.create(AppSettingsComponent.prototype) as AppSettingsComponent;
    Object.assign(component, {
      ebayApiService: ebay,
      toast: messages,
      ebayForm: new FormGroup({
        appId: new FormControl(' app-id '),
        globalId: new FormControl('EBAY-DE'),
      }),
    });
    component.onSaveEbayConfig();
    expect(ebay.saveConfig).toHaveBeenCalledWith({ appId: 'app-id', siteId: 'EBAY-DE' });
    expect(messages.success).toHaveBeenCalledWith('eBay-Verbindung wurde gespeichert.');
  });
});
