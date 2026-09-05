import '@angular/compiler';
import { describe, it, expect } from 'vitest';
import { signal } from '@angular/core';
import { PurchaseService } from './purchase.service';
import { Purchase } from '../models/flipbase.models';

/**
 * Zusatzkosten und Sendungsangaben eines Einkaufs.
 *
 * Das Erfassungsformular fragt nach Versand, Fahrtkosten, Zoll und einer
 * Sendungsnummer. Beim Anlegen wurden die Kostenzeilen nur aufsummiert und nie
 * gespeichert - nach dem naechsten Laden rechnete die Liste die Summe aus dem
 * Einkaufspreis plus den (nicht vorhandenen) Kostenzeilen neu, und die
 * Zusatzkosten waren spurlos weg. Beim Bearbeiten kamen sie gar nicht erst im
 * Formular an.
 *
 * Diese Tests halten fest, dass jede Angabe des Formulars auch dort landet, wo
 * sie das naechste Laden ueberlebt.
 */
describe('Zusatzkosten und Sendungsangaben', () => {
  function baue<T>(prototyp: object, felder: Record<string, unknown>): T {
    const dienst = Object.create(prototyp) as T;
    Object.assign(dienst as object, felder);
    return dienst;
  }

  interface Eintrag {
    tabelle: string;
    aktion: 'insert' | 'update' | 'delete' | 'rpc';
    werte: unknown;
  }

  /** Ein Supabase-Doppel, das mitschreibt, was tatsaechlich abgeschickt wird. */
  function datenbankDoppel() {
    const protokoll: Eintrag[] = [];
    const client = {
      rpc: (funktion: string, payload: Record<string, unknown>) => {
        protokoll.push({ tabelle: funktion, aktion: 'rpc', werte: payload });
        const purchase = payload['p_purchase'] as Record<string, unknown>;
        const expenses = (payload['p_expenses'] as Record<string, unknown>[]) ?? [];
        return Promise.resolve({
          data: {
            purchase: { ...purchase, id: 'db-neu', workspace_id: 'ws-1' },
            purchase_lines: [],
            purchase_costs: expenses.map((expense, index) => ({
              ...expense,
              id: `db-kosten-${index + 1}`,
              purchase_id: 'db-neu',
            })),
          },
          error: null,
        });
      },
      from: (tabelle: string) => ({
        insert: (werte: unknown) => {
          protokoll.push({ tabelle, aktion: 'insert', werte });
          const antwort = Promise.resolve({ data: null, error: null });
          return Object.assign(antwort, {
            select: () => {
              const zeilen = (Array.isArray(werte) ? werte : [werte]).map((wert, index) => ({
                ...((wert ?? {}) as Record<string, unknown>),
                id: `db-kosten-${index + 1}`,
              }));
              return Object.assign(Promise.resolve({ data: zeilen, error: null }), {
                single: () => Promise.resolve({ data: { id: 'db-neu' }, error: null }),
              });
            },
          });
        },
        update: (werte: unknown) => {
          protokoll.push({ tabelle, aktion: 'update', werte });
          return { eq: () => Promise.resolve({ error: null }) };
        },
        delete: () => {
          protokoll.push({ tabelle, aktion: 'delete', werte: null });
          return { eq: () => Promise.resolve({ error: null }) };
        },
      }),
    };
    return { protokoll, client };
  }

  function zeilen(protokoll: Eintrag[], tabelle: string, aktion: Eintrag['aktion']) {
    return protokoll.filter((e) => e.tabelle === tabelle && e.aktion === aktion);
  }

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
    const { protokoll, client } = datenbankDoppel();
    const purchasesRaw = signal<Purchase[]>(liste);
    const selectedPurchaseRaw = signal<Purchase | null>(liste[0] ?? null);
    return {
      protokoll,
      purchasesRaw,
      selectedPurchaseRaw,
      dienst: baue<PurchaseService>(PurchaseService.prototype, {
        purchasesRaw,
        selectedPurchaseRaw,
        selectedPurchase: selectedPurchaseRaw.asReadonly(),
        mockStore: {
          isDemoMode: () => false,
          getPurchases: () => [],
          savePurchase: () => undefined,
        },
        sourcesService: { sources: () => [] },
        suppliersService: { suppliers: () => [] },
        syncStatus: { melde: (_b: string, f: unknown) => new Error(String(f)) },
        supabase: { client },
      }),
    };
  }

  describe('Beim Bearbeiten', () => {
    it('haengt eine neu gebuchte Kostenposition mit dem Workspace an die bestehende Liste an', async () => {
      // Der Detaildialog zeigt seine Zeilen aus `selectedPurchase.costs`.
      // Nur die Gesamtsumme zu aktualisieren laesst dort weiterhin allein
      // den alten Eintrag stehen und wirkt wie ein Ueberschreiben.
      const mitVersand: Purchase = {
        ...einkauf,
        total_purchase_cost: 242.9,
        costs: [
          {
            id: 'kosten-alt',
            purchase_id: 'p-1',
            type: 'shipping',
            amount: 12.9,
            description: 'DHL Paket',
          },
        ],
      };
      const { dienst, protokoll, selectedPurchaseRaw } = dienstMit([mitVersand]);

      await dienst.addPurchaseCost('p-1', 'travel', 7.1, 'Abholung');

      expect(selectedPurchaseRaw()?.costs).toEqual([
        mitVersand.costs?.[0],
        {
          id: 'db-neu',
          workspace_id: 'ws-1',
          purchase_id: 'p-1',
          type: 'travel',
          amount: 7.1,
          description: 'Abholung',
        },
      ]);
      expect(selectedPurchaseRaw()?.total_purchase_cost).toBe(250);
      expect(zeilen(protokoll, 'purchase_costs', 'insert')[0].werte).toEqual({
        workspace_id: 'ws-1',
        purchase_id: 'p-1',
        type: 'travel',
        amount: 7.1,
        description: 'Abholung',
      });
    });

    it('schreibt eine nachgetragene Kostenzeile in die Datenbank', async () => {
      // Der gemeldete Fall: Kosten im Bearbeiten-Dialog eintragen, speichern,
      // und nichts passiert.
      const { dienst, protokoll } = dienstMit([einkauf]);

      await dienst.ersetzeZusatzkosten('p-1', [
        { type: 'shipping', amount: 12.9, description: 'DHL Paket' },
      ]);

      const eingefuegt = zeilen(protokoll, 'purchase_costs', 'insert');
      expect(eingefuegt).toHaveLength(1);
      expect(eingefuegt[0].werte).toEqual([
        {
          workspace_id: 'ws-1',
          purchase_id: 'p-1',
          type: 'shipping',
          amount: 12.9,
          description: 'DHL Paket',
        },
      ]);
      expect(zeilen(protokoll, 'purchases', 'update')).toHaveLength(0);
    });

    it('raeumt die alten Zeilen weg, statt sie zu verdoppeln', async () => {
      // Der Dialog schickt immer die vollstaendige Liste. Ohne Aufraeumen
      // stuende nach dem zweiten Speichern jede Position doppelt da.
      const { dienst, protokoll } = dienstMit([einkauf]);

      await dienst.ersetzeZusatzkosten('p-1', [{ type: 'travel', amount: 8, description: null }]);

      expect(zeilen(protokoll, 'purchase_costs', 'delete')).toHaveLength(1);
    });

    it('loescht auch dann, wenn die letzte Kostenzeile entfernt wurde', async () => {
      const { dienst, protokoll } = dienstMit([einkauf]);

      await dienst.ersetzeZusatzkosten('p-1', []);

      expect(zeilen(protokoll, 'purchase_costs', 'delete')).toHaveLength(1);
      expect(zeilen(protokoll, 'purchase_costs', 'insert')).toHaveLength(0);
    });

    it('zieht die Gesamtkosten der Anzeige sofort nach', async () => {
      // Sonst zeigt die Kachel bis zum naechsten Laden den alten Betrag.
      const { dienst, purchasesRaw } = dienstMit([einkauf]);

      await dienst.ersetzeZusatzkosten('p-1', [
        { type: 'shipping', amount: 12.9, description: null },
        { type: 'travel', amount: 7.1, description: null },
      ]);

      expect(purchasesRaw()[0].total_purchase_cost).toBe(250);
    });

    it('deutet Zusatzkosten bei unbekanntem Warenpreis nicht als vollstaendige Gesamtkosten', async () => {
      const unbekannt: Purchase = {
        ...einkauf,
        purchase_price: null,
        total_purchase_cost: null,
      };
      const { dienst, purchasesRaw } = dienstMit([unbekannt]);

      await dienst.ersetzeZusatzkosten('p-1', [
        { type: 'shipping', amount: 12.9, description: null },
      ]);

      expect(purchasesRaw()[0].total_purchase_cost).toBeNull();
    });

    it('haengt die neuen Kostenzeilen an den geoeffneten Einkauf', async () => {
      const { dienst, selectedPurchaseRaw } = dienstMit([einkauf]);

      await dienst.ersetzeZusatzkosten('p-1', [
        { type: 'customs', amount: 19, description: 'Zoll' },
      ]);

      expect(selectedPurchaseRaw()?.costs).toHaveLength(1);
      expect(selectedPurchaseRaw()?.costs?.[0].amount).toBe(19);
    });

    it('uebernimmt die Datenbank-IDs der ersetzten Kostenzeilen', async () => {
      // Ohne ID blendet die Detailansicht den Loeschbutton fuer diese Zeile
      // aus, obwohl die Zeile bereits in der Datenbank gespeichert ist.
      const { dienst, selectedPurchaseRaw } = dienstMit([einkauf]);

      await dienst.ersetzeZusatzkosten('p-1', [
        { type: 'shipping', amount: 12.9, description: 'DHL' },
        { type: 'packaging', amount: 3.5, description: 'Karton' },
      ]);

      expect(selectedPurchaseRaw()?.costs?.map((kosten) => kosten.id)).toEqual([
        'db-kosten-1',
        'db-kosten-2',
      ]);
    });

    it('speichert eine nachgetragene Sendungsnummer', async () => {
      // Das Feld stand im Bearbeiten-Dialog, wurde aber nie mitgeschickt.
      const { dienst, protokoll } = dienstMit([einkauf]);

      await dienst.updatePurchase('p-1', {
        tracking_number: '00340434161094042557',
        tracking_carrier: 'dhl',
      });

      const werte = zeilen(protokoll, 'purchases', 'update')[0].werte as Record<string, unknown>;
      expect(werte['tracking_number']).toBe('00340434161094042557');
      expect(werte['tracking_carrier']).toBe('dhl');
    });

    it('setzt eine nachgetragene Sendung auf unterwegs', async () => {
      // Ohne das bliebe sie auf 'pending' stehen - und die Zustellmeldung, die
      // die Artikel auf 'eingetroffen' setzt, haette nie einen Anlass.
      const { dienst, protokoll } = dienstMit([einkauf]);

      await dienst.updatePurchase('p-1', { tracking_number: '00340434161094042557' });

      const werte = zeilen(protokoll, 'purchases', 'update')[0].werte as Record<string, unknown>;
      expect(werte['tracking_status']).toBe('in_transit');
    });

    it('setzt eine geloeschte Sendungsnummer wieder zurueck', async () => {
      const mitSendung: Purchase = {
        ...einkauf,
        tracking_number: '123',
        tracking_status: 'in_transit',
      };
      const { dienst, protokoll } = dienstMit([mitSendung]);

      await dienst.updatePurchase('p-1', { tracking_number: null });

      const werte = zeilen(protokoll, 'purchases', 'update')[0].werte as Record<string, unknown>;
      expect(werte['tracking_status']).toBe('pending');
      expect(werte['tracking_carrier']).toBe(null);
    });

    it('ruehrt den Sendungsstatus nicht an, wenn die Nummer gar nicht im Spiel war', async () => {
      // Eine Preiskorrektur darf eine laufende Sendung nicht zuruecksetzen.
      const unterwegs: Purchase = {
        ...einkauf,
        tracking_number: '123',
        tracking_status: 'out_for_delivery',
      };
      const { dienst, protokoll } = dienstMit([unterwegs]);

      await dienst.updatePurchase('p-1', { purchase_price: 249.9 });

      const werte = zeilen(protokoll, 'purchases', 'update')[0].werte as Record<string, unknown>;
      expect(werte['tracking_status']).toBeUndefined();
    });

    it('loescht die vorhandene Sendungsnummer nicht bei einer Preiskorrektur', async () => {
      // Der Schreibbefehl laesst weg, was `undefined` ist. Ein leeres Feld
      // gegen `null` zu tauschen haette hier die laufende Sendung geloescht.
      const unterwegs: Purchase = { ...einkauf, tracking_number: '123', tracking_carrier: 'dhl' };
      const { dienst, protokoll } = dienstMit([unterwegs]);

      await dienst.updatePurchase('p-1', { purchase_price: 249.9 });

      const werte = zeilen(protokoll, 'purchases', 'update')[0].werte as Record<string, unknown>;
      expect(werte['tracking_number']).toBeUndefined();
      expect(werte['tracking_carrier']).toBeUndefined();
    });
  });

  describe('Beim Anlegen', () => {
    /** Ein Dienst mit allem, was `createPurchase` anfasst. */
    function anlegeDienst() {
      const { protokoll, client } = datenbankDoppel();
      const purchasesRaw = signal<Purchase[]>([]);
      const selectedPurchaseRaw = signal<Purchase | null>(null);
      return {
        protokoll,
        purchasesRaw,
        dienst: baue<PurchaseService>(PurchaseService.prototype, {
          purchasesRaw,
          selectedPurchaseRaw,
          selectedPurchase: selectedPurchaseRaw.asReadonly(),
          workspaceService: { currentWorkspace: () => ({ id: 'ws-1' }) },
          mockStore: {
            isDemoMode: () => false,
            getPurchases: () => [],
            savePurchase: () => undefined,
            deletePurchase: () => undefined,
          },
          sourcesService: { sources: () => [] },
          suppliersService: { suppliers: () => [] },
          syncStatus: { melde: (_b: string, f: unknown) => new Error(String(f)) },
          webhookService: { sendPurchaseNotification: () => undefined },
          inventory: { createItem: () => Promise.resolve({ data: null, error: null }) },
          supabase: { client },
        }),
      };
    }

    it('übergibt die erfassten Zusatzkosten an die atomare Einkaufstransaktion', async () => {
      // Bis hierhin wurden sie nur zur Gesamtsumme addiert. Weil die Liste
      // beim Laden aus Preis plus Kostenzeilen neu rechnet, war der Betrag
      // nach dem naechsten Aufruf wieder verschwunden.
      const { dienst, protokoll } = anlegeDienst();

      await dienst.createPurchase({
        type: 'lot',
        title: 'Konvolut Werkzeug',
        purchase_date: '2026-08-21',
        purchase_price: 230,
        initial_costs: [
          { type: 'shipping', amount: 12.9, description: 'DHL' },
          { type: 'travel', amount: 7.1 },
        ],
      });

      const aufruf = zeilen(protokoll, 'create_purchase', 'rpc');
      expect(aufruf).toHaveLength(1);
      expect((aufruf[0].werte as { p_expenses: unknown[] }).p_expenses).toEqual([
        {
          type: 'shipping',
          amount: 12.9,
          description: 'DHL',
          allocation_method: 'value_weighted',
          target_purchase_line_ref: null,
        },
        {
          type: 'travel',
          amount: 7.1,
          description: null,
          allocation_method: 'value_weighted',
          target_purchase_line_ref: null,
        },
      ]);
    });

    it('übernimmt die Kostenzeilen mit der endgültigen Einkaufskennung', async () => {
      // Der Einkauf laeuft bis zur Antwort der Datenbank unter einer
      // Behelfskennung. Wuerden die Kosten daran haengen, zeigte der
      // Fremdschluessel ins Leere.
      const { dienst } = anlegeDienst();

      const ergebnis = await dienst.createPurchase({
        type: 'lot',
        title: 'Konvolut',
        purchase_date: '2026-08-21',
        purchase_price: 100,
        initial_costs: [{ type: 'shipping', amount: 5 }],
      });

      expect(ergebnis.data?.costs?.[0].purchase_id).toBe('db-neu');
    });

    it('schreibt keine Kostenzeile ohne Betrag', async () => {
      const { dienst, protokoll } = anlegeDienst();

      await dienst.createPurchase({
        type: 'lot',
        title: 'Konvolut',
        purchase_date: '2026-08-21',
        purchase_price: 100,
        initial_costs: [{ type: 'shipping', amount: 0 }],
      });

      const aufruf = zeilen(protokoll, 'create_purchase', 'rpc');
      expect((aufruf[0].werte as { p_expenses: unknown[] }).p_expenses).toEqual([]);
    });
  });
});
