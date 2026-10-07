import { ɵresolveComponentResources } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { glob, readFile } from 'node:fs/promises';
import { provideRouter } from '@angular/router';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { SniperBrowserService } from '../../services/sniper-browser.service';
import { SniperBrowserConnectComponent } from './sniper-browser-connect.component';

const sessionId = '12345678-1234-1234-1234-123456789012';
beforeAll(async () => {
  await ɵresolveComponentResources(async (url) => {
    const matches: string[] = [];
    for await (const match of glob(`src/app/**/${url.replace(/^\.\//u, '')}`)) matches.push(match);
    if (matches.length !== 1) throw new Error(`Test-Ressource ${url} ist nicht eindeutig.`);
    return readFile(matches[0], 'utf8');
  });
});
describe('SniperBrowserConnectComponent', () => {
  const api = {
    status: vi.fn(),
    open: vi.fn(),
    frame: vi.fn(),
    input: vi.fn(),
    verify: vi.fn(),
    close: vi.fn(),
  };
  beforeEach(() => {
    vi.resetAllMocks();
    api.status.mockResolvedValue({
      state: 'interaction_required',
      sessionId: null,
      expiresAt: null,
      message: null,
    });
    api.open.mockResolvedValue({
      state: 'manual',
      sessionId,
      expiresAt: new Date(Date.now() + 600000).toISOString(),
      message: null,
    });
    api.frame.mockResolvedValue(new Blob(['fixture'], { type: 'image/jpeg' }));
    api.close.mockResolvedValue(undefined);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fixture');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    // Klassenverhalten und Ressourcenlebensdauer; das echte Template prüft der Browsertest.
    TestBed.overrideComponent(SniperBrowserConnectComponent, {
      set: { template: '', imports: [] },
    });
    TestBed.configureTestingModule({
      imports: [SniperBrowserConnectComponent],
      providers: [provideRouter([]), { provide: SniperBrowserService, useValue: api }],
    });
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });
  it('opens once and does not create a second session during startup', async () => {
    const fixture = TestBed.createComponent(SniperBrowserConnectComponent);
    fixture.detectChanges();
    await fixture.componentInstance.open();
    await vi.waitFor(() => expect(fixture.componentInstance.session()?.sessionId).toBe(sessionId));
    expect(api.open).toHaveBeenCalledTimes(1);
    fixture.destroy();
  });
  it('discards a late screenshot after close and revokes the current image', async () => {
    let resolveFrame: (frame: Blob) => void = () => undefined;
    api.frame.mockReturnValue(
      new Promise<Blob>((resolve) => {
        resolveFrame = resolve;
      }),
    );
    const fixture = TestBed.createComponent(SniperBrowserConnectComponent);
    await fixture.componentInstance.open();
    await vi.waitFor(() => expect(api.frame).toHaveBeenCalled());
    await fixture.componentInstance.close();
    resolveFrame(new Blob(['late']));
    await Promise.resolve();
    await Promise.resolve();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(api.close).toHaveBeenCalledWith(sessionId);
    expect(fixture.componentInstance.frameUrl()).toBeNull();
    fixture.destroy();
  });
  it('shows a verification failure and keeps the bot paused', async () => {
    api.verify.mockRejectedValue(new Error('Vinted verlangt weiterhin eine Prüfung.'));
    const fixture = TestBed.createComponent(SniperBrowserConnectComponent);
    await fixture.componentInstance.open();
    await vi.waitFor(() => expect(fixture.componentInstance.session()?.sessionId).toBe(sessionId));
    await fixture.componentInstance.verify();
    expect(fixture.componentInstance.error()).toContain('Vinted verlangt weiterhin');
    expect(fixture.componentInstance.frameUrl()).toBeNull();
    expect(fixture.componentInstance.session()).toBeNull();
    fixture.destroy();
  });
  it('rejects an expired session before requesting frames', async () => {
    api.open.mockResolvedValue({
      state: 'manual',
      sessionId,
      expiresAt: new Date(Date.now() - 1000).toISOString(),
      message: null,
    });
    const fixture = TestBed.createComponent(SniperBrowserConnectComponent);
    await fixture.componentInstance.open();
    await vi.waitFor(() => expect(fixture.componentInstance.error()).toContain('abgelaufen'));
    expect(api.frame).not.toHaveBeenCalled();
    expect(fixture.componentInstance.error()).toContain('abgelaufen');
    fixture.destroy();
  });
  it('cancels the actual lease on close during verification and discards its late result', async () => {
    let finish: (status: unknown) => void = () => undefined;
    api.verify.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const fixture = TestBed.createComponent(SniperBrowserConnectComponent);
    await vi.waitFor(() => expect(fixture.componentInstance.session()?.sessionId).toBe(sessionId));
    const verifying = fixture.componentInstance.verify();
    await fixture.componentInstance.close();
    expect(api.close).toHaveBeenCalledWith(sessionId);
    finish({ state: 'ready', sessionId: null, expiresAt: null, message: null });
    await verifying;
    expect(fixture.componentInstance.confirmed()).toBe(false);
    fixture.destroy();
  });
});
