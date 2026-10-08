import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
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
import { CustomSelectComponent } from '../../../../shared/components/custom-select/custom-select.component';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.service';
import { MarketplaceAccountStore } from '../../services/marketplace-account.store';
import { VintedLocalExtensionStore } from '../../services/vinted-local-extension.store';
import { VintedFavoriteMessageApiService } from '../../services/vinted-favorite-message-api.service';
import { VintedMessagingApiService } from '../../services/vinted-messaging-api.service';
import {
  favoriteMessageStateLabels,
  favoriteOfferStateLabels,
  favoriteOfferPriceCents,
  validateFavoriteOffer,
  validateFavoriteMessageConfig,
  type FavoriteMessageConfig,
  type FavoriteMessageRule,
  type FavoriteMessageSettings,
  type FavoriteOfferConfig,
} from '../../models/vinted-favorite-messages';

const offerFailureLabels: Readonly<Record<string, string>> = {
  missing_transaction: 'Für dieses Gespräch fehlt die Zuordnung zu einem Vinted-Angebot.',
  inactive_item: 'Der Artikel ist nicht mehr für ein Angebot verfügbar.',
  invalid_price: 'Der berechnete Angebotspreis liegt außerhalb unserer zulässigen Preisgrenzen.',
  transaction_changed:
    'Das zugehörige Vinted-Gespräch hat sich geändert. Das geplante Angebot wurde ausgelassen.',
  price_changed: 'Der Artikelpreis hat sich geändert. Das geplante Angebot wurde ausgelassen.',
  configuration_changed:
    'Deine Nachrichteneinstellungen haben sich geändert. Das geplante Angebot wurde angehalten.',
  timeout:
    'Die Antwort auf das Angebot hat zu lange gedauert. Prüfe auf Vinted, ob das Angebot angekommen ist.',
  provider_rejected: 'Vinted hat das Angebot abgelehnt.',
  provider_unavailable: 'Der Vinted-Dienst für Angebote ist vorübergehend nicht verfügbar.',
  auth: 'Die Freigabe für dieses Angebot konnte nicht bestätigt werden. Prüfe Deine Kontoverbindung.',
  identity: 'Das angemeldete Vinted-Konto passt nicht zu diesem Auftrag. Prüfe das Browserprofil.',
  login: 'Melde Dich im verknüpften Browserprofil wieder bei Vinted an.',
  interaction: 'Vinted verlangt eine Bestätigung durch Dich. Öffne das Gespräch auf Vinted.',
  verification:
    'Vinted verlangt eine zusätzliche Prüfung. Öffne Vinted im verknüpften Browserprofil.',
  session_blocked: 'Die Vinted-Sitzung konnte nicht verwendet werden. Prüfe Deine Kontoverbindung.',
  identity_changed:
    'Das angemeldete Vinted-Konto passt nicht zu diesem Auftrag. Prüfe das Browserprofil.',
  login_required: 'Melde Dich im verknüpften Browserprofil wieder bei Vinted an.',
  interaction_required:
    'Vinted verlangt eine Bestätigung durch Dich. Öffne Vinted im verknüpften Browserprofil.',
  verification_required:
    'Vinted verlangt eine zusätzliche Prüfung. Öffne Vinted im verknüpften Browserprofil.',
  interrupted: 'Die Verarbeitung des Angebots wurde unterbrochen. Prüfe das Gespräch auf Vinted.',
  rate_limited: 'Vinted verlangt eine Wartezeit. Prüfe das Gespräch auf Vinted.',
  unavailable: 'Vinted war für diesen Angebotsversand nicht erreichbar.',
  offer_unconfirmed:
    'Der Angebotsversand wurde nicht eindeutig bestätigt. Prüfe das Gespräch auf Vinted.',
};

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
    CustomSelectComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VintedFavoriteMessagesComponent {
  readonly store = inject(MarketplaceAccountStore);
  readonly local = inject(VintedLocalExtensionStore);
  private readonly messagingApi = inject(VintedMessagingApiService);
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
  readonly offerStateLabels = favoriteOfferStateLabels;
  readonly formId = 'vinted-favorite-settings';
  readonly offerTypeOptions = [
    { value: 'amount', label: 'Fester Nachlass in Euro' },
    { value: 'percentage', label: 'Nachlass in Prozent' },
  ];
  readonly deleteIcon = LucideTrash2;
  readonly upIcon = LucideArrowUp;
  readonly downIcon = LucideArrowDown;
  readonly form = new FormGroup({
    enabled: new FormControl(false, { nonNullable: true }),
    offerEnabled: new FormControl(false, { nonNullable: true }),
    offerType: new FormControl<FavoriteOfferConfig['type']>('amount', { nonNullable: true }),
    offerValue: new FormControl<number | null>(5),
    templates: new FormArray([
      textControl(
        'Hallo! Danke für Dein Interesse an {article}. Wenn Du Fragen hast, schreib mir gerne. 😊',
      ),
    ]),
    rules: new FormArray<ReturnType<typeof ruleForm>>([]),
    delayMinutes: new FormControl<number | null>(0),
  });
  private readonly formValues = toSignal(this.form.valueChanges, {
    initialValue: this.form.getRawValue(),
  });
  readonly offerPreviewPriceCents = computed(() => {
    const values = this.formValues();
    return values.offerEnabled
      ? favoriteOfferPriceCents(4000, {
          type: values.offerType ?? 'amount',
          value: values.offerValue ?? -1,
        })
      : null;
  });
  readonly offerInvalid = computed(() => {
    const values = this.formValues();
    return (
      !!values.offerEnabled &&
      !validateFavoriteOffer({ type: values.offerType, value: values.offerValue })
    );
  });
  readonly offerValidationMessage = computed(() => {
    const values = this.formValues();
    if (!values.offerEnabled) return null;
    if (this.offerInvalid())
      return values.offerType === 'percentage'
        ? 'Gib einen Nachlass von 1 bis 50 Prozent mit höchstens zwei Dezimalstellen ein.'
        : 'Gib einen positiven Nachlass in Euro mit höchstens zwei Dezimalstellen ein.';
    return this.offerPreviewPriceCents() === null
      ? 'Beim Beispielpreis von 40 € wäre dieser Nachlass zu hoch. Ein Angebot muss mindestens die Hälfte des aktuellen Artikelpreises betragen.'
      : null;
  });
  private readonly offerPriceFormatter = new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
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
        this.applyConfig(null, false);
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
    const offer: FavoriteOfferConfig | null = values.offerEnabled
      ? { type: values.offerType, value: values.offerValue ?? -1 }
      : null;
    if (offer && !validateFavoriteOffer(offer)) {
      this.error.set(
        values.offerType === 'percentage'
          ? 'Prüfe Deinen Nachlass: 1 bis 50 Prozent mit höchstens zwei Dezimalstellen.'
          : 'Prüfe Deinen Nachlass: ein positiver Eurobetrag mit höchstens zwei Dezimalstellen.',
      );
      return;
    }
    const config: FavoriteMessageConfig = {
      offer,
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
      if (values.enabled && account.executionMode === 'cloud') {
        const permission = await this.messagingApi.readPermission(account);
        if (!this.isCurrent(context, revision)) return;
        if (!currentSettings.active || !permission.allowed) {
          const confirmed = await this.dialog.frage({
            titel: 'Favoritennachrichten aktivieren?',
            text: 'Flipbase sendet Deine Vorlagen automatisch über die Cloud an neue Interessenten dieses Kontos. Frühere Favorisierungen und bestehende Gespräche werden ausgelassen. Die Kontoverbindung und Automatik müssen aktiv sein.',
            bestaetigenText: 'Aktivieren',
          });
          if (!confirmed || !this.isCurrent(context, revision)) return;
          if (!permission.allowed) {
            if (!account.externalAccountId)
              throw new Error('Bestätige zuerst die Kontoverbindung.');
            const approved = await this.messagingApi.approveCloud(
              account,
              account.externalAccountId,
            );
            if (!approved.allowed || approved.executionMode !== 'cloud')
              throw new Error('Die Cloud-Nachrichtenfreigabe konnte nicht bestätigt werden.');
          }
        }
      } else if (
        values.enabled &&
        (!currentSettings.active || !this.local.binding()?.messagesSend)
      ) {
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
    this.applyConfig(settings.config, settings.enabled);
  }
  private applyConfig(storedConfig: FavoriteMessageConfig | null, enabled: boolean): void {
    const config = storedConfig ?? {
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
    this.form.controls.enabled.setValue(enabled);
    const offer = storedConfig?.offer;
    this.form.controls.offerEnabled.setValue(!!offer);
    this.form.controls.offerType.setValue(offer?.type ?? 'amount');
    this.form.controls.offerValue.setValue(offer?.value ?? 5);
    this.form.controls.delayMinutes.setValue(config.delayMinutes);
    this.form.markAsPristine();
  }
  formatOfferPrice(priceCents: number): string {
    return this.offerPriceFormatter.format(priceCents / 100);
  }
  offerFailureReason(errorCode: string | null | undefined): string | null {
    if (!errorCode) return null;
    const reason = Object.hasOwn(offerFailureLabels, errorCode)
      ? offerFailureLabels[errorCode]
      : null;
    return reason ?? 'Der genaue Angebotsgrund ist nicht verfügbar. Prüfe das Gespräch auf Vinted.';
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
