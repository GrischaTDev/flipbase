import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormArray, FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { LucideTrash2 } from '@lucide/angular';
import { AuthService } from '../../../../core/services/auth.service';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import { CardComponent } from '../../../../shared/components/card/card.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import { TextFieldComponent } from '../../../../shared/components/text-field/text-field.component';
import { NumberInputComponent } from '../../../../shared/components/number-input/number-input.component';
import { CustomCheckboxComponent } from '../../../../shared/components/custom-checkbox/custom-checkbox.component';
import { CustomSelectComponent } from '../../../../shared/components/custom-select/custom-select.component';
import { NoticeBannerComponent } from '../../../../shared/components/notice-banner/notice-banner.component';
import { MarketplaceAccountStore } from '../../services/marketplace-account.store';
import { VintedNegotiationApiService } from '../../services/vinted-negotiation-api.service';
import {
  calculateNegotiationPrices,
  createDefaultNegotiationConfig,
  isNegotiationConfig,
  negotiationStateLabels,
  type NegotiationMessageEvent,
  type NegotiationMessageStep,
  type NegotiationSettings,
  type VintedNegotiationConfig,
} from '../../models/vinted-negotiation';

const numberControl = (amount: number | null) => new FormControl<number | null>(amount);
const textControl = (text = '') => new FormControl(text, { nonNullable: true });
function stepForm(step?: NegotiationMessageStep) {
  return new FormGroup({
    delaySeconds: numberControl(step?.delaySeconds ?? 0),
    templates: new FormArray((step?.templates ?? ['']).map(textControl)),
  });
}
function bandForm(band?: VintedNegotiationConfig['priceBands'][number]) {
  return new FormGroup({
    upTo: numberControl(band?.upToCents ? band.upToCents / 100 : null),
    discountType: new FormControl<'amount' | 'percentage'>(band?.discountType ?? 'amount', {
      nonNullable: true,
    }),
    discountValue: numberControl(band?.discountValue ?? 10),
  });
}
@Component({
  selector: 'app-vinted-negotiation',
  templateUrl: './vinted-negotiation.component.html',
  imports: [
    ReactiveFormsModule,
    DatePipe,
    CardComponent,
    ButtonComponent,
    BadgeComponent,
    TextFieldComponent,
    NumberInputComponent,
    CustomCheckboxComponent,
    CustomSelectComponent,
    NoticeBannerComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VintedNegotiationComponent {
  readonly store = inject(MarketplaceAccountStore);
  private readonly api = inject(VintedNegotiationApiService);
  private readonly auth = inject(AuthService);
  private readonly workspace = inject(WorkspaceService);
  readonly settings = signal<NegotiationSettings | null>(null);
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly saved = signal(false);
  readonly deleteIcon = LucideTrash2;
  readonly states = negotiationStateLabels;
  readonly actions = {
    accept: 'Annahme',
    decline: 'Ablehnung',
    counter: 'Gegenangebot',
    message: 'Nachricht',
  };
  readonly discountOptions = [
    { value: 'amount', label: 'Euro' },
    { value: 'percentage', label: 'Prozent' },
  ];
  readonly orderOptions = [
    { value: 'offer_first', label: 'Angebot vor Nachricht' },
    { value: 'message_first', label: 'Nachricht vor Angebot' },
  ];
  readonly delayOptions = [
    { value: '0', label: 'Sofort' },
    { value: '30', label: '30 Sekunden' },
    { value: '60', label: '1 Minute' },
    { value: '120', label: '2 Minuten' },
    { value: '300', label: '5 Minuten' },
    { value: 'custom', label: 'Individuelle Wartezeit' },
  ];
  private readonly customDelay = signal(false);
  readonly delayUnitOptions = [
    { value: 'seconds', label: 'Sekunden' },
    { value: 'minutes', label: 'Minuten' },
  ];
  private readonly delayUnits = signal(new Map<FormControl<number | null>, string>());
  delayUnit(control: FormControl<number | null>) {
    return this.delayUnits().get(control) ?? 'seconds';
  }
  delayAmount(control: FormControl<number | null>) {
    const seconds = control.value;
    return seconds === null ? null : seconds / (this.delayUnit(control) === 'minutes' ? 60 : 1);
  }
  chooseDelayUnit(control: FormControl<number | null>, unit: string | null) {
    if (unit !== 'seconds' && unit !== 'minutes') return;
    this.delayUnits.update((units) => new Map(units).set(control, unit));
  }
  changeDelay(control: FormControl<number | null>, amount: number | null) {
    const seconds =
      amount === null ? null : amount * (this.delayUnit(control) === 'minutes' ? 60 : 1);
    control.setValue(
      seconds !== null && Math.abs(seconds - Math.round(seconds)) < 1e-7
        ? Math.round(seconds)
        : seconds,
    );
    this.form.markAsDirty();
  }
  readonly messageSections: readonly {
    event: NegotiationMessageEvent;
    title: string;
    description: string;
  }[] = [
    {
      event: 'accepted',
      title: 'Eigene Annahme',
      description:
        'Nach bestätigter Annahme eines Käuferangebots. Eine Annahme ist noch kein Kauf.',
    },
    {
      event: 'counter',
      title: 'Gegenangebot',
      description: 'Bei einem weiteren Verhandlungsschritt.',
    },
    { event: 'final', title: 'Letztes Gegenangebot', description: 'Beim letzten erlaubten Preis.' },
    {
      event: 'after_final',
      title: 'Weiteres Angebot nach letzter Stufe',
      description: 'Wenn nach der letzten Stufe erneut ein Käuferangebot eingeht.',
    },
    {
      event: 'after_acceptance',
      title: 'Weiteres Angebot nach eigener Annahme',
      description: 'Wenn nach Deiner Annahme erneut ein Käuferangebot eingeht.',
    },
    {
      event: 'purchased',
      title: 'Bestätigter Kauf',
      description: 'Nach bestätigter Zahlung. Gilt unabhängig von der automatischen Verhandlung.',
    },
  ];
  readonly messageForms = {
    accepted: new FormArray<ReturnType<typeof stepForm>>([]),
    counter: new FormArray<ReturnType<typeof stepForm>>([]),
    final: new FormArray<ReturnType<typeof stepForm>>([]),
    after_final: new FormArray<ReturnType<typeof stepForm>>([]),
    after_acceptance: new FormArray<ReturnType<typeof stepForm>>([]),
    buyer_accepted: new FormArray<ReturnType<typeof stepForm>>([]),
    purchased: new FormArray<ReturnType<typeof stepForm>>([]),
  };
  readonly form = new FormGroup({
    enabled: new FormControl(false, { nonNullable: true }),
    discountType: new FormControl<'amount' | 'percentage'>('amount', { nonNullable: true }),
    discountValue: numberControl(10),
    priceBands: new FormArray<ReturnType<typeof bandForm>>([]),
    stages: new FormArray([50, 80, 100].map(numberControl)),
    delaySeconds: numberControl(0),
    sendOrder: new FormControl<'offer_first' | 'message_first'>('offer_first', {
      nonNullable: true,
    }),
    purchaseEnabled: new FormControl(false, { nonNullable: true }),
    messages: new FormGroup(this.messageForms),
  });
  readonly previewPrice = numberControl(50);
  private readonly values = toSignal(this.form.valueChanges, {
    initialValue: this.form.getRawValue(),
  });
  readonly selectedDelay = computed(() => {
    const delay = String(this.values().delaySeconds);
    return !this.customDelay() && this.delayOptions.some((option) => option.value === delay)
      ? delay
      : 'custom';
  });
  chooseDelay(selection: string | null) {
    if (selection === 'custom') {
      this.customDelay.set(true);
      return;
    }
    if (selection && this.delayOptions.some((option) => option.value === selection)) {
      this.customDelay.set(false);
      this.form.controls.delaySeconds.setValue(Number(selection));
      this.form.markAsDirty();
    }
  }
  private readonly price = toSignal(this.previewPrice.valueChanges, { initialValue: 50 });
  readonly preview = computed(() => {
    this.values();
    const config = this.config();
    if (!isNegotiationConfig(config)) return null;
    try {
      return calculateNegotiationPrices(Math.round((this.price() ?? 0) * 100), config);
    } catch {
      return null;
    }
  });
  private readonly context = computed(() => {
    const account = this.store.selectedConnection();
    const user = this.auth.currentUser();
    const workspace = this.workspace.currentWorkspace();
    return account &&
      user &&
      this.store.canManage() &&
      workspace?.id === account.workspaceId &&
      !workspace.archived_at
      ? JSON.stringify([
          user.id,
          workspace.id,
          account.connectionId,
          account.externalAccountId,
          account.executionMode,
        ])
      : null;
  });
  private revision = 0;
  private destroyed = false;
  constructor() {
    effect(() => {
      this.context();
      untracked(() => {
        this.revision++;
        this.settings.set(null);
        this.busy.set(false);
        this.error.set(null);
        this.saved.set(false);
        this.apply(createDefaultNegotiationConfig(), false);
        void this.reload();
      });
    });
    const timer = setInterval(() => {
      if (document.visibilityState !== 'hidden' && !this.busy()) void this.reload(true);
    }, 60_000);
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.revision++;
      clearInterval(timer);
    });
  }
  addBand() {
    if (this.form.controls.priceBands.length < 20) {
      this.form.controls.priceBands.push(bandForm());
      this.form.markAsDirty();
    }
  }
  addStage() {
    if (this.form.controls.stages.length < 10) {
      this.form.controls.stages.push(numberControl(100));
      this.form.markAsDirty();
    }
  }
  addStep(event: NegotiationMessageEvent) {
    if (event !== 'buyer_accepted' && this.messageForms[event].length < 5) {
      this.messageForms[event].push(stepForm());
      this.form.markAsDirty();
    }
  }
  addAlternative(step: ReturnType<typeof stepForm>) {
    if (step.controls.templates.length < 10) {
      step.controls.templates.push(textControl());
      this.form.markAsDirty();
    }
  }
  removeBand(index: number) {
    this.form.controls.priceBands.removeAt(index);
    this.form.markAsDirty();
  }
  removeStage(index: number) {
    if (this.form.controls.stages.length > 1) {
      this.form.controls.stages.removeAt(index);
      this.form.markAsDirty();
    }
  }
  removeStep(event: NegotiationMessageEvent, index: number) {
    this.messageForms[event].removeAt(index);
    this.form.markAsDirty();
  }
  removeAlternative(step: ReturnType<typeof stepForm>, index: number) {
    if (step.controls.templates.length > 1) {
      step.controls.templates.removeAt(index);
      this.form.markAsDirty();
    }
  }
  config(): VintedNegotiationConfig {
    const values = this.form.getRawValue();
    return {
      discountType: values.discountType,
      discountValue: values.discountValue ?? -1,
      priceBands: values.priceBands.map((band) => ({
        discountType: band.discountType,
        discountValue: band.discountValue ?? -1,
        upToCents:
          band.upTo === null
            ? null
            : Math.abs(band.upTo * 100 - Math.round(band.upTo * 100)) < 1e-7
              ? Math.round(band.upTo * 100)
              : band.upTo * 100,
      })),
      stages: values.stages.map((stage) => stage ?? -1),
      delaySeconds: values.delaySeconds ?? -1,
      sendOrder: values.sendOrder,
      purchaseEnabled: values.purchaseEnabled,
      messages: {
        accepted: this.steps('accepted'),
        counter: this.steps('counter'),
        final: this.steps('final'),
        after_final: this.steps('after_final'),
        after_acceptance: this.steps('after_acceptance'),
        buyer_accepted: this.settings()?.config.messages.buyer_accepted ?? [],
        purchased: this.steps('purchased'),
      },
    };
  }
  private steps(event: NegotiationMessageEvent): readonly NegotiationMessageStep[] {
    return this.messageForms[event]
      .getRawValue()
      .map((step) => ({ templates: step.templates, delaySeconds: step.delaySeconds ?? -1 }));
  }
  async reload(background = false) {
    const scope = this.store.selectedConnection();
    const context = this.context();
    if (!scope || !context || this.busy()) {
      if (!context) this.loading.set(false);
      return;
    }
    const revision = ++this.revision;
    if (!background) this.loading.set(true);
    try {
      const settings = await this.api.read(scope);
      if (!this.current(context, revision)) return;
      const previous = this.settings();
      this.settings.set(
        this.form.dirty && previous
          ? { ...previous, active: settings.active, events: settings.events }
          : settings,
      );
      if (!this.form.dirty) this.apply(settings.config, settings.enabled);
    } catch (error) {
      if (this.current(context, revision))
        this.error.set(
          error instanceof Error
            ? error.message
            : 'Die Einstellungen konnten nicht geladen werden.',
        );
    } finally {
      if (this.current(context, revision)) this.loading.set(false);
    }
  }
  async save() {
    const settings = this.settings();
    const context = this.context();
    if (!settings || !context || this.busy() || this.loading()) return;
    const config = this.config();
    if (!isNegotiationConfig(config)) {
      this.error.set(
        'Prüfe Nachlass, aufsteigende Preisbereiche und Stufen (letzte Stufe 100), Texte und Wartezeiten.',
      );
      return;
    }
    const revision = ++this.revision;
    this.busy.set(true);
    this.error.set(null);
    this.saved.set(false);
    try {
      const saved = await this.api.save(settings, this.form.controls.enabled.value, config);
      if (!this.current(context, revision)) return;
      this.settings.set(saved);
      this.apply(saved.config, saved.enabled);
      this.saved.set(true);
    } catch (error) {
      if (this.current(context, revision))
        this.error.set(
          error instanceof Error
            ? error.message
            : 'Die Einstellungen konnten nicht gespeichert werden.',
        );
    } finally {
      if (this.current(context, revision)) this.busy.set(false);
    }
  }
  private current(context: string, revision: number) {
    return !this.destroyed && context === this.context() && revision === this.revision;
  }
  private apply(config: VintedNegotiationConfig, enabled: boolean) {
    this.customDelay.set(false);
    this.form.patchValue({
      enabled,
      discountType: config.discountType,
      discountValue: config.discountValue,
      delaySeconds: config.delaySeconds,
      sendOrder: config.sendOrder,
      purchaseEnabled: config.purchaseEnabled,
    });
    this.form.controls.priceBands.clear();
    config.priceBands.forEach((band) => this.form.controls.priceBands.push(bandForm(band)));
    this.form.controls.stages.clear();
    config.stages.forEach((stage) => this.form.controls.stages.push(numberControl(stage)));
    for (const section of this.messageSections) {
      const steps = this.messageForms[section.event];
      steps.clear();
      config.messages[section.event].forEach((step) => steps.push(stepForm(step)));
    }
    this.delayUnits.set(
      new Map(
        [
          this.form.controls.delaySeconds,
          ...this.messageSections.flatMap((section) =>
            this.messageForms[section.event].controls.map((step) => step.controls.delaySeconds),
          ),
        ].map((control) => [
          control,
          control.value && control.value % 60 === 0 ? 'minutes' : 'seconds',
        ]),
      ),
    );
    this.form.markAsPristine();
  }
  formatPrice(cents: number) {
    return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(
      cents / 100,
    );
  }
}
