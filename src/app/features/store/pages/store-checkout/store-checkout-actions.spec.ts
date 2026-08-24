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
    placeOrder.mockResolvedValue({ id: 'order-1' });
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
    placeOrder.mockRejectedValue(new Error('Artikel nicht mehr verfügbar'));

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
    placeOrder.mockRejectedValue(
      syncStatus.melde('Speichern der Bestellung', new Error('offline')),
    );

    await komponente.onSubmitOrder();

    expect(navigate).not.toHaveBeenCalled();
    expect(syncStatus.fehler()).toHaveLength(1);
    expect(toast.toasts()).toEqual([]);
  });
});
