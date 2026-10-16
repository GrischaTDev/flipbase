import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { KleinanzeigenExtensionBridge } from './kleinanzeigen-extension-bridge';
const workspace = '49000000-0000-4000-8000-000000000011';
const proposal = {
  externalAccountId: '123',
  displayName: 'Testkonto',
  accountType: 'private',
  installationId: '49000000-0000-4000-8000-000000000031',
  tokenHash: 'a'.repeat(64),
  nonce: '49000000-0000-4000-8000-000000000041',
};
function message(data: unknown, origin = location.origin, source: Window | null = window) {
  window.dispatchEvent(new MessageEvent('message', { origin, source, data }));
}
describe('Kleinanzeigen-Erweiterungsbrücke', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [KleinanzeigenExtensionBridge] });
    vi.useFakeTimers();
    vi.spyOn(window, 'postMessage').mockImplementation(() => undefined);
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });
  it('erkennt nur die ausdrücklich erreichbaren Kleinanzeigen-Fähigkeiten', () => {
    const bridge = TestBed.inject(KleinanzeigenExtensionBridge);
    message({
      type: 'FLIPBASE_EXTENSION_STATUS',
      installed: true,
      vintedLocal: true,
      version: '99.0.0',
    });
    expect(bridge.capabilities().accounts).toBe(false);
    message({
      type: 'FLIPBASE_EXTENSION_STATUS',
      installed: true,
      kleinanzeigenCapabilities: { accounts: true, sync: false, publish: false },
    });
    expect(bridge.capabilities()).toEqual({ accounts: true, sync: false, publish: false });
    message({
      type: 'FLIPBASE_EXTENSION_STATUS',
      installed: false,
      kleinanzeigenCapabilities: { accounts: false, sync: false, publish: false },
    });
    expect(bridge.capabilities().accounts).toBe(false);
  });
  it('verwirft Fähigkeiten nach ausbleibender Statusantwort', () => {
    const bridge = TestBed.inject(KleinanzeigenExtensionBridge);
    message({
      type: 'FLIPBASE_EXTENSION_STATUS',
      installed: true,
      kleinanzeigenCapabilities: { accounts: true, sync: false, publish: false },
    });
    bridge.checkInstallation();
    vi.advanceTimersByTime(3000);
    expect(bridge.capabilities().accounts).toBe(false);
    expect(bridge.checking()).toBe(false);
  });
  it('ordnet nur eigene Herkunft und Anfragekennung zu', async () => {
    const bridge = TestBed.inject(KleinanzeigenExtensionBridge);
    const pending = bridge.prepare(
      workspace,
      false,
      'https://api.flipbase.de/functions/v1/kleinanzeigen-local-extension',
    );
    const call = vi.mocked(window.postMessage).mock.calls[0];
    const id = (call[0] as { requestId: string }).requestId;
    const result = {
      type: 'FLIPBASE_KLEINANZEIGEN_RESULT',
      requestId: id,
      success: true,
      result: proposal,
    };
    message(result, 'https://foreign.example');
    message(result, location.origin, null);
    message({ ...result, requestId: 'other' });
    let done = false;
    void pending.then(() => {
      done = true;
    });
    await Promise.resolve();
    expect(done).toBe(false);
    message(result);
    expect(await pending).toEqual(proposal);
    expect(call[1]).toBe(location.origin);
    expect(call[0]).toMatchObject({
      workspaceId: workspace,
      canPublish: false,
      type: 'FLIPBASE_KLEINANZEIGEN_PREPARE_ACCOUNT',
    });
    expect(call[0]).not.toHaveProperty('payload');
  });
  it('leitet keine Secret-haltige Antwort an die Kontobindung weiter', async () => {
    const bridge = TestBed.inject(KleinanzeigenExtensionBridge);
    const pending = bridge.prepare(
      workspace,
      false,
      'https://api.flipbase.de/functions/v1/kleinanzeigen-local-extension',
    );
    const id = (vi.mocked(window.postMessage).mock.calls[0][0] as { requestId: string }).requestId;
    message({
      type: 'FLIPBASE_KLEINANZEIGEN_RESULT',
      requestId: id,
      success: true,
      result: { ...proposal, secret: 'private' },
    });
    await expect(pending).rejects.toThrow('Antwort');
  });
  it('lässt die lokale Zustimmung länger als eine Minute zu und beendet hängende Anfragen', async () => {
    const pending = TestBed.inject(KleinanzeigenExtensionBridge).prepare(
      workspace,
      false,
      'https://api.flipbase.de/functions/v1/kleinanzeigen-local-extension',
    );
    const assertion = expect(pending).rejects.toThrow('geantwortet');
    vi.advanceTimersByTime(60000);
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(120000);
    await assertion;
    expect(vi.getTimerCount()).toBe(0);
  });
  it('beendet Anfragen und Listener beim Verlassen der Ansicht', async () => {
    const bridge = TestBed.inject(KleinanzeigenExtensionBridge);
    const pending = bridge.prepare(
      workspace,
      false,
      'https://api.flipbase.de/functions/v1/kleinanzeigen-local-extension',
    );
    const assertion = expect(pending).rejects.toThrow('geschlossen');
    TestBed.resetTestingModule();
    await assertion;
    expect(vi.getTimerCount()).toBe(0);
  });
  it('übernimmt widersprüchliche oder fremde Fähigkeiten nicht', () => {
    const bridge = TestBed.inject(KleinanzeigenExtensionBridge);
    for (const caps of [
      { accounts: false, sync: false, publish: true },
      { accounts: true, sync: 'yes', publish: false },
      { accounts: true, sync: true, publish: true, secret: 'private' },
    ])
      message({
        type: 'FLIPBASE_EXTENSION_STATUS',
        installed: true,
        kleinanzeigenCapabilities: caps,
      });
    message(
      {
        type: 'FLIPBASE_EXTENSION_STATUS',
        installed: true,
        kleinanzeigenCapabilities: { accounts: true, sync: true, publish: true },
      },
      'https://evil.example',
    );
    expect(bridge.capabilities().accounts).toBe(false);
  });
  it('übermittelt nur die öffentliche Abgleichskennung und prüft die passende Abschlussantwort', async () => {
    const bridge = TestBed.inject(KleinanzeigenExtensionBridge);
    const run = {
      workspaceId: workspace,
      connectionId: '12',
      runId: '42',
      generation: 1,
      state: 'queued' as const,
    };
    const pending = bridge.synchronize(run);
    const call = vi.mocked(window.postMessage).mock.calls[0];
    const id = (call[0] as { requestId: string }).requestId;
    const result = {
      workspaceId: workspace,
      connectionId: '12',
      runId: '42',
      generation: 1,
      state: 'confirmed',
      observedAt: '2026-10-16T06:00:00Z',
      itemCount: 17,
    };
    message({ type: 'FLIPBASE_KLEINANZEIGEN_RESULT', requestId: id, success: true, result });
    expect(await pending).toEqual(result);
    expect(call[0]).toEqual({
      type: 'FLIPBASE_KLEINANZEIGEN_SYNC',
      requestId: id,
      workspaceId: workspace,
      connectionId: '12',
      runId: '42',
      generation: 1,
    });
  });
});

describe('Kleinanzeigen-Formularfähigkeit', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [KleinanzeigenExtensionBridge] });
    vi.spyOn(window, 'postMessage').mockImplementation(() => undefined);
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });
  it('verlangt eine ausdrückliche Formularfähigkeit und gibt keine Versionsbehauptung frei', () => {
    const bridge = TestBed.inject(KleinanzeigenExtensionBridge);
    message({
      type: 'FLIPBASE_EXTENSION_STATUS',
      installed: true,
      version: '99',
      kleinanzeigenCapabilities: { accounts: true, sync: true, publish: false },
    });
    expect(bridge.formSchemaAvailable()).toBe(false);
    message({
      type: 'FLIPBASE_EXTENSION_STATUS',
      installed: true,
      kleinanzeigenFormSchema: true,
      kleinanzeigenCapabilities: { accounts: true, sync: true, publish: false },
    });
    expect(bridge.formSchemaAvailable()).toBe(true);
    message({
      type: 'FLIPBASE_EXTENSION_STATUS',
      installed: false,
      kleinanzeigenFormSchema: true,
      kleinanzeigenCapabilities: { accounts: false, sync: false, publish: false },
    });
    expect(bridge.formSchemaAvailable()).toBe(false);
  });
  it('ordnet Kategorien mit Konto und Generation zu und verwirft eine fremde Antwort', async () => {
    const bridge = TestBed.inject(KleinanzeigenExtensionBridge);
    message({
      type: 'FLIPBASE_EXTENSION_STATUS',
      installed: true,
      kleinanzeigenFormSchema: true,
      kleinanzeigenCapabilities: { accounts: true, sync: true, publish: false },
    });
    const scope = {
      workspaceId: workspace,
      connectionId: '9007199254740993',
      externalAccountId: '123',
      generation: 2,
    };
    const pending = bridge.loadFormSchema(scope, '153');
    const call = vi.mocked(window.postMessage).mock.calls.at(-1)![0] as { requestId: string };
    message({
      type: 'FLIPBASE_KLEINANZEIGEN_RESULT',
      requestId: call.requestId,
      success: true,
      result: {
        ...scope,
        generation: 1,
        categoryPath: '153',
        categoryLabel: 'Mode',
        choices: [{ path: '153/160', label: 'Herren', isParent: true }],
        schema: null,
        schemaRevision: null,
        observedAt: new Date().toISOString(),
      },
    });
    await expect(pending).rejects.toThrow('Formular');
  });
});

describe('Kontingent und Auftragsausführung', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [KleinanzeigenExtensionBridge] });
    vi.spyOn(window, 'postMessage').mockImplementation(() => undefined);
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });
  const scope = {
    workspaceId: workspace,
    connectionId: '12',
    externalAccountId: '123',
    generation: 1,
    accountType: 'private' as const,
  };
  function caps(quota = true, publish = true) {
    message({
      type: 'FLIPBASE_EXTENSION_STATUS',
      installed: true,
      kleinanzeigenQuota: quota,
      kleinanzeigenCapabilities: { accounts: true, sync: true, publish },
    });
  }
  it('verlangt ausdrücklich den offiziellen Kontingentadapter', async () => {
    const b = TestBed.inject(KleinanzeigenExtensionBridge);
    caps(false);
    expect(b.quotaAvailable()).toBe(false);
    await expect(b.refreshQuota(scope)).rejects.toThrow('Kontingent');
    expect(window.postMessage).not.toHaveBeenCalled();
  });
  it('prüft Generation, Konto und frischen offiziellen Kontingentstand', async () => {
    const b = TestBed.inject(KleinanzeigenExtensionBridge);
    caps();
    const p = b.refreshQuota(scope);
    const request = vi.mocked(window.postMessage).mock.calls.at(-1)![0] as { requestId: string };
    expect(request).toMatchObject({
      type: 'FLIPBASE_KLEINANZEIGEN_QUOTA',
      workspaceId: workspace,
      connectionId: '12',
      generation: 1,
    });
    message({
      type: 'FLIPBASE_KLEINANZEIGEN_RESULT',
      requestId: request.requestId,
      success: true,
      result: {
        workspaceId: workspace,
        connectionId: '12',
        externalAccountId: '123',
        generation: 1,
        expiresAt: new Date(Date.now() + 60000).toISOString(),
        canPublish: true,
        quota: {
          used: 99,
          observedAt: new Date().toISOString(),
          reserved: 0,
          allowed: true,
          reason: null,
        },
      },
    });
    expect((await p).quota.used).toBe(99);
  });
  it('wertet eine Extensionantwort nur als Bearbeitungsbestätigung aus', async () => {
    const b = TestBed.inject(KleinanzeigenExtensionBridge);
    caps();
    const p = b.runJob(scope, '42', 'reconcile');
    const request = vi.mocked(window.postMessage).mock.calls.at(-1)![0] as { requestId: string };
    expect(request).toMatchObject({
      type: 'FLIPBASE_KLEINANZEIGEN_PUBLISH_JOB',
      jobId: '42',
      mode: 'reconcile',
    });
    message({
      type: 'FLIPBASE_KLEINANZEIGEN_RESULT',
      requestId: request.requestId,
      success: true,
      result: {
        workspaceId: workspace,
        connectionId: '12',
        jobId: '42',
        generation: 1,
        handled: true,
        published: true,
      },
    });
    await expect(p).rejects.toThrow('Auftrag');
  });
});
