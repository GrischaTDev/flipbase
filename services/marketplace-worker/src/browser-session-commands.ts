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
  acknowledge?: (payload?: unknown) => void;
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
        async (original, offered) => {
          await this.pause(pending, 'offer_price', undefined, { original, offered });
          return true;
        },
        {
          beforeWrite: () => this.pause(pending, 'listing_begin'),
          readPhotoChunk: (imageId, offset) => this.pausePhoto(pending, imageId, offset),
        },
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
      Object.keys(request).some((key) => !['action', 'id', 'sequence', 'payload'].includes(key))
    )
      throw new Error('Browseraktion nicht verfügbar');
    if (request.action === 'cancel') {
      if (Object.hasOwn(request, 'payload')) throw new Error('Ungültiger Browserabbruch');
      pending.cancelled = true;
      pending.reject?.(new Error('Browseraktion abgebrochen'));
      // Laufende Aktionen ohne Freigabepause erst nach ihrem tatsächlichen Ende freigeben.
      if (pending.event?.kind === 'result' || pending.event?.kind === 'error')
        this.pending = undefined;
      return {};
    }
    if (request.action !== 'poll' || !Number.isSafeInteger(request.sequence))
      throw new Error('Ungültige Browserfreigabe');
    const photoAcknowledgment =
      pending.acknowledge &&
      request.sequence === pending.sequence &&
      pending.event?.kind === 'listing_photo';
    if (Object.hasOwn(request, 'payload') !== Boolean(photoAcknowledgment))
      throw new Error('Ungültige Originalfotoantwort');
    if (pending.acknowledge && request.sequence === pending.sequence) {
      const acknowledge = pending.acknowledge;
      pending.acknowledge = undefined;
      pending.reject = undefined;
      pending.event = undefined;
      acknowledge(request.payload);
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
    kind: 'authorize' | 'stage' | 'offer_price' | 'listing_begin',
    stage?: 'profile' | 'publications' | 'conversations' | 'sales',
    price?: { original: number; offered: number },
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
        kind === 'offer_price' && price
          ? { kind, sequence: pending.sequence, ...price }
          : kind === 'stage' && stage
            ? { kind, sequence: pending.sequence, stage }
            : {
                kind: kind === 'listing_begin' ? 'listing_begin' : 'authorize',
                sequence: pending.sequence,
              },
      );
    });
  }
  private pausePhoto(pending: PendingAction, imageId: string, offset: number): Promise<unknown> {
    if (pending.cancelled || this.pending !== pending || pending.acknowledge)
      return Promise.reject(new Error('Browseraktion abgebrochen'));
    return new Promise((resolve, reject) => {
      // Der private Download besitzt bereits eine 20-Sekunden-Grenze.
      const timeout = setTimeout(() => {
        pending.cancelled = true;
        reject(new Error('Originalfotoübergabe abgelaufen'));
      }, 30_000);
      pending.acknowledge = (payload) => {
        clearTimeout(timeout);
        resolve(payload);
      };
      pending.reject = (error) => {
        clearTimeout(timeout);
        reject(error);
      };
      pending.sequence++;
      this.publish(pending, { kind: 'listing_photo', sequence: pending.sequence, imageId, offset });
    });
  }
}
