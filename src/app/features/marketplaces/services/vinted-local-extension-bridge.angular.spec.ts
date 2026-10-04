import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VintedLocalExtensionBridge } from './vinted-local-extension-bridge';

describe('Lokale Vinted-Erweiterungsbrücke', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [VintedLocalExtensionBridge] });
    vi.useFakeTimers();
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });
  function response(requestId: string, origin = location.origin, source: Window | null = window) {
    window.dispatchEvent(
      new MessageEvent('message', {
        origin,
        source,
        data: {
          type: 'FLIPBASE_VINTED_LOCAL_RESULT',
          requestId,
          success: true,
          result: { identity: 'confirmed' },
        },
      }),
    );
  }
  it('erkennt nur die lokale Vinted-Erweiterung aus dem eigenen Fenster und Origin', () => {
    const bridge = TestBed.inject(VintedLocalExtensionBridge);
    const status = (origin: string, source: Window | null, vintedLocal: boolean) =>
      window.dispatchEvent(
        new MessageEvent('message', {
          origin,
          source,
          data: { type: 'FLIPBASE_EXTENSION_STATUS', installed: true, vintedLocal },
        }),
      );
    status('https://foreign.example', window, true);
    status(location.origin, null, true);
    status(location.origin, window, false);
    expect(bridge.installed()).toBe(false);
    status(location.origin, window, true);
    expect(bridge.installed()).toBe(true);
  });
  it('ignoriert fremde Quellen, Origins und Anfragekennungen', async () => {
    const post = vi.spyOn(window, 'postMessage').mockImplementation(() => undefined);
    const bridge = TestBed.inject(VintedLocalExtensionBridge);
    const pending = bridge.request('FLIPBASE_VINTED_LOCAL_PREPARE');
    const request = post.mock.calls[0][0] as { requestId: string };
    response(request.requestId, 'https://foreign.example');
    response(request.requestId, location.origin, null);
    response('wrong-request');
    let resolved = false;
    void pending.then(() => {
      resolved = true;
    });
    await Promise.resolve();
    expect(resolved).toBe(false);
    response(request.requestId);
    expect(await pending).toEqual({ identity: 'confirmed' });
    expect(post.mock.calls[0][1]).toBe(location.origin);
  });
  it('zeigt eine fehlende Installationsantwort und kann danach erneut prüfen', () => {
    vi.spyOn(window, 'postMessage').mockImplementation(() => undefined);
    const bridge = TestBed.inject(VintedLocalExtensionBridge);
    bridge.checkInstallation();
    expect(bridge.checkingInstallation()).toBe(true);
    vi.advanceTimersByTime(3_000);
    expect(bridge.checkingInstallation()).toBe(false);
    expect(bridge.installationCheckFailed()).toBe(true);
    bridge.checkInstallation();
    window.dispatchEvent(
      new MessageEvent('message', {
        origin: location.origin,
        source: window,
        data: { type: 'FLIPBASE_EXTENSION_STATUS', installed: true, vintedLocal: true },
      }),
    );
    expect(bridge.installed()).toBe(true);
    expect(bridge.checkingInstallation()).toBe(false);
    expect(bridge.installationCheckFailed()).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('behält eine erkannte Installation während der erneuten Prüfung bei', () => {
    vi.spyOn(window, 'postMessage').mockImplementation(() => undefined);
    const bridge = TestBed.inject(VintedLocalExtensionBridge);
    window.dispatchEvent(
      new MessageEvent('message', {
        origin: location.origin,
        source: window,
        data: { type: 'FLIPBASE_EXTENSION_STATUS', installed: true, vintedLocal: true },
      }),
    );
    bridge.checkInstallation();
    expect(bridge.installed()).toBe(true);
    TestBed.resetTestingModule();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('beendet eine fehlende Erweiterungsantwort nach einer Minute', async () => {
    vi.spyOn(window, 'postMessage').mockImplementation(() => undefined);
    const pending = TestBed.inject(VintedLocalExtensionBridge).request(
      'FLIPBASE_VINTED_LOCAL_PREPARE',
    );
    const assertion = expect(pending).rejects.toThrow('Erweiterung');
    await vi.advanceTimersByTimeAsync(60_000);
    await assertion;
  });
  it('beendet auch eine fehlende Synchronisierungsantwort nach einer Minute', async () => {
    vi.spyOn(window, 'postMessage').mockImplementation(() => undefined);
    const pending = TestBed.inject(VintedLocalExtensionBridge).request(
      'FLIPBASE_VINTED_LOCAL_SYNC',
      { workspaceId: 'workspace', connectionId: 'account' },
    );
    const assertion = expect(pending).rejects.toThrow('Erweiterung');
    await vi.advanceTimersByTimeAsync(60_000);
    await assertion;
  });
  it('verwirft offene Anfragen beim Verlassen der Ansicht', async () => {
    vi.spyOn(window, 'postMessage').mockImplementation(() => undefined);
    const pending = TestBed.inject(VintedLocalExtensionBridge).request(
      'FLIPBASE_VINTED_LOCAL_PREPARE',
    );
    const assertion = expect(pending).rejects.toThrow('geschlossen');
    TestBed.resetTestingModule();
    await assertion;
    expect(vi.getTimerCount()).toBe(0);
  });
});
