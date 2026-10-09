import { Injectable, inject, signal } from '@angular/core';
import { AuthService } from '../../../core/services/auth.service';
import type { MarketplaceEntry } from '../models/marketplace-read.models';
import type { NegotiationAction, NegotiationReceipt } from '../models/vinted-negotiation';

/** Behält denselben Auftrag bei einer unklaren Antwort auch nach erneutem Öffnen. */
@Injectable({ providedIn: 'root' })
export class VintedNegotiationActionStore {
  private readonly auth = inject(AuthService);
  private readonly requests = new Map<string, string>();
  readonly inFlight = signal<ReadonlySet<string>>(new Set());
  private readonly uncertain = new Map<string, string>();
  readonly receipts = signal<
    ReadonlyMap<string, NegotiationReceipt & { readonly action: NegotiationAction }>
  >(new Map());
  key(entry: MarketplaceEntry): string {
    return JSON.stringify([
      this.auth.currentUser()?.id,
      entry.workspaceId,
      entry.connectionId,
      entry.id,
      entry.negotiationOffer,
    ]);
  }
  request(key: string, action: NegotiationAction, price: number | null): string | null {
    const signature = JSON.stringify([key, action, price]);
    if (
      this.inFlight().has(key) ||
      (this.uncertain.has(key) && this.uncertain.get(key) !== signature)
    )
      return null;
    const request = this.requests.get(signature) ?? crypto.randomUUID();
    this.requests.set(signature, request);
    this.uncertain.set(key, signature);
    this.inFlight.update((keys) => new Set(keys).add(key));
    return request;
  }
  finish(key: string, definitive: boolean): void {
    this.inFlight.update((keys) => {
      const remaining = new Set(keys);
      remaining.delete(key);
      return remaining;
    });
    if (definitive) this.uncertain.delete(key);
  }
  record(key: string, receipt: NegotiationReceipt, action?: NegotiationAction): void {
    const requestedAction = action ?? this.receipts().get(key)?.action;
    if (requestedAction)
      this.receipts.update((receipts) =>
        new Map(receipts).set(key, { ...receipt, action: requestedAction }),
      );
  }
}
