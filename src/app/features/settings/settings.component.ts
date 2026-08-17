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
import { WorkspaceRole } from '../../core/models/reflip.models';

@Component({
  selector: 'app-settings',
  imports: [ReactiveFormsModule, TranslatePipe, LucideAngularModule],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.scss',
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
  readonly translate = inject(TranslateService);

  readonly settingsIcon = Settings;
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

  readonly inviteForm = new FormGroup({
    email: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.email] }),
    role: new FormControl<WorkspaceRole>('member', { nonNullable: true, validators: [Validators.required] }),
  });

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

  exportAllData(): void {
    const json = this.exportService.generateJsonBackup(
      this.workspaceService.currentWorkspace(),
      this.purchaseService.purchases(),
      this.inventoryService.items(),
      this.salesService.sales()
    );
    this.exportService.downloadFile(
      json,
      `reflip-backup-${new Date().toISOString().split('T')[0]}.json`,
      'application/json'
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
