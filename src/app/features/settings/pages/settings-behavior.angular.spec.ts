import '@angular/compiler';
import {
  signal,
  ɵresolveComponentResources,
  ɵɵqueryAdvance,
  ɵɵviewQuerySignal,
} from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { readFile } from 'node:fs/promises';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  UserProfile,
  Workspace,
  WorkspaceInvite,
  WorkspaceMember,
  WorkspaceRole,
} from '../../../core/models/flipbase.models';
import { CarrierConfig } from '../../../core/models/fulfillment.models';
import { PaymentGatewayConfig } from '../../../core/models/store.models';
import { WebhookConfig } from '../../../core/models/webhook.models';
import { AuthService } from '../../../core/services/auth.service';
import { EbayApiService } from '../../../core/services/ebay-api.service';
import { FulfillmentService } from '../../../core/services/fulfillment.service';
import { PwaService } from '../../../core/services/pwa.service';
import { StoreService } from '../../../core/services/store.service';
import { SyncStatusService } from '../../../core/services/sync-status.service';
import { WebPushService, WebPushSettings } from '../../../core/services/web-push.service';
import { WebhookService } from '../../../core/services/webhook.service';
import { WorkspaceMemberService } from '../../../core/services/workspace-member.service';
import { WorkspaceService } from '../../../core/services/workspace.service';
import { ConfirmDialogService } from '../../../shared/components/confirm-dialog/confirm-dialog.service';
import { CustomCheckboxComponent } from '../../../shared/components/custom-checkbox/custom-checkbox.component';
import { CustomSelectComponent } from '../../../shared/components/custom-select/custom-select.component';
import { ToastService, ToastType } from '../../../shared/components/toast/toast.service';
import { TextFieldComponent } from '../../../shared/components/text-field/text-field.component';
import { NumberInputComponent } from '../../../shared/components/number-input/number-input.component';
import { AccountSettingsComponent } from './account-settings/account-settings.component';
import { AppSettingsComponent } from './app-settings/app-settings.component';
import { NotificationSettingsComponent } from './notification-settings/notification-settings.component';
import { ShippingSettingsComponent } from './shipping-settings/shipping-settings.component';
import { StoreSettingsComponent } from './store-settings/store-settings.component';
import { TeamSettingsComponent } from './team-settings/team-settings.component';
import { WorkspaceSettingsComponent } from './workspace-settings/workspace-settings.component';

interface MutationResult {
  readonly data: object | null;
  readonly error: Error | null;
  readonly reportedBySyncStatus: boolean;
}

/**
 * Der Vitest-Fallback sieht Signal-Inputs, Model-Ausgänge und die Signal-ViewQuery
 * von Kindkomponenten ohne das Angular-Build-Plugin nicht. Die Snapshots begrenzen
 * die notwendige Bridge auf diese isolierte Datei und stellen jedes Metadatum danach
 * wieder her.
 */
interface AngularBindingMetadata {
  inputs: Record<string, unknown>;
  declaredInputs: Record<string, string>;
  outputs: Record<string, string>;
}

type AngularViewQuery = (renderFlags: number, context: unknown) => void;

let selectMetadataSnapshot: AngularBindingMetadata | null = null;
let checkboxMetadataSnapshot: AngularBindingMetadata | null = null;
let textFieldMetadataSnapshot: AngularBindingMetadata | null = null;
let numberInputMetadataSnapshot: AngularBindingMetadata | null = null;
let selectViewQuerySnapshot: AngularViewQuery | null | undefined;

const resourceFiles: Readonly<Record<string, string>> = {
  'account-settings.component.html': './account-settings/account-settings.component.html',
  'app-settings.component.html': './app-settings/app-settings.component.html',
  'notification-settings.component.html':
    './notification-settings/notification-settings.component.html',
  'shipping-settings.component.html': './shipping-settings/shipping-settings.component.html',
  'store-settings.component.html': './store-settings/store-settings.component.html',
  'team-settings.component.html': './team-settings/team-settings.component.html',
  'workspace-settings.component.html': './workspace-settings/workspace-settings.component.html',
  'custom-checkbox.component.html':
    '../../../shared/components/custom-checkbox/custom-checkbox.component.html',
  'custom-checkbox.component.scss':
    '../../../shared/components/custom-checkbox/custom-checkbox.component.scss',
  'custom-select.component.html':
    '../../../shared/components/custom-select/custom-select.component.html',
  'custom-select.component.scss':
    '../../../shared/components/custom-select/custom-select.component.scss',
  'badge.component.html': '../../../shared/components/badge/badge.component.html',
  'badge.component.scss': '../../../shared/components/badge/badge.component.scss',
  'text-field.component.html': '../../../shared/components/text-field/text-field.component.html',
  'text-field.component.scss': '../../../shared/components/text-field/text-field.component.scss',
  'number-input.component.html': '../../../shared/components/number-input/number-input.component.html',
  'number-input.component.scss': '../../../shared/components/number-input/number-input.component.scss',
};

beforeAll(async () => {
  await ɵresolveComponentResources((url) => {
    const fileName = url.split('/').at(-1)?.replace(/^\.\//, '') ?? '';
    const resource = resourceFiles[fileName];
    if (!resource) throw new Error(`Unbekannte Angular-Ressource im Settings-Test: ${url}`);
    return readFile(new URL(resource, import.meta.url), 'utf8');
  });

  const selectMetadata = (
    CustomSelectComponent as unknown as {
      ɵcmp: AngularBindingMetadata & { viewQuery: AngularViewQuery | null };
    }
  ).ɵcmp;
  selectMetadataSnapshot = {
    inputs: selectMetadata.inputs,
    declaredInputs: selectMetadata.declaredInputs,
    outputs: selectMetadata.outputs,
  };
  selectViewQuerySnapshot = selectMetadata.viewQuery;
  selectMetadata.inputs = {
    ...selectMetadata.inputs,
    options: ['options', 1, null],
    value: ['value', 1, null],
    placeholder: ['placeholder', 1, null],
    variant: ['variant', 1, null],
    size: ['size', 1, null],
    disabled: ['disabled', 1, null],
    widthClass: ['widthClass', 1, null],
    openDirection: ['openDirection', 1, null],
    ariaLabel: ['ariaLabel', 1, null],
    triggerId: ['triggerId', 1, null],
  };
  selectMetadata.declaredInputs = {
    ...selectMetadata.declaredInputs,
    options: 'options',
    value: 'value',
    placeholder: 'placeholder',
    variant: 'variant',
    size: 'size',
    disabled: 'disabled',
    widthClass: 'widthClass',
    openDirection: 'openDirection',
    ariaLabel: 'ariaLabel',
    triggerId: 'triggerId',
  };
  selectMetadata.outputs = {
    ...selectMetadata.outputs,
    valueChange: 'value',
  };
  selectMetadata.viewQuery = (renderFlags, context) => {
    const component = context as {
      trigger: Parameters<typeof ɵɵviewQuerySignal>[0];
    };
    if (renderFlags & 1) ɵɵviewQuerySignal(component.trigger, ['trigger'], 5);
    if (renderFlags & 2) ɵɵqueryAdvance();
  };

  const checkboxMetadata = (CustomCheckboxComponent as unknown as { ɵcmp: AngularBindingMetadata })
    .ɵcmp;
  checkboxMetadataSnapshot = {
    inputs: checkboxMetadata.inputs,
    declaredInputs: checkboxMetadata.declaredInputs,
    outputs: checkboxMetadata.outputs,
  };
  checkboxMetadata.inputs = {
    ...checkboxMetadata.inputs,
    checked: ['checked', 1, null],
    indeterminate: ['indeterminate', 1, null],
    label: ['label', 1, null],
    disabled: ['disabled', 1, null],
    size: ['size', 1, null],
    color: ['color', 1, null],
    ariaLabel: ['ariaLabel', 1, null],
    id: ['id', 1, null],
  };
  checkboxMetadata.declaredInputs = {
    ...checkboxMetadata.declaredInputs,
    checked: 'checked',
    indeterminate: 'indeterminate',
    label: 'label',
    disabled: 'disabled',
    size: 'size',
    color: 'color',
    ariaLabel: 'ariaLabel',
    id: 'id',
  };
  checkboxMetadata.outputs = {
    ...checkboxMetadata.outputs,
    checkedChange: 'checked',
  };

  const textFieldMetadata = (TextFieldComponent as unknown as { ɵcmp: AngularBindingMetadata })
    .ɵcmp;
  textFieldMetadataSnapshot = {
    inputs: textFieldMetadata.inputs,
    declaredInputs: textFieldMetadata.declaredInputs,
    outputs: textFieldMetadata.outputs,
  };
  textFieldMetadata.inputs = {
    ...textFieldMetadata.inputs,
    label: ['label', 1, null],
    labelHidden: ['labelHidden', 1, null],
    placeholder: ['placeholder', 1, null],
    type: ['type', 1, null],
    multiline: ['multiline', 1, null],
    monospaced: ['monospaced', 1, null],
    error: ['error', 1, null],
    helpText: ['helpText', 1, null],
    disabled: ['disabled', 1, null],
    id: ['id', 1, null],
    ariaLabel: ['ariaLabel', 1, null],
    autocomplete: ['autocomplete', 1, null],
    required: ['required', 1, null],
    maxLength: ['maxLength', 1, null],
  };
  textFieldMetadata.declaredInputs = {
    ...textFieldMetadata.declaredInputs,
    label: 'label',
    labelHidden: 'labelHidden',
    placeholder: 'placeholder',
    type: 'type',
    multiline: 'multiline',
    monospaced: 'monospaced',
    error: 'error',
    helpText: 'helpText',
    disabled: 'disabled',
    id: 'id',
    ariaLabel: 'ariaLabel',
    autocomplete: 'autocomplete',
    required: 'required',
    maxLength: 'maxLength',
  };

  const numberMetadata = (NumberInputComponent as unknown as { ɵcmp: AngularBindingMetadata }).ɵcmp;
  numberInputMetadataSnapshot = {
    inputs: numberMetadata.inputs,
    declaredInputs: numberMetadata.declaredInputs,
    outputs: numberMetadata.outputs,
  };
  numberMetadata.inputs = {
    ...numberMetadata.inputs,
    value: ['value', 1, null],
    placeholder: ['placeholder', 1, null],
    step: ['step', 1, null],
    min: ['min', 1, null],
    max: ['max', 1, null],
    unit: ['unit', 1, null],
    id: ['id', 1, null],
    ariaLabel: ['ariaLabel', 1, null],
    ariaDescribedby: ['ariaDescribedby', 1, null],
    asCurrency: ['asCurrency', 1, null],
    disabled: ['disabled', 1, null],
    showStepper: ['showStepper', 1, null],
  };
  numberMetadata.declaredInputs = {
    ...numberMetadata.declaredInputs,
    value: 'value',
    placeholder: 'placeholder',
    step: 'step',
    min: 'min',
    max: 'max',
    unit: 'unit',
    id: 'id',
    ariaLabel: 'ariaLabel',
    ariaDescribedby: 'ariaDescribedby',
    asCurrency: 'asCurrency',
    disabled: 'disabled',
    showStepper: 'showStepper',
  };
  numberMetadata.outputs = {
    ...numberMetadata.outputs,
    valueChange: 'value',
  };
});

afterAll(() => {
  if (selectMetadataSnapshot) {
    const metadata = (
      CustomSelectComponent as unknown as {
        ɵcmp: AngularBindingMetadata & { viewQuery: AngularViewQuery | null };
      }
    ).ɵcmp;
    metadata.inputs = selectMetadataSnapshot.inputs;
    metadata.declaredInputs = selectMetadataSnapshot.declaredInputs;
    metadata.outputs = selectMetadataSnapshot.outputs;
    metadata.viewQuery = selectViewQuerySnapshot ?? null;
    selectMetadataSnapshot = null;
    selectViewQuerySnapshot = undefined;
  }
  if (checkboxMetadataSnapshot) {
    const metadata = (
      CustomCheckboxComponent as unknown as {
        ɵcmp: AngularBindingMetadata;
      }
    ).ɵcmp;
    metadata.inputs = checkboxMetadataSnapshot.inputs;
    metadata.declaredInputs = checkboxMetadataSnapshot.declaredInputs;
    metadata.outputs = checkboxMetadataSnapshot.outputs;
    checkboxMetadataSnapshot = null;
  }
  if (textFieldMetadataSnapshot) {
    const metadata = (TextFieldComponent as unknown as { ɵcmp: AngularBindingMetadata }).ɵcmp;
    metadata.inputs = textFieldMetadataSnapshot.inputs;
    metadata.declaredInputs = textFieldMetadataSnapshot.declaredInputs;
    metadata.outputs = textFieldMetadataSnapshot.outputs;
    textFieldMetadataSnapshot = null;
  }
  if (numberInputMetadataSnapshot) {
    const metadata = (NumberInputComponent as unknown as { ɵcmp: AngularBindingMetadata }).ɵcmp;
    metadata.inputs = numberInputMetadataSnapshot.inputs;
    metadata.declaredInputs = numberInputMetadataSnapshot.declaredInputs;
    metadata.outputs = numberInputMetadataSnapshot.outputs;
    numberInputMetadataSnapshot = null;
  }
});

beforeEach(() => vi.useFakeTimers());

afterEach(() => {
  TestBed.resetTestingModule();
  vi.clearAllTimers();
  vi.useRealTimers();
});

function workspace(id: string, name: string): Workspace {
  return {
    id,
    name,
    currency: 'EUR',
    tax_mode: 'diff_25a',
    min_roi_percent: 20,
    min_profit_amount: 10,
    created_at: '2026-08-25T10:00:00.000Z',
  };
}

function paymentConfig(key: string): PaymentGatewayConfig {
  return {
    stripeEnabled: true,
    stripePublishableKey: key,
    paypalEnabled: true,
    paypalClientId: '',
    paypalEmail: 'shop@flipbase.de',
    bankTransferEnabled: true,
    bankIban: 'DE001234',
    bankBic: 'FLIPDEFF',
    bankAccountHolder: 'Flipbase GmbH',
    cashOnPickupEnabled: false,
  };
}

function carrierConfig(secret: string): CarrierConfig {
  return {
    dhlEnabled: true,
    dhlEkp: '1234567890',
    dhlApiKey: secret,
    hermesEnabled: true,
    hermesClientId: 'hermes-account',
    hermesApiKey: `${secret}-hermes`,
    senderName: 'Ada Lovelace',
    senderCompany: 'Analytical Engines GmbH',
    senderStreet: 'Testweg',
    senderHouseNumber: '42a',
    senderPostalCode: '10115',
    senderCity: 'Berlin',
    senderCountry: 'Deutschland',
    senderEmail: 'ada@example.com',
    senderPhone: '+49 30 123456',
  };
}

function webhookConfig(secret: string): WebhookConfig {
  return {
    discordEnabled: true,
    discordWebhookUrl: `https://discord.example/${secret}`,
    telegramEnabled: true,
    telegramBotToken: secret,
    telegramChatId: 'chat-1',
    customWebhookEnabled: true,
    customWebhookUrl: `https://hooks.example/${secret}`,
    notifyOnSale: true,
    notifyOnPurchase: false,
    notifyOnLowMargin: true,
    soundEnabled: true,
  };
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function renderedButton<T>(fixture: ComponentFixture<T>, label: string): HTMLButtonElement {
  const normalize = (text: string | null) => text?.replace(/\s+/g, ' ').trim() ?? '';
  const button = Array.from(
    (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('button'),
  ).find((candidate) => normalize(candidate.textContent) === label);
  expect(button, `Gerenderter Button „${label}“ fehlt.`).toBeDefined();
  return button as HTMLButtonElement;
}

function renderedSubmitButton<T>(
  fixture: ComponentFixture<T>,
  formHeadingId: string,
): HTMLButtonElement {
  const button = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
    `form[aria-labelledby="${formHeadingId}"] button[type="submit"]`,
  );
  expect(button, `Gerenderter Submit für „${formHeadingId}“ fehlt.`).not.toBeNull();
  return button as HTMLButtonElement;
}

function renderedInput<T>(fixture: ComponentFixture<T>, formControlName: string): HTMLInputElement {
  const input = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>(
    `input[formcontrolname="${formControlName}"], app-text-field[formcontrolname="${formControlName}"] input, app-number-input[formcontrolname="${formControlName}"] input`,
  );
  expect(input, `Gerendertes Feld „${formControlName}“ fehlt.`).not.toBeNull();
  return input as HTMLInputElement;
}

function renderedCheckbox<T>(fixture: ComponentFixture<T>, ariaLabel: string): HTMLButtonElement {
  const checkbox = Array.from(
    (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>(
      'button[role="checkbox"]',
    ),
  ).find((candidate) => candidate.getAttribute('aria-label') === ariaLabel);
  expect(checkbox, `Gerenderter Schalter „${ariaLabel}“ fehlt.`).toBeDefined();
  return checkbox as HTMLButtonElement;
}

async function selectRenderedOption<T>(
  fixture: ComponentFixture<T>,
  ariaLabel: string,
  optionLabel: string,
): Promise<void> {
  const normalize = (text: string | null) => text?.replace(/\s+/g, ' ').trim() ?? '';
  const trigger = Array.from(
    (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>(
      'button[role="combobox"]',
    ),
  ).find((candidate) => candidate.getAttribute('aria-label') === ariaLabel);
  expect(trigger, `Gerenderte Auswahl „${ariaLabel}“ fehlt.`).toBeDefined();

  (trigger as HTMLButtonElement).click();
  fixture.detectChanges();
  const option = Array.from(
    (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>(
      'button[role="option"]',
    ),
  ).find((candidate) => normalize(candidate.textContent) === optionLabel);
  expect(option, `Gerenderte Option „${optionLabel}“ fehlt.`).toBeDefined();

  (option as HTMLButtonElement).click();
  await flushAsyncAction(fixture);
}

function enterValue(input: HTMLInputElement, value: string): void {
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function flushEffects<T>(fixture: ComponentFixture<T>): void {
  TestBed.flushEffects();
  fixture.detectChanges();
}

async function flushAsyncAction<T>(fixture: ComponentFixture<T>): Promise<void> {
  for (let turn = 0; turn < 6; turn += 1) await Promise.resolve();
  flushEffects(fixture);
}

function expectOnlyToast(
  toast: ToastService,
  type: ToastType,
  title: string,
  description?: string,
): void {
  expect(toast.toasts()).toHaveLength(1);
  expect(toast.toasts()[0]).toMatchObject({
    type,
    title,
    description,
    persistent: type === 'error',
  });
}

async function renderAccount(
  options: {
    readonly updateResult?: {
      readonly error: Error | null;
      readonly reportedBySyncStatus: boolean;
    };
    readonly confirmed?: boolean;
    readonly signOut?: () => Promise<void>;
  } = {},
) {
  const profile = signal<UserProfile | null>({
    id: 'user-1',
    email: 'ada@flipbase.de',
    full_name: 'Ada Lovelace',
    avatar_url: null,
  });
  const auth = {
    profile,
    currentUser: signal({ email: 'ada@flipbase.de' }),
    aktualisiereProfil: vi.fn(async () =>
      Promise.resolve(
        options.updateResult ?? {
          error: null,
          reportedBySyncStatus: false,
        },
      ),
    ),
    abmeldenUeberall: vi.fn(options.signOut ?? (async () => Promise.resolve())),
  };
  const dialog = {
    frage: vi.fn(async () => Promise.resolve(options.confirmed ?? false)),
  };
  await TestBed.configureTestingModule({
    imports: [AccountSettingsComponent],
    providers: [
      ToastService,
      { provide: AuthService, useValue: auth },
      { provide: ConfirmDialogService, useValue: dialog },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(AccountSettingsComponent);
  flushEffects(fixture);
  return { fixture, auth, dialog, toast: TestBed.inject(ToastService) };
}

async function renderWorkspace(
  options: {
    readonly updateError?: Error | null;
    readonly createError?: Error | null;
    readonly deleteResult?: {
      readonly success: boolean;
      readonly reportedBySyncStatus: boolean;
      readonly retentionBlocked?: boolean;
    };
    readonly archiveError?: Error | null;
    readonly restoreError?: Error | null;
    readonly confirmations?: readonly boolean[];
    readonly workspaceBArchived?: boolean;
  } = {},
) {
  const workspaceA = workspace('workspace-a', 'Workspace A');
  const workspaceB = {
    ...workspace('workspace-b', 'Workspace B'),
    archived_at: options.workspaceBArchived ? '2026-09-04T12:00:00.000Z' : null,
  };
  const currentWorkspace = signal<Workspace | null>(workspaceA);
  const workspaceService = {
    currentWorkspace,
    workspaces: signal<Workspace[]>([workspaceA, workspaceB]),
    updateWorkspaceSettings: vi.fn(async () => ({ error: options.updateError ?? null })),
    createWorkspace: vi.fn(async () => ({ error: options.createError ?? null })),
    switchWorkspace: vi.fn(),
    deleteWorkspace: vi.fn(() =>
      Promise.resolve(options.deleteResult ?? { success: true, reportedBySyncStatus: false }),
    ),
    archiveWorkspace: vi.fn(() => Promise.resolve({ error: options.archiveError ?? null })),
    restoreWorkspace: vi.fn(() => Promise.resolve({ error: options.restoreError ?? null })),
  };
  const router = { navigate: vi.fn(async () => true) };
  const confirmations = [...(options.confirmations ?? [true, true])];
  const dialog = {
    frage: vi.fn(() => Promise.resolve(confirmations.shift() ?? true)),
  };
  await TestBed.configureTestingModule({
    imports: [WorkspaceSettingsComponent],
    providers: [
      ToastService,
      { provide: WorkspaceService, useValue: workspaceService },
      { provide: Router, useValue: router },
      { provide: ConfirmDialogService, useValue: dialog },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(WorkspaceSettingsComponent);
  flushEffects(fixture);
  return {
    fixture,
    workspaceService,
    currentWorkspace,
    router,
    dialog,
    toast: TestBed.inject(ToastService),
  };
}

function member(id: string, role: WorkspaceRole = 'member'): WorkspaceMember {
  return {
    id,
    workspace_id: 'workspace-a',
    user_id: `user-${id}`,
    email: `${id}@flipbase.de`,
    role,
  };
}

function invite(id: string): WorkspaceInvite {
  return {
    id,
    workspace_id: 'workspace-a',
    email: `${id}@flipbase.de`,
    role: 'accountant',
    status: 'pending',
    created_at: '2026-08-25T10:00:00.000Z',
  };
}

async function renderTeam(
  options: {
    readonly inviteError?: Error | null;
    readonly roleError?: Error | null;
    readonly removeError?: Error | null;
    readonly cancelError?: Error | null;
    readonly confirmed?: boolean;
  } = {},
) {
  const memberService = {
    members: signal<WorkspaceMember[]>([member('member-1')]),
    invites: signal<WorkspaceInvite[]>([invite('invite-1')]),
    getRoleBadge: vi.fn((role: WorkspaceRole) => ({
      label: role === 'accountant' ? 'Steuerberater / DATEV' : 'Sourcing & Einkauf',
      description:
        role === 'accountant' ? 'Nur-Lesen auf Finanzen' : 'Einkauf und Inventar bearbeiten',
    })),
    inviteMember: vi.fn(async () => ({ error: options.inviteError ?? null })),
    updateMemberRole: vi.fn(async () => ({ error: options.roleError ?? null })),
    removeMember: vi.fn(async () => ({ error: options.removeError ?? null })),
    cancelInvite: vi.fn(async () => ({ error: options.cancelError ?? null })),
  };
  const dialog = {
    frage: vi.fn(async () => Promise.resolve(options.confirmed ?? true)),
  };
  await TestBed.configureTestingModule({
    imports: [TeamSettingsComponent],
    providers: [
      ToastService,
      { provide: WorkspaceMemberService, useValue: memberService },
      { provide: ConfirmDialogService, useValue: dialog },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(TeamSettingsComponent);
  fixture.detectChanges();
  return { fixture, memberService, dialog, toast: TestBed.inject(ToastService) };
}

describe('Kontoeinstellungen – echte Angular-Fixture', () => {
  it('bindet den gerenderten Primärbutton an das Profil-Payload und bestätigt den Erfolg', async () => {
    const { fixture, auth, toast } = await renderAccount();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Mein Konto');
    fixture.componentInstance.profileForm.controls.fullName.setValue('Grace Hopper');
    fixture.detectChanges();

    renderedButton(fixture, 'Namen speichern').click();
    await flushAsyncAction(fixture);

    expect(auth.aktualisiereProfil).toHaveBeenCalledOnce();
    expect(auth.aktualisiereProfil).toHaveBeenCalledWith('Grace Hopper');
    expectOnlyToast(toast, 'success', 'Profil wurde gespeichert.');
  });

  it('deaktiviert die gerenderte Profilaktion bei einem ungültigen Namen', async () => {
    const { fixture, auth, toast } = await renderAccount();
    fixture.componentInstance.profileForm.controls.fullName.setValue('');
    fixture.detectChanges();
    const saveButton = renderedButton(fixture, 'Namen speichern');

    expect(saveButton.disabled).toBe(true);
    saveButton.click();
    await flushAsyncAction(fixture);

    expect(auth.aktualisiereProfil).not.toHaveBeenCalled();
    expect(toast.toasts()).toEqual([]);
  });

  it('zeigt einen lokal behandelten Profilfehler persistent an und beendet den Ladezustand', async () => {
    const { fixture, toast } = await renderAccount({
      updateResult: { error: new Error('Nicht angemeldet'), reportedBySyncStatus: false },
    });

    renderedButton(fixture, 'Namen speichern').click();
    await flushAsyncAction(fixture);

    expect(fixture.componentInstance.isSavingProfile()).toBe(false);
    expectOnlyToast(toast, 'error', 'Profil konnte nicht gespeichert werden.', 'Nicht angemeldet');
  });

  it('dupliziert einen bereits zentral gemeldeten Profilfehler nicht', async () => {
    const { fixture, toast } = await renderAccount({
      updateResult: { error: new Error('Sync-Fehler'), reportedBySyncStatus: true },
    });

    renderedButton(fixture, 'Namen speichern').click();
    await flushAsyncAction(fixture);

    expect(fixture.componentInstance.isSavingProfile()).toBe(false);
    expect(toast.toasts()).toEqual([]);
  });

  it('bricht die globale Abmeldung nach der gerenderten Bestätigungsaktion ab', async () => {
    const { fixture, auth, dialog } = await renderAccount({ confirmed: false });

    renderedButton(fixture, 'Von allen Geräten abmelden').click();
    await flushAsyncAction(fixture);

    expect(dialog.frage).toHaveBeenCalledWith({
      titel: 'Von allen Geräten abmelden?',
      text: 'Alle offenen Sitzungen werden beendet – auch auf deinem Handy und auf fremden Rechnern. Du musst dich überall neu anmelden.',
      bestaetigenText: 'Überall abmelden',
      gefahr: true,
    });
    expect(auth.abmeldenUeberall).not.toHaveBeenCalled();
  });

  it('meldet nach Bestätigung überall ab und hält den Button nur währenddessen gesperrt', async () => {
    const pendingSignOut = deferred<void>();
    const { fixture, auth } = await renderAccount({
      confirmed: true,
      signOut: () => pendingSignOut.promise,
    });

    renderedButton(fixture, 'Von allen Geräten abmelden').click();
    await flushAsyncAction(fixture);

    expect(auth.abmeldenUeberall).toHaveBeenCalledOnce();
    expect(fixture.componentInstance.isSigningOutEverywhere()).toBe(true);
    expect(renderedButton(fixture, 'Melde ab...').disabled).toBe(true);

    pendingSignOut.resolve(undefined);
    await flushAsyncAction(fixture);
    expect(fixture.componentInstance.isSigningOutEverywhere()).toBe(false);
  });
});

describe('Workspace-Einstellungen – echte Angular-Fixture', () => {
  it('bindet den gerenderten Primärbutton an das Workspace-Payload', async () => {
    const { fixture, workspaceService, toast } = await renderWorkspace();
    fixture.componentInstance.settingsForm.patchValue({
      workspaceName: 'Neuer Name',
      currency: 'USD',
      taxMode: 'regular_19',
      minRoiPercent: 27,
      minProfitAmount: 18,
    });
    fixture.detectChanges();

    renderedButton(fixture, 'Einstellungen speichern').click();
    await flushAsyncAction(fixture);

    expect(workspaceService.updateWorkspaceSettings).toHaveBeenCalledWith('workspace-a', {
      name: 'Neuer Name',
      min_roi_percent: 27,
      min_profit_amount: 18,
    });
    expectOnlyToast(toast, 'success', 'Einstellungen wurden gespeichert.');
  });

  it('blockiert ein ungültiges Workspace-Formular im gerenderten Button', async () => {
    const { fixture, workspaceService, toast } = await renderWorkspace();
    fixture.componentInstance.settingsForm.controls.workspaceName.setValue('');
    fixture.detectChanges();
    const saveButton = renderedButton(fixture, 'Einstellungen speichern');

    expect(saveButton.disabled).toBe(true);
    saveButton.click();
    await flushAsyncAction(fixture);

    expect(workspaceService.updateWorkspaceSettings).not.toHaveBeenCalled();
    expect(toast.toasts()).toEqual([]);
  });

  it('bestätigt einen fehlgeschlagenen Workspace-Update nicht und beendet den Ladezustand', async () => {
    const { fixture, workspaceService, toast } = await renderWorkspace({
      updateError: new Error('Sync-Fehler'),
    });

    renderedButton(fixture, 'Einstellungen speichern').click();
    await flushAsyncAction(fixture);

    expect(workspaceService.updateWorkspaceSettings).toHaveBeenCalledOnce();
    expect(fixture.componentInstance.isSaving()).toBe(false);
    expect(toast.toasts()).toEqual([]);
  });

  it('ignoriert leere Neuanlagen und behält den Namen nach einem Fehler', async () => {
    const { fixture, workspaceService, toast } = await renderWorkspace({
      createError: new Error('Sync-Fehler'),
    });
    const createButton = renderedButton(fixture, 'Erstellen');
    expect(createButton.disabled).toBe(true);
    createButton.click();
    await flushAsyncAction(fixture);
    expect(workspaceService.createWorkspace).not.toHaveBeenCalled();

    fixture.componentInstance.newWorkspaceName.setValue('   ');
    fixture.detectChanges();
    renderedButton(fixture, 'Erstellen').click();
    await flushAsyncAction(fixture);
    expect(workspaceService.createWorkspace).not.toHaveBeenCalled();

    fixture.componentInstance.newWorkspaceName.setValue(' Zweiter Workspace ');
    fixture.detectChanges();
    renderedButton(fixture, 'Erstellen').click();
    await flushAsyncAction(fixture);

    expect(workspaceService.createWorkspace).toHaveBeenCalledWith('Zweiter Workspace');
    expect(fixture.componentInstance.newWorkspaceName.value).toBe(' Zweiter Workspace ');
    expect(fixture.componentInstance.isCreatingWorkspace()).toBe(false);
    expect(toast.toasts()).toEqual([]);
  });

  it('erstellt über den gerenderten Button und leert das Feld erst nach Erfolg', async () => {
    const { fixture, workspaceService, toast } = await renderWorkspace();
    fixture.componentInstance.newWorkspaceName.setValue(' Zweiter Workspace ');
    fixture.detectChanges();

    renderedButton(fixture, 'Erstellen').click();
    await flushAsyncAction(fixture);

    expect(workspaceService.createWorkspace).toHaveBeenCalledWith('Zweiter Workspace');
    expect(fixture.componentInstance.newWorkspaceName.value).toBe('');
    expectOnlyToast(toast, 'success', 'Workspace wurde erstellt.');
  });

  it('aktiviert den gewählten Workspace und löscht einen leeren Workspace direkt', async () => {
    const { fixture, workspaceService, dialog, router, toast } = await renderWorkspace();

    renderedButton(fixture, 'Aktivieren').click();
    await flushAsyncAction(fixture);
    const deleteButton = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      '[aria-label="Workspace B löschen"]',
    );
    expect(deleteButton).not.toBeNull();
    deleteButton?.click();
    await flushAsyncAction(fixture);

    expect(workspaceService.switchWorkspace).toHaveBeenCalledWith('workspace-b');
    expect(dialog.frage).toHaveBeenCalledWith(
      expect.objectContaining({
        titel: 'Workspace löschen?',
        bestaetigenText: 'Workspace löschen',
        gefahr: true,
      }),
    );
    expect(workspaceService.deleteWorkspace).toHaveBeenCalledWith('workspace-b');
    expect(router.navigate).not.toHaveBeenCalled();
    expectOnlyToast(toast, 'success', 'Workspace wurde gelöscht.');
  });

  it('bietet nach blockierter Löschung direkt die Archivierung an statt umzuleiten', async () => {
    const { fixture, workspaceService, dialog, router, toast } = await renderWorkspace({
      deleteResult: {
        success: false,
        reportedBySyncStatus: false,
        retentionBlocked: true,
      },
      confirmations: [true, true],
    });

    const deleteButton = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      '[aria-label="Workspace B löschen"]',
    );
    expect(deleteButton).not.toBeNull();
    deleteButton?.click();
    await flushAsyncAction(fixture);

    expect(dialog.frage).toHaveBeenCalledTimes(2);
    expect(dialog.frage).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        titel: 'Workspace kann nicht gelöscht werden',
        bestaetigenText: 'Workspace archivieren',
      }),
    );

    await flushAsyncAction(fixture);
    expect(workspaceService.archiveWorkspace).toHaveBeenCalledWith('workspace-b');
    expect(router.navigate).not.toHaveBeenCalled();
    expectOnlyToast(toast, 'success', 'Workspace wurde archiviert.');
  });

  it('stellt einen archivierten Workspace direkt in der Workspace-Verwaltung wieder her', async () => {
    const { fixture, workspaceService, toast } = await renderWorkspace({
      workspaceBArchived: true,
    });

    renderedButton(fixture, 'Wiederherstellen').click();
    await flushAsyncAction(fixture);

    expect(workspaceService.restoreWorkspace).toHaveBeenCalledWith('workspace-b');
    expectOnlyToast(toast, 'success', 'Workspace wurde wiederhergestellt.');
  });
});

describe('Team-Einstellungen – echte Angular-Fixture', () => {
  it('öffnet und schließt den Einladungsdialog über seine gerenderten Aktionen', async () => {
    const { fixture } = await renderTeam();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'Steuerberater / DATEV · Nur-Lesen auf Finanzen',
    );

    renderedButton(fixture, 'Mitglied einladen').click();
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('[role="dialog"]')).not.toBeNull();

    renderedButton(fixture, 'Abbrechen').click();
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('[role="dialog"]')).toBeNull();
  });

  it('blockiert die ungültige Einladung am gerenderten Primärbutton', async () => {
    const { fixture, memberService, toast } = await renderTeam();
    renderedButton(fixture, 'Mitglied einladen').click();
    fixture.detectChanges();
    fixture.componentInstance.inviteForm.controls.email.setValue('keine-mail');
    fixture.detectChanges();
    const submitButton = renderedButton(fixture, 'Einladung senden');

    expect(submitButton.disabled).toBe(true);
    submitButton.click();
    await flushAsyncAction(fixture);

    expect(memberService.inviteMember).not.toHaveBeenCalled();
    expect(toast.toasts()).toEqual([]);
  });

  it('sendet das Einladungs-Payload, bestätigt Erfolg und schließt den Dialog', async () => {
    const { fixture, memberService, toast } = await renderTeam();
    renderedButton(fixture, 'Mitglied einladen').click();
    fixture.componentInstance.inviteForm.setValue({
      email: 'team@flipbase.de',
      role: 'fulfillment',
    });
    fixture.detectChanges();

    renderedButton(fixture, 'Einladung senden').click();
    await flushAsyncAction(fixture);

    expect(memberService.inviteMember).toHaveBeenCalledWith('team@flipbase.de', 'fulfillment');
    expect((fixture.nativeElement as HTMLElement).querySelector('[role="dialog"]')).toBeNull();
    expectOnlyToast(toast, 'success', 'Einladung wurde versendet.');
  });

  it('hält den Dialog bei einem Einladungsfehler offen und rendert die Ursache', async () => {
    const { fixture, toast } = await renderTeam({
      inviteError: new Error('Einladung nicht möglich'),
    });
    renderedButton(fixture, 'Mitglied einladen').click();
    fixture.componentInstance.inviteForm.setValue({
      email: 'team@flipbase.de',
      role: 'member',
    });
    fixture.detectChanges();

    renderedButton(fixture, 'Einladung senden').click();
    await flushAsyncAction(fixture);

    const alert = (fixture.nativeElement as HTMLElement).querySelector('[role="alert"]');
    expect(alert?.textContent).toContain('Einladung nicht möglich');
    expect((fixture.nativeElement as HTMLElement).querySelector('[role="dialog"]')).not.toBeNull();
    expect(fixture.componentInstance.isSendingInvite()).toBe(false);
    expect(toast.toasts()).toEqual([]);
  });

  it('bindet Rollenwechsel, bestätigtes Entfernen und Widerruf an die gerenderten Zeilen', async () => {
    const { fixture, memberService, dialog, toast } = await renderTeam({ confirmed: true });
    await selectRenderedOption(fixture, 'Rolle von member-1@flipbase.de', 'Administrator');

    const removeButton = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      '[aria-label="member-1@flipbase.de entfernen"]',
    );
    expect(removeButton).not.toBeNull();
    removeButton?.click();
    await flushAsyncAction(fixture);
    renderedButton(fixture, 'Widerrufen').click();
    await flushAsyncAction(fixture);

    expect(memberService.updateMemberRole).toHaveBeenCalledWith('member-1', 'admin');
    expect(dialog.frage).toHaveBeenCalledWith({
      titel: 'Mitglied entfernen?',
      text: 'Die Person verliert damit den Zugriff auf diesen Workspace.',
      bestaetigenText: 'Entfernen',
      gefahr: true,
    });
    expect(memberService.removeMember).toHaveBeenCalledWith('member-1');
    expect(memberService.cancelInvite).toHaveBeenCalledWith('invite-1');
    expect(toast.toasts().map(({ title }) => title)).toEqual([
      'Rolle wurde geändert.',
      'Mitglied wurde entfernt.',
      'Einladung wurde zurückgezogen.',
    ]);
  });

  it('entfernt ohne Bestätigung nicht und bestätigt fehlgeschlagene Teamaktionen nicht', async () => {
    const { fixture, memberService, toast } = await renderTeam({
      roleError: new Error('Rollenfehler'),
      removeError: new Error('Entfernfehler'),
      cancelError: new Error('Widerruffehler'),
      confirmed: false,
    });

    await selectRenderedOption(fixture, 'Rolle von member-1@flipbase.de', 'Administrator');
    await fixture.componentInstance.onRemoveMember('member-1');
    await fixture.componentInstance.onCancelInvite('invite-1');

    expect(memberService.updateMemberRole).toHaveBeenCalledWith('member-1', 'admin');
    expect(memberService.removeMember).not.toHaveBeenCalled();
    expect(memberService.cancelInvite).toHaveBeenCalledWith('invite-1');
    expect(toast.toasts()).toEqual([]);
  });

  it('bestätigt einen fehlgeschlagenen, zuvor bestätigten Entfernvorgang nicht', async () => {
    const { fixture, memberService, toast } = await renderTeam({
      removeError: new Error('Sync-Fehler'),
      confirmed: true,
    });

    await fixture.componentInstance.onRemoveMember('member-1');

    expect(memberService.removeMember).toHaveBeenCalledWith('member-1');
    expect(toast.toasts()).toEqual([]);
  });
});

async function renderNotifications(
  options: {
    readonly updateResult?: MutationResult;
    readonly webhookTestResult?: { readonly success: boolean; readonly message: string };
    readonly permission?: 'granted' | 'denied' | 'default' | 'unsupported';
    readonly permissionResult?: boolean;
    readonly pushTestResult?: boolean;
    readonly centralThrow?: boolean;
  } = {},
) {
  const currentWorkspace = signal<Workspace | null>(workspace('workspace-a', 'Workspace A'));
  const config = signal<WebhookConfig>(webhookConfig('telegram-a-secret'));
  const loadedWorkspaceId = signal<string | null>('workspace-a');
  const updateConfig = vi.fn(
    async (): Promise<MutationResult> =>
      options.updateResult ?? { data: {}, error: null, reportedBySyncStatus: false },
  );
  const sendTestNotification = vi.fn(
    async (): Promise<{ success: boolean; message: string }> =>
      options.webhookTestResult ?? { success: true, message: 'Webhook erreicht.' },
  );
  const webhookService = {
    config,
    loadedWorkspaceId,
    updateConfig,
    sendTestNotification,
  };
  const settings = signal<WebPushSettings>({
    enabled: true,
    notifyOnShopOrder: true,
    notifyOnFulfillment: false,
    notifyOnMarginAlert: true,
    soundEnabled: false,
  });
  const webPushService = {
    permission: signal(options.permission ?? 'default'),
    settings,
    requestPermission: vi.fn(async () => options.permissionResult ?? true),
    sendTestNotification: vi.fn(async () => options.pushTestResult ?? true),
    updateSettings: vi.fn(),
  };
  const syncStatus = {
    istZentralGemeldet: vi.fn(() => options.centralThrow ?? false),
  };
  await TestBed.configureTestingModule({
    imports: [NotificationSettingsComponent],
    providers: [
      ToastService,
      { provide: WorkspaceService, useValue: { currentWorkspace } },
      { provide: WebhookService, useValue: webhookService },
      { provide: WebPushService, useValue: webPushService },
      { provide: SyncStatusService, useValue: syncStatus },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(NotificationSettingsComponent);
  flushEffects(fixture);
  return {
    fixture,
    currentWorkspace,
    config,
    loadedWorkspaceId,
    webhookService,
    webPushService,
    syncStatus,
    toast: TestBed.inject(ToastService),
  };
}

describe('Benachrichtigungseinstellungen – echte Angular-Fixture', () => {
  it('leert A-Geheimnisse beim Wechsel, ignoriert verspätetes A und patcht erst geladenes B', async () => {
    const { fixture, currentWorkspace, config, loadedWorkspaceId } = await renderNotifications();
    expect(fixture.componentInstance.webhookForm.controls.telegramBotToken.value).toBe(
      'telegram-a-secret',
    );
    expect(fixture.componentInstance.isLoadingWorkspaceConfig()).toBe(false);

    currentWorkspace.set(workspace('workspace-b', 'Workspace B'));
    loadedWorkspaceId.set(null);
    flushEffects(fixture);

    expect(fixture.componentInstance.webhookForm.controls.discordWebhookUrl.value).toBe('');
    expect(fixture.componentInstance.webhookForm.controls.telegramBotToken.value).toBe('');
    expect(fixture.componentInstance.webhookForm.controls.customWebhookUrl.value).toBe('');
    expect(fixture.componentInstance.isLoadingWorkspaceConfig()).toBe(true);
    expect(renderedButton(fixture, 'Webhook-Einstellungen speichern').disabled).toBe(true);

    config.set(webhookConfig('late-a-secret'));
    loadedWorkspaceId.set('workspace-a');
    flushEffects(fixture);
    expect(fixture.componentInstance.webhookForm.controls.telegramBotToken.value).toBe('');

    config.set(webhookConfig('telegram-b-secret'));
    loadedWorkspaceId.set('workspace-b');
    flushEffects(fixture);

    expect(fixture.componentInstance.webhookForm.controls.telegramBotToken.value).toBe(
      'telegram-b-secret',
    );
    expect(fixture.componentInstance.webhookForm.controls.discordWebhookUrl.value).toBe(
      'https://discord.example/telegram-b-secret',
    );
    expect(fixture.componentInstance.isLoadingWorkspaceConfig()).toBe(false);
  });

  it('bindet den gerenderten Primärbutton an das vollständige getrimmte Webhook-Payload', async () => {
    const { fixture, webhookService, toast } = await renderNotifications();
    fixture.componentInstance.webhookForm.setValue({
      discordEnabled: true,
      discordWebhookUrl: ' https://discord.example/new ',
      telegramEnabled: false,
      telegramBotToken: ' telegram-secret ',
      telegramChatId: ' chat-42 ',
      customWebhookEnabled: true,
      customWebhookUrl: ' https://hooks.example/new ',
      notifyOnSale: false,
      notifyOnPurchase: true,
      soundEnabled: false,
    });
    fixture.detectChanges();

    renderedButton(fixture, 'Webhook-Einstellungen speichern').click();
    await flushAsyncAction(fixture);

    expect(webhookService.updateConfig).toHaveBeenCalledOnce();
    expect(webhookService.updateConfig).toHaveBeenCalledWith({
      discordEnabled: true,
      discordWebhookUrl: 'https://discord.example/new',
      telegramEnabled: false,
      telegramBotToken: 'telegram-secret',
      telegramChatId: 'chat-42',
      customWebhookEnabled: true,
      customWebhookUrl: 'https://hooks.example/new',
      notifyOnSale: false,
      notifyOnPurchase: true,
      soundEnabled: false,
    });
    expectOnlyToast(toast, 'success', 'Webhook-Konfiguration wurde gespeichert.');
  });

  it('meldet eine unbestätigte Webhook-Antwort mit der eindeutigen Fallback-Ursache', async () => {
    const { fixture, toast } = await renderNotifications({
      updateResult: { data: null, error: null, reportedBySyncStatus: false },
    });

    renderedButton(fixture, 'Webhook-Einstellungen speichern').click();
    await flushAsyncAction(fixture);

    expectOnlyToast(
      toast,
      'error',
      'Webhook-Konfiguration konnte nicht gespeichert werden.',
      'Keine bestätigte Webhook-Konfiguration.',
    );
    expect(fixture.componentInstance.isSavingWebhookConfig()).toBe(false);
  });

  it('zeigt einen lokalen Webhook-Fehler persistent an', async () => {
    const { fixture, toast } = await renderNotifications({
      updateResult: {
        data: null,
        error: new Error('Webhook offline'),
        reportedBySyncStatus: false,
      },
    });

    renderedButton(fixture, 'Webhook-Einstellungen speichern').click();
    await flushAsyncAction(fixture);

    expectOnlyToast(
      toast,
      'error',
      'Webhook-Konfiguration konnte nicht gespeichert werden.',
      'Webhook offline',
    );
  });

  it('dupliziert einen vom SyncStatus gemeldeten Webhook-Fehler nicht', async () => {
    const { fixture, toast } = await renderNotifications({
      updateResult: {
        data: null,
        error: new Error('Sync-Fehler'),
        reportedBySyncStatus: true,
      },
    });

    renderedButton(fixture, 'Webhook-Einstellungen speichern').click();
    await flushAsyncAction(fixture);

    expect(toast.toasts()).toEqual([]);
    expect(fixture.componentInstance.isSavingWebhookConfig()).toBe(false);
  });

  it('lässt einen verspäteten A-Erfolg den laufenden B-Save nicht beenden', async () => {
    const updateA = deferred<MutationResult>();
    const updateB = deferred<MutationResult>();
    const { fixture, currentWorkspace, config, loadedWorkspaceId, webhookService, toast } =
      await renderNotifications();
    webhookService.updateConfig
      .mockReturnValueOnce(updateA.promise)
      .mockReturnValueOnce(updateB.promise);

    renderedButton(fixture, 'Webhook-Einstellungen speichern').click();
    await Promise.resolve();
    expect(fixture.componentInstance.isSavingWebhookConfig()).toBe(true);

    currentWorkspace.set(workspace('workspace-b', 'Workspace B'));
    loadedWorkspaceId.set(null);
    flushEffects(fixture);
    config.set(webhookConfig('telegram-b-secret'));
    loadedWorkspaceId.set('workspace-b');
    flushEffects(fixture);

    const saveBButton = renderedSubmitButton(fixture, 'webhook-heading');
    expect(saveBButton.disabled).toBe(false);
    saveBButton.click();
    await Promise.resolve();
    expect(webhookService.updateConfig).toHaveBeenCalledTimes(2);
    expect(fixture.componentInstance.isSavingWebhookConfig()).toBe(true);

    updateA.resolve({ data: {}, error: null, reportedBySyncStatus: false });
    await flushAsyncAction(fixture);

    expect(toast.toasts()).toEqual([]);
    expect(fixture.componentInstance.isSavingWebhookConfig()).toBe(true);

    updateB.resolve({ data: {}, error: null, reportedBySyncStatus: false });
    await flushAsyncAction(fixture);

    expectOnlyToast(toast, 'success', 'Webhook-Konfiguration wurde gespeichert.');
    expect(fixture.componentInstance.isSavingWebhookConfig()).toBe(false);
  });

  it('ignoriert eine verspätete A-Rejection und meldet nur die laufende B-Rejection', async () => {
    const updateA = deferred<MutationResult>();
    const updateB = deferred<MutationResult>();
    const staleError = new Error('Workspace A ist offline');
    const currentError = new Error('Workspace B ist offline');
    const {
      fixture,
      currentWorkspace,
      config,
      loadedWorkspaceId,
      webhookService,
      syncStatus,
      toast,
    } = await renderNotifications();
    webhookService.updateConfig
      .mockReturnValueOnce(updateA.promise)
      .mockReturnValueOnce(updateB.promise);

    renderedButton(fixture, 'Webhook-Einstellungen speichern').click();
    await Promise.resolve();
    currentWorkspace.set(workspace('workspace-b', 'Workspace B'));
    loadedWorkspaceId.set(null);
    flushEffects(fixture);
    config.set(webhookConfig('telegram-b-secret'));
    loadedWorkspaceId.set('workspace-b');
    flushEffects(fixture);

    const saveBButton = renderedSubmitButton(fixture, 'webhook-heading');
    expect(saveBButton.disabled).toBe(false);
    saveBButton.click();
    await Promise.resolve();
    expect(webhookService.updateConfig).toHaveBeenCalledTimes(2);

    updateA.reject(staleError);
    await flushAsyncAction(fixture);

    expect(syncStatus.istZentralGemeldet).not.toHaveBeenCalled();
    expect(toast.toasts()).toEqual([]);
    expect(fixture.componentInstance.isSavingWebhookConfig()).toBe(true);

    updateB.reject(currentError);
    await flushAsyncAction(fixture);

    expect(syncStatus.istZentralGemeldet).toHaveBeenCalledOnce();
    expect(syncStatus.istZentralGemeldet).toHaveBeenCalledWith(currentError);
    expectOnlyToast(
      toast,
      'error',
      'Webhook-Konfiguration konnte nicht gespeichert werden.',
      currentError.message,
    );
    expect(fixture.componentInstance.isSavingWebhookConfig()).toBe(false);
  });

  it('sendet nach einem Workspace-Wechsel keinen verspäteten Webhook-Test', async () => {
    const pendingUpdate = deferred<MutationResult>();
    const { fixture, currentWorkspace, webhookService, toast } = await renderNotifications();
    webhookService.updateConfig.mockReturnValueOnce(pendingUpdate.promise);
    fixture.componentInstance.webhookForm.controls.discordEnabled.setValue(true);
    fixture.detectChanges();

    renderedButton(fixture, 'Discord-Test senden').click();
    await Promise.resolve();
    expect(fixture.componentInstance.isTestingWebhook()).toBe(true);

    currentWorkspace.set(workspace('workspace-b', 'Workspace B'));
    flushEffects(fixture);
    pendingUpdate.resolve({ data: {}, error: null, reportedBySyncStatus: false });
    await flushAsyncAction(fixture);

    expect(webhookService.sendTestNotification).not.toHaveBeenCalled();
    expect(toast.toasts()).toEqual([]);
    expect(fixture.componentInstance.isTestingWebhook()).toBe(false);
  });

  it('speichert vor dem gerenderten Webhook-Test und bestätigt dessen Erfolg', async () => {
    const { fixture, webhookService, toast } = await renderNotifications();
    fixture.componentInstance.webhookForm.controls.discordEnabled.setValue(true);
    fixture.detectChanges();

    renderedButton(fixture, 'Discord-Test senden').click();
    await flushAsyncAction(fixture);

    expect(webhookService.updateConfig).toHaveBeenCalledOnce();
    expect(webhookService.sendTestNotification).toHaveBeenCalledOnce();
    expect(webhookService.sendTestNotification).toHaveBeenCalledWith('discord');
    expectOnlyToast(toast, 'success', 'Test-Webhook wurde versendet.');
  });

  it('zeigt die vom Webhook-Test gemeldete Fehlerursache an', async () => {
    const { fixture, toast } = await renderNotifications({
      webhookTestResult: { success: false, message: 'Webhook ist nicht erreichbar.' },
    });
    fixture.componentInstance.webhookForm.controls.discordEnabled.setValue(true);
    fixture.detectChanges();

    renderedButton(fixture, 'Discord-Test senden').click();
    await flushAsyncAction(fixture);

    expectOnlyToast(
      toast,
      'error',
      'Test-Webhook konnte nicht versendet werden.',
      'Webhook ist nicht erreichbar.',
    );
  });

  it('fängt einen geworfenen Webhook-Testfehler ab und setzt den Ladezustand zurück', async () => {
    const { fixture, webhookService, syncStatus, toast } = await renderNotifications();
    webhookService.sendTestNotification.mockRejectedValueOnce(new Error('Test explodiert'));
    fixture.componentInstance.webhookForm.controls.discordEnabled.setValue(true);
    fixture.detectChanges();

    renderedButton(fixture, 'Discord-Test senden').click();
    await flushAsyncAction(fixture);

    expect(syncStatus.istZentralGemeldet).toHaveBeenCalledWith(expect.any(Error));
    expect(fixture.componentInstance.isTestingWebhook()).toBe(false);
    expectOnlyToast(
      toast,
      'error',
      'Test-Webhook konnte nicht versendet werden.',
      'Test explodiert',
    );
  });

  it.each([
    [true, 'success', 'Browser-Benachrichtigungen wurden aktiviert.', undefined],
    [
      false,
      'error',
      'Browser-Benachrichtigungen konnten nicht aktiviert werden.',
      'Berechtigung wurde im Browser verweigert oder blockiert.',
    ],
  ] as const)(
    'meldet das Ergebnis der gerenderten Push-Berechtigungsaktion (%s)',
    async (permissionResult, type, title, description) => {
      const { fixture, webPushService, toast } = await renderNotifications({ permissionResult });

      renderedButton(fixture, 'Push aktivieren').click();
      await flushAsyncAction(fixture);

      expect(webPushService.requestPermission).toHaveBeenCalledOnce();
      expectOnlyToast(toast, type, title, description);
    },
  );

  it.each([
    [true, 'success', 'Test-Benachrichtigung wurde versendet.', undefined],
    [
      false,
      'error',
      'Test-Benachrichtigung konnte nicht versendet werden.',
      'Push konnte nicht angezeigt werden. Bitte Berechtigung im Browser prüfen.',
    ],
  ] as const)(
    'meldet das Ergebnis der gerenderten Test-Push-Aktion (%s)',
    async (pushTestResult, type, title, description) => {
      const { fixture, webPushService, toast } = await renderNotifications({
        permission: 'granted',
        pushTestResult,
      });

      renderedButton(fixture, 'Test-Push senden').click();
      await flushAsyncAction(fixture);

      expect(webPushService.sendTestNotification).toHaveBeenCalledOnce();
      expect(fixture.componentInstance.isTestingPush()).toBe(false);
      expectOnlyToast(toast, type, title, description);
    },
  );

  it('rendert alle Push-Schalter mit eindeutigen Namen und bindet ihre Änderung', async () => {
    const { fixture, webPushService, toast } = await renderNotifications();
    const toggles = [
      ['Neue Webshop-Bestellungen', { notifyOnShopOrder: false }],
      ['Erstellte Versandetiketten', { notifyOnFulfillment: true }],
      ['Margen- und Profit-Alarme', { notifyOnMarginAlert: false }],
      ['Benachrichtigungston', { soundEnabled: true }],
    ] as const;
    const renderedNames = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('[role="checkbox"]'),
    ).map((checkbox) => checkbox.getAttribute('aria-label'));
    for (const [ariaLabel] of toggles) expect(renderedNames).toContain(ariaLabel);

    for (const [ariaLabel] of toggles) {
      renderedCheckbox(fixture, ariaLabel).click();
      fixture.detectChanges();
    }

    expect(webPushService.updateSettings).toHaveBeenCalledTimes(toggles.length);
    toggles.forEach(([, value], index) => {
      expect(webPushService.updateSettings).toHaveBeenNthCalledWith(index + 1, value);
    });
    expect(toast.toasts().map(({ title }) => title)).toEqual(
      toggles.map(() => 'Benachrichtigungseinstellung wurde gespeichert.'),
    );
  });
});

async function renderStore(
  options: {
    readonly updateResult?: MutationResult;
    readonly centralThrow?: boolean;
  } = {},
) {
  const currentWorkspace = signal<Workspace | null>(workspace('workspace-a', 'Workspace A'));
  const storeSettings = signal({ payments: paymentConfig('pk_workspace_a') });
  const loadedWorkspaceId = signal<string | null>('workspace-a');
  const updatePaymentsConfig = vi.fn(
    async (): Promise<MutationResult> =>
      options.updateResult ?? { data: {}, error: null, reportedBySyncStatus: false },
  );
  const storeService = { storeSettings, loadedWorkspaceId, updatePaymentsConfig };
  const syncStatus = {
    istZentralGemeldet: vi.fn(() => options.centralThrow ?? false),
  };
  await TestBed.configureTestingModule({
    imports: [StoreSettingsComponent],
    providers: [
      ToastService,
      { provide: WorkspaceService, useValue: { currentWorkspace } },
      { provide: StoreService, useValue: storeService },
      { provide: SyncStatusService, useValue: syncStatus },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(StoreSettingsComponent);
  flushEffects(fixture);
  return {
    fixture,
    currentWorkspace,
    storeSettings,
    loadedWorkspaceId,
    storeService,
    syncStatus,
    toast: TestBed.inject(ToastService),
  };
}

describe('Shop-Einstellungen – echte Angular-Fixture', () => {
  it('leert A-Zahlungsdaten beim Wechsel, ignoriert verspätetes A und patcht erst geladenes B', async () => {
    const { fixture, currentWorkspace, storeSettings, loadedWorkspaceId } = await renderStore();
    expect(fixture.componentInstance.paymentForm.controls.stripePublishableKey.value).toBe(
      'pk_workspace_a',
    );
    expect(fixture.componentInstance.isLoadingWorkspaceConfig()).toBe(false);

    currentWorkspace.set(workspace('workspace-b', 'Workspace B'));
    loadedWorkspaceId.set(null);
    flushEffects(fixture);

    expect(fixture.componentInstance.paymentForm.controls.stripePublishableKey.value).toBe('');
    expect(fixture.componentInstance.paymentForm.controls.bankIban.value).toBe('');
    expect(fixture.componentInstance.isLoadingWorkspaceConfig()).toBe(true);
    expect(renderedButton(fixture, 'Zahlungsmethoden speichern').disabled).toBe(true);

    storeSettings.set({ payments: paymentConfig('pk_late_workspace_a') });
    loadedWorkspaceId.set('workspace-a');
    flushEffects(fixture);
    expect(fixture.componentInstance.paymentForm.controls.stripePublishableKey.value).toBe('');

    storeSettings.set({ payments: paymentConfig('pk_workspace_b') });
    loadedWorkspaceId.set('workspace-b');
    flushEffects(fixture);

    expect(fixture.componentInstance.paymentForm.controls.stripePublishableKey.value).toBe(
      'pk_workspace_b',
    );
    expect(fixture.componentInstance.paymentForm.controls.bankIban.value).toBe('DE001234');
    expect(fixture.componentInstance.isLoadingWorkspaceConfig()).toBe(false);
  });

  it('bindet den gerenderten Primärbutton an das vollständige getrimmte Zahlungs-Payload', async () => {
    const { fixture, storeService, toast } = await renderStore();
    fixture.componentInstance.paymentForm.setValue({
      stripeEnabled: true,
      stripePublishableKey: ' pk_live_new ',
      paypalEnabled: true,
      paypalEmail: ' payments@flipbase.de ',
      bankTransferEnabled: true,
      bankName: ' Testbank ',
      bankIban: ' DE009999 ',
      bankBic: ' TESTDEFF ',
      bankAccountHolder: ' Ada Lovelace ',
      cashOnPickupEnabled: false,
    });
    fixture.detectChanges();

    renderedButton(fixture, 'Zahlungsmethoden speichern').click();
    await flushAsyncAction(fixture);

    expect(storeService.updatePaymentsConfig).toHaveBeenCalledOnce();
    expect(storeService.updatePaymentsConfig).toHaveBeenCalledWith({
      stripeEnabled: true,
      stripePublishableKey: 'pk_live_new',
      paypalEnabled: true,
      paypalEmail: 'payments@flipbase.de',
      bankTransferEnabled: true,
      bankIban: 'DE009999',
      bankBic: 'TESTDEFF',
      bankAccountHolder: 'Ada Lovelace',
      cashOnPickupEnabled: false,
    });
    expectOnlyToast(toast, 'success', 'Zahlungsmethoden wurden gespeichert.');
  });

  it('blockiert das Speichern ohne passend geladene Workspace-Konfiguration', async () => {
    const { fixture, loadedWorkspaceId, storeService, toast } = await renderStore();
    loadedWorkspaceId.set(null);
    flushEffects(fixture);
    const saveButton = renderedButton(fixture, 'Zahlungsmethoden speichern');

    expect(saveButton.disabled).toBe(true);
    saveButton.click();
    await flushAsyncAction(fixture);

    expect(storeService.updatePaymentsConfig).not.toHaveBeenCalled();
    expect(toast.toasts()).toEqual([]);
  });

  it('meldet eine unbestätigte Zahlungsantwort mit der eindeutigen Fallback-Ursache', async () => {
    const { fixture, toast } = await renderStore({
      updateResult: { data: null, error: null, reportedBySyncStatus: false },
    });

    renderedButton(fixture, 'Zahlungsmethoden speichern').click();
    await flushAsyncAction(fixture);

    expectOnlyToast(
      toast,
      'error',
      'Zahlungsmethoden konnten nicht gespeichert werden.',
      'Keine bestätigten Zahlungsmethoden.',
    );
    expect(fixture.componentInstance.isSavingPaymentConfig()).toBe(false);
  });

  it('zeigt einen lokalen Zahlungsfehler persistent an', async () => {
    const { fixture, toast } = await renderStore({
      updateResult: {
        data: null,
        error: new Error('Payment offline'),
        reportedBySyncStatus: false,
      },
    });

    renderedButton(fixture, 'Zahlungsmethoden speichern').click();
    await flushAsyncAction(fixture);

    expectOnlyToast(
      toast,
      'error',
      'Zahlungsmethoden konnten nicht gespeichert werden.',
      'Payment offline',
    );
  });

  it('dupliziert einen vom SyncStatus gemeldeten Zahlungsfehler nicht', async () => {
    const { fixture, toast } = await renderStore({
      updateResult: { data: null, error: new Error('Sync-Fehler'), reportedBySyncStatus: true },
    });

    renderedButton(fixture, 'Zahlungsmethoden speichern').click();
    await flushAsyncAction(fixture);

    expect(toast.toasts()).toEqual([]);
    expect(fixture.componentInstance.isSavingPaymentConfig()).toBe(false);
  });

  it('fängt einen geworfenen Zahlungsfehler ab und setzt den Ladezustand zurück', async () => {
    const { fixture, storeService, syncStatus, toast } = await renderStore();
    storeService.updatePaymentsConfig.mockRejectedValueOnce(new Error('Datenbank offline'));

    renderedButton(fixture, 'Zahlungsmethoden speichern').click();
    await flushAsyncAction(fixture);

    expect(syncStatus.istZentralGemeldet).toHaveBeenCalledWith(expect.any(Error));
    expect(fixture.componentInstance.isSavingPaymentConfig()).toBe(false);
    expectOnlyToast(
      toast,
      'error',
      'Zahlungsmethoden konnten nicht gespeichert werden.',
      'Datenbank offline',
    );
  });

  it('lässt einen verspäteten A-Erfolg den laufenden B-Save nicht beenden', async () => {
    const updateA = deferred<MutationResult>();
    const updateB = deferred<MutationResult>();
    const { fixture, currentWorkspace, storeSettings, loadedWorkspaceId, storeService, toast } =
      await renderStore();
    storeService.updatePaymentsConfig
      .mockReturnValueOnce(updateA.promise)
      .mockReturnValueOnce(updateB.promise);

    renderedButton(fixture, 'Zahlungsmethoden speichern').click();
    await Promise.resolve();
    expect(fixture.componentInstance.isSavingPaymentConfig()).toBe(true);

    currentWorkspace.set(workspace('workspace-b', 'Workspace B'));
    loadedWorkspaceId.set(null);
    flushEffects(fixture);
    storeSettings.set({ payments: paymentConfig('pk_workspace_b') });
    loadedWorkspaceId.set('workspace-b');
    flushEffects(fixture);

    const saveBButton = renderedSubmitButton(fixture, 'store-heading');
    expect(saveBButton.disabled).toBe(false);
    saveBButton.click();
    await Promise.resolve();
    expect(storeService.updatePaymentsConfig).toHaveBeenCalledTimes(2);
    expect(fixture.componentInstance.isSavingPaymentConfig()).toBe(true);

    updateA.resolve({ data: {}, error: null, reportedBySyncStatus: false });
    await flushAsyncAction(fixture);

    expect(toast.toasts()).toEqual([]);
    expect(fixture.componentInstance.isSavingPaymentConfig()).toBe(true);

    updateB.resolve({ data: {}, error: null, reportedBySyncStatus: false });
    await flushAsyncAction(fixture);

    expectOnlyToast(toast, 'success', 'Zahlungsmethoden wurden gespeichert.');
    expect(fixture.componentInstance.isSavingPaymentConfig()).toBe(false);
  });

  it('ignoriert eine verspätete A-Rejection und meldet nur die laufende B-Rejection', async () => {
    const updateA = deferred<MutationResult>();
    const updateB = deferred<MutationResult>();
    const staleError = new Error('Workspace A ist offline');
    const currentError = new Error('Workspace B ist offline');
    const {
      fixture,
      currentWorkspace,
      storeSettings,
      loadedWorkspaceId,
      storeService,
      syncStatus,
      toast,
    } = await renderStore();
    storeService.updatePaymentsConfig
      .mockReturnValueOnce(updateA.promise)
      .mockReturnValueOnce(updateB.promise);

    renderedButton(fixture, 'Zahlungsmethoden speichern').click();
    await Promise.resolve();
    currentWorkspace.set(workspace('workspace-b', 'Workspace B'));
    loadedWorkspaceId.set(null);
    flushEffects(fixture);
    storeSettings.set({ payments: paymentConfig('pk_workspace_b') });
    loadedWorkspaceId.set('workspace-b');
    flushEffects(fixture);

    const saveBButton = renderedSubmitButton(fixture, 'store-heading');
    expect(saveBButton.disabled).toBe(false);
    saveBButton.click();
    await Promise.resolve();
    expect(storeService.updatePaymentsConfig).toHaveBeenCalledTimes(2);

    updateA.reject(staleError);
    await flushAsyncAction(fixture);

    expect(syncStatus.istZentralGemeldet).not.toHaveBeenCalled();
    expect(toast.toasts()).toEqual([]);
    expect(fixture.componentInstance.isSavingPaymentConfig()).toBe(true);

    updateB.reject(currentError);
    await flushAsyncAction(fixture);

    expect(syncStatus.istZentralGemeldet).toHaveBeenCalledOnce();
    expect(syncStatus.istZentralGemeldet).toHaveBeenCalledWith(currentError);
    expectOnlyToast(
      toast,
      'error',
      'Zahlungsmethoden konnten nicht gespeichert werden.',
      currentError.message,
    );
    expect(fixture.componentInstance.isSavingPaymentConfig()).toBe(false);
  });
});

async function renderShipping(
  options: {
    readonly updateResult?: MutationResult;
    readonly centralThrow?: boolean;
  } = {},
) {
  const currentWorkspace = signal<Workspace | null>(workspace('workspace-a', 'Workspace A'));
  const config = signal<CarrierConfig>(carrierConfig('dhl-a-secret'));
  const loadedWorkspaceId = signal<string | null>('workspace-a');
  const loadError = signal<Error | null>(null);
  const loadFromSupabase = vi.fn(async () => undefined);
  const updateCarrierConfig = vi.fn(
    async (): Promise<MutationResult> =>
      options.updateResult ?? { data: {}, error: null, reportedBySyncStatus: false },
  );
  const fulfillmentService = {
    carrierConfig: config,
    loadedWorkspaceId,
    loadError,
    loadFromSupabase,
    updateCarrierConfig,
  };
  const syncStatus = {
    istZentralGemeldet: vi.fn(() => options.centralThrow ?? false),
  };
  await TestBed.configureTestingModule({
    imports: [ShippingSettingsComponent],
    providers: [
      ToastService,
      { provide: WorkspaceService, useValue: { currentWorkspace } },
      { provide: FulfillmentService, useValue: fulfillmentService },
      { provide: SyncStatusService, useValue: syncStatus },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(ShippingSettingsComponent);
  flushEffects(fixture);
  return {
    fixture,
    currentWorkspace,
    config,
    loadedWorkspaceId,
    loadError,
    fulfillmentService,
    syncStatus,
    toast: TestBed.inject(ToastService),
  };
}

describe('Versandeinstellungen – echte Angular-Fixture', () => {
  it('weist leere Pflichtfelder und eine ungültige E-Mail verständlich aus', async () => {
    const { fixture, fulfillmentService } = await renderShipping();
    fixture.componentInstance.carrierForm.patchValue({
      senderName: '   ',
      senderEmail: 'keine-mail',
    });
    fixture.componentInstance.carrierForm.controls.senderName.markAsTouched();
    fixture.componentInstance.carrierForm.controls.senderEmail.markAsTouched();
    fixture.detectChanges();

    expect(renderedButton(fixture, 'Carrier-Einstellungen speichern').disabled).toBe(true);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Name ist erforderlich.');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'Bitte gib eine gültige E-Mail-Adresse ein.',
    );
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('input[aria-invalid="true"]'),
    ).not.toBeNull();
    expect(fulfillmentService.updateCarrierConfig).not.toHaveBeenCalled();
  });

  it('zeigt Ladefehler an und bietet einen erneuten Versuch an', async () => {
    const { fixture, loadError, fulfillmentService } = await renderShipping();
    loadError.set(new Error('Datenbank offline'));
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'Versanddaten konnten nicht geladen werden.',
    );
    renderedButton(fixture, 'Erneut laden').click();

    expect(fulfillmentService.loadFromSupabase).toHaveBeenCalledWith('workspace-a');
    expect(renderedButton(fixture, 'Carrier-Einstellungen speichern').disabled).toBe(true);
  });

  it('leert A-Geheimnisse beim Wechsel, ignoriert verspätetes A und patcht erst geladenes B', async () => {
    const { fixture, currentWorkspace, config, loadedWorkspaceId } = await renderShipping();
    expect(fixture.componentInstance.carrierForm.controls.dhlApiKey.value).toBe('dhl-a-secret');
    expect(fixture.componentInstance.isLoadingWorkspaceConfig()).toBe(false);

    currentWorkspace.set(workspace('workspace-b', 'Workspace B'));
    loadedWorkspaceId.set(null);
    flushEffects(fixture);

    expect(fixture.componentInstance.carrierForm.controls.dhlApiKey.value).toBe('');
    expect(fixture.componentInstance.carrierForm.controls.hermesApiKey.value).toBe('');
    expect(fixture.componentInstance.isLoadingWorkspaceConfig()).toBe(true);
    expect(renderedButton(fixture, 'Carrier-Einstellungen speichern').disabled).toBe(true);

    config.set(carrierConfig('dhl-late-a-secret'));
    loadedWorkspaceId.set('workspace-a');
    flushEffects(fixture);
    expect(fixture.componentInstance.carrierForm.controls.dhlApiKey.value).toBe('');

    config.set(carrierConfig('dhl-b-secret'));
    loadedWorkspaceId.set('workspace-b');
    flushEffects(fixture);

    expect(fixture.componentInstance.carrierForm.controls.dhlApiKey.value).toBe('dhl-b-secret');
    expect(fixture.componentInstance.carrierForm.controls.hermesApiKey.value).toBe(
      'dhl-b-secret-hermes',
    );
    expect(fixture.componentInstance.isLoadingWorkspaceConfig()).toBe(false);
  });

  it('bindet den gerenderten Primärbutton an das vollständige getrimmte Carrier-Payload', async () => {
    const { fixture, fulfillmentService, toast } = await renderShipping();
    fixture.componentInstance.carrierForm.setValue({
      dhlEnabled: true,
      dhlEkp: ' 9876543210 ',
      dhlApiKey: ' dhl-secret ',
      hermesEnabled: true,
      hermesClientId: ' hermes-id ',
      hermesApiKey: ' hermes-secret ',
      senderName: ' Ada Lovelace ',
      senderCompany: ' Analytical Engines GmbH ',
      senderStreet: ' Testweg ',
      senderHouseNumber: ' 42a ',
      senderPostalCode: ' 10115 ',
      senderCity: ' Berlin ',
      senderCountry: ' Deutschland ',
      senderEmail: 'ada@example.com',
      senderPhone: ' +49 30 123456 ',
    });
    fixture.detectChanges();

    renderedButton(fixture, 'Carrier-Einstellungen speichern').click();
    await flushAsyncAction(fixture);

    expect(fulfillmentService.updateCarrierConfig).toHaveBeenCalledOnce();
    expect(fulfillmentService.updateCarrierConfig).toHaveBeenCalledWith({
      dhlEnabled: true,
      dhlEkp: '9876543210',
      dhlApiKey: 'dhl-secret',
      hermesEnabled: true,
      hermesClientId: 'hermes-id',
      hermesApiKey: 'hermes-secret',
      senderName: 'Ada Lovelace',
      senderCompany: 'Analytical Engines GmbH',
      senderStreet: 'Testweg',
      senderHouseNumber: '42a',
      senderPostalCode: '10115',
      senderCity: 'Berlin',
      senderCountry: 'Deutschland',
      senderEmail: 'ada@example.com',
      senderPhone: '+49 30 123456',
    });
    expectOnlyToast(toast, 'success', 'Versanddienstleister wurden gespeichert.');
  });

  it('blockiert das Speichern ohne passend geladene Workspace-Konfiguration', async () => {
    const { fixture, loadedWorkspaceId, fulfillmentService, toast } = await renderShipping();
    loadedWorkspaceId.set(null);
    flushEffects(fixture);
    const saveButton = renderedButton(fixture, 'Carrier-Einstellungen speichern');

    expect(saveButton.disabled).toBe(true);
    saveButton.click();
    await flushAsyncAction(fixture);

    expect(fulfillmentService.updateCarrierConfig).not.toHaveBeenCalled();
    expect(toast.toasts()).toEqual([]);
  });

  it('meldet eine unbestätigte Carrier-Antwort mit der eindeutigen Fallback-Ursache', async () => {
    const { fixture, toast } = await renderShipping({
      updateResult: { data: null, error: null, reportedBySyncStatus: false },
    });

    renderedButton(fixture, 'Carrier-Einstellungen speichern').click();
    await flushAsyncAction(fixture);

    expectOnlyToast(
      toast,
      'error',
      'Versanddienstleister konnten nicht gespeichert werden.',
      'Keine bestätigte Carrier-Konfiguration.',
    );
    expect(fixture.componentInstance.isSavingCarrierConfig()).toBe(false);
  });

  it('zeigt einen lokalen Carrier-Fehler persistent an', async () => {
    const { fixture, toast } = await renderShipping({
      updateResult: {
        data: null,
        error: new Error('Carrier offline'),
        reportedBySyncStatus: false,
      },
    });

    renderedButton(fixture, 'Carrier-Einstellungen speichern').click();
    await flushAsyncAction(fixture);

    expectOnlyToast(
      toast,
      'error',
      'Versanddienstleister konnten nicht gespeichert werden.',
      'Carrier offline',
    );
  });

  it('dupliziert einen vom SyncStatus gemeldeten Carrier-Fehler nicht', async () => {
    const { fixture, toast } = await renderShipping({
      updateResult: { data: null, error: new Error('Sync-Fehler'), reportedBySyncStatus: true },
    });

    renderedButton(fixture, 'Carrier-Einstellungen speichern').click();
    await flushAsyncAction(fixture);

    expect(toast.toasts()).toEqual([]);
    expect(fixture.componentInstance.isSavingCarrierConfig()).toBe(false);
  });

  it('fängt einen geworfenen Carrier-Fehler ab und setzt den Ladezustand zurück', async () => {
    const { fixture, fulfillmentService, syncStatus, toast } = await renderShipping();
    fulfillmentService.updateCarrierConfig.mockRejectedValueOnce(new Error('Datenbank offline'));

    renderedButton(fixture, 'Carrier-Einstellungen speichern').click();
    await flushAsyncAction(fixture);

    expect(syncStatus.istZentralGemeldet).toHaveBeenCalledWith(expect.any(Error));
    expect(fixture.componentInstance.isSavingCarrierConfig()).toBe(false);
    expectOnlyToast(
      toast,
      'error',
      'Versanddienstleister konnten nicht gespeichert werden.',
      'Datenbank offline',
    );
  });

  it('lässt einen verspäteten A-Erfolg den laufenden B-Save nicht beenden', async () => {
    const updateA = deferred<MutationResult>();
    const updateB = deferred<MutationResult>();
    const { fixture, currentWorkspace, config, loadedWorkspaceId, fulfillmentService, toast } =
      await renderShipping();
    fulfillmentService.updateCarrierConfig
      .mockReturnValueOnce(updateA.promise)
      .mockReturnValueOnce(updateB.promise);

    renderedButton(fixture, 'Carrier-Einstellungen speichern').click();
    await Promise.resolve();
    expect(fixture.componentInstance.isSavingCarrierConfig()).toBe(true);

    currentWorkspace.set(workspace('workspace-b', 'Workspace B'));
    loadedWorkspaceId.set(null);
    flushEffects(fixture);
    config.set(carrierConfig('dhl-b-secret'));
    loadedWorkspaceId.set('workspace-b');
    flushEffects(fixture);

    const saveBButton = renderedSubmitButton(fixture, 'shipping-heading');
    expect(saveBButton.disabled).toBe(false);
    saveBButton.click();
    await Promise.resolve();
    expect(fulfillmentService.updateCarrierConfig).toHaveBeenCalledTimes(2);
    expect(fixture.componentInstance.isSavingCarrierConfig()).toBe(true);

    updateA.resolve({ data: {}, error: null, reportedBySyncStatus: false });
    await flushAsyncAction(fixture);

    expect(toast.toasts()).toEqual([]);
    expect(fixture.componentInstance.isSavingCarrierConfig()).toBe(true);

    updateB.resolve({ data: {}, error: null, reportedBySyncStatus: false });
    await flushAsyncAction(fixture);

    expectOnlyToast(toast, 'success', 'Versanddienstleister wurden gespeichert.');
    expect(fixture.componentInstance.isSavingCarrierConfig()).toBe(false);
  });

  it('ignoriert eine verspätete A-Rejection und meldet nur die laufende B-Rejection', async () => {
    const updateA = deferred<MutationResult>();
    const updateB = deferred<MutationResult>();
    const staleError = new Error('Workspace A ist offline');
    const currentError = new Error('Workspace B ist offline');
    const {
      fixture,
      currentWorkspace,
      config,
      loadedWorkspaceId,
      fulfillmentService,
      syncStatus,
      toast,
    } = await renderShipping();
    fulfillmentService.updateCarrierConfig
      .mockReturnValueOnce(updateA.promise)
      .mockReturnValueOnce(updateB.promise);

    renderedButton(fixture, 'Carrier-Einstellungen speichern').click();
    await Promise.resolve();
    currentWorkspace.set(workspace('workspace-b', 'Workspace B'));
    loadedWorkspaceId.set(null);
    flushEffects(fixture);
    config.set(carrierConfig('dhl-b-secret'));
    loadedWorkspaceId.set('workspace-b');
    flushEffects(fixture);

    const saveBButton = renderedSubmitButton(fixture, 'shipping-heading');
    expect(saveBButton.disabled).toBe(false);
    saveBButton.click();
    await Promise.resolve();
    expect(fulfillmentService.updateCarrierConfig).toHaveBeenCalledTimes(2);

    updateA.reject(staleError);
    await flushAsyncAction(fixture);

    expect(syncStatus.istZentralGemeldet).not.toHaveBeenCalled();
    expect(toast.toasts()).toEqual([]);
    expect(fixture.componentInstance.isSavingCarrierConfig()).toBe(true);

    updateB.reject(currentError);
    await flushAsyncAction(fixture);

    expect(syncStatus.istZentralGemeldet).toHaveBeenCalledOnce();
    expect(syncStatus.istZentralGemeldet).toHaveBeenCalledWith(currentError);
    expectOnlyToast(
      toast,
      'error',
      'Versanddienstleister konnten nicht gespeichert werden.',
      currentError.message,
    );
    expect(fixture.componentInstance.isSavingCarrierConfig()).toBe(false);
  });
});

async function renderApp(
  options: { readonly installed?: boolean; readonly online?: boolean } = {},
) {
  const pwaService = {
    isOnline: signal(options.online ?? true),
    isInstalled: signal(options.installed ?? false),
    promptInstall: vi.fn(),
  };
  const ebayApiService = {
    getConfig: vi.fn(() => ({ appId: 'existing-app-id', siteId: 'EBAY-DE' })),
    saveConfig: vi.fn(),
  };
  await TestBed.configureTestingModule({
    imports: [AppSettingsComponent],
    providers: [
      ToastService,
      { provide: PwaService, useValue: pwaService },
      { provide: EbayApiService, useValue: ebayApiService },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(AppSettingsComponent);
  fixture.detectChanges();
  return { fixture, pwaService, ebayApiService, toast: TestBed.inject(ToastService) };
}

describe('App-Einstellungen – echte Angular-Fixture', () => {
  it('bindet den gerenderten eBay-Submit an das normalisierte Konfigurations-Payload', async () => {
    const { fixture, ebayApiService, toast } = await renderApp();
    expect(renderedInput(fixture, 'appId').value).toBe('existing-app-id');
    enterValue(renderedInput(fixture, 'appId'), ' new-app-id ');
    enterValue(renderedInput(fixture, 'globalId'), 'EBAY-AT');
    fixture.detectChanges();

    renderedButton(fixture, 'eBay-Verbindung speichern').click();
    await flushAsyncAction(fixture);

    expect(ebayApiService.saveConfig).toHaveBeenCalledOnce();
    expect(ebayApiService.saveConfig).toHaveBeenCalledWith({
      appId: 'new-app-id',
      siteId: 'EBAY-AT',
    });
    expectOnlyToast(toast, 'success', 'eBay-Verbindung wurde gespeichert.');
  });

  it('bindet den gerenderten PWA-Installationsbutton an den Installationsdialog', async () => {
    const { fixture, pwaService, toast } = await renderApp();
    const renderedText = (fixture.nativeElement as HTMLElement).textContent;

    expect(renderedText).toContain('Online (Live-Sync)');
    expect(renderedText).toContain('Im Web-Browser');

    renderedButton(fixture, 'Flipbase auf Smartphone / Desktop installieren').click();
    await flushAsyncAction(fixture);

    expect(pwaService.promptInstall).toHaveBeenCalledOnce();
    expect(toast.toasts()).toEqual([]);
  });

  it('rendert eine installierte App offline ohne erneute Installationsaktion', async () => {
    const { fixture, pwaService, toast } = await renderApp({ installed: true, online: false });
    const host = fixture.nativeElement as HTMLElement;

    expect(host.textContent).toContain('Offline-Cache aktiv');
    expect(host.textContent).toContain('Installiert (Standalone)');
    expect(host.textContent).toContain(
      'Flipbase ist bereits als native App auf diesem Gerät installiert.',
    );
    expect(
      Array.from(host.querySelectorAll<HTMLButtonElement>('button')).find(
        (button) =>
          button.textContent?.replace(/\s+/g, ' ').trim() ===
          'Flipbase auf Smartphone / Desktop installieren',
      ),
    ).toBeUndefined();
    expect(pwaService.promptInstall).not.toHaveBeenCalled();
    expect(toast.toasts()).toEqual([]);
  });
});
