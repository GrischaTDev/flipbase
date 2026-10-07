import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  output,
  signal,
} from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { ModalShellComponent } from '../../../../shared/components/modal-shell/modal-shell.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { TextFieldComponent } from '../../../../shared/components/text-field/text-field.component';
import {
  SniperBrowserError,
  type SniperBrowserInput,
  type SniperBrowserStatus,
} from '../../models/sniper-browser.model';
import { SniperBrowserService } from '../../services/sniper-browser.service';

@Component({
  selector: 'app-sniper-browser-connect',
  imports: [ReactiveFormsModule, ModalShellComponent, ButtonComponent, TextFieldComponent],
  templateUrl: './sniper-browser-connect.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SniperBrowserConnectComponent {
  private readonly api = inject(SniperBrowserService);
  readonly closed = output<void>();
  readonly session = signal<SniperBrowserStatus | null>(null);
  readonly frameUrl = signal<string | null>(null);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly confirmed = signal(false);
  readonly now = signal(Date.now());
  readonly remainingSeconds = computed(
    () =>
      Math.max(0, Math.ceil((Date.parse(this.session()?.expiresAt ?? '') - this.now()) / 1000)) ||
      0,
  );
  readonly text = new FormControl('', {
    nonNullable: true,
    validators: [
      Validators.required,
      Validators.maxLength(256),
      Validators.pattern(/^[^\p{Cc}]+$/u),
    ],
  });
  private generation = 0;
  private ended = false;
  private framePending = false;
  private controller: AbortController | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.ended = true;
      const id = this.session()?.sessionId;
      this.clearSession();
      if (id) void this.api.close(id).catch(() => undefined);
    });
    void this.open();
  }

  async open(): Promise<void> {
    if (this.busy() || this.session() || this.ended) return;
    this.busy.set(true);
    const generation = this.generation;
    try {
      const current = await this.api.status();
      const session =
        current.state === 'manual' && current.sessionId ? current : await this.api.open();
      if (this.ended || generation !== this.generation) {
        if (session.sessionId) await this.api.close(session.sessionId);
        return;
      }
      if (!session.sessionId || !session.expiresAt)
        throw new Error(session.message ?? 'Browsersitzung nicht verfügbar.');
      this.session.set(session);
      this.timer = setInterval(() => this.tick(), 1000);
      this.tick();
    } catch (error) {
      if (!this.ended) this.showError(error);
    } finally {
      this.busy.set(false);
      if (this.session()) this.tick();
    }
  }

  private tick(): void {
    this.now.set(Date.now());
    if (!this.session()) return;
    if (!this.remainingSeconds()) {
      this.error.set('Die Browsersitzung ist abgelaufen. Der Bot bleibt pausiert.');
      const id = this.session()?.sessionId;
      this.clearSession();
      if (id) void this.api.close(id).catch(() => undefined);
      return;
    }
    if (!document.hidden && !this.busy()) void this.loadFrame();
  }

  private async loadFrame(): Promise<void> {
    const id = this.session()?.sessionId;
    if (!id || this.framePending || this.ended) return;
    this.framePending = true;
    const generation = this.generation;
    const controller = new AbortController();
    this.controller = controller;
    try {
      const frame = await this.api.frame(id, controller.signal);
      if (
        this.ended ||
        controller.signal.aborted ||
        generation !== this.generation ||
        this.session()?.sessionId !== id
      )
        return;
      const previousFrame = this.frameUrl();
      this.frameUrl.set(URL.createObjectURL(frame));
      if (previousFrame) URL.revokeObjectURL(previousFrame);
    } catch (error) {
      if (!controller.signal.aborted && generation === this.generation && !this.ended) {
        this.showError(error);
        this.clearSession();
        void this.api.close(id).catch(() => undefined);
      }
    } finally {
      this.framePending = false;
      if (this.controller === controller) this.controller = null;
    }
  }

  click(event: MouseEvent): void {
    const viewport = event.currentTarget;
    const image = viewport instanceof HTMLElement ? viewport.querySelector('img') : null;
    if (!image || !this.frameUrl()) return;
    const rectangle = image.getBoundingClientRect();
    if (!rectangle.width || !rectangle.height) return;
    const x = (event.clientX - rectangle.left) / rectangle.width;
    const y = (event.clientY - rectangle.top) / rectangle.height;
    if (x >= 0 && x <= 1 && y >= 0 && y <= 1) void this.input({ kind: 'click', x, y });
  }
  keydown(event: KeyboardEvent): void {
    if (
      ['Enter', 'Tab', 'Escape', 'Backspace'].includes(event.key) &&
      !event.altKey &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.shiftKey
    ) {
      event.preventDefault();
      event.stopPropagation();
      void this.input({ kind: 'key', key: event.key as 'Enter' | 'Tab' | 'Escape' | 'Backspace' });
    }
  }
  async sendText(): Promise<void> {
    if (this.text.invalid) return;
    if (await this.input({ kind: 'text', text: this.text.value })) this.text.reset();
  }
  async press(key: 'Enter' | 'Tab' | 'Escape' | 'Backspace'): Promise<void> {
    await this.input({ kind: 'key', key });
  }
  private async input(command: SniperBrowserInput): Promise<boolean> {
    const id = this.session()?.sessionId;
    if (!id || !this.frameUrl() || this.busy()) return false;
    this.busy.set(true);
    try {
      await this.api.input(id, command);
      return true;
    } catch (error) {
      this.showError(error);
      if (error instanceof SniperBrowserError && [401, 403, 409].includes(error.status)) {
        this.clearSession();
        void this.api.close(id).catch(() => undefined);
      }
      return false;
    } finally {
      this.busy.set(false);
    }
  }
  async verify(): Promise<void> {
    const id = this.session()?.sessionId;
    if (!id || this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    this.clearSession(true);
    const generation = this.generation;
    try {
      const result = await this.api.verify(id);
      if (this.ended || generation !== this.generation) return;
      if (result.state !== 'ready') throw new Error(result.message ?? 'Der Bot bleibt pausiert.');
      this.confirmed.set(true);
    } catch (error) {
      if (this.ended || generation !== this.generation) return;
      this.showError(error);
      await this.api.close(id).catch(() => undefined);
    } finally {
      if (!this.ended && generation === this.generation) this.clearSession();
      this.busy.set(false);
    }
  }
  async close(): Promise<void> {
    if (this.ended) return;
    this.ended = true;
    const id = this.session()?.sessionId;
    this.clearSession();
    try {
      if (id) await this.api.close(id);
    } catch (error) {
      this.showError(error);
      this.ended = false;
      return;
    }
    this.closed.emit();
  }
  private clearSession(keepLease = false): void {
    this.generation += 1;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.controller?.abort();
    const frame = this.frameUrl();
    this.frameUrl.set(null);
    if (frame) URL.revokeObjectURL(frame);
    if (!keepLease) this.session.set(null);
  }
  private showError(error: unknown): void {
    this.error.set(
      error instanceof Error ? error.message : 'Die Botsitzung ist gerade nicht verfügbar.',
    );
  }
}
