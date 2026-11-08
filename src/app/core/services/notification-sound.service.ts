import { DestroyRef, Injectable, inject } from '@angular/core';

export type NotificationSoundKind = 'general' | 'sale';

interface WindowWithWebkitAudio extends Window {
  readonly webkitAudioContext?: typeof AudioContext;
}

@Injectable({ providedIn: 'root' })
export class NotificationSoundService {
  private readonly destroyRef = inject(DestroyRef);
  private context: AudioContext | null = null;
  private readonly voices = new Map<OscillatorNode, GainNode>();
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
    try {
      this.stopVoices();
      const start = context.currentTime;
      if (kind === 'sale') {
        // Eigener kurzer Kassenton: Anschlag und zwei helle, metallische Klänge.
        this.tone(context, 180, start, 0.035, 0.05, 'triangle');
        this.tone(context, 1320, start + 0.045, 0.16, 0.065);
        this.tone(context, 2112, start + 0.045, 0.12, 0.025);
        this.tone(context, 1760, start + 0.17, 0.42, 0.075);
        this.tone(context, 2816, start + 0.17, 0.3, 0.025);
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

  async preview(kind: NotificationSoundKind): Promise<boolean> {
    return (await this.unlock()) && this.play(kind);
  }

  private async unlock(): Promise<boolean> {
    if (this.destroyed || typeof window === 'undefined') return false;
    try {
      if (!this.context || this.context.state === 'closed') {
        const AudioContextClass =
          window.AudioContext || (window as WindowWithWebkitAudio).webkitAudioContext;
        if (!AudioContextClass) return false;
        this.context = new AudioContextClass();
      }
      const context = this.context;
      if (context.state !== 'running') await context.resume();
      return !this.destroyed && context.state === 'running';
    } catch {
      return false;
    }
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
    for (const [oscillator, gain] of this.voices) {
      oscillator.onended = null;
      try {
        oscillator.stop();
      } catch {
        // Bereits beendete Klangerzeuger benötigen nur noch das Trennen.
      }
      oscillator.disconnect();
      gain.disconnect();
    }
    this.voices.clear();
  }
}
