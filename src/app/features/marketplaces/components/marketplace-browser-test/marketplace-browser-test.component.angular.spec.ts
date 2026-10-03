import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MarketplaceAccountStore } from '../../services/marketplace-account.store';
import { MarketplaceBrowserTestStore } from '../../services/marketplace-browser-test.store';
import { createMarketplaceFixtures } from '../../testing/marketplace-fixtures';
import { MarketplaceBrowserTestComponent } from './marketplace-browser-test.component';

const [account] = createMarketplaceFixtures().connections;
const session = signal<{ id: string; frameUrl: string | null } | null>(null);
const sendInput = vi.fn().mockResolvedValue(undefined);
const dragSupported = signal(true);
const awaitingLogin = signal(false);
const manualLogin = signal(false);
const startManualLogin = vi.fn().mockResolvedValue(undefined);
const checkLogin = vi.fn().mockResolvedValue(undefined);
let browserImage: HTMLButtonElement;
let component: MarketplaceBrowserTestComponent;

function pointer(type: string, x: number, y: number, timestamp: number, pointerId = 1): void {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
    button: 0,
  });
  Object.defineProperties(event, {
    pointerId: { value: pointerId },
    isPrimary: { value: true },
    timeStamp: { value: timestamp },
  });
  Object.defineProperty(event, 'currentTarget', { value: browserImage });
  if (type === 'pointerdown') component.startPointer(event as PointerEvent);
  if (type === 'pointermove') component.movePointer(event as PointerEvent);
  if (type === 'pointerup') void component.endPointer(event as PointerEvent);
  if (type === 'pointercancel') component.cancelPointer(event as PointerEvent);
}

beforeEach(async () => {
  vi.useFakeTimers();
  session.set({ id: 'session-a', frameUrl: 'blob:preview' });
  sendInput.mockClear();
  dragSupported.set(true);
  awaitingLogin.set(false);
  manualLogin.set(false);
  startManualLogin.mockClear();
  checkLogin.mockClear();
  TestBed.configureTestingModule({
    providers: [
      {
        provide: MarketplaceAccountStore,
        useValue: {
          canManage: signal(true),
          mutationError: signal(null),
        },
      },
      {
        provide: MarketplaceBrowserTestStore,
        useValue: {
          session,
          dragSupported,
          connection: signal(account),
          available: signal(true),
          readOnly: signal(false),
          availabilityChecked: signal(true),
          outdated: signal(false),
          busy: signal(false),
          canAct: signal(true),
          canLogin: signal(true),
          canStart: signal(false),
          awaitingLogin,
          manualLogin,
          startManualLogin,
          awaitingVerification: signal(false),
          interactionRequired: signal(false),
          progress: signal(null),
          error: signal(null),
          checkAvailability: vi.fn(),
          checkLogin,
          input: sendInput,
        },
      },
    ],
  });
  component = TestBed.runInInjectionContext(() => new MarketplaceBrowserTestComponent());
  TestBed.tick();
  browserImage = document.createElement('button');
  vi.spyOn(browserImage, 'getBoundingClientRect').mockReturnValue({
    left: 10,
    top: 20,
    width: 200,
    height: 100,
    right: 210,
    bottom: 120,
    x: 10,
    y: 20,
    toJSON: () => ({}),
  });
  Object.assign(browserImage, {
    setPointerCapture: vi.fn(),
    hasPointerCapture: vi.fn(() => true),
    releasePointerCapture: vi.fn(),
  });
});

afterEach(() => {
  TestBed.resetTestingModule();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

it('zeigt bei sichtbarem Browser keinen zweiten großen Ladespinner', () => {
  awaitingLogin.set(true);
  expect(component.showProgress()).toBe(false);
});

it('sperrt die manuelle Browseransicht nicht durch automatische Anmeldeprüfungen', async () => {
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  awaitingLogin.set(true);
  await vi.advanceTimersByTimeAsync(6000);
  expect(checkLogin).not.toHaveBeenCalled();
});

it('prüft eine Anmeldung im Hintergrund weiterhin automatisch', async () => {
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  session.set({ id: 'session-a', frameUrl: null });
  awaitingLogin.set(true);
  await vi.advanceTimersByTimeAsync(3000);
  expect(checkLogin).toHaveBeenCalledOnce();
  expect(component.showProgress()).toBe(true);
});

it('prüft im manuellen Modus auch ohne Browserbild nicht im Hintergrund', async () => {
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  session.set({ id: 'session-a', frameUrl: null });
  manualLogin.set(true);
  awaitingLogin.set(true);
  await vi.advanceTimersByTimeAsync(6000);
  expect(checkLogin).not.toHaveBeenCalled();
});

it('entfernt Formularinhalte vor dem Wechsel in die manuelle Anmeldung', async () => {
  component.loginForm.setValue({ username: 'synthetic', password: 'synthetic' });
  component.code.setValue('123456');
  component.manualTextInput.setValue('synthetic');
  await component.openManualBrowser();
  expect(startManualLogin).toHaveBeenCalledOnce();
  expect(component.loginForm.getRawValue()).toEqual({ username: '', password: '' });
  expect(component.code.value).toBe('');
  expect(component.manualTextInput.value).toBe('');
});

it('überträgt eine manuelle Ziehbewegung erst beim Loslassen mit Positionen und Zeiten', () => {
  pointer('pointerdown', 30, 40, 1000);
  pointer('pointermove', 70, 50, 1100);
  expect(sendInput).not.toHaveBeenCalled();
  pointer('pointerup', 170, 70, 1300);
  const clickEvent = new MouseEvent('click', { bubbles: true, detail: 1 });
  Object.defineProperty(clickEvent, 'currentTarget', { value: browserImage });
  component.clickFrame(clickEvent);
  expect(sendInput).toHaveBeenCalledExactlyOnceWith({
    kind: 'drag',
    points: [
      { x: 0.1, y: 0.2, elapsedMs: 0 },
      { x: 0.3, y: 0.3, elapsedMs: 100 },
      { x: 0.8, y: 0.5, elapsedMs: 300 },
    ],
  });
});

it('überträgt einen kurzen Zeigerdruck als genau einen Klick', () => {
  pointer('pointerdown', 30, 40, 1000);
  pointer('pointerup', 30, 40, 1050);
  const clickEvent = new MouseEvent('click', { bubbles: true, detail: 1 });
  Object.defineProperty(clickEvent, 'currentTarget', { value: browserImage });
  component.clickFrame(clickEvent);
  expect(sendInput).toHaveBeenCalledExactlyOnceWith({ kind: 'click', x: 0.1, y: 0.2 });
});

it('verwirft eine abgebrochene Geste vollständig', () => {
  pointer('pointerdown', 30, 40, 1000);
  pointer('pointermove', 100, 40, 1100);
  pointer('pointercancel', 100, 40, 1200);
  pointer('pointerup', 170, 40, 1300);
  expect(sendInput).not.toHaveBeenCalled();
});

it('sendet nach einem Sitzungswechsel keine alte Ziehbewegung', () => {
  pointer('pointerdown', 30, 40, 1000);
  pointer('pointermove', 100, 40, 1100);
  session.set({ id: 'session-b', frameUrl: 'blob:other-preview' });
  pointer('pointerup', 170, 40, 1300);
  expect(sendInput).not.toHaveBeenCalled();
});

it('gibt die Zeigeraufnahme bei einem Sitzungswechsel sofort frei', () => {
  pointer('pointerdown', 30, 40, 1000);
  session.set(null);
  TestBed.tick();
  expect(component.pointerPosition()).toBeNull();
  expect(browserImage.releasePointerCapture).toHaveBeenCalledWith(1);
});

it('sendet keine Ziehbewegung an einen älteren Browserdienst', () => {
  dragSupported.set(false);
  pointer('pointerdown', 30, 40, 1000);
  pointer('pointerup', 170, 40, 1300);
  expect(sendInput).not.toHaveBeenCalled();
  expect(component.pointerMessage()).toContain('momentan nicht verfügbar');
});

it('begrenzt lange Gesten auf echte Messpunkte und behält Anfang und Ende', () => {
  pointer('pointerdown', 30, 40, 1000);
  for (let index = 1; index <= 400; index++)
    pointer('pointermove', 30 + index / 4, 40, 1000 + index * 32);
  pointer('pointerup', 170, 40, 14_000);
  const input = sendInput.mock.calls[0]?.[0] as {
    kind: string;
    points: { x: number; y: number; elapsedMs: number }[];
  };
  expect(input.kind).toBe('drag');
  expect(input.points.length).toBeLessThanOrEqual(128);
  expect(input.points[0]).toEqual({ x: 0.1, y: 0.2, elapsedMs: 0 });
  expect(input.points.at(-1)).toEqual({ x: 0.8, y: 0.2, elapsedMs: 13_000 });
  expect(
    input.points.every(
      (point, index) => index === 0 || point.elapsedMs > input.points[index - 1].elapsedMs,
    ),
  ).toBe(true);
});

it('verwirft eine Bewegung über 15 Sekunden', () => {
  pointer('pointerdown', 30, 40, 1000);
  pointer('pointerup', 170, 40, 16_001);
  expect(sendInput).not.toHaveBeenCalled();
  expect(component.pointerMessage()).toContain('abgebrochen');
});

it('behält die echte Loslassposition auch bei gleichem Zeitstempel', () => {
  pointer('pointerdown', 30, 40, 1000);
  pointer('pointermove', 100, 40, 1100);
  pointer('pointerup', 170, 40, 1100);
  const input = sendInput.mock.calls[0]?.[0] as { points: { x: number; elapsedMs: number }[] };
  expect(input.points.at(-1)).toEqual({ x: 0.8, y: 0.2, elapsedMs: 100 });
});

it('übernimmt nach Zeigerabbruch weiterhin den Tastaturklick', () => {
  pointer('pointerdown', 30, 40, 1000);
  pointer('pointercancel', 100, 40, 1200);
  const event = new MouseEvent('click', { detail: 0 });
  Object.defineProperty(event, 'currentTarget', { value: browserImage });
  component.clickFrame(event);
  expect(sendInput).toHaveBeenCalledExactlyOnceWith({ kind: 'click', x: 0.5, y: 0.5 });
});
