import { randomUUID } from 'node:crypto';
import type { BrowserInfo } from './gologin-cloud-browser.ts';
import {
  browserActionError,
  browserCommandLimit,
  commandRecord,
  executeBrowserAction,
  type BrowserActionEvent,
} from './isolated-browser-actions.ts';

interface PendingAction {
  id: string;
  sequence: number;
  event?: BrowserActionEvent;
  acknowledge?: () => void;
  reject?: (error: Error) => void;
  changed?: () => void;
  cancelled: boolean;
}

/** Eine Sitzung bearbeitet feste Aktionen nacheinander; Freigaben kommen vom Controller. */
export class BrowserSessionCommands {
  private pending?: PendingAction;
  private readonly browser: BrowserInfo;
  constructor(browser: BrowserInfo) {
    this.browser = browser;
  }

  async request(input: unknown): Promise<unknown> {
    const request = commandRecord(input);
    if (request.action === 'ready' && Object.keys(request).length === 1) return { ready: true };
    if (request.action === 'start') {
      if (
        Object.keys(request).some((key) => !['action', 'operation'].includes(key)) ||
        this.pending
      )
        throw new Error('Browseraktion läuft bereits');
      const pending: PendingAction = { id: randomUUID(), sequence: 0, cancelled: false };
      this.pending = pending;
      void executeBrowserAction(
        this.browser,
        request.operation,
        () => this.pause(pending, 'authorize'),
        (stage) => this.pause(pending, 'stage', stage),
      )
        .then((value) => {
          if (Buffer.byteLength(JSON.stringify(value) ?? '') > browserCommandLimit)
            throw new Error('Browserantwort zu groß');
          this.publish(pending, { kind: 'result', value });
        })
        .catch((error) => this.publish(pending, browserActionError(error)));
      return { id: pending.id };
    }
    const pending = this.pending;
    if (
      !pending ||
      request.id !== pending.id ||
      Object.keys(request).some((key) => !['action', 'id', 'sequence'].includes(key))
    )
      throw new Error('Browseraktion nicht verfügbar');
    if (request.action === 'cancel') {
      pending.cancelled = true;
      pending.reject?.(new Error('Browseraktion abgebrochen'));
      // Laufende Aktionen ohne Freigabepause erst nach ihrem tatsächlichen Ende freigeben.
      if (pending.event?.kind === 'result' || pending.event?.kind === 'error')
        this.pending = undefined;
      return {};
    }
    if (request.action !== 'poll' || !Number.isSafeInteger(request.sequence))
      throw new Error('Ungültige Browserfreigabe');
    if (pending.acknowledge && request.sequence === pending.sequence) {
      const acknowledge = pending.acknowledge;
      pending.acknowledge = undefined;
      pending.reject = undefined;
      pending.event = undefined;
      acknowledge();
    } else if (request.sequence !== pending.sequence - (pending.acknowledge ? 1 : 0))
      throw new Error('Ungültige Browserfreigabe');
    if (!pending.event)
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          pending.changed = undefined;
          resolve();
        }, 5000);
        pending.changed = () => {
          clearTimeout(timeout);
          pending.changed = undefined;
          resolve();
        };
      });
    return pending.event ?? { kind: 'wait' };
  }

  private publish(pending: PendingAction, event: BrowserActionEvent): void {
    if (this.pending !== pending) return;
    pending.event = event;
    pending.changed?.();
    if (pending.cancelled) this.pending = undefined;
  }
  private pause(
    pending: PendingAction,
    kind: 'authorize' | 'stage',
    stage?: 'profile' | 'publications' | 'conversations' | 'sales',
  ): Promise<void> {
    if (pending.cancelled || this.pending !== pending)
      return Promise.reject(new Error('Browseraktion abgebrochen'));
    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        pending.cancelled = true;
        reject(new Error('Browserfreigabe abgelaufen'));
      }, 15000);
      pending.acknowledge = () => {
        clearTimeout(timeout);
        resolve();
      };
      pending.reject = (error) => {
        clearTimeout(timeout);
        reject(error);
      };
      pending.sequence += 1;
      this.publish(
        pending,
        kind === 'stage' && stage
          ? { kind, sequence: pending.sequence, stage }
          : { kind: 'authorize', sequence: pending.sequence },
      );
    });
  }
}
