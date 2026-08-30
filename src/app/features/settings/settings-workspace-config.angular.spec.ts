import '@angular/compiler';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormBuilder } from '@angular/forms';
import { TranslateService } from '@ngx-translate/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../core/services/auth.service';
import { EbayApiService } from '../../core/services/ebay-api.service';
import { ExportService } from '../../core/services/export.service';
import { FulfillmentService } from '../../core/services/fulfillment.service';
import { InventoryService } from '../../core/services/inventory.service';
import { PurchaseService } from '../../core/services/purchase.service';
import { PwaService } from '../../core/services/pwa.service';
import { SalesService } from '../../core/services/sales.service';
import { StoreService } from '../../core/services/store.service';
import { SyncStatusService } from '../../core/services/sync-status.service';
import { WebPushService } from '../../core/services/web-push.service';
import { WebhookService } from '../../core/services/webhook.service';
import { WorkspaceMemberService } from '../../core/services/workspace-member.service';
import { WorkspaceService } from '../../core/services/workspace.service';
import { ConfirmDialogService } from '../../shared/components/confirm-dialog/confirm-dialog.service';
import { ToastService } from '../../shared/components/toast/toast.service';
import { SettingsComponent } from './settings.component';
afterEach(() => TestBed.resetTestingModule());

describe('SettingsComponent – Workspace-Konfiguration', () => {
  it('leert A-Geheimnisse sofort und patcht erst die geladene B-Konfiguration', () => {
    const currentWorkspace = signal({
      id: 'workspace-a',
      name: 'A',
      currency: 'EUR',
      tax_mode: 'diff_25a',
      min_roi_percent: 20,
      min_profit_amount: 10,
      created_at: '2026-08-25T10:00:00Z',
    });
    const storeSettings = signal({
      payments: {
        stripeEnabled: true,
        stripePublishableKey: 'pk_a',
        paypalEnabled: false,
        paypalEmail: '',
        bankTransferEnabled: false,
        bankIban: '',
        bankBic: '',
        bankAccountHolder: '',
        cashOnPickupEnabled: false,
      },
    });
    const carrierConfig = signal({
      dhlEnabled: true,
      dhlEkp: 'a-ekp',
      dhlApiKey: 'dhl-a-secret',
      hermesEnabled: false,
      hermesClientId: '',
      hermesApiKey: '',
    });
    const webhookConfig = signal({
      discordEnabled: false,
      discordWebhookUrl: '',
      telegramEnabled: true,
      telegramBotToken: 'telegram-a-secret',
      telegramChatId: 'a-chat',
      customWebhookEnabled: false,
      customWebhookUrl: '',
      notifyOnSale: true,
      notifyOnPurchase: true,
      notifyOnLowMargin: true,
      soundEnabled: true,
    });
    const storeLoaded = signal<string | null>('workspace-a');
    const carrierLoaded = signal<string | null>('workspace-a');
    const webhookLoaded = signal<string | null>('workspace-a');

    TestBed.configureTestingModule({
      providers: [
        FormBuilder,
        ToastService,
        SyncStatusService,
        { provide: ConfirmDialogService, useValue: { frage: vi.fn() } },
        { provide: WorkspaceService, useValue: { currentWorkspace } },
        { provide: AuthService, useValue: { profile: signal(null) } },
        { provide: ExportService, useValue: {} },
        { provide: SalesService, useValue: {} },
        { provide: PurchaseService, useValue: {} },
        { provide: InventoryService, useValue: {} },
        {
          provide: EbayApiService,
          useValue: { getConfig: () => ({ appId: '', siteId: 'EBAY-DE' }) },
        },
        { provide: WorkspaceMemberService, useValue: {} },
        {
          provide: WebhookService,
          useValue: { config: webhookConfig, loadedWorkspaceId: webhookLoaded },
        },
        { provide: PwaService, useValue: {} },
        {
          provide: StoreService,
          useValue: { storeSettings, loadedWorkspaceId: storeLoaded },
        },
        {
          provide: FulfillmentService,
          useValue: { carrierConfig, loadedWorkspaceId: carrierLoaded },
        },
        { provide: WebPushService, useValue: {} },
        { provide: TranslateService, useValue: {} },
      ],
    });
    const component = TestBed.runInInjectionContext(() => new SettingsComponent());
    TestBed.flushEffects();
    expect(component.paymentForm.controls.stripePublishableKey.value).toBe('pk_a');

    currentWorkspace.set({ ...currentWorkspace(), id: 'workspace-b', name: 'B' });
    storeLoaded.set(null);
    carrierLoaded.set(null);
    webhookLoaded.set(null);
    TestBed.flushEffects();

    expect(component.paymentForm.controls.stripePublishableKey.value).toBe('');
    expect(component.carrierForm.controls.dhlApiKey.value).toBe('');
    expect(component.webhookForm.controls.telegramBotToken.value).toBe('');
    expect(component.isLoadingWorkspaceConfig()).toBe(true);

    storeSettings.set({
      payments: {
        ...storeSettings().payments,
        stripePublishableKey: 'pk_b',
      },
    });
    carrierConfig.set({ ...carrierConfig(), dhlApiKey: 'dhl-b-secret' });
    webhookConfig.set({ ...webhookConfig(), telegramBotToken: 'telegram-b-secret' });
    storeLoaded.set('workspace-b');
    carrierLoaded.set('workspace-b');
    webhookLoaded.set('workspace-b');
    TestBed.flushEffects();

    expect(component.paymentForm.controls.stripePublishableKey.value).toBe('pk_b');
    expect(component.carrierForm.controls.dhlApiKey.value).toBe('dhl-b-secret');
    expect(component.webhookForm.controls.telegramBotToken.value).toBe('telegram-b-secret');
    expect(component.isLoadingWorkspaceConfig()).toBe(false);
  });
});
