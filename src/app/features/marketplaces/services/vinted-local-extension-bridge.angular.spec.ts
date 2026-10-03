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
  it('beendet eine fehlende Erweiterungsantwort nach einer Minute', async () => {
    vi.spyOn(window, 'postMessage').mockImplementation(() => undefined);
    const pending = TestBed.inject(VintedLocalExtensionBridge).request(
      'FLIPBASE_VINTED_LOCAL_PREPARE',
    );
    const assertion = expect(pending).rejects.toThrow('Erweiterung');
    await vi.advanceTimersByTimeAsync(60_000);
    await assertion;
  });
  it('wartet bei der manuellen Datenübernahme höchstens fünf Minuten', async () => {
    vi.spyOn(window, 'postMessage').mockImplementation(() => undefined);
    const pending = TestBed.inject(VintedLocalExtensionBridge).request(
      'FLIPBASE_VINTED_LOCAL_SYNC',
      { workspaceId: 'workspace', connectionId: 'account' },
    );
    const assertion = expect(pending).rejects.toThrow('Erweiterung');
    await vi.advanceTimersByTimeAsync(300_000);
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
