import '@angular/compiler';
import { signal } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceRole } from '../../core/models/flipbase.models';
import { ToastService } from '../../shared/components/toast/toast.service';
import { SettingsComponent } from './settings.component';
import { SyncStatusService } from '../../core/services/sync-status.service';

interface SettingsErgebnisse {
  readonly profilError?: Error | null;
  readonly profilReportedBySyncStatus?: boolean;
  readonly settingsError?: Error | null;
  readonly workspaceError?: Error | null;
  readonly deleteSuccess?: boolean;
  readonly deleteReportedBySyncStatus?: boolean;
  readonly inviteError?: Error | null;
  readonly roleError?: Error | null;
  readonly removeError?: Error | null;
  readonly cancelError?: Error | null;
  readonly pushPermission?: boolean;
  readonly pushTest?: boolean;
  readonly webhookTest?: { success: boolean; message: string };
  readonly paymentError?: Error | null;
  readonly carrierError?: Error | null;
  readonly webhookConfigError?: Error | null;
  readonly configReportedBySyncStatus?: boolean;
}

function erstelleKomponente(ergebnisse: SettingsErgebnisse = {}) {
  const toast = new ToastService();
  const newWorkspaceName = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required],
  });
  newWorkspaceName.setValue('Zweiter Workspace');
  const workspaceService = {
    currentWorkspace: signal({
      id: 'workspace-1',
      name: 'Flipbase',
      currency: 'EUR',
      tax_mode: 'diff_25a',
      min_roi_percent: 20,
      min_profit_amount: 10,
      created_at: '2026-08-24T10:00:00.000Z',
    }),
    updateWorkspaceSettings: vi.fn(async () => ({ error: ergebnisse.settingsError ?? null })),
    createWorkspace: vi.fn(async () => ({
      data: ergebnisse.workspaceError ? null : workspaceService.currentWorkspace(),
      error: ergebnisse.workspaceError ?? null,
    })),
    deleteWorkspace: vi.fn(async () => ({
      success: ergebnisse.deleteSuccess ?? true,
      reportedBySyncStatus: ergebnisse.deleteReportedBySyncStatus ?? false,
    })),
    switchWorkspace: vi.fn(),
  };
  const auth = {
    aktualisiereProfil: vi.fn(async () => ({
      error: ergebnisse.profilError ?? null,
      reportedBySyncStatus: ergebnisse.profilReportedBySyncStatus ?? false,
    })),
  };
  const memberService = {
    inviteMember: vi.fn(async () => ({ error: ergebnisse.inviteError ?? null })),
    updateMemberRole: vi.fn(async () => ({ error: ergebnisse.roleError ?? null })),
    removeMember: vi.fn(async () => ({ error: ergebnisse.removeError ?? null })),
    cancelInvite: vi.fn(async () => ({ error: ergebnisse.cancelError ?? null })),
  };
  const webPushService = {
    requestPermission: vi.fn(async () => ergebnisse.pushPermission ?? true),
    sendTestNotification: vi.fn(async () => ergebnisse.pushTest ?? true),
    updateSettings: vi.fn(),
  };
  const webhookService = {
    config: signal({
      discordEnabled: false,
      discordWebhookUrl: '',
      telegramEnabled: false,
      telegramBotToken: '',
      telegramChatId: '',
      customWebhookEnabled: false,
      customWebhookUrl: '',
      notifyOnSale: true,
      notifyOnPurchase: true,
      notifyOnLowMargin: true,
      soundEnabled: true,
    }),
    loadedWorkspaceId: signal<string | null>('workspace-1'),
    updateConfig: vi.fn(async () => ({
      data: ergebnisse.webhookConfigError ? null : {},
      error: ergebnisse.webhookConfigError ?? null,
      reportedBySyncStatus: ergebnisse.configReportedBySyncStatus ?? false,
    })),
    sendTestNotification: vi.fn(
      async () =>
        ergebnisse.webhookTest ?? {
          success: true,
          message: 'Der Webhook-Dienst hat die Testnachricht angenommen.',
        },
    ),
  };
  const exportService = {
    generatePurchasesCsv: vi.fn(() => 'purchases-csv'),
    generateInventoryCsv: vi.fn(() => 'inventory-csv'),
    generateSalesCsv: vi.fn(() => 'sales-csv'),
    downloadFile: vi.fn(),
  };
  const storeService = {
    storeSettings: signal({ payments: { stripePublishableKey: '' } }),
    loadedWorkspaceId: signal<string | null>('workspace-1'),
    updatePaymentsConfig: vi.fn(async () => ({
      data: ergebnisse.paymentError ? null : {},
      error: ergebnisse.paymentError ?? null,
      reportedBySyncStatus: ergebnisse.configReportedBySyncStatus ?? false,
    })),
  };
  const fulfillmentService = {
    carrierConfig: signal({ dhlApiKey: '', hermesApiKey: '' }),
    loadedWorkspaceId: signal<string | null>('workspace-1'),
    updateCarrierConfig: vi.fn(async () => ({
      data: ergebnisse.carrierError ? null : {},
      error: ergebnisse.carrierError ?? null,
      reportedBySyncStatus: ergebnisse.configReportedBySyncStatus ?? false,
    })),
  };
  const komponente = Object.create(SettingsComponent.prototype) as SettingsComponent;

  Object.assign(komponente, {
    dialog: { frage: vi.fn(async () => true) },
    toast,
    syncStatus: new SyncStatusService(),
    workspaceService,
    auth,
    memberService,
    webPushService,
    webhookService,
    exportService,
    purchaseService: { purchases: signal([]) },
    inventoryService: { items: signal([]) },
    salesService: { sales: signal([]) },
    storeService,
    fulfillmentService,
    ebayApiService: { saveConfig: vi.fn() },
    isSaving: signal(false),
    istProfilSpeichern: signal(false),
    isCreatingWs: signal(false),
    isTestingPush: signal(false),
    isTestingWebhook: signal(false),
    isSavingPaymentConfig: signal(false),
    isSavingCarrierConfig: signal(false),
    isSavingWebhookConfig: signal(false),
    isLoadingWorkspaceConfig: signal(false),
    isSendingInvite: signal(false),
    isInviteModalOpen: signal(true),
    inviteError: signal<string | null>(null),
    profilForm: new FormGroup({
      fullName: new FormControl('Ada Lovelace', {
        nonNullable: true,
        validators: [Validators.required, Validators.minLength(2)],
      }),
    }),
    settingsForm: new FormGroup({
      workspaceName: new FormControl('Flipbase', {
        nonNullable: true,
        validators: [Validators.required],
      }),
      currency: new FormControl('EUR', { nonNullable: true }),
      taxMode: new FormControl('diff_25a', { nonNullable: true }),
      minRoiPercent: new FormControl(20, { nonNullable: true }),
      minProfitAmount: new FormControl(10, { nonNullable: true }),
    }),
    newWorkspaceName,
    inviteForm: new FormGroup({
      email: new FormControl('team@flipbase.de', {
        nonNullable: true,
        validators: [Validators.required, Validators.email],
      }),
      role: new FormControl<WorkspaceRole>('member', {
        nonNullable: true,
        validators: [Validators.required],
      }),
    }),
    paymentForm: new FormGroup({
      stripeEnabled: new FormControl(true),
      stripePublishableKey: new FormControl(''),
      paypalEnabled: new FormControl(true),
      paypalEmail: new FormControl(''),
      bankTransferEnabled: new FormControl(true),
      bankIban: new FormControl(''),
      bankBic: new FormControl(''),
      bankAccountHolder: new FormControl(''),
      cashOnPickupEnabled: new FormControl(true),
    }),
    carrierForm: new FormGroup({
      dhlEnabled: new FormControl(true),
      dhlEkp: new FormControl(''),
      dhlApiKey: new FormControl(''),
      hermesEnabled: new FormControl(true),
      hermesClientId: new FormControl(''),
      hermesApiKey: new FormControl(''),
    }),
    ebayForm: new FormGroup({
      appId: new FormControl(''),
      globalId: new FormControl('EBAY-DE'),
    }),
    webhookForm: new FormGroup({
      discordEnabled: new FormControl(false),
      discordWebhookUrl: new FormControl(''),
      telegramEnabled: new FormControl(false),
      telegramBotToken: new FormControl(''),
      telegramChatId: new FormControl(''),
      customWebhookEnabled: new FormControl(false),
      customWebhookUrl: new FormControl(''),
      notifyOnSale: new FormControl(true),
      notifyOnPurchase: new FormControl(true),
      soundEnabled: new FormControl(true),
    }),
  });

  return {
    komponente,
    toast,
    workspaceService,
    memberService,
    webhookService,
    storeService,
    fulfillmentService,
  };
}

function erwarteEinzelnenToast(toast: ToastService, type: 'success' | 'error', title: string) {
  expect(toast.toasts()).toHaveLength(1);
  expect(toast.toasts()[0]).toMatchObject({ type, title });
}

describe('SettingsComponent – zentrale Aktionsmeldungen', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('bestätigt gespeicherte Profil- und Workspace-Einstellungen', async () => {
    const profil = erstelleKomponente();
    await profil.komponente.onSaveProfil();
    erwarteEinzelnenToast(profil.toast, 'success', 'Profil wurde gespeichert.');

    const einstellungen = erstelleKomponente();
    await einstellungen.komponente.onSaveSettings();
    erwarteEinzelnenToast(einstellungen.toast, 'success', 'Einstellungen wurden gespeichert.');
  });

  it('meldet ungültige, nicht abgesendete Formulare nicht', async () => {
    const { komponente, toast } = erstelleKomponente();
    komponente.profilForm.controls.fullName.setValue('');
    komponente.settingsForm.controls.workspaceName.setValue('');
    komponente.newWorkspaceName.setValue('');

    await komponente.onSaveProfil();
    await komponente.onSaveSettings();
    await komponente.onCreateWorkspace();

    expect(toast.toasts()).toEqual([]);
  });

  it('erzeugt bei SyncStatus-gestützten Profil- und Einstellungsfehlern keinen zweiten Toast', async () => {
    const profil = erstelleKomponente({
      profilError: new Error('Sync-Fehler'),
      profilReportedBySyncStatus: true,
    });
    await profil.komponente.onSaveProfil();
    expect(profil.toast.toasts()).toEqual([]);

    const einstellungen = erstelleKomponente({ settingsError: new Error('Sync-Fehler') });
    await einstellungen.komponente.onSaveSettings();
    expect(einstellungen.toast.toasts()).toEqual([]);
  });

  it('meldet einen nicht zentral erfassten Profilfehler persistent', async () => {
    const { komponente, toast } = erstelleKomponente({
      profilError: new Error('Nicht angemeldet'),
      profilReportedBySyncStatus: false,
    });

    await komponente.onSaveProfil();

    erwarteEinzelnenToast(toast, 'error', 'Profil konnte nicht gespeichert werden.');
    expect(toast.toasts()[0]).toMatchObject({
      description: 'Nicht angemeldet',
      persistent: true,
    });
  });

  it('setzt das Workspace-Formular erst nach erfolgreichem Erstellen zurück', async () => {
    const fehler = erstelleKomponente({ workspaceError: new Error('Sync-Fehler') });
    await fehler.komponente.onCreateWorkspace();

    expect(fehler.komponente.newWorkspaceName.value).toBe('Zweiter Workspace');
    expect(fehler.komponente.isCreatingWs()).toBe(false);
    expect(fehler.toast.toasts()).toEqual([]);

    const erfolg = erstelleKomponente();
    await erfolg.komponente.onCreateWorkspace();

    expect(erfolg.komponente.newWorkspaceName.value).toBe('');
    erwarteEinzelnenToast(erfolg.toast, 'success', 'Workspace wurde erstellt.');
  });

  it('bestätigt das Löschen eines Workspace erst nach bestätigtem Service-Erfolg', async () => {
    const erfolg = erstelleKomponente({ deleteSuccess: true });
    await erfolg.komponente.onDeleteWorkspace('workspace-2');
    erwarteEinzelnenToast(erfolg.toast, 'success', 'Workspace wurde gelöscht.');

    const fehler = erstelleKomponente({ deleteSuccess: false });
    await fehler.komponente.onDeleteWorkspace('workspace-2');
    erwarteEinzelnenToast(fehler.toast, 'error', 'Workspace konnte nicht gelöscht werden.');
    expect(fehler.toast.toasts()[0].persistent).toBe(true);
  });

  it('erzeugt bei einem zentral gemeldeten Workspace-Löschfehler keinen zweiten Toast', async () => {
    const { komponente, toast } = erstelleKomponente({
      deleteSuccess: false,
      deleteReportedBySyncStatus: true,
    });

    await komponente.onDeleteWorkspace('workspace-2');

    expect(toast.toasts()).toEqual([]);
  });

  it.each([
    ['eBay-Verbindung wurde gespeichert.', (c: SettingsComponent) => c.onSaveEbayConfig()],
    [
      'Benachrichtigungseinstellung wurde gespeichert.',
      (c: SettingsComponent) => c.onTogglePushSetting('enabled', true),
    ],
    ['Einkäufe wurden exportiert.', (c: SettingsComponent) => c.exportPurchasesCsv()],
    ['Inventar wurde exportiert.', (c: SettingsComponent) => c.exportInventoryCsv()],
    ['Verkäufe wurden exportiert.', (c: SettingsComponent) => c.exportSalesCsv()],
  ])('bestätigt die synchrone Aktion mit „%s“', (title, aktion) => {
    const { komponente, toast } = erstelleKomponente();

    aktion(komponente);

    erwarteEinzelnenToast(toast, 'success', title);
  });

  it.each([
    ['Zahlungsmethoden wurden gespeichert.', (c: SettingsComponent) => c.onSavePaymentConfig()],
    ['Versanddienstleister wurden gespeichert.', (c: SettingsComponent) => c.onSaveCarrierConfig()],
    ['Webhook-Konfiguration wurde gespeichert.', (c: SettingsComponent) => c.onSaveWebhookConfig()],
  ])(
    'bestätigt die persistente Konfiguration erst nach Service-Erfolg mit „%s“',
    async (title, aktion) => {
      const { komponente, toast } = erstelleKomponente();
      await aktion(komponente);
      erwarteEinzelnenToast(toast, 'success', title);
    },
  );

  it('meldet lokale Konfigurationsfehler persistent und zentral gemeldete nicht doppelt', async () => {
    const lokal = erstelleKomponente({ paymentError: new Error('offline') });
    await lokal.komponente.onSavePaymentConfig();
    erwarteEinzelnenToast(
      lokal.toast,
      'error',
      'Zahlungsmethoden konnten nicht gespeichert werden.',
    );
    expect(lokal.toast.toasts()[0].persistent).toBe(true);

    const zentral = erstelleKomponente({
      carrierError: new Error('offline'),
      configReportedBySyncStatus: true,
    });
    await zentral.komponente.onSaveCarrierConfig();
    expect(zentral.toast.toasts()).toEqual([]);
  });

  it('setzt Ladezustände auch bei geworfenen Konfigurationsfehlern zurück', async () => {
    const { komponente, toast } = erstelleKomponente();
    vi.mocked(komponente.storeService.updatePaymentsConfig).mockRejectedValue(new Error('offline'));

    await komponente.onSavePaymentConfig();

    expect(komponente.isSavingPaymentConfig()).toBe(false);
    expect(toast.toasts()[0]).toMatchObject({ type: 'error', persistent: true });
  });

  it('blockiert A-Konfiguration während des Workspace-Wechsels und speichert danach nur B-Werte', async () => {
    const { komponente, workspaceService, storeService } = erstelleKomponente();
    komponente.paymentForm.patchValue({ stripePublishableKey: 'pk_workspace_a' });
    workspaceService.currentWorkspace.set({
      ...workspaceService.currentWorkspace(),
      id: 'workspace-2',
      name: 'Workspace B',
    });
    storeService.loadedWorkspaceId.set(null);
    komponente.isLoadingWorkspaceConfig.set(true);

    await komponente.onSavePaymentConfig();

    expect(storeService.updatePaymentsConfig).not.toHaveBeenCalled();

    komponente.paymentForm.patchValue({ stripePublishableKey: 'pk_workspace_b' });
    storeService.loadedWorkspaceId.set('workspace-2');
    komponente.isLoadingWorkspaceConfig.set(false);
    await komponente.onSavePaymentConfig();

    expect(storeService.updatePaymentsConfig).toHaveBeenCalledOnce();
    expect(storeService.updatePaymentsConfig).toHaveBeenCalledWith(
      expect.objectContaining({ stripePublishableKey: 'pk_workspace_b' }),
    );
  });

  it('meldet das Ergebnis der Browser-Berechtigung als Erfolg oder angepinnten Fehler', async () => {
    const erfolg = erstelleKomponente({ pushPermission: true });
    await erfolg.komponente.onRequestPushPermission();
    erwarteEinzelnenToast(erfolg.toast, 'success', 'Browser-Benachrichtigungen wurden aktiviert.');

    const fehler = erstelleKomponente({ pushPermission: false });
    await fehler.komponente.onRequestPushPermission();
    erwarteEinzelnenToast(
      fehler.toast,
      'error',
      'Browser-Benachrichtigungen konnten nicht aktiviert werden.',
    );
    expect(fehler.toast.toasts()[0]).toMatchObject({
      description: 'Berechtigung wurde im Browser verweigert oder blockiert.',
      persistent: true,
    });
  });

  it('meldet das Ergebnis einer Test-Benachrichtigung als Erfolg oder angepinnten Fehler', async () => {
    const erfolg = erstelleKomponente({ pushTest: true });
    await erfolg.komponente.onTestWebPush();
    erwarteEinzelnenToast(erfolg.toast, 'success', 'Test-Benachrichtigung wurde versendet.');

    const fehler = erstelleKomponente({ pushTest: false });
    await fehler.komponente.onTestWebPush();
    erwarteEinzelnenToast(
      fehler.toast,
      'error',
      'Test-Benachrichtigung konnte nicht versendet werden.',
    );
    expect(fehler.toast.toasts()[0]).toMatchObject({
      description: 'Push konnte nicht angezeigt werden. Bitte Berechtigung im Browser prüfen.',
      persistent: true,
    });
  });

  it('meldet für einen Webhook-Test genau dessen Ergebnis', async () => {
    const erfolg = erstelleKomponente({
      webhookTest: { success: true, message: 'Webhook erfolgreich erreicht.' },
    });
    await erfolg.komponente.testWebhook('discord');
    erwarteEinzelnenToast(erfolg.toast, 'success', 'Test-Webhook wurde versendet.');

    const fehler = erstelleKomponente({
      webhookTest: { success: false, message: 'Webhook ist nicht erreichbar.' },
    });
    await fehler.komponente.testWebhook('discord');
    erwarteEinzelnenToast(fehler.toast, 'error', 'Test-Webhook konnte nicht versendet werden.');
    expect(fehler.toast.toasts()[0]).toMatchObject({
      description: 'Webhook ist nicht erreichbar.',
      persistent: true,
    });
  });

  it('schließt die Einladung erst nach bestätigtem Erfolg', async () => {
    const fehler = erstelleKomponente({ inviteError: new Error('Einladung nicht möglich') });
    await fehler.komponente.onSendInvite();

    expect(fehler.komponente.isInviteModalOpen()).toBe(true);
    expect(fehler.toast.toasts()).toEqual([]);

    const erfolg = erstelleKomponente();
    await erfolg.komponente.onSendInvite();

    expect(erfolg.komponente.isInviteModalOpen()).toBe(false);
    erwarteEinzelnenToast(erfolg.toast, 'success', 'Einladung wurde versendet.');
  });

  it.each([
    ['Rolle wurde geändert.', (c: SettingsComponent) => c.onUpdateRole('member-1', 'admin')],
    ['Mitglied wurde entfernt.', (c: SettingsComponent) => c.onRemoveMember('member-1')],
    ['Einladung wurde zurückgezogen.', (c: SettingsComponent) => c.onCancelInvite('invite-1')],
  ])('bestätigt die Mitgliederaktion mit „%s“', async (title, aktion) => {
    const { komponente, toast } = erstelleKomponente();

    await aktion(komponente);

    erwarteEinzelnenToast(toast, 'success', title);
  });

  it('bestätigt fehlgeschlagene Mitgliederaktionen nicht zusätzlich zum Sync-Fehler', async () => {
    const rolle = erstelleKomponente({ roleError: new Error('Sync-Fehler') });
    await rolle.komponente.onUpdateRole('member-1', 'admin');
    expect(rolle.toast.toasts()).toEqual([]);

    const entfernen = erstelleKomponente({ removeError: new Error('Sync-Fehler') });
    await entfernen.komponente.onRemoveMember('member-1');
    expect(entfernen.toast.toasts()).toEqual([]);

    const einladung = erstelleKomponente({ cancelError: new Error('Sync-Fehler') });
    await einladung.komponente.onCancelInvite('invite-1');
    expect(einladung.toast.toasts()).toEqual([]);
  });
});
