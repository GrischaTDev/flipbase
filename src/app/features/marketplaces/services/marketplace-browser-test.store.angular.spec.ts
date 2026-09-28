import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../../core/services/auth.service';
import { WorkspaceService } from '../../../core/services/workspace.service';
import { createMarketplaceFixtures } from '../testing/marketplace-fixtures';
import { MarketplaceAccountStore } from './marketplace-account.store';
import {
  BrowserTestSessionEndedError,
  GoLoginApiLimitError,
  MarketplaceBrowserTestApiService,
  VintedLoginPendingError,
  VintedVerificationRequiredError,
} from './marketplace-browser-test-api.service';
import { MarketplaceBrowserTestStore } from './marketplace-browser-test.store';

const [accountA, accountB] = createMarketplaceFixtures().connections;
const id = '25600000-0000-4000-8000-000000000031';
const jpeg = new Blob([Uint8Array.from([0xff, 0xd8, 0xff, 0xd9])], { type: 'image/jpeg' });
let selectedId: ReturnType<typeof signal<string>>;
let selectionVersion: ReturnType<typeof signal<number>>;
let workspace: ReturnType<typeof signal<{ id: string } | null>>;
let session: ReturnType<typeof signal<{ access_token: string } | null>>;
let api: {
  available: ReturnType<typeof vi.fn>;
  open: ReturnType<typeof vi.fn>;
  frame: ReturnType<typeof vi.fn>;
  input: ReturnType<typeof vi.fn>;
  identify: ReturnType<typeof vi.fn>;
  login: ReturnType<typeof vi.fn>;
  verify: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
};
let reloadConnections: ReturnType<typeof vi.fn>;
let store: MarketplaceBrowserTestStore;

beforeEach(async () => {
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: vi.fn(() => 'blob:test'),
  });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
  selectedId = signal(accountA.connectionId);
  selectionVersion = signal(0);
  workspace = signal<{ id: string } | null>({ id: accountA.workspaceId });
  session = signal<{ access_token: string } | null>({ access_token: 'token-a' });
  api = {
    available: vi.fn().mockResolvedValue({ available: true, readOnly: false }),
    open: vi.fn().mockResolvedValue(id),
    frame: vi.fn().mockResolvedValue(jpeg),
    input: vi.fn().mockResolvedValue(undefined),
    identify: vi.fn().mockResolvedValue({ externalAccountId: '12345', username: 'my-vinted' }),
    login: vi.fn().mockResolvedValue('submitted'),
    verify: vi.fn().mockResolvedValue('submitted'),
    close: vi.fn().mockResolvedValue(undefined),
  };
  reloadConnections = vi.fn().mockResolvedValue(undefined);
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      MarketplaceBrowserTestStore,
      {
        provide: MarketplaceAccountStore,
        useValue: {
          selectedConnection: computed(
            () =>
              [accountA, accountB].find((account) => account.connectionId === selectedId()) ?? null,
          ),
          selectionVersion,
          canManage: signal(true),
          reloadConnections,
        },
      },
      { provide: WorkspaceService, useValue: { currentWorkspace: workspace } },
      {
        provide: AuthService,
        useValue: { currentUser: signal({ id: 'operator-a' }), session },
      },
      { provide: MarketplaceBrowserTestApiService, useValue: api },
    ],
  });
  store = TestBed.inject(MarketplaceBrowserTestStore);
  TestBed.tick();
  await store.checkAvailability();
});

describe('Kontogebundener Browser-Testbereich', () => {
  it('zeigt eine Vinted-Codeanforderung an und sendet den Code nur für die aktive Verbindung', async () => {
    api.identify.mockRejectedValueOnce(new VintedVerificationRequiredError());
    await store.login({ username: 'synthetic', password: 'synthetic' });
    await store.checkLogin();
    expect(store.awaitingVerification()).toBe(true);
    expect(store.error()).toBeNull();
    await store.verifyCode('123456');
    expect(api.verify).toHaveBeenCalledOnce();
    expect(api.verify).toHaveBeenCalledWith(
      { workspaceId: accountA.workspaceId, connectionId: accountA.connectionId },
      id,
      '123456',
      'token-a',
    );
    expect(store.awaitingVerification()).toBe(false);
  });
  it('schickt nach einem Kontowechsel keinen Code an die alte Sitzung', async () => {
    api.identify.mockRejectedValueOnce(new VintedVerificationRequiredError());
    await store.login({ username: 'synthetic', password: 'synthetic' });
    await store.checkLogin();
    selectedId.set(accountB.connectionId);
    selectionVersion.update((value) => value + 1);
    TestBed.tick();
    await store.verifyCode('123456');
    expect(api.verify).not.toHaveBeenCalled();
  });
  it('sendet keinen Code nach Ablauf der Bestätigungsfrist', async () => {
    api.identify.mockRejectedValueOnce(new VintedVerificationRequiredError());
    await store.login({ username: 'synthetic', password: 'synthetic' });
    await store.checkLogin();
    const now = Date.now();
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now + 121_000);
    try {
      await store.verifyCode('123456');
      expect(api.verify).not.toHaveBeenCalled();
      expect(store.error()).toContain('nicht rechtzeitig');
    } finally {
      clock.mockRestore();
    }
  });
  it('zeigt das GoLogin-Limit vor dem Senden der Zugangsdaten an', async () => {
    api.open.mockRejectedValueOnce(new GoLoginApiLimitError());
    await store.login({ username: 'synthetic', password: 'synthetic' });
    expect(store.error()).toContain('GoLogin meldet');
    expect(store.error()).toContain('API & MCP');
    expect(api.login).not.toHaveBeenCalled();
  });
  it('behält die Sitzung nach Token-Erneuerung und prüft mit dem neuen Token', async () => {
    await store.start();
    session.set({ access_token: 'token-a-renewed' });
    await store.refresh();
    expect(store.session()?.id).toBe(id);
    expect(api.frame).toHaveBeenLastCalledWith(
      { workspaceId: accountA.workspaceId, connectionId: accountA.connectionId },
      id,
      'token-a-renewed',
    );
  });

  it('verbirgt die alte Sitzung beim Kontowechsel und beendet sie', async () => {
    await store.start();
    selectedId.set(accountB.connectionId);
    selectionVersion.update((value) => value + 1);
    expect(store.session()).toBeNull();
    TestBed.tick();
    expect(api.close).toHaveBeenCalledWith(
      { workspaceId: accountA.workspaceId, connectionId: accountA.connectionId },
      id,
      'token-a',
    );
  });

  it('lädt das verbundene Konto nach bestätigter Anmeldung neu', async () => {
    await store.start();
    await store.confirmAccount();
    expect(api.identify).toHaveBeenCalledWith(
      { workspaceId: accountA.workspaceId, connectionId: accountA.connectionId },
      id,
      'token-a',
    );
    expect(api.close).toHaveBeenCalledOnce();
    expect(reloadConnections).toHaveBeenCalledWith(accountA.connectionId);
    expect(store.session()).toBeNull();
  });

  it('übernimmt einen fehlgeschlagenen Identitätsabruf nicht als Verbindung', async () => {
    await store.start();
    api.identify.mockRejectedValueOnce(new Error('private provider detail'));
    await store.confirmAccount();
    expect(api.close).not.toHaveBeenCalled();
    expect(reloadConnections).not.toHaveBeenCalled();
    expect(store.session()?.id).toBe(id);
    expect(store.error()).toContain('nicht sicher bestätigt');
  });

  it('wiederholt unklare Eingaben nicht automatisch', async () => {
    await store.start();
    api.input.mockRejectedValue(new Error('private provider detail'));
    await store.input({ kind: 'press', key: 'Enter' });
    expect(api.input).toHaveBeenCalledTimes(1);
    expect(api.frame).toHaveBeenCalledTimes(1);
    expect(store.error()).toContain('nicht sicher bestätigt');
  });

  it('sperrt Eingaben im lesenden Testmodus auch bei direktem Store-Aufruf', async () => {
    api.available.mockResolvedValue({ available: true, readOnly: true });
    await store.checkAvailability();
    await store.start();
    await store.input({ kind: 'click', x: 0.5, y: 0.5 });
    expect(api.input).not.toHaveBeenCalled();
    expect(store.session()?.id).toBe(id);
  });

  it('blendet ein altes Browserbild nach fehlgeschlagener Aktualisierung aus', async () => {
    await store.start();
    expect(store.session()?.frameUrl).toBe('blob:test');
    api.frame.mockRejectedValueOnce(new Error('session expired'));
    await store.refresh();
    expect(store.session()?.frameUrl).toBeNull();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test');
    expect(store.canAct()).toBe(true);
    expect(store.canStart()).toBe(false);
    expect(store.error()).toContain('nicht bestätigt');
  });

  it('gibt einen bestätigten Ablauf für einen neuen Start frei', async () => {
    await store.start();
    api.frame.mockRejectedValueOnce(new BrowserTestSessionEndedError());
    await store.refresh();
    expect(store.session()).toBeNull();
    expect(store.canStart()).toBe(true);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test');
  });

  it('lässt nach einem bestätigten Abbruch beim ersten Bild erneut starten', async () => {
    api.frame.mockRejectedValueOnce(new BrowserTestSessionEndedError());
    await store.start();
    expect(store.session()).toBeNull();
    expect(store.canStart()).toBe(true);
  });

  it('verbirgt die Sitzung sofort bei Workspacewechsel', async () => {
    await store.start();
    workspace.set({ id: 'other-workspace' });
    expect(store.session()).toBeNull();
  });
});

it('startet die Anmeldung einmalig im ausgewählten Konto und wartet auf Bestätigung', async () => {
  api.login = vi.fn().mockResolvedValue('submitted');
  await store.login({ username: 'test-user', password: 'synthetic' });
  expect(api.open).toHaveBeenCalledOnce();
  expect(api.login).toHaveBeenCalledWith(
    { workspaceId: accountA.workspaceId, connectionId: accountA.connectionId },
    id,
    { username: 'test-user', password: 'synthetic' },
    'token-a',
  );
  expect(store.awaitingLogin()).toBe(true);
  await store.checkLogin();
  expect(reloadConnections).toHaveBeenCalledWith(accountA.connectionId);
  expect(store.session()).toBeNull();
});

it('meldet im Hintergrund an, auch wenn keine Browserbilder verfügbar sind', async () => {
  api.frame.mockRejectedValue(new Error('frame unavailable'));
  api.identify.mockResolvedValueOnce(null);
  await store.login({ username: 'synthetic', password: 'synthetic' });
  await store.checkLogin();
  expect(store.awaitingLogin()).toBe(true);
  expect(store.error()).toBeNull();
  expect(api.frame).not.toHaveBeenCalled();
  await store.checkLogin();
  expect(reloadConnections).toHaveBeenCalledOnce();
});

it('prüft nach unklarem Absenden nur das Ergebnis und sendet keine Zugangsdaten erneut', async () => {
  api.login.mockResolvedValue('submission_unconfirmed');
  await store.login({ username: 'synthetic', password: 'synthetic' });
  await store.login({ username: 'duplicate', password: 'duplicate' });
  await store.checkLogin();
  expect(api.login).toHaveBeenCalledOnce();
  expect(reloadConnections).toHaveBeenCalledOnce();
});

it('sperrt einen neuen Versuch nach Transportfehler bis zum bestätigten Beenden', async () => {
  api.login.mockRejectedValueOnce(new Error('network error'));
  await store.login({ username: 'synthetic', password: 'synthetic' });
  expect(store.awaitingLogin()).toBe(false);
  expect(store.canLogin()).toBe(false);
  await store.login({ username: 'duplicate', password: 'duplicate' });
  expect(api.login).toHaveBeenCalledOnce();
  api.close.mockRejectedValueOnce(new Error('uncertain close'));
  await store.close();
  expect(store.canLogin()).toBe(false);
  await store.close();
  expect(store.canLogin()).toBe(true);
});

it('stoppt bei einem nicht bedienbaren Formular ohne ein Passwort erneut zu senden', async () => {
  api.login.mockResolvedValue('form_unavailable');
  await store.login({ username: 'synthetic', password: 'synthetic' });
  await store.checkLogin();
  expect(store.awaitingLogin()).toBe(false);
  expect(store.error()).toContain('Anmeldeformular');
  expect(api.identify).not.toHaveBeenCalled();
  expect(api.login).toHaveBeenCalledOnce();
});

it('begrenzt eine unbestätigte Anmeldung ohne automatischen Passwort-Neuversuch', async () => {
  api.identify.mockResolvedValue(null);
  await store.login({ username: 'synthetic', password: 'synthetic' });
  const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 61_000);
  try {
    await store.checkLogin();
    expect(store.awaitingLogin()).toBe(false);
    expect(store.error()).toContain('nicht bestätigt');
    expect(api.login).toHaveBeenCalledOnce();
    expect(reloadConnections).not.toHaveBeenCalled();
  } finally {
    clock.mockRestore();
  }
});

it('erklärt beim Zeitlimit ein weiterhin sichtbares Vinted-Anmeldeformular', async () => {
  api.identify.mockRejectedValue(new VintedLoginPendingError());
  await store.login({ username: 'synthetic', password: 'synthetic' });
  await store.checkLogin();
  expect(store.awaitingLogin()).toBe(true);
  expect(store.error()).toBeNull();
  const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 61_000);
  try {
    await store.checkLogin();
    expect(store.awaitingLogin()).toBe(false);
    expect(store.error()).toContain('Anmeldeformular');
    expect(api.login).toHaveBeenCalledOnce();
    expect(reloadConnections).not.toHaveBeenCalled();
  } finally {
    clock.mockRestore();
  }
});

it('sendet Zugangsdaten nach einem Kontowechsel während des Starts nicht weiter', async () => {
  api.login = vi.fn();
  let resolveOpen!: (value: string) => void;
  api.open.mockReturnValue(
    new Promise<string>((resolve) => {
      resolveOpen = resolve;
    }),
  );
  const pending = store.login({ username: 'test-user', password: 'synthetic' });
  selectedId.set(accountB.connectionId);
  selectionVersion.update((value) => value + 1);
  resolveOpen(id);
  await pending;
  expect(api.login).not.toHaveBeenCalled();
});

it('meldet eine nicht bedienbare Anmeldung des älteren Workers ohne Endlosschleife', async () => {
  api.login = vi.fn().mockResolvedValue('interaction_required');
  api.identify.mockResolvedValue(null);
  await store.login({ username: 'test-user', password: 'synthetic' });
  await store.checkLogin();
  await store.checkLogin();
  expect(api.login).toHaveBeenCalledOnce();
  expect(api.close).not.toHaveBeenCalled();
  expect(store.session()?.id).toBe(id);
  expect(store.awaitingLogin()).toBe(false);
  expect(store.error()).toContain('zusätzliche Prüfung');
  expect(api.identify).not.toHaveBeenCalled();
});

it('verwirft eine verspätete Anmeldebestätigung nach Workspacewechsel', async () => {
  await store.login({ username: 'synthetic', password: 'synthetic' });
  let resolveIdentity!: (value: unknown) => void;
  api.identify.mockReturnValue(
    new Promise((resolve) => {
      resolveIdentity = resolve;
    }),
  );
  const checking = store.checkLogin();
  workspace.set({ id: 'other-workspace' });
  resolveIdentity({ externalAccountId: '12345', username: 'synthetic' });
  await checking;
  expect(reloadConnections).not.toHaveBeenCalled();
  expect(store.session()).toBeNull();
});

it('beendet die automatische Anmeldung nach Ablauf und behält unklare Stopps sichtbar', async () => {
  api.login.mockRejectedValueOnce(new BrowserTestSessionEndedError());
  await store.login({ username: 'synthetic', password: 'synthetic' });
  expect(store.session()).toBeNull();
  expect(store.awaitingLogin()).toBe(false);
  await store.login({ username: 'synthetic', password: 'synthetic' });
  api.close.mockRejectedValueOnce(new Error('unconfirmed-stop'));
  await store.checkLogin();
  expect(store.session()?.id).toBe(id);
  expect(store.error()).toContain('nicht sicher bestätigt');
  expect(reloadConnections).not.toHaveBeenCalled();
});

it('erlaubt Beenden während einer laufenden Anmeldung und verwirft deren späte Antwort', async () => {
  await store.start();
  let finishLogin!: (value: string) => void;
  api.login.mockReturnValue(
    new Promise<string>((resolve) => {
      finishLogin = resolve;
    }),
  );
  const pending = store.login({ username: 'synthetic', password: 'synthetic' });
  await store.close();
  finishLogin('submitted');
  await pending;
  expect(api.close).toHaveBeenCalledOnce();
  expect(store.session()).toBeNull();
  expect(api.frame).toHaveBeenCalledTimes(1);
});

it('stoppt bei abgelehnten Zugangsdaten die Prüfung und erlaubt einen ausdrücklichen neuen Versuch', async () => {
  const { VintedLoginRejectedError } = await import('./marketplace-browser-test-api.service');
  api.identify.mockRejectedValue(new VintedLoginRejectedError());
  await store.login({ username: 'synthetic', password: 'synthetic' });
  await store.checkLogin();
  expect(store.awaitingLogin()).toBe(false);
  expect(store.error()).toContain('Zugangsdaten');
  await store.checkLogin();
  expect(api.identify).toHaveBeenCalledOnce();
  expect(api.login).toHaveBeenCalledOnce();
  await store.login({ username: 'corrected', password: 'synthetic-corrected' });
  expect(api.open).toHaveBeenCalledOnce();
  expect(api.login).toHaveBeenCalledTimes(2);
  expect(store.awaitingLogin()).toBe(true);
  expect(store.error()).toBeNull();
});
