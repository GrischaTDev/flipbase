import '@angular/compiler';
import { describe, it, expect } from 'vitest';
import { signal } from '@angular/core';
import { PurchaseService } from './purchase.service';
import { SalesService } from './sales.service';
import { AuthService } from './auth.service';
import { ProfitEngineService } from './profit-engine.service';
import { SyncStatusService } from './sync-status.service';
import { Purchase, Sale, UserProfile } from '../models/flipbase.models';

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

    /** Wie `dienstMit`, aber angemeldet - und merkt sich, was zur Datenbank geht. */
    function dienstMitDatenbank(liste: Purchase[]) {
      const geschrieben: Record<string, unknown>[] = [];
      const purchasesRaw = signal<Purchase[]>(liste);
      const selectedPurchaseRaw = signal<Purchase | null>(liste[0] ?? null);
      return {
        geschrieben,
        purchasesRaw,
        dienst: baue<PurchaseService>(PurchaseService.prototype, {
          purchasesRaw,
          selectedPurchaseRaw,
          mockStore: {
            isDemoMode: () => false,
            getPurchases: () => [],
            savePurchase: () => undefined,
          },
          sourcesService: { sources: () => [] },
          suppliersService: { suppliers: () => [] },
          syncStatus: { melde: (_bereich: string, fehler: unknown) => new Error(String(fehler)) },
          supabase: {
            client: {
              from: () => ({
                update: (werte: Record<string, unknown>) => {
                  geschrieben.push(werte);
                  return { eq: () => Promise.resolve({ error: null }) };
                },
              }),
            },
          },
        }),
      };
    }

    it('uebernimmt eine geaenderte Einkaufsart in der Anzeige', async () => {
      // Die Art laesst sich im Bearbeiten-Dialog anklicken, wurde beim
      // Speichern aber weggeworfen: Aus einem Lot wurde nie eine Mystery Box.
      const { dienst, purchasesRaw } = dienstMit([einkauf]);

      await dienst.updatePurchase('p-1', { type: 'mystery_pack' });

      expect(purchasesRaw()[0].type).toBe('mystery_pack');
    });

    it('schreibt die geaenderte Einkaufsart auch in die Datenbank', async () => {
      // Der eigentliche Fehler: Die Anzeige zog mit, die Spalte `type` stand
      // aber nicht im Schreibbefehl - nach dem naechsten Laden war die alte
      // Art zurueck.
      const { dienst, geschrieben } = dienstMitDatenbank([einkauf]);

      await dienst.updatePurchase('p-1', { type: 'mystery_pack' });

      expect(geschrieben[0]['type']).toBe('mystery_pack');
    });

    it('laesst die Art unangetastet, wenn nur der Preis korrigiert wird', async () => {
      const { dienst, purchasesRaw } = dienstMitDatenbank([einkauf]);

      await dienst.updatePurchase('p-1', { purchase_price: 249.9 });

      expect(purchasesRaw()[0].type).toBe('lot');
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

    it('lehnt eine freie Preiskorrektur ab und lässt den Verkauf unverändert', async () => {
      const { dienst, sales } = dienstMit([verkauf]);

      const { error } = await dienst.updateSale('s-1', { sale_price: 399 });

      expect(error?.message).toContain('Korrekturvorgang');
      expect(sales()).toEqual([verkauf]);
    });

    it('lehnt frei nachgetragene Gebühren ab und lässt den Verkauf unverändert', async () => {
      const { dienst, sales } = dienstMit([verkauf]);

      const { error } = await dienst.updateSale('s-1', {
        platform_fee: 37.9,
        shipping_cost: 6.99,
      });

      expect(error?.message).toContain('Korrekturvorgang');
      expect(sales()).toEqual([verkauf]);
    });

    it('lehnt den direkten Retourenvermerk ab und lässt den Verkauf unverändert', async () => {
      const { dienst, sales } = dienstMit([verkauf]);

      const { error } = await dienst.markiereAlsRetourniert('s-1', 379);

      expect(error?.message).toContain('atomaren Retourenpfad');
      expect(sales()).toEqual([verkauf]);
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

      const { error, reportedBySyncStatus } = await dienst.aktualisiereProfil('Grischa');

      expect(error).toBeInstanceOf(Error);
      expect(reportedBySyncStatus).toBe(false);
    });

    it('meldet eine leere Datenbankantwort als Persistenzfehler und behält das bisherige Profil', async () => {
      const bisherigesProfil: UserProfile = {
        id: 'u-1',
        email: 'grischa@example.com',
        full_name: 'Bisheriger Name',
        avatar_url: null,
      };
      const profile = signal<UserProfile | null>(bisherigesProfil);
      const syncStatus = new SyncStatusService();
      const dienst = baue<AuthService>(AuthService.prototype, {
        currentUser: () => ({ id: 'u-1' }),
        profile,
        syncStatus,
        supabase: {
          client: {
            from: () => ({
              update: () => ({
                eq: () => ({
                  select: () => ({
                    single: async () => ({ data: null, error: null }),
                  }),
                }),
              }),
            }),
          },
        },
      });

      const result = await dienst.aktualisiereProfil('Neuer Name');

      expect(result.error).toBeInstanceOf(Error);
      expect(result.reportedBySyncStatus).toBe(true);
      expect(profile()).toEqual(bisherigesProfil);
      expect(syncStatus.hatFehler()).toBe(true);
    });
  });
});
