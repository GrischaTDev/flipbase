import '@angular/compiler';
import { describe, it, expect } from 'vitest';
import { signal } from '@angular/core';
import { PurchaseService } from './purchase.service';
import { SalesService } from './sales.service';
import { AuthService } from './auth.service';
import { ProfitEngineService } from './profit-engine.service';
import { Purchase, Sale } from '../models/flipbase.models';

/**
 * Bearbeiten von Einkauf, Verkauf und Profil.
 *
 * Bis zum 21.08.2026 liess sich in der Anwendung fast nichts aendern: Ein
 * Zahlendreher im Einkaufspreis bedeutete loeschen und neu anlegen - und weil
 * die Artikel per Fremdschluessel am Einkauf haengen, waren sie damit weg. Beim
 * Verkauf lief es ueber Stornieren, mit verfaelschter Auswertung dazwischen.
 *
 * Diese Tests halten fest, was beim Aendern passieren muss - und vor allem,
 * was dabei **nicht** passieren darf.
 */
describe('Bearbeiten vorhandener Daten', () => {
  /** Legt einen Dienst ohne Injektionskontext an und setzt nur das Noetige. */
  function baue<T>(prototyp: object, felder: Record<string, unknown>): T {
    const dienst = Object.create(prototyp) as T;
    Object.assign(dienst as object, felder);
    return dienst;
  }

  describe('Einkauf', () => {
    const einkauf: Purchase = {
      id: 'p-1',
      workspace_id: 'ws-1',
      type: 'lot',
      title: 'Konvolut Werkzeug',
      purchase_date: '2026-08-10',
      purchase_price: 230,
      cost_allocation_mode: 'even',
    };

    function dienstMit(liste: Purchase[]) {
      const purchasesRaw = signal<Purchase[]>(liste);
      const selectedPurchaseRaw = signal<Purchase | null>(liste[0] ?? null);
      return {
        purchasesRaw,
        selectedPurchaseRaw,
        dienst: baue<PurchaseService>(PurchaseService.prototype, {
          purchasesRaw,
          selectedPurchaseRaw,
          mockStore: {
            isDemoMode: () => true,
            getPurchases: () => [],
            savePurchase: () => undefined,
          },
          sourcesService: { sources: () => [{ id: 'q-1', name: 'Flohmarkt' }] },
          suppliersService: { suppliers: () => [] },
        }),
      };
    }

    it('uebernimmt den korrigierten Preis', async () => {
      const { dienst, purchasesRaw } = dienstMit([einkauf]);

      await dienst.updatePurchase('p-1', { purchase_price: 249.9 });

      expect(purchasesRaw()[0].purchase_price).toBe(249.9);
    });

    it('laesst die uebrigen Angaben unangetastet', async () => {
      const { dienst, purchasesRaw } = dienstMit([einkauf]);

      await dienst.updatePurchase('p-1', { purchase_price: 249.9 });

      expect(purchasesRaw()[0].title).toBe('Konvolut Werkzeug');
      expect(purchasesRaw()[0].purchase_date).toBe('2026-08-10');
    });

    it('aendert nur den gemeinten Einkauf', async () => {
      const zweiter: Purchase = { ...einkauf, id: 'p-2', title: 'Palette Retouren' };
      const { dienst, purchasesRaw } = dienstMit([einkauf, zweiter]);

      await dienst.updatePurchase('p-1', { title: 'Neuer Titel' });

      expect(purchasesRaw()[1].title).toBe('Palette Retouren');
    });

    it('zieht die geoeffnete Detailansicht mit', async () => {
      const { dienst, selectedPurchaseRaw } = dienstMit([einkauf]);

      await dienst.updatePurchase('p-1', { title: 'Konvolut Werkzeug (geprüft)' });

      expect(selectedPurchaseRaw()?.title).toBe('Konvolut Werkzeug (geprüft)');
    });

    it('haengt die neue Quelle an, wenn sie gewechselt wird', async () => {
      const { dienst, purchasesRaw } = dienstMit([einkauf]);

      await dienst.updatePurchase('p-1', { source_id: 'q-1' });

      expect(purchasesRaw()[0].source?.name).toBe('Flohmarkt');
    });
  });

  describe('Verkauf', () => {
    const verkauf: Sale = {
      id: 's-1',
      workspace_id: 'ws-1',
      inventory_item_id: 'i-1',
      platform: 'ebay',
      sale_price: 379,
      sale_date: '2026-08-18',
      platform_fee: 0,
      shipping_cost: 0,
      packaging_cost: 0,
      other_costs: 0,
    };

    function dienstMit(liste: Sale[]) {
      const sales = signal<Sale[]>(liste);
      return {
        sales,
        dienst: baue<SalesService>(SalesService.prototype, {
          sales,
          mockStore: { isDemoMode: () => true, saveSale: () => undefined },
          profitEngine: new ProfitEngineService(),
        }),
      };
    }

    it('rechnet den Gewinn nach einer Preiskorrektur neu', async () => {
      const { dienst, sales } = dienstMit([verkauf]);

      await dienst.updateSale('s-1', { sale_price: 399 });

      expect(sales()[0].sale_price).toBe(399);
      expect(sales()[0].net_profit).toBe(399);
    });

    it('zieht nachgetragene Gebuehren vom Gewinn ab', async () => {
      // Genau der Fall, der durch die nicht gebundenen Formularfelder monatelang
      // unmoeglich war: Gebuehren nachtragen, damit die Marge stimmt.
      const { dienst, sales } = dienstMit([verkauf]);

      await dienst.updateSale('s-1', { platform_fee: 37.9, shipping_cost: 6.99 });

      expect(sales()[0].net_profit).toBeCloseTo(379 - 37.9 - 6.99, 2);
    });

    it('nimmt einen zurueckgegebenen Verkauf aus der Gewinnrechnung', async () => {
      // Eine Retoure liess den Verkauf frueher unberuehrt: Der Gewinn zaehlte
      // weiter, waehrend der Artikel schon wieder im Lager lag - derselbe
      // Gegenstand doppelt.
      const { dienst, sales } = dienstMit([verkauf]);

      await dienst.markiereAlsRetourniert('s-1', 379);

      expect(sales()[0].returned_at).toBeTruthy();
      expect(sales()[0].refund_amount).toBe(379);
    });

    it('meldet einen unbekannten Verkauf, statt still nichts zu tun', async () => {
      const { dienst } = dienstMit([verkauf]);

      const { error } = await dienst.updateSale('gibt-es-nicht', { sale_price: 1 });

      expect(error).toBeInstanceOf(Error);
    });
  });

  describe('Profil', () => {
    it('lehnt einen leeren Namen ab', async () => {
      const dienst = baue<AuthService>(AuthService.prototype, {
        currentUser: () => ({ id: 'u-1' }),
      });

      const { error } = await dienst.aktualisiereProfil('   ');

      expect(error?.message).toContain('leer');
    });

    it('aendert nichts, solange niemand angemeldet ist', async () => {
      const dienst = baue<AuthService>(AuthService.prototype, {
        currentUser: () => null,
      });

      const { error } = await dienst.aktualisiereProfil('Grischa');

      expect(error).toBeInstanceOf(Error);
    });
  });
});
