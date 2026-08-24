import '@angular/compiler';
import { Injector, runInInjectionContext, signal } from '@angular/core';
import { Router } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LoggerService } from '../../../../core/services/logger.service';
import { StoreService } from '../../../../core/services/store.service';
import { SyncStatusService } from '../../../../core/services/sync-status.service';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { StoreCheckoutComponent } from './store-checkout.component';

function fuellePflichtfelder(komponente: StoreCheckoutComponent): void {
  komponente.form.patchValue({
    firstName: 'Ada',
    lastName: 'Lovelace',
    email: 'ada@example.com',
    street: 'Testweg',
    houseNumber: '1',
    zip: '12345',
    city: 'Berlin',
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolver) => (resolve = resolver));
  return { promise, resolve };
}

describe('StoreCheckoutComponent – Bestellmeldung', () => {
  const placeOrder = vi.fn();
  const navigate = vi.fn();
  let komponente: StoreCheckoutComponent;
  let syncStatus: SyncStatusService;
  let toast: ToastService;

  beforeEach(() => {
    placeOrder.mockReset();
    navigate.mockReset();
    toast = new ToastService();
    syncStatus = new SyncStatusService();
    const injector = Injector.create({
      providers: [
        { provide: StoreService, useValue: { cart: signal([{}]), placeOrder } },
        { provide: Router, useValue: { navigate } },
        { provide: LoggerService, useValue: { error: vi.fn() } },
        { provide: ToastService, useValue: toast },
        { provide: SyncStatusService, useValue: syncStatus },
      ],
    });
    komponente = runInInjectionContext(injector, () => new StoreCheckoutComponent());
    fuellePflichtfelder(komponente);
  });

  it('bestätigt die Bestellung vor der Navigation zur Erfolgsseite', async () => {
    placeOrder.mockResolvedValue({
      status: 'success',
      order: { id: 'order-1' },
      error: null,
      problems: [],
    });
    const toastWarVorNavigation: boolean[] = [];
    navigate.mockImplementation(() => {
      toastWarVorNavigation.push(toast.toasts()[0]?.title === 'Bestellung wurde aufgegeben.');
      return Promise.resolve(true);
    });

    await komponente.onSubmitOrder();

    expect(toastWarVorNavigation).toEqual([true]);
    expect(toast.toasts()[0]).toMatchObject({
      type: 'success',
      title: 'Bestellung wurde aufgegeben.',
    });
    expect(navigate).toHaveBeenCalledWith(['/shop/order-success', 'order-1']);
  });

  it('meldet eine fehlgeschlagene Bestellung persistent und bleibt im Checkout', async () => {
    placeOrder.mockResolvedValue({
      status: 'failed',
      order: null,
      error: new Error('Artikel nicht mehr verfügbar'),
      problems: [],
    });

    await komponente.onSubmitOrder();

    expect(navigate).not.toHaveBeenCalled();
    expect(toast.toasts()[0]).toMatchObject({
      type: 'error',
      title: 'Bestellung konnte nicht aufgegeben werden.',
      description: 'Artikel nicht mehr verfügbar',
      persistent: true,
    });
    expect(komponente.form.controls.firstName.value).toBe('Ada');
    expect(komponente.isSubmitting()).toBe(false);
  });

  it('erzeugt bei einem bereits zentral gemeldeten Bestellfehler keinen zweiten Toast', async () => {
    placeOrder.mockResolvedValue({
      status: 'failed',
      order: null,
      error: syncStatus.melde('Speichern der Bestellung', new Error('offline')),
      problems: [],
    });

    await komponente.onSubmitOrder();

    expect(navigate).not.toHaveBeenCalled();
    expect(syncStatus.fehler()).toHaveLength(1);
    expect(toast.toasts()).toEqual([]);
  });

  it('meldet eine bestätigte Bestellung mit Nachschrittproblem als Warnung', async () => {
    placeOrder.mockResolvedValue({
      status: 'partial',
      order: { id: 'order-1' },
      error: null,
      problems: [{ message: 'Interne Benachrichtigung fehlgeschlagen.' }],
    });

    await komponente.onSubmitOrder();

    expect(toast.toasts()[0]).toMatchObject({
      type: 'warning',
      title: 'Bestellung wurde aufgegeben, aber nicht vollständig nachbearbeitet.',
      description: 'Interne Benachrichtigung fehlgeschlagen.',
    });
    expect(navigate).toHaveBeenCalledWith(['/shop/order-success', 'order-1']);
  });

  it('zeigt bei einem ungültigen Formular keinen Toast und bestellt nicht', async () => {
    komponente.form.controls.email.setValue('ungültig');

    await komponente.onSubmitOrder();

    expect(placeOrder).not.toHaveBeenCalled();
    expect(toast.toasts()).toEqual([]);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('startet bei einem Doppelclick nur einen Bestellvorgang', async () => {
    const antwort = deferred<{
      status: 'success';
      order: { id: string };
      error: null;
      problems: [];
    }>();
    placeOrder.mockReturnValueOnce(antwort.promise);

    const ersterAufruf = komponente.onSubmitOrder();
    const zweiterAufruf = komponente.onSubmitOrder();

    expect(placeOrder).toHaveBeenCalledTimes(1);
    antwort.resolve({ status: 'success', order: { id: 'order-1' }, error: null, problems: [] });
    await Promise.all([ersterAufruf, zweiterAufruf]);
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it('verwendet bei einem fachlichen Retry dieselbe Bestell-ID', async () => {
    placeOrder
      .mockResolvedValueOnce({
        status: 'failed',
        order: null,
        error: new Error('offline'),
        problems: [],
      })
      .mockResolvedValueOnce({
        status: 'success',
        order: { id: 'order-1' },
        error: null,
        problems: [],
      });

    await komponente.onSubmitOrder();
    await komponente.onSubmitOrder();

    const ersterVersuch = placeOrder.mock.calls[0][1];
    const zweiterVersuch = placeOrder.mock.calls[1][1];
    expect(ersterVersuch).toMatchObject({
      orderId: expect.any(String),
      orderNumber: expect.any(String),
    });
    expect(ersterVersuch).toEqual(zweiterVersuch);
  });

  it('deutet eine abgelehnte Navigation nicht als Bestellfehler um', async () => {
    placeOrder.mockResolvedValue({
      status: 'success',
      order: { id: 'order-1' },
      error: null,
      problems: [],
    });
    navigate.mockResolvedValue(false);

    await komponente.onSubmitOrder();

    expect(toast.toasts()).toEqual([
      expect.objectContaining({ type: 'success', title: 'Bestellung wurde aufgegeben.' }),
      expect.objectContaining({
        type: 'info',
        title: 'Bestellung gespeichert, Seite konnte nicht gewechselt werden.',
      }),
    ]);
  });

  it('meldet eine geworfene Navigation nur als Warnung nach bestätigter Bestellung', async () => {
    placeOrder.mockResolvedValue({
      status: 'success',
      order: { id: 'order-1' },
      error: null,
      problems: [],
    });
    navigate.mockRejectedValue(new Error('Router blockiert'));

    await komponente.onSubmitOrder();

    expect(toast.toasts().map(({ type }) => type)).toEqual(['success', 'warning']);
    expect(toast.toasts()[1]).toMatchObject({
      title: 'Bestellung gespeichert, Seite konnte nicht gewechselt werden.',
      description: 'Router blockiert',
    });
    expect(toast.toasts().some(({ type }) => type === 'error')).toBe(false);
  });
});
