import { DestroyRef, inject, signal, type WritableSignal } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import type { MarketplaceEntry } from '../models/marketplace-read.models';
import type { MarketplaceAccountStore } from './marketplace-account.store';
import { VintedListingPriceChangedError } from './marketplace-browser-test-api.service';

/** Gemeinsamer Preisablauf für Detailansicht und Kleiderschrank. */
export function createVintedListingPriceEditor(options: {
  store: MarketplaceAccountStore;
  entry: () => MarketplaceEntry | null;
  busy: WritableSignal<boolean>;
  blocked?: () => boolean;
  priceRead: (price: number) => void;
  confirmed: () => void;
  closed: () => void;
}) {
  const open = signal(false);
  const error = signal<string | null>(null);
  const control = new FormControl<number | null>(null, [
    Validators.required,
    Validators.min(0.01),
    Validators.max(999999.99),
  ]);
  const form = new FormGroup({ price: control });
  let expectedPriceCents = 0;
  let revision = 0;
  inject(DestroyRef).onDestroy(() => revision++);
  const available = (entry: MarketplaceEntry | null) => {
    const connection = options.store.selectedConnection();
    return (
      !!entry &&
      entry.price !== null &&
      entry.currency === 'EUR' &&
      entry.publicationState !== 'draft' &&
      options.store.canManage() &&
      connection?.connectionId === entry.connectionId &&
      connection.workspaceId === entry.workspaceId &&
      connection.status === 'connected' &&
      connection.executionMode !== 'local'
    );
  };
  const close = () => {
    if (options.busy()) return;
    open.set(false);
    options.closed();
  };
  return {
    open,
    error,
    control,
    form,
    available,
    close,
    reset() {
      revision++;
      open.set(false);
      error.set(null);
      control.enable();
    },
    show() {
      const entry = options.entry();
      if (!available(entry) || options.busy() || options.blocked?.() || open()) return;
      revision++;
      expectedPriceCents = Math.round(entry!.price! * 100);
      control.reset(entry!.price);
      error.set(null);
      open.set(true);
    },
    async save() {
      const entry = options.entry();
      if (!open() || options.busy() || !available(entry)) return;
      const price = control.value;
      if (
        control.invalid ||
        price === null ||
        !Number.isFinite(price) ||
        Math.abs(price * 100 - Math.round(price * 100)) > 0.000001
      ) {
        control.markAsTouched();
        error.set('Gib einen Preis größer als 0 € mit höchstens zwei Nachkommastellen ein.');
        return;
      }
      const cents = Math.round(price * 100);
      if (cents === expectedPriceCents) {
        close();
        return;
      }
      const version = revision;
      const selection = options.store.selectionVersion();
      const current = () =>
        version === revision &&
        selection === options.store.selectionVersion() &&
        options.entry()?.id === entry!.id &&
        available(options.entry());
      options.busy.set(true);
      error.set(null);
      control.disable();
      try {
        await options.store.saveListingPrice(
          entry!.connectionId,
          entry!.id,
          expectedPriceCents,
          cents,
        );
        if (!current()) return;
        options.priceRead(cents / 100);
        open.set(false);
        options.closed();
        options.confirmed();
      } catch (failure) {
        if (!current()) return;
        if (failure instanceof VintedListingPriceChangedError) {
          expectedPriceCents = failure.priceCents;
          options.priceRead(failure.priceCents / 100);
        }
        error.set(
          failure instanceof Error
            ? failure.message
            : 'Der neue Preis konnte nicht bestätigt werden.',
        );
      } finally {
        if (version === revision) {
          options.busy.set(false);
          control.enable();
        }
      }
    },
  };
}
