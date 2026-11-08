import '@angular/compiler';
import { Injector } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NotificationSoundService } from './notification-sound.service';

function createTestOscillator() {
  return {
    type: 'sine',
    frequency: { setValueAtTime: vi.fn() },
    connect: vi.fn(),
    disconnect: vi.fn(),
    start: vi.fn<(when?: number) => void>(),
    stop: vi.fn<(when?: number) => void>(),
    onended: null as (() => void) | null,
  };
}

class TestAudioContext {
  static instances: TestAudioContext[] = [];
  state: AudioContextState = 'suspended';
  currentTime = 0;
  destination = {};
  oscillators: ReturnType<typeof createTestOscillator>[] = [];
  resume = vi.fn(async () => {
    this.state = 'running';
  });
  close = vi.fn(async () => {
    this.state = 'closed';
  });
  constructor() {
    TestAudioContext.instances.push(this);
  }
  createOscillator() {
    const oscillator = createTestOscillator();
    this.oscillators.push(oscillator);
    return oscillator;
  }
  createGain() {
    return {
      gain: {
        setValueAtTime: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
      disconnect: vi.fn(),
    };
  }
}

describe('Benachrichtigungstöne im Browser', () => {
  let injector: ReturnType<typeof Injector.create>;
  let service: NotificationSoundService;
  let destroyed: boolean;

  beforeEach(() => {
    TestAudioContext.instances = [];
    destroyed = false;
    vi.stubGlobal('AudioContext', TestAudioContext);
    injector = Injector.create({ providers: [NotificationSoundService] });
    service = injector.get(NotificationSoundService);
  });

  afterEach(() => {
    if (!destroyed) injector.destroy();
    vi.unstubAllGlobals();
  });

  it('öffnet vor einer Nutzeraktion keinen Audiokontext und wartet keine Meldung auf', () => {
    expect(service.play('sale')).toBe(false);
    expect(TestAudioContext.instances).toHaveLength(0);
  });

  it.each(['pointerup', 'touchend', 'keydown'])(
    'gibt Audio nach %s ohne Probehören frei',
    async (event) => {
      document.dispatchEvent(new Event(event));
      await Promise.resolve();
      await Promise.resolve();

      expect(TestAudioContext.instances).toHaveLength(1);
      expect(service.play('general')).toBe(true);
    },
  );

  it('spielt beim Probehören unterschiedliche kurze Klänge über denselben Audiokontext', async () => {
    expect(await service.preview('general')).toBe(true);
    const context = TestAudioContext.instances[0];
    const general = context.oscillators.map((node) => node.frequency.setValueAtTime.mock.calls);
    const count = context.oscillators.length;

    expect(await service.preview('sale')).toBe(true);
    const sale = context.oscillators
      .slice(count)
      .map((node) => node.frequency.setValueAtTime.mock.calls);

    expect(TestAudioContext.instances).toHaveLength(1);
    expect(general.length).toBeGreaterThan(0);
    expect(sale.length).toBeGreaterThan(0);
    expect(sale).not.toEqual(general);
    expect(context.oscillators.every((node) => node.start.mock.calls.length === 1)).toBe(true);
    for (const node of context.oscillators) {
      const start = node.start.mock.calls[0][0] as number;
      const stop = node.stop.mock.calls[0][0] as number;
      expect(stop).toBeGreaterThan(start);
      expect(stop - start).toBeLessThan(1);
    }
  });

  it.each(['suspended', 'interrupted'] as const)(
    'holt nach %s keinen zuvor blockierten Verkaufston nach',
    async (state) => {
      await service.preview('general');
      const context = TestAudioContext.instances[0];
      context.state = state;
      const count = context.oscillators.length;
      context.resume.mockClear();

      expect(service.play('sale')).toBe(false);
      expect(context.resume).not.toHaveBeenCalled();
      document.dispatchEvent(new Event('pointerdown'));
      await Promise.resolve();
      await Promise.resolve();

      expect(context.state).toBe('running');
      expect(context.oscillators).toHaveLength(count);
      expect(service.play('sale')).toBe(true);
    },
  );

  it('fängt abgelehnte Audiowiedergabe ab', async () => {
    document.dispatchEvent(new Event('pointerdown'));
    await Promise.resolve();
    await Promise.resolve();
    const context = TestAudioContext.instances[0];
    context.state = 'suspended';
    context.resume.mockRejectedValueOnce(new Error('blocked'));

    await expect(service.preview('sale')).resolves.toBe(false);
    expect(context.oscillators).toHaveLength(0);
  });

  it('bleibt ohne Audio-API funktionsfähig', async () => {
    vi.stubGlobal('AudioContext', undefined);
    await expect(service.preview('general')).resolves.toBe(false);
    expect(service.play('sale')).toBe(false);
  });

  it('gibt den Audiokontext und aktive Klangerzeuger beim Beenden frei', async () => {
    await service.preview('sale');
    const context = TestAudioContext.instances[0];
    injector.destroy();
    destroyed = true;
    expect(context.close).toHaveBeenCalledOnce();
    expect(context.oscillators.every((node) => node.disconnect.mock.calls.length > 0)).toBe(true);
    expect(service.play('general')).toBe(false);
  });
});
