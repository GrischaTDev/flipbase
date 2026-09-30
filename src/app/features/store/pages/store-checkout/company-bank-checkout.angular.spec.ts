import { signal, ɵresolveComponentResources } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { registerLocaleData } from '@angular/common';
import localeDe from '@angular/common/locales/de';
import { readFile } from 'node:fs/promises';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { CompanyBankAccount } from '../../../../core/models/company-store.models';
import { StoreService } from '../../../../core/services/store.service';
import { SyncStatusService } from '../../../../core/services/sync-status.service';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { StoreCheckoutComponent } from './store-checkout.component';

beforeAll(async () => {
  registerLocaleData(localeDe);
  await ɵresolveComponentResources((url) => readFile(new URL(url, import.meta.url), 'utf8'));
});
afterEach(() => TestBed.resetTestingModule());

async function render(account: CompanyBankAccount | null) {
  const companyBankAccount = signal(account);
  TestBed.configureTestingModule({
    imports: [StoreCheckoutComponent],
    providers: [
      provideRouter([]),
      SyncStatusService,
      ToastService,
      {
        provide: StoreService,
        useValue: {
          companyBankAccount,
          canUseBankTransfer: () => companyBankAccount() !== null,
          cart: signal([{ item: { id: 'item-1', title: 'Kamera' }, quantity: 1, unitPrice: 25 }]),
          cartSubtotal: signal(25),
          cartTotal: signal(30),
          cartShippingCost: signal(5),
          cartItemCount: signal(1),
          cartItemUnitPrice: () => 25,
          storeSettings: signal({
            storeName: 'Testshop',
            freeShippingThreshold: 50,
            shippingCost: 5,
          }),
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(StoreCheckoutComponent);
  fixture.detectChanges();
  return { fixture, companyBankAccount, root: fixture.nativeElement as HTMLElement };
}

describe('Unternehmenskonto im Checkout', () => {
  it('zeigt nach Auswahl von Banküberweisung das aktuelle Unternehmenskonto', async () => {
    const { fixture, root } = await render({
      accountHolder: 'Zentraler Inhaber',
      iban: 'DE89370400440532013000',
      bic: 'COBADEFFXXX',
      bankName: 'Zentralbank',
    });
    const radio = root.querySelector<HTMLInputElement>('input[value="bank_transfer"]')!;
    expect(radio).not.toBeNull();
    radio.click();
    fixture.detectChanges();
    expect(root.textContent).toContain('Zentraler Inhaber');
    expect(root.textContent).toContain('DE89370400440532013000');
  });
  it('bietet ohne zentrales Konto keine Banküberweisung an', async () => {
    const { root } = await render(null);
    expect(root.querySelector('input[value="bank_transfer"]')).toBeNull();
    expect(root.textContent).toContain('Banküberweisung ist derzeit nicht verfügbar.');
  });
});
