import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  LucideAngularModule,
  Settings,
  Download,
  Save,
  CheckCircle2,
  FileSpreadsheet,
  Database,
  Globe,
  DollarSign,
  Percent,
  Sliders,
  ShieldCheck,
  Link2,
  Plug,
  Users,
  UserPlus,
  Mail,
  Trash2,
  X,
  Bell,
  Send,
  Smartphone,
  Wifi,
  WifiOff,
  CreditCard,
  Truck,
  Package,
  Building,
  Plus,
  Bot,
  Landmark,
  ShoppingCart,
  AlertTriangle,
  Volume2,
  Store,
} from 'lucide-angular';
import { WorkspaceService } from '../../core/services/workspace.service';
import { ExportService } from '../../core/services/export.service';
import { SalesService } from '../../core/services/sales.service';
import { PurchaseService } from '../../core/services/purchase.service';
import { InventoryService } from '../../core/services/inventory.service';
import { EbayApiService } from '../../core/services/ebay-api.service';
import { WorkspaceMemberService } from '../../core/services/workspace-member.service';
import { WebhookService } from '../../core/services/webhook.service';
import { PwaService } from '../../core/services/pwa.service';
import { StoreService } from '../../core/services/store.service';
import { FulfillmentService } from '../../core/services/fulfillment.service';
import { WebPushService } from '../../core/services/web-push.service';
import { WorkspaceRole } from '../../core/models/reflip.models';
import { CustomCheckboxComponent } from '../../shared/components/custom-checkbox/custom-checkbox.component';

@Component({
  selector: 'app-settings',
  imports: [
    ReactiveFormsModule,
    TranslatePipe,
    LucideAngularModule,
    CustomCheckboxComponent,
  ],
  templateUrl: './settings.component.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsComponent {
  readonly workspaceService = inject(WorkspaceService);
  readonly exportService = inject(ExportService);
  readonly salesService = inject(SalesService);
  readonly purchaseService = inject(PurchaseService);
  readonly inventoryService = inject(InventoryService);
  readonly ebayApiService = inject(EbayApiService);
  readonly memberService = inject(WorkspaceMemberService);
  readonly webhookService = inject(WebhookService);
  readonly pwaService = inject(PwaService);
  readonly storeService = inject(StoreService);
  readonly fulfillmentService = inject(FulfillmentService);
  readonly webPushService = inject(WebPushService);
  readonly translate = inject(TranslateService);

  readonly settingsIcon = Settings;
  readonly cardIcon = CreditCard;
  readonly truckIcon = Truck;
  readonly packageIcon = Package;
  readonly buildingIcon = Building;
  readonly plusIcon = Plus;
  readonly downloadIcon = Download;
  readonly saveIcon = Save;
  readonly checkIcon = CheckCircle2;
  readonly csvIcon = FileSpreadsheet;
  readonly dbIcon = Database;
  readonly globeIcon = Globe;
  readonly dollarIcon = DollarSign;
  readonly percentIcon = Percent;
  readonly slidersIcon = Sliders;
  readonly shieldIcon = ShieldCheck;
  readonly linkIcon = Link2;
  readonly plugIcon = Plug;
  readonly usersIcon = Users;
  readonly userPlusIcon = UserPlus;
  readonly mailIcon = Mail;
  readonly trashIcon = Trash2;
  readonly closeIcon = X;
  readonly bellIcon = Bell;
  readonly sendIcon = Send;
  readonly smartphoneIcon = Smartphone;
  readonly wifiIcon = Wifi;
  readonly wifiOffIcon = WifiOff;
  readonly botIcon = Bot;
  readonly landmarkIcon = Landmark;
  readonly shoppingCartIcon = ShoppingCart;
  readonly alertTriangleIcon = AlertTriangle;
  readonly volumeIcon = Volume2;
  readonly storeIcon = Store;

  readonly isSaving = signal<boolean>(false);
  readonly saveSuccess = signal<boolean>(false);
  readonly ebaySaveSuccess = signal<boolean>(false);
  readonly webhookSaveSuccess = signal<boolean>(false);

  readonly isTestingWebhook = signal<boolean>(false);
  readonly webhookStatusMessage = signal<{ success: boolean; text: string } | null>(null);

  // Invite modal state
  readonly isInviteModalOpen = signal<boolean>(false);
  readonly isSendingInvite = signal<boolean>(false);
  readonly inviteError = signal<string | null>(null);

  readonly settingsForm = new FormGroup({
    workspaceName: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    currency: new FormControl('EUR', { nonNullable: true }),
    taxMode: new FormControl('diff_25a', { nonNullable: true }),
    minRoiPercent: new FormControl<number>(20, { nonNullable: true, validators: [Validators.min(0)] }),
    minProfitAmount: new FormControl<number>(10, { nonNullable: true, validators: [Validators.min(0)] }),
  });

  readonly ebayForm = new FormGroup({
    appId: new FormControl(''),
    globalId: new FormControl('EBAY-DE'),
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

  readonly paymentSaveSuccess = signal<boolean>(false);
  readonly carrierSaveSuccess = signal<boolean>(false);

  readonly paymentForm = new FormGroup({
    stripeEnabled: new FormControl(true),
    stripePublishableKey: new FormControl(''),
    paypalEnabled: new FormControl(true),
    paypalEmail: new FormControl(''),
    bankTransferEnabled: new FormControl(true),
    bankName: new FormControl(''),
    bankIban: new FormControl(''),
    bankBic: new FormControl(''),
    bankAccountHolder: new FormControl(''),
    cashOnPickupEnabled: new FormControl(true),
  });

  readonly carrierForm = new FormGroup({
    dhlEnabled: new FormControl(true),
    dhlEkp: new FormControl(''),
    dhlApiKey: new FormControl(''),
    hermesEnabled: new FormControl(true),
    hermesClientId: new FormControl(''),
    hermesApiKey: new FormControl(''),
  });

  readonly inviteForm = new FormGroup({
    email: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.email] }),
    role: new FormControl<WorkspaceRole>('member', { nonNullable: true, validators: [Validators.required] }),
  });

  readonly newWorkspaceName = new FormControl('', { nonNullable: true, validators: [Validators.required] });
  readonly isCreatingWs = signal<boolean>(false);

  constructor() {
    effect(() => {
      const ws = this.workspaceService.currentWorkspace();
      if (ws) {
        this.settingsForm.patchValue({
          workspaceName: ws.name,
          currency: ws.currency || 'EUR',
          taxMode: ws.tax_mode || 'diff_25a',
          minRoiPercent: ws.min_roi_percent,
          minProfitAmount: ws.min_profit_amount,
        });
      }
    });

    const cfg = this.ebayApiService.getConfig();
    this.ebayForm.patchValue({
      appId: cfg.appId || '',
      globalId: cfg.siteId || 'EBAY-DE',
    });

    const pm = this.storeService.storeSettings().payments;
    this.paymentForm.patchValue({
      stripeEnabled: pm.stripeEnabled,
      stripePublishableKey: pm.stripePublishableKey,
      paypalEnabled: pm.paypalEnabled,
      paypalEmail: pm.paypalEmail,
      bankTransferEnabled: pm.bankTransferEnabled,
      bankIban: pm.bankIban,
      bankBic: pm.bankBic,
      bankAccountHolder: pm.bankAccountHolder,
      cashOnPickupEnabled: pm.cashOnPickupEnabled,
    });

    const cCfg = this.fulfillmentService.carrierConfig();
    this.carrierForm.patchValue({
      dhlEnabled: cCfg.dhlEnabled,
      dhlEkp: cCfg.dhlEkp,
      dhlApiKey: cCfg.dhlApiKey,
      hermesEnabled: cCfg.hermesEnabled,
      hermesClientId: cCfg.hermesClientId,
      hermesApiKey: cCfg.hermesApiKey,
    });
  }

  onSavePaymentConfig(): void {
    const val = this.paymentForm.getRawValue();
    this.storeService.updatePaymentsConfig({
      stripeEnabled: !!val.stripeEnabled,
      stripePublishableKey: val.stripePublishableKey?.trim() || '',
      paypalEnabled: !!val.paypalEnabled,
      paypalEmail: val.paypalEmail?.trim() || '',
      bankTransferEnabled: !!val.bankTransferEnabled,
      bankIban: val.bankIban?.trim() || '',
      bankBic: val.bankBic?.trim() || '',
      bankAccountHolder: val.bankAccountHolder?.trim() || '',
      cashOnPickupEnabled: !!val.cashOnPickupEnabled,
    });

    this.paymentSaveSuccess.set(true);
    setTimeout(() => this.paymentSaveSuccess.set(false), 3000);
  }

  onSaveCarrierConfig(): void {
    const val = this.carrierForm.getRawValue();
    this.fulfillmentService.updateCarrierConfig({
      dhlEnabled: !!val.dhlEnabled,
      dhlEkp: val.dhlEkp?.trim() || '',
      dhlApiKey: val.dhlApiKey?.trim() || '',
      hermesEnabled: !!val.hermesEnabled,
      hermesClientId: val.hermesClientId?.trim() || '',
      hermesApiKey: val.hermesApiKey?.trim() || '',
    });

    this.carrierSaveSuccess.set(true);
    setTimeout(() => this.carrierSaveSuccess.set(false), 3000);
  }

  async onSaveSettings(): Promise<void> {
    if (this.settingsForm.invalid) return;

    const ws = this.workspaceService.currentWorkspace();
    if (!ws) return;

    this.isSaving.set(true);
    const val = this.settingsForm.getRawValue();

    await this.workspaceService.updateWorkspaceSettings(ws.id, {
      name: val.workspaceName,
      min_roi_percent: val.minRoiPercent,
      min_profit_amount: val.minProfitAmount,
    });

    this.isSaving.set(false);
    this.saveSuccess.set(true);
    setTimeout(() => this.saveSuccess.set(false), 3000);
  }

  async onCreateWorkspace(): Promise<void> {
    if (this.newWorkspaceName.invalid) return;
    const name = this.newWorkspaceName.value.trim();
    if (!name) return;

    this.isCreatingWs.set(true);
    await this.workspaceService.createWorkspace(name);
    this.newWorkspaceName.reset();
    this.isCreatingWs.set(false);
  }

  onSwitchWorkspace(wsId: string): void {
    this.workspaceService.switchWorkspace(wsId);
  }

  async onDeleteWorkspace(wsId: string): Promise<void> {
    if (confirm('Möchtest du diesen Workspace wirklich löschen?')) {
      await this.workspaceService.deleteWorkspace(wsId);
    }
  }

  readonly isTestingPush = signal<boolean>(false);
  readonly pushStatusMessage = signal<{ success: boolean; text: string } | null>(null);

  async onRequestPushPermission(): Promise<void> {
    const granted = await this.webPushService.requestPermission();
    if (granted) {
      this.pushStatusMessage.set({ success: true, text: 'Browser-Benachrichtigungen erfolgreich erlaubt!' });
    } else {
      this.pushStatusMessage.set({ success: false, text: 'Berechtigung wurde im Browser verweigert oder blockiert.' });
    }
    setTimeout(() => this.pushStatusMessage.set(null), 4000);
  }

  async onTestWebPush(): Promise<void> {
    this.isTestingPush.set(true);
    const sent = await this.webPushService.sendTestNotification();
    this.isTestingPush.set(false);

    if (sent) {
      this.pushStatusMessage.set({ success: true, text: 'Test-Push erfolgreich gesendet!' });
    } else {
      this.pushStatusMessage.set({
        success: false,
        text: 'Push konnte nicht angezeigt werden. Bitte Berechtigung im Browser prüfen.',
      });
    }
    setTimeout(() => this.pushStatusMessage.set(null), 4000);
  }

  onTogglePushSetting(key: 'enabled' | 'notifyOnShopOrder' | 'notifyOnFulfillment' | 'notifyOnMarginAlert' | 'soundEnabled', val: boolean): void {
    this.webPushService.updateSettings({ [key]: val });
  }

  onSaveEbayConfig(): void {
    const val = this.ebayForm.getRawValue();
    this.ebayApiService.saveConfig({
      appId: val.appId?.trim() || undefined,
      siteId: val.globalId || 'EBAY-DE',
    });

    this.ebaySaveSuccess.set(true);
    setTimeout(() => this.ebaySaveSuccess.set(false), 3000);
  }

  onSaveWebhookConfig(): void {
    const val = this.webhookForm.getRawValue();
    this.webhookService.updateConfig({
      discordEnabled: !!val.discordEnabled,
      discordWebhookUrl: val.discordWebhookUrl?.trim() || '',
      telegramEnabled: !!val.telegramEnabled,
      telegramBotToken: val.telegramBotToken?.trim() || '',
      telegramChatId: val.telegramChatId?.trim() || '',
      customWebhookEnabled: !!val.customWebhookEnabled,
      customWebhookUrl: val.customWebhookUrl?.trim() || '',
      notifyOnSale: !!val.notifyOnSale,
      notifyOnPurchase: !!val.notifyOnPurchase,
      soundEnabled: !!val.soundEnabled,
    });

    this.webhookSaveSuccess.set(true);
    setTimeout(() => this.webhookSaveSuccess.set(false), 3000);
  }

  async testWebhook(channel: 'discord' | 'telegram' | 'custom'): Promise<void> {
    this.onSaveWebhookConfig();
    this.isTestingWebhook.set(true);
    this.webhookStatusMessage.set(null);

    const res = await this.webhookService.sendTestNotification(channel);
    this.isTestingWebhook.set(false);
    this.webhookStatusMessage.set({ success: res.success, text: res.message });

    setTimeout(() => this.webhookStatusMessage.set(null), 6000);
  }

  openInviteModal(): void {
    this.inviteForm.reset({ email: '', role: 'member' });
    this.inviteError.set(null);
    this.isInviteModalOpen.set(true);
  }

  closeInviteModal(): void {
    this.isInviteModalOpen.set(false);
  }

  async onSendInvite(): Promise<void> {
    if (this.inviteForm.invalid) return;

    this.isSendingInvite.set(true);
    this.inviteError.set(null);
    const { email, role } = this.inviteForm.getRawValue();

    const { error } = await this.memberService.inviteMember(email, role);
    this.isSendingInvite.set(false);

    if (error) {
      this.inviteError.set(error.message);
    } else {
      this.closeInviteModal();
    }
  }

  async onUpdateRole(memberId: string, role: WorkspaceRole): Promise<void> {
    await this.memberService.updateMemberRole(memberId, role);
  }

  async onRemoveMember(memberId: string): Promise<void> {
    if (confirm('Möchtest du dieses Team-Mitglied wirklich aus dem Workspace entfernen?')) {
      await this.memberService.removeMember(memberId);
    }
  }

  async onCancelInvite(inviteId: string): Promise<void> {
    await this.memberService.cancelInvite(inviteId);
  }

  exportPurchasesCsv(): void {
    const csv = this.exportService.generatePurchasesCsv(this.purchaseService.purchases());
    this.exportService.downloadFile(
      csv,
      `reflip-einkaeufe-${new Date().toISOString().split('T')[0]}.csv`,
      'text/csv;charset=utf-8;'
    );
  }

  exportInventoryCsv(): void {
    const csv = this.exportService.generateInventoryCsv(this.inventoryService.items());
    this.exportService.downloadFile(
      csv,
      `reflip-inventar-${new Date().toISOString().split('T')[0]}.csv`,
      'text/csv;charset=utf-8;'
    );
  }

  exportSalesCsv(): void {
    const csv = this.exportService.generateSalesCsv(this.salesService.sales());
    this.exportService.downloadFile(
      csv,
      `reflip-verkaeufe-${new Date().toISOString().split('T')[0]}.csv`,
      'text/csv;charset=utf-8;'
    );
  }
}
