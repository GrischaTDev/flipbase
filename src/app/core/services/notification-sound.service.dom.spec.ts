import '@angular/compiler';
import { Injector } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { NotificationSoundService } from './notification-sound.service';

function createTestSource() {
  return {
    connect: vi.fn(),
    disconnect: vi.fn(),
    start: vi.fn<(when?: number) => void>(),
    stop: vi.fn<(when?: number) => void>(),
    onended: null as (() => void) | null,
  };
}

function createTestOscillator() {
  return {
    ...createTestSource(),
    type: 'sine',
    frequency: { setValueAtTime: vi.fn() },
  };
}

function createTestBufferSource() {
  return { ...createTestSource(), buffer: null as AudioBuffer | null };
}

function createTestGain() {
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

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

const recordingBytes = new Uint8Array([82, 73, 70, 70]);

class TestAudioContext {
  static instances: TestAudioContext[] = [];
  state: AudioContextState = 'suspended';
  currentTime = 0;
  destination = {};
  decodedBuffer = { duration: 1.2 } as AudioBuffer;
  oscillators: ReturnType<typeof createTestOscillator>[] = [];
  sources: ReturnType<typeof createTestBufferSource>[] = [];
  gains: ReturnType<typeof createTestGain>[] = [];
  resume = vi.fn(async () => {
    this.state = 'running';
  });
  close = vi.fn(async () => {
    this.state = 'closed';
  });
  decodeAudioData = vi.fn(async (_bytes: ArrayBuffer) => this.decodedBuffer);
  constructor() {
    TestAudioContext.instances.push(this);
  }
  createOscillator() {
    const oscillator = createTestOscillator();
    this.oscillators.push(oscillator);
    return oscillator;
  }
  createBufferSource() {
    const source = createTestBufferSource();
    this.sources.push(source);
    return source;
  }
  createGain() {
    const gain = createTestGain();
    this.gains.push(gain);
    return gain;
  }
}

async function waitForPreparation(context: TestAudioContext) {
  await vi.waitFor(() => expect(context.decodeAudioData).toHaveBeenCalledOnce());
  await Promise.resolve();
}

describe('Benachrichtigungstöne im Browser', () => {
  let injector: ReturnType<typeof Injector.create>;
  let service: NotificationSoundService;
  let destroyed: boolean;
  let fetchAudio: Mock<typeof fetch>;

  beforeEach(() => {
    TestAudioContext.instances = [];
    destroyed = false;
    fetchAudio = vi.fn<typeof fetch>().mockImplementation(async () => new Response(recordingBytes));
    vi.stubGlobal('fetch', fetchAudio);
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
    expect(fetchAudio).not.toHaveBeenCalled();
  });

  it.each(['pointerup', 'touchend', 'keydown'])(
    'gibt Audio nach %s frei und bereitet den Kassenton ohne Wiedergabe vor',
    async (event) => {
      document.dispatchEvent(new Event(event));
      const context = TestAudioContext.instances[0];
      await waitForPreparation(context);

      expect(TestAudioContext.instances).toHaveLength(1);
      expect(fetchAudio).toHaveBeenCalledExactlyOnceWith(
        '/sounds/sale-cash-register.wav',
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
      expect(context.sources).toHaveLength(0);
      expect(service.play('general')).toBe(true);
    },
  );

  it('spielt die Kassenaufnahme und den unveränderten allgemeinen Ton über denselben Kontext', async () => {
    expect(await service.preview('general')).toBe(true);
    const context = TestAudioContext.instances[0];
    expect(
      context.oscillators.map((node) => node.frequency.setValueAtTime.mock.calls[0][0]),
    ).toEqual([660, 880]);
    expect(await service.preview('sale')).toBe(true);

    expect(TestAudioContext.instances).toHaveLength(1);
    expect(context.oscillators).toHaveLength(2);
    expect(context.sources).toHaveLength(1);
    expect(context.sources[0].buffer).toBe(context.decodedBuffer);
    expect(context.sources[0].start).toHaveBeenCalledExactlyOnceWith(0);
    expect(context.gains.at(-1)?.gain.setValueAtTime).toHaveBeenCalledExactlyOnceWith(0.5, 0);
    expect(new Uint8Array(context.decodeAudioData.mock.calls[0][0])).toEqual(recordingBytes);
    for (const node of context.oscillators) {
      const start = node.start.mock.calls[0][0] as number;
      const stop = node.stop.mock.calls[0][0] as number;
      expect(stop).toBeGreaterThan(start);
      expect(stop - start).toBeLessThan(1);
    }
  });

  it('lädt und decodiert nur einmal, erzeugt aber je Wiedergabe eine neue Quelle', async () => {
    expect(await service.preview('sale')).toBe(true);
    const context = TestAudioContext.instances[0];
    const first = context.sources[0];
    expect(await service.preview('sale')).toBe(true);

    expect(fetchAudio).toHaveBeenCalledOnce();
    expect(context.decodeAudioData).toHaveBeenCalledOnce();
    expect(context.sources).toHaveLength(2);
    expect(context.sources[1]).not.toBe(first);
    expect(context.sources[1].buffer).toBe(first.buffer);
    expect(first.stop).toHaveBeenCalledOnce();
    expect(first.disconnect).toHaveBeenCalledOnce();
    expect(context.sources.every((source) => source.start.mock.calls.length === 1)).toBe(true);
  });

  it('bündelt gleichzeitiges Vorladen und holt einen währenddessen eingehenden Verkauf nicht nach', async () => {
    const loading = deferred<Response>();
    fetchAudio.mockReturnValueOnce(loading.promise);
    document.dispatchEvent(new Event('pointerdown'));
    document.dispatchEvent(new Event('pointerup'));
    document.dispatchEvent(new Event('keydown'));
    await vi.waitFor(() => expect(fetchAudio).toHaveBeenCalledOnce());
    const context = TestAudioContext.instances[0];

    expect(service.play('sale')).toBe(false);
    expect(context.sources).toHaveLength(0);
    expect(context.oscillators).toHaveLength(0);
    loading.resolve(new Response(recordingBytes));
    await waitForPreparation(context);

    expect(fetchAudio).toHaveBeenCalledOnce();
    expect(context.sources).toHaveLength(0);
    expect(service.play('sale')).toBe(true);
    expect(context.sources).toHaveLength(1);
  });

  it.each(['suspended', 'interrupted'] as const)(
    'holt nach %s keinen zuvor blockierten Verkaufston nach',
    async (state) => {
      await service.preview('sale');
      const context = TestAudioContext.instances[0];
      context.state = state;
      const count = context.sources.length;
      context.resume.mockClear();

      expect(service.play('sale')).toBe(false);
      expect(context.resume).not.toHaveBeenCalled();
      document.dispatchEvent(new Event('pointerdown'));
      await Promise.resolve();
      await Promise.resolve();

      expect(context.state).toBe('running');
      expect(context.sources).toHaveLength(count);
      expect(service.play('sale')).toBe(true);
    },
  );

  it.each(['network', 'http', 'decode'] as const)(
    'meldet einen Fehler bei %s ohne falschen Ersatzton und erlaubt einen neuen Versuch',
    async (failure) => {
      if (failure === 'network') fetchAudio.mockRejectedValueOnce(new Error('offline'));
      if (failure === 'http') fetchAudio.mockResolvedValueOnce(new Response('', { status: 503 }));
      const preview = service.preview('sale');
      const context = TestAudioContext.instances[0];
      if (failure === 'decode')
        context.decodeAudioData.mockRejectedValueOnce(new Error('invalid audio'));
      await expect(preview).resolves.toBe(false);
      expect(context.sources).toHaveLength(0);
      expect(context.oscillators).toHaveLength(0);

      expect(await service.preview('sale')).toBe(true);
      expect(fetchAudio).toHaveBeenCalledTimes(2);
      expect(context.sources).toHaveLength(1);
    },
  );

  it('spielt den allgemeinen Ton auch während die Aufnahme noch lädt', async () => {
    const loading = deferred<Response>();
    fetchAudio.mockReturnValueOnce(loading.promise);
    expect(await service.preview('general')).toBe(true);
    const context = TestAudioContext.instances[0];
    expect(context.oscillators).toHaveLength(2);
    expect(context.sources).toHaveLength(0);
    loading.resolve(new Response(recordingBytes));
    await waitForPreparation(context);
    expect(context.sources).toHaveLength(0);
  });

  it('spielt von zwei gleichzeitig angeforderten Vorschauen nur die jüngste', async () => {
    const loading = deferred<Response>();
    fetchAudio.mockReturnValueOnce(loading.promise);
    const first = service.preview('sale');
    const second = service.preview('sale');
    await vi.waitFor(() => expect(fetchAudio).toHaveBeenCalledOnce());
    loading.resolve(new Response(recordingBytes));

    await expect(first).resolves.toBe('cancelled');
    await expect(second).resolves.toBe(true);
    const context = TestAudioContext.instances[0];
    expect(context.decodeAudioData).toHaveBeenCalledOnce();
    expect(context.sources).toHaveLength(1);
  });

  it('holt eine wartende Vorschau nach einer neueren automatischen Meldung nicht nach', async () => {
    const loading = deferred<Response>();
    fetchAudio.mockReturnValueOnce(loading.promise);
    const preview = service.preview('sale');
    await vi.waitFor(() => expect(fetchAudio).toHaveBeenCalledOnce());
    expect(service.play('general')).toBe(true);
    loading.resolve(new Response(recordingBytes));

    await expect(preview).resolves.toBe('cancelled');
    const context = TestAudioContext.instances[0];
    expect(context.oscillators).toHaveLength(2);
    expect(context.sources).toHaveLength(0);
  });

  it('bricht eine verlassene Vorschau ab und behält die gemeinsam vorbereitete Aufnahme', async () => {
    const decoding = deferred<AudioBuffer>();
    const preview = service.preview('sale');
    const context = TestAudioContext.instances[0];
    context.decodeAudioData.mockReturnValueOnce(decoding.promise);
    await vi.waitFor(() => expect(context.decodeAudioData).toHaveBeenCalledOnce());
    service.cancelPreview();
    decoding.resolve(context.decodedBuffer);

    await expect(preview).resolves.toBe('cancelled');
    expect(context.sources).toHaveLength(0);
    expect(service.play('sale')).toBe(true);
    expect(fetchAudio).toHaveBeenCalledOnce();
    expect(context.decodeAudioData).toHaveBeenCalledOnce();
  });

  it('fängt abgelehnte Audiofreigabe ab', async () => {
    await service.preview('general');
    const context = TestAudioContext.instances[0];
    context.resume.mockRejectedValueOnce(new Error('blocked'));
    context.state = 'suspended';
    const count = context.sources.length;

    await expect(service.preview('sale')).resolves.toBe(false);
    expect(context.sources).toHaveLength(count);
  });

  it('bleibt ohne Audio-API funktionsfähig', async () => {
    vi.stubGlobal('AudioContext', undefined);
    await expect(service.preview('general')).resolves.toBe(false);
    expect(service.play('sale')).toBe(false);
    expect(fetchAudio).not.toHaveBeenCalled();
  });

  it('trennt eine natürlich beendete Aufnahme und ihren Pegelknoten', async () => {
    await service.preview('sale');
    const context = TestAudioContext.instances[0];
    const source = context.sources[0];
    const gain = context.gains[0];
    source.onended?.();

    expect(source.disconnect).toHaveBeenCalledOnce();
    expect(gain.disconnect).toHaveBeenCalledOnce();
    injector.destroy();
    destroyed = true;
    expect(source.stop).not.toHaveBeenCalled();
  });

  it('bricht beim Beenden einen laufenden Download ab und gibt den Audiokontext frei', async () => {
    const loading = deferred<Response>();
    fetchAudio.mockReturnValueOnce(loading.promise);
    const preview = service.preview('sale');
    await vi.waitFor(() => expect(fetchAudio).toHaveBeenCalledOnce());
    const context = TestAudioContext.instances[0];
    const signal = fetchAudio.mock.calls[0][1]?.signal;
    injector.destroy();
    destroyed = true;
    expect(signal?.aborted).toBe(true);
    loading.resolve(new Response(recordingBytes));

    await expect(preview).resolves.toBe('cancelled');
    expect(context.decodeAudioData).not.toHaveBeenCalled();
    expect(context.sources).toHaveLength(0);
    expect(context.close).toHaveBeenCalledOnce();
    document.dispatchEvent(new Event('pointerdown'));
    expect(TestAudioContext.instances).toHaveLength(1);
    expect(service.play('general')).toBe(false);
  });

  it('startet nach dem Beenden auch nach verspäteter Decodierung keine Aufnahme', async () => {
    const decoding = deferred<AudioBuffer>();
    const preview = service.preview('sale');
    const context = TestAudioContext.instances[0];
    context.decodeAudioData.mockReturnValueOnce(decoding.promise);
    await vi.waitFor(() => expect(context.decodeAudioData).toHaveBeenCalledOnce());
    injector.destroy();
    destroyed = true;
    decoding.resolve(context.decodedBuffer);

    await expect(preview).resolves.toBe('cancelled');
    expect(context.sources).toHaveLength(0);
    expect(context.close).toHaveBeenCalledOnce();
    expect(service.play('sale')).toBe(false);
  });

  it.each(['sale', 'general'] as const)(
    'stoppt aktive Klangerzeuger für %s beim Beenden',
    async (kind) => {
      await service.preview(kind);
      const context = TestAudioContext.instances[0];
      injector.destroy();
      destroyed = true;

      expect(context.close).toHaveBeenCalledOnce();
      for (const source of context.sources) {
        expect(source.stop).toHaveBeenCalledOnce();
        expect(source.disconnect).toHaveBeenCalledOnce();
      }
      for (const oscillator of context.oscillators) {
        expect(oscillator.stop).toHaveBeenCalledTimes(2);
        expect(oscillator.disconnect).toHaveBeenCalledOnce();
      }
      expect(service.play('general')).toBe(false);
    },
  );
});
