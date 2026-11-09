import { DestroyRef, Injectable, inject } from '@angular/core';

export type NotificationSoundKind = 'general' | 'sale';
export type NotificationSoundPreviewResult = boolean | 'cancelled';

const SALE_SOUND_URL = '/sounds/sale-cash-register.wav';

interface WindowWithWebkitAudio extends Window {
  readonly webkitAudioContext?: typeof AudioContext;
}

@Injectable({ providedIn: 'root' })
export class NotificationSoundService {
  private readonly destroyRef = inject(DestroyRef);
  private context: AudioContext | null = null;
  private readonly voices = new Map<AudioScheduledSourceNode, GainNode>();
  private saleBuffer: AudioBuffer | null = null;
  private saleBufferLoad: Promise<AudioBuffer | null> | null = null;
  private saleLoadAbort: AbortController | null = null;
  private previewRequestId = 0;
  private destroyed = false;
  private readonly activateAudio = () => {
    void this.unlock();
  };
  private readonly activationEvents = ['pointerdown', 'pointerup', 'touchend', 'keydown'] as const;

  constructor() {
    if (typeof document !== 'undefined') {
      // Touch und Stift aktivieren den Browser erst beim Loslassen.
      for (const event of this.activationEvents)
        document.addEventListener(event, this.activateAudio, { capture: true, passive: true });
    }
    this.destroyRef.onDestroy(() => {
      this.destroyed = true;
      this.cancelPreview();
      this.abortSaleLoad();
      this.saleBuffer = null;
      if (typeof document !== 'undefined') {
        for (const event of this.activationEvents)
          document.removeEventListener(event, this.activateAudio, true);
      }
      this.stopVoices();
      if (this.context && this.context.state !== 'closed')
        void this.context.close().catch(() => {
          // Ein abgelehntes Schließen darf das Beenden der App nicht unterbrechen.
        });
      this.context = null;
    });
  }

  /** Automatische Meldungen warten nie auf eine spätere Browserfreigabe. */
  play(kind: NotificationSoundKind): boolean {
    const context = this.context;
    if (this.destroyed || !context || context.state !== 'running') return false;
    const saleBuffer = kind === 'sale' ? this.saleBuffer : null;
    if (kind === 'sale' && !saleBuffer) return false;
    try {
      this.cancelPreview();
      this.stopVoices();
      const start = context.currentTime;
      if (saleBuffer) {
        this.playSaleRecording(context, saleBuffer, start);
      } else {
        this.tone(context, 660, start, 0.14, 0.065);
        this.tone(context, 880, start + 0.11, 0.25, 0.055);
      }
      return true;
    } catch {
      this.stopVoices();
      return false;
    }
  }

  async preview(kind: NotificationSoundKind): Promise<NotificationSoundPreviewResult> {
    const requestId = ++this.previewRequestId;
    const context = await this.unlock();
    if (this.destroyed || requestId !== this.previewRequestId) return 'cancelled';
    if (!context) return false;
    const prepared = kind !== 'sale' || !!(await this.prepareSaleSound(context));
    if (this.destroyed || requestId !== this.previewRequestId || context !== this.context)
      return 'cancelled';
    return prepared && this.play(kind);
  }

  /** Eine verlassene oder ersetzte Vorschau darf nach dem Laden nicht mehr starten. */
  cancelPreview(): void {
    this.previewRequestId += 1;
  }

  private async unlock(): Promise<AudioContext | null> {
    if (this.destroyed || typeof window === 'undefined') return null;
    try {
      if (!this.context || this.context.state === 'closed') {
        this.abortSaleLoad();
        const AudioContextClass =
          window.AudioContext || (window as WindowWithWebkitAudio).webkitAudioContext;
        if (!AudioContextClass) return null;
        this.context = new AudioContextClass();
      }
      const context = this.context;
      if (context.state !== 'running') await context.resume();
      if (this.destroyed || context !== this.context || context.state !== 'running') return null;
      // Vorbereiten spielt nichts ab. Automatische Meldungen warten auch hier nicht.
      void this.prepareSaleSound(context);
      return context;
    } catch {
      return null;
    }
  }

  private prepareSaleSound(context: AudioContext): Promise<AudioBuffer | null> {
    if (this.destroyed || context !== this.context || context.state === 'closed')
      return Promise.resolve(null);
    if (this.saleBuffer) return Promise.resolve(this.saleBuffer);
    if (this.saleBufferLoad) return this.saleBufferLoad;
    const controller = new AbortController();
    this.saleLoadAbort = controller;
    const load = this.loadSaleSound(context, controller).finally(() => {
      if (this.saleBufferLoad === load) {
        this.saleBufferLoad = null;
        this.saleLoadAbort = null;
      }
    });
    this.saleBufferLoad = load;
    return load;
  }

  private async loadSaleSound(
    context: AudioContext,
    controller: AbortController,
  ): Promise<AudioBuffer | null> {
    const isCurrent = () =>
      !this.destroyed &&
      !controller.signal.aborted &&
      context === this.context &&
      context.state !== 'closed';
    try {
      const response = await fetch(SALE_SOUND_URL, { signal: controller.signal });
      if (!response.ok || !isCurrent()) return null;
      const bytes = await response.arrayBuffer();
      if (!isCurrent()) return null;
      const buffer = await context.decodeAudioData(bytes);
      if (!isCurrent()) return null;
      this.saleBuffer = buffer;
      return buffer;
    } catch {
      return null;
    }
  }

  private abortSaleLoad(): void {
    this.saleLoadAbort?.abort();
    this.saleLoadAbort = null;
    this.saleBufferLoad = null;
  }

  private playSaleRecording(context: AudioContext, buffer: AudioBuffer, start: number): void {
    const source = context.createBufferSource();
    const gain = context.createGain();
    this.voices.set(source, gain);
    source.buffer = buffer;
    gain.gain.setValueAtTime(0.5, start);
    source.connect(gain);
    gain.connect(context.destination);
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
      this.voices.delete(source);
    };
    source.start(start);
  }

  private tone(
    context: AudioContext,
    frequency: number,
    start: number,
    duration: number,
    volume: number,
    type: OscillatorType = 'sine',
  ): void {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    this.voices.set(oscillator, gain);
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.linearRampToValueAtTime(volume, start + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
      this.voices.delete(oscillator);
    };
    oscillator.start(start);
    oscillator.stop(start + duration);
  }

  private stopVoices(): void {
    for (const [source, gain] of this.voices) {
      source.onended = null;
      try {
        source.stop();
      } catch {
        // Bereits beendete Klangerzeuger benötigen nur noch das Trennen.
      }
      source.disconnect();
      gain.disconnect();
    }
    this.voices.clear();
  }
}
