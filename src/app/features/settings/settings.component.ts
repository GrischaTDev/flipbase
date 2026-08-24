import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  LucideDynamicIcon,
  LucideSettings as Settings,
  LucideDownload as Download,
  LucideSave as Save,
  LucideCheckCircle2 as CheckCircle2,
  LucideFileSpreadsheet as FileSpreadsheet,
  LucideDatabase as Database,
  LucideGlobe as Globe,
  LucideDollarSign as DollarSign,
  LucidePercent as Percent,
  LucideSliders as Sliders,
  LucideShieldCheck as ShieldCheck,
  LucideLink2 as Link2,
  LucidePlug as Plug,
  LucideUser as UserIcon,
  LucideUsers as Users,
  LucideUserPlus as UserPlus,
  LucideMail as Mail,
  LucideTrash2 as Trash2,
  LucideX as X,
  LucideBell as Bell,
  LucideSend as Send,
  LucideSmartphone as Smartphone,
  LucideWifi as Wifi,
  LucideWifiOff as WifiOff,
  LucideCreditCard as CreditCard,
  LucideTruck as Truck,
  LucidePackage as Package,
  LucideBuilding as Building,
  LucidePlus as Plus,
  LucideBot as Bot,
  LucideLandmark as Landmark,
  LucideShoppingCart as ShoppingCart,
  LucideAlertTriangle as AlertTriangle,
  LucideVolume2 as Volume2,
  LucideStore as Store,
} from '@lucide/angular';
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
import { WorkspaceRole } from '../../core/models/flipbase.models';
import { CustomCheckboxComponent } from '../../shared/components/custom-checkbox/custom-checkbox.component';
import { ConfirmDialogService } from '../../shared/components/confirm-dialog/confirm-dialog.service';
import { AuthService } from '../../core/services/auth.service';
import {
  CustomSelectComponent,
  SelectOption,
} from '../../shared/components/custom-select/custom-select.component';
import { ToastService } from '../../shared/components/toast/toast.service';

@Component({
  selector: 'app-settings',
  imports: [
    ReactiveFormsModule,
    TranslatePipe,
    LucideDynamicIcon,
    CustomCheckboxComponent,
    CustomSelectComponent,
  ],
  templateUrl: './settings.component.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsComponent {
  /**
   * Vorgaben fuer die eigenen Auswahlfelder.
   *
   * Ein natives Auswahlfeld klappt eine Liste auf, die das Betriebssystem
   * zeichnet - hell, mit fremder Schrift. Deshalb uebernimmt
   * `app-custom-select`, und die Eintraege stehen hier.
   */
  readonly steuermodusOptionen: SelectOption<string>[] = [
    { value: 'diff_25a', label: '§ 25a Differenzbesteuerung (Gebrauchtwaren)' },
    { value: 'kleinunternehmer_19', label: '§ 19 Kleinunternehmer (0% USt)' },
    { value: 'regular_19', label: '19% Regelbesteuerung (Standard)' },
  ];

  readonly rollenOptionen: SelectOption<WorkspaceRole>[] = [
    { value: 'admin', label: 'Administrator' },
    { value: 'member', label: 'Sourcing & Einkauf' },
    { value: 'fulfillment', label: 'Packstation & Logistik' },
    { value: 'accountant', label: 'Steuerberater / DATEV' },
    { value: 'readonly', label: 'Nur-Lesen' },
  ];

  readonly einladungsrollenOptionen: SelectOption<WorkspaceRole>[] = [
    { value: 'member', label: 'Sourcing & Einkauf (Einkauf & Inventar)' },
    { value: 'fulfillment', label: 'Packstation & Logistik (Versand & Sendungsverfolgung)' },
    { value: 'accountant', label: 'Steuerberater / DATEV (Nur-Lesen auf Finanzen)' },
    { value: 'readonly', label: 'Nur-Lesen (Reine Ansicht)' },
    { value: 'admin', label: 'Administrator (Voller Zugriff ohne Inhaber-Rechte)' },
  ];

  private readonly dialog = inject(ConfirmDialogService);
  readonly workspaceService = inject(WorkspaceService);
  readonly auth = inject(AuthService);
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
  private readonly toast = inject(ToastService);

  readonly settingsIcon = Settings;
  readonly userIcon = UserIcon;
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

  readonly isTestingWebhook = signal<boolean>(false);

  // Invite modal state
  readonly isInviteModalOpen = signal<boolean>(false);
  readonly isSendingInvite = signal<boolean>(false);
  readonly inviteError = signal<string | null>(null);

  readonly settingsForm = new FormGroup({
    workspaceName: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    currency: new FormControl('EUR', { nonNullable: true }),
    taxMode: new FormControl('diff_25a', { nonNullable: true }),
    minRoiPercent: new FormControl<number>(20, {
      nonNullable: true,
      validators: [Validators.min(0)],
    }),
    minProfitAmount: new FormControl<number>(10, {
      nonNullable: true,
      validators: [Validators.min(0)],
    }),
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
    email: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.email],
    }),
    role: new FormControl<WorkspaceRole>('member', {
      nonNullable: true,
      validators: [Validators.required],
    }),
  });

  readonly newWorkspaceName = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required],
  });
  readonly isCreatingWs = signal<boolean>(false);

  constructor() {
    // Namen des eigenen Profils vorbelegen, sobald er geladen ist.
    effect(() => {
      const profil = this.auth.profile();
      if (profil?.full_name) {
        this.profilForm.patchValue({ fullName: profil.full_name }, { emitEvent: false });
      }
    });

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

    this.toast.success('Zahlungsmethoden wurden gespeichert.');
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

    this.toast.success('Versanddienstleister wurden gespeichert.');
  }

  /** Name des eigenen Profils. Die E-Mail gehoert zur Anmeldung und bleibt aussen vor. */
  readonly profilForm = new FormGroup({
    fullName: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(2)],
    }),
  });

  readonly istProfilSpeichern = signal<boolean>(false);
  readonly istUeberallAbmelden = signal(false);

  async onSaveProfil(): Promise<void> {
    if (this.profilForm.invalid) return;

    this.istProfilSpeichern.set(true);

    const { error, reportedBySyncStatus } = await this.auth.aktualisiereProfil(
      this.profilForm.getRawValue().fullName,
    );

    this.istProfilSpeichern.set(false);
    if (error) {
      if (!reportedBySyncStatus) {
        this.toast.error('Profil konnte nicht gespeichert werden.', error.message);
      }
      return;
    }

    this.toast.success('Profil wurde gespeichert.');
  }

  /**
   * Beendet die Sitzung auf allen Geraeten.
   *
   * Mit Rueckfrage, weil der Schritt jedes andere Geraet mitnimmt und sich
   * nicht zuruecknehmen laesst.
   */
  async onAbmeldenUeberall(): Promise<void> {
    const bestaetigt = await this.dialog.frage({
      titel: 'Von allen Geräten abmelden?',
      text:
        'Alle offenen Sitzungen werden beendet – auch auf deinem Handy und auf ' +
        'fremden Rechnern. Du musst dich überall neu anmelden.',
      bestaetigenText: 'Überall abmelden',
      gefahr: true,
    });

    if (!bestaetigt) return;

    this.istUeberallAbmelden.set(true);
    try {
      await this.auth.abmeldenUeberall();
    } finally {
      // Im Normalfall ist die Komponente danach fort - schlaegt der Aufruf
      // aber fehl, muss der Knopf wieder bedienbar sein.
      this.istUeberallAbmelden.set(false);
    }
  }

  async onSaveSettings(): Promise<void> {
    if (this.settingsForm.invalid) return;

    const ws = this.workspaceService.currentWorkspace();
    if (!ws) return;

    this.isSaving.set(true);
    const val = this.settingsForm.getRawValue();

    const { error } = await this.workspaceService.updateWorkspaceSettings(ws.id, {
      name: val.workspaceName,
      min_roi_percent: val.minRoiPercent,
      min_profit_amount: val.minProfitAmount,
    });

    this.isSaving.set(false);
    if (error) return;

    this.toast.success('Einstellungen wurden gespeichert.');
  }

  async onCreateWorkspace(): Promise<void> {
    if (this.newWorkspaceName.invalid) return;
    const name = this.newWorkspaceName.value.trim();
    if (!name) return;

    this.isCreatingWs.set(true);
    const { error } = await this.workspaceService.createWorkspace(name);
    this.isCreatingWs.set(false);
    if (error) return;

    this.newWorkspaceName.reset();
    this.toast.success('Workspace wurde erstellt.');
  }

  onSwitchWorkspace(wsId: string): void {
    this.workspaceService.switchWorkspace(wsId);
  }

  async onDeleteWorkspace(wsId: string): Promise<void> {
    const bestaetigt = await this.dialog.frage({
      titel: 'Workspace löschen?',
      text: 'Der Workspace wird mit allen darin erfassten Daten gelöscht. Das lässt sich nicht rückgängig machen.',
      bestaetigenText: 'Löschen',
      gefahr: true,
    });
    if (bestaetigt) {
      const { success, reportedBySyncStatus } = await this.workspaceService.deleteWorkspace(wsId);
      if (!success) {
        if (!reportedBySyncStatus) {
          this.toast.error(
            'Workspace konnte nicht gelöscht werden.',
            'Der einzige Workspace kann nicht gelöscht werden.',
          );
        }
        return;
      }

      this.toast.success('Workspace wurde gelöscht.');
    }
  }

  readonly isTestingPush = signal<boolean>(false);

  async onRequestPushPermission(): Promise<void> {
    const granted = await this.webPushService.requestPermission();
    if (granted) {
      this.toast.success('Browser-Benachrichtigungen wurden aktiviert.');
    } else {
      this.toast.error(
        'Browser-Benachrichtigungen konnten nicht aktiviert werden.',
        'Berechtigung wurde im Browser verweigert oder blockiert.',
      );
    }
  }

  async onTestWebPush(): Promise<void> {
    this.isTestingPush.set(true);
    const sent = await this.webPushService.sendTestNotification();
    this.isTestingPush.set(false);

    if (sent) {
      this.toast.success('Test-Benachrichtigung wurde versendet.');
    } else {
      this.toast.error(
        'Test-Benachrichtigung konnte nicht versendet werden.',
        'Push konnte nicht angezeigt werden. Bitte Berechtigung im Browser prüfen.',
      );
    }
  }

  onTogglePushSetting(
    key:
      | 'enabled'
      | 'notifyOnShopOrder'
      | 'notifyOnFulfillment'
      | 'notifyOnMarginAlert'
      | 'soundEnabled',
    val: boolean,
  ): void {
    this.webPushService.updateSettings({ [key]: val });
    this.toast.success('Benachrichtigungseinstellung wurde gespeichert.');
  }

  onSaveEbayConfig(): void {
    const val = this.ebayForm.getRawValue();
    this.ebayApiService.saveConfig({
      appId: val.appId?.trim() || undefined,
      siteId: val.globalId || 'EBAY-DE',
    });

    this.toast.success('eBay-Verbindung wurde gespeichert.');
  }

  onSaveWebhookConfig(): void {
    this.saveWebhookConfig();
    this.toast.success('Webhook-Konfiguration wurde gespeichert.');
  }

  private saveWebhookConfig(): void {
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
  }

  async testWebhook(channel: 'discord' | 'telegram' | 'custom'): Promise<void> {
    this.saveWebhookConfig();
    this.isTestingWebhook.set(true);

    const res = await this.webhookService.sendTestNotification(channel);
    this.isTestingWebhook.set(false);
    if (res.success) {
      this.toast.success('Test-Webhook wurde versendet.');
    } else {
      this.toast.error('Test-Webhook konnte nicht versendet werden.', res.message);
    }
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
      return;
    }

    this.toast.success('Einladung wurde versendet.');
    this.closeInviteModal();
  }

  async onUpdateRole(memberId: string, role: WorkspaceRole): Promise<void> {
    const { error } = await this.memberService.updateMemberRole(memberId, role);
    if (error) return;

    this.toast.success('Rolle wurde geändert.');
  }

  async onRemoveMember(memberId: string): Promise<void> {
    const bestaetigt = await this.dialog.frage({
      titel: 'Mitglied entfernen?',
      text: 'Die Person verliert damit den Zugriff auf diesen Workspace.',
      bestaetigenText: 'Entfernen',
      gefahr: true,
    });
    if (bestaetigt) {
      const { error } = await this.memberService.removeMember(memberId);
      if (error) return;

      this.toast.success('Mitglied wurde entfernt.');
    }
  }

  async onCancelInvite(inviteId: string): Promise<void> {
    const { error } = await this.memberService.cancelInvite(inviteId);
    if (error) return;

    this.toast.success('Einladung wurde zurückgezogen.');
  }

  exportPurchasesCsv(): void {
    const csv = this.exportService.generatePurchasesCsv(this.purchaseService.purchases());
    this.exportService.downloadFile(
      csv,
      `flipbase-einkaeufe-${new Date().toISOString().split('T')[0]}.csv`,
      'text/csv;charset=utf-8;',
    );
    this.toast.success('Einkäufe wurden exportiert.');
  }

  exportInventoryCsv(): void {
    const csv = this.exportService.generateInventoryCsv(this.inventoryService.items());
    this.exportService.downloadFile(
      csv,
      `flipbase-inventar-${new Date().toISOString().split('T')[0]}.csv`,
      'text/csv;charset=utf-8;',
    );
    this.toast.success('Inventar wurde exportiert.');
  }

  exportSalesCsv(): void {
    const csv = this.exportService.generateSalesCsv(this.salesService.sales());
    this.exportService.downloadFile(
      csv,
      `flipbase-verkaeufe-${new Date().toISOString().split('T')[0]}.csv`,
      'text/csv;charset=utf-8;',
    );
    this.toast.success('Verkäufe wurden exportiert.');
  }
}
