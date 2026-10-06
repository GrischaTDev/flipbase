import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormArray, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { LucideArrowUp, LucideArrowDown, LucideTrash2 } from '@lucide/angular';
import { AuthService } from '../../../../core/services/auth.service';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import { CardComponent } from '../../../../shared/components/card/card.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import { NoticeBannerComponent } from '../../../../shared/components/notice-banner/notice-banner.component';
import { TextFieldComponent } from '../../../../shared/components/text-field/text-field.component';
import { NumberInputComponent } from '../../../../shared/components/number-input/number-input.component';
import { CustomCheckboxComponent } from '../../../../shared/components/custom-checkbox/custom-checkbox.component';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.service';
import { MarketplaceAccountStore } from '../../services/marketplace-account.store';
import { VintedLocalExtensionStore } from '../../services/vinted-local-extension.store';
import { VintedFavoriteMessageApiService } from '../../services/vinted-favorite-message-api.service';
import {
  favoriteMessageStateLabels,
  validateFavoriteMessageConfig,
  type FavoriteMessageConfig,
  type FavoriteMessageRule,
  type FavoriteMessageSettings,
} from '../../models/vinted-favorite-messages';

const textControl = (text = '') =>
  new FormControl(text, {
    nonNullable: true,
    validators: [Validators.required, Validators.maxLength(2000)],
  });
function ruleForm(rule?: FavoriteMessageRule) {
  return new FormGroup({
    name: new FormControl(rule?.name ?? 'Neue Regel', { nonNullable: true }),
    startHour: new FormControl<number | null>(rule?.startHour ?? null),
    endHour: new FormControl<number | null>(rule?.endHour ?? null),
    days: new FormArray(
      Array.from(
        { length: 7 },
        (_, index) =>
          new FormControl(rule?.days.includes(index + 1) ?? false, { nonNullable: true }),
      ),
    ),
    minPrice: new FormControl<number | null>(rule?.minPrice ?? null),
    maxPrice: new FormControl<number | null>(rule?.maxPrice ?? null),
    templates: new FormArray((rule?.templates ?? ['']).map((text) => textControl(text))),
  });
}
@Component({
  selector: 'app-vinted-favorite-messages',
  templateUrl: './vinted-favorite-messages.component.html',
  imports: [
    ReactiveFormsModule,
    DatePipe,
    CardComponent,
    ButtonComponent,
    BadgeComponent,
    NoticeBannerComponent,
    TextFieldComponent,
    NumberInputComponent,
    CustomCheckboxComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VintedFavoriteMessagesComponent {
  readonly store = inject(MarketplaceAccountStore);
  readonly local = inject(VintedLocalExtensionStore);
  private readonly api = inject(VintedFavoriteMessageApiService);
  private readonly auth = inject(AuthService);
  private readonly workspace = inject(WorkspaceService);
  private readonly dialog = inject(ConfirmDialogService);
  readonly settings = signal<FavoriteMessageSettings | null>(null);
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly saved = signal(false);
  readonly days = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
  readonly stateLabels = favoriteMessageStateLabels;
  readonly deleteIcon = LucideTrash2;
  readonly upIcon = LucideArrowUp;
  readonly downIcon = LucideArrowDown;
  readonly form = new FormGroup({
    enabled: new FormControl(false, { nonNullable: true }),
    templates: new FormArray([
      textControl(
        'Hallo! Danke für Dein Interesse an {article}. Wenn Du Fragen hast, schreib mir gerne. 😊',
      ),
    ]),
    rules: new FormArray<ReturnType<typeof ruleForm>>([]),
    delayMinutes: new FormControl<number | null>(0),
  });
  private revision = 0;
  private context: string | null = null;
  private destroyed = false;

  constructor() {
    effect(() => {
      const account = this.store.selectedConnection();
      const user = this.auth.currentUser();
      const workspace = this.workspace.currentWorkspace();
      const context =
        account && user && workspace?.id === account.workspaceId && !workspace.archived_at
          ? JSON.stringify([user.id, account.workspaceId, account.connectionId])
          : null;
      untracked(() => {
        if (this.context === context) return;
        this.context = context;
        this.revision++;
        this.settings.set(null);
        this.error.set(null);
        this.saved.set(false);
        this.busy.set(false);
        this.loading.set(!!context);
        if (context) void this.reload();
      });
    });
    const timer = setInterval(() => {
      if (document.visibilityState !== 'hidden' && !this.busy()) void this.reload(true);
    }, 60_000);
    inject(DestroyRef).onDestroy(() => {
      clearInterval(timer);
      this.destroyed = true;
      this.revision++;
    });
  }
  addTemplate(templates: FormArray<FormControl<string>>): void {
    if (templates.length < 10) {
      templates.push(textControl());
      this.form.markAsDirty();
    }
  }
  addRule(): void {
    if (this.form.controls.rules.length < 20) {
      this.form.controls.rules.push(ruleForm());
      this.form.markAsDirty();
    }
  }
  removeTemplate(templates: FormArray<FormControl<string>>, index: number): void {
    if (templates.length > 1) {
      templates.removeAt(index);
      this.form.markAsDirty();
    }
  }
  removeRule(index: number): void {
    this.form.controls.rules.removeAt(index);
    this.form.markAsDirty();
  }
  moveRule(index: number, offset: number): void {
    const rules = this.form.controls.rules;
    if (index + offset < 0 || index + offset >= rules.length) return;
    const rule = rules.at(index);
    rules.removeAt(index);
    rules.insert(index + offset, rule);
    this.form.markAsDirty();
  }
  async reload(background = false): Promise<void> {
    const account = this.store.selectedConnection();
    const context = this.context;
    if (!account || !context || this.busy() || this.destroyed) return;
    const revision = ++this.revision;
    if (!background) {
      this.loading.set(true);
      this.error.set(null);
    }
    try {
      const settings = await this.api.read(account);
      if (!this.isCurrent(context, revision)) return;
      this.settings.set(
        background && this.form.dirty && this.settings()
          ? {
              ...(this.settings() as FavoriteMessageSettings),
              active: settings.active,
              lastCheckedAt: settings.lastCheckedAt,
              events: settings.events,
            }
          : settings,
      );
      if (!background || !this.form.dirty) this.applySettings(settings);
    } catch (error) {
      if (this.isCurrent(context, revision)) this.error.set(this.errorText(error));
    } finally {
      if (this.isCurrent(context, revision)) this.loading.set(false);
    }
  }
  async save(): Promise<void> {
    const settings = this.settings();
    const account = this.store.selectedConnection();
    const context = this.context;
    if (!settings || !account || !context || this.busy() || this.loading()) return;
    const values = this.form.getRawValue();
    const config: FavoriteMessageConfig = {
      templates: values.templates,
      delayMinutes: values.delayMinutes ?? -1,
      timezone: 'Europe/Berlin',
      rules: values.rules.map((rule) => ({
        ...rule,
        days: rule.days.flatMap((selected, index) => (selected ? [index + 1] : [])),
      })),
    };
    if (!validateFavoriteMessageConfig(config)) {
      this.error.set(
        'Prüfe Deine Texte, Stunden und Preisgrenzen. Ein Zeitfenster braucht eine Start- und Endstunde.',
      );
      return;
    }
    const revision = ++this.revision;
    this.busy.set(true);
    this.error.set(null);
    this.saved.set(false);
    try {
      const currentSettings = values.enabled ? await this.api.read(settings) : settings;
      if (!this.isCurrent(context, revision)) return;
      if (values.enabled && (!currentSettings.active || !this.local.binding()?.messagesSend)) {
        const confirmed = await this.dialog.frage({
          titel: 'Favoritennachrichten aktivieren?',
          text: 'Flipbase sendet Deine Vorlagen automatisch an neue Interessenten dieses Kontos. Frühere Favorisierungen werden ausgelassen. Dein Browser muss laufen.',
          bestaetigenText: 'Aktivieren',
        });
        if (!this.isCurrent(context, revision) || !confirmed) return;
        await this.local.loadConnection(account);
        if (!this.isCurrent(context, revision)) return;
        if (!this.local.messagesAllowed()) await this.local.approveInbox();
        if (!this.isCurrent(context, revision)) return;
        if (!this.local.binding()?.messagesSend && !(await this.local.approveSend()))
          throw new Error(this.local.error() ?? 'Erteile zuerst die lokale Nachrichtenfreigabe.');
      }
      if (!this.isCurrent(context, revision)) return;
      const saved = await this.api.save(settings, values.enabled, config);
      if (!this.isCurrent(context, revision)) return;
      this.settings.set(saved);
      this.applySettings(saved);
      this.saved.set(true);
    } catch (error) {
      if (this.isCurrent(context, revision)) this.error.set(this.errorText(error));
    } finally {
      if (this.isCurrent(context, revision)) this.busy.set(false);
    }
  }
  private applySettings(settings: FavoriteMessageSettings): void {
    const config = settings.config ?? {
      templates: [
        'Hallo! Danke für Dein Interesse an {article}. Wenn Du Fragen hast, schreib mir gerne. 😊',
      ],
      rules: [],
      delayMinutes: 0,
    };
    this.form.controls.templates.clear();
    config.templates.forEach((text) => this.form.controls.templates.push(textControl(text)));
    this.form.controls.rules.clear();
    config.rules.forEach((rule) => this.form.controls.rules.push(ruleForm(rule)));
    this.form.controls.enabled.setValue(settings.enabled);
    this.form.controls.delayMinutes.setValue(config.delayMinutes);
    this.form.markAsPristine();
  }
  private isCurrent(context: string, revision: number): boolean {
    const account = this.store.selectedConnection();
    return (
      !this.destroyed &&
      this.context === context &&
      this.revision === revision &&
      this.workspace.currentWorkspace()?.id === account?.workspaceId &&
      JSON.stringify([this.auth.currentUser()?.id, account?.workspaceId, account?.connectionId]) ===
        context
    );
  }
  private errorText(error: unknown): string {
    return error instanceof Error
      ? error.message
      : 'Favoritennachrichten konnten nicht gespeichert werden.';
  }
}
