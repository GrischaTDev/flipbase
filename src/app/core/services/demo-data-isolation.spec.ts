import { describe, it, expect, beforeEach } from 'vitest';
import { Injector, runInInjectionContext } from '@angular/core';
import { MockDataStoreService } from './mock-data-store.service';

/**
 * Regressionstests zum Prüfbericht Phase 5, Befund „Kritisch 2".
 *
 * Zuvor befüllte der Konstruktor des MockDataStore ungeschützt den
 * Browser-Speicher mit Beispieldaten. Da elf Services diesen Dienst
 * injizieren, bekam damit jeder Nutzer – auch ein echt angemeldeter mit
 * leerem Bestand – vier erfundene Einkäufe und neun Artikel untergeschoben.
 * Die landeten anschließend in jeder Sicherung.
 */
describe('Beispieldaten dürfen nur im Demo-Modus entstehen', () => {
  let speicher: Record<string, string>;

  beforeEach(() => {
    speicher = {};
    const attrappe = {
      getItem: (k: string) => speicher[k] ?? null,
      setItem: (k: string, v: string) => {
        speicher[k] = v;
      },
      removeItem: (k: string) => {
        delete speicher[k];
      },
      key: (i: number) => Object.keys(speicher)[i] ?? null,
      clear: () => {
        speicher = {};
      },
      get length() {
        return Object.keys(speicher).length;
      },
    };
    (globalThis as unknown as { localStorage: unknown }).localStorage = attrappe;
  });

  const neuerStore = () =>
    runInInjectionContext(Injector.create({ providers: [] }), () => new MockDataStoreService());

  it('schreibt beim Erzeugen des Dienstes nichts in den Speicher', () => {
    neuerStore();

    expect(Object.keys(speicher)).toEqual([]);
  });

  it('legt Beispieldaten erst auf ausdrückliche Anforderung an', () => {
    const store = neuerStore();
    // Der Demo-Modus laeuft hier bereits: enterDemoMode() setzt ihn, bevor es
    // die Beispieldaten anfordert. Ohne ihn gibt der Spiegel nichts heraus.
    store.isDemoMode.set(true);
    expect(store.getPurchases().length).toBe(0);

    store.ensureShowcaseData();

    expect(store.getPurchases().length).toBeGreaterThan(0);
    expect(store.getItems().length).toBeGreaterThan(0);
  });

  it('überschreibt vorhandene Daten nicht, wenn Beispieldaten angefordert werden', () => {
    const store = neuerStore();
    store.isDemoMode.set(true);
    store.savePurchase({
      cost_allocation_mode: 'even',
      id: 'echt-1',
      workspace_id: 'ws-echt',
      type: 'single',
      title: 'Echter Einkauf des Nutzers',
      purchase_date: '2026-08-19',
      purchase_price: 42,
    });

    store.ensureShowcaseData();

    const titel = store.getPurchases().map((p) => p.title);
    expect(titel).toContain('Echter Einkauf des Nutzers');
    expect(titel.length).toBe(1);
  });

  it('setzt nur auf ausdrückliches Zurücksetzen die Beispieldaten neu', () => {
    const store = neuerStore();
    store.isDemoMode.set(true);
    store.savePurchase({
      cost_allocation_mode: 'even',
      id: 'echt-1',
      workspace_id: 'ws-echt',
      type: 'single',
      title: 'Echter Einkauf des Nutzers',
      purchase_date: '2026-08-19',
      purchase_price: 42,
    });

    store.resetToDemoShowcase();

    const titel = store.getPurchases().map((p) => p.title);
    expect(titel).not.toContain('Echter Einkauf des Nutzers');
    expect(titel.length).toBeGreaterThan(0);
  });

  describe('Schreibsperre ausserhalb des Demo-Modus', () => {
    // Seit der Umstellung auf Supabase ist die Datenbank die alleinige Quelle
    // der Wahrheit. Der lokale Speicher darf sich bei angemeldeten Nutzern
    // nicht mehr mit Geschaeftsdaten fuellen - sonst entstuende eine zweite,
    // veraltende Kopie, die niemand pflegt.
    const beispielEinkauf = {
      id: 'p-1',
      workspace_id: 'ws',
      type: 'single' as const,
      title: 'Sollte nicht ankommen',
      purchase_date: '2026-08-19',
      purchase_price: 10,
      cost_allocation_mode: 'even' as const,
    };

    it('schreibt keinen Einkauf, solange der Demo-Modus aus ist', () => {
      const store = neuerStore();

      store.savePurchase(beispielEinkauf);

      expect(store.getPurchases().length).toBe(0);
      expect(Object.keys(speicher)).toEqual([]);
    });

    it('schreibt keinen Artikel, solange der Demo-Modus aus ist', () => {
      const store = neuerStore();

      store.saveItem({
        id: 'i-1',
        workspace_id: 'ws',
        title: 'Sollte nicht ankommen',
        condition: 'used',
        status: 'ready',
        allocated_purchase_cost: 0,
      });

      expect(store.getItems().length).toBe(0);
    });

    it('schreibt im Demo-Modus wieder ganz normal', () => {
      const store = neuerStore();
      store.isDemoMode.set(true);

      store.savePurchase(beispielEinkauf);

      expect(store.getPurchases().length).toBe(1);
    });

    it('gibt ausserhalb des Demo-Modus nichts heraus, auch wenn etwas gespeichert ist', () => {
      // Gegenprobe zur Schreibsperre: Wer sich anmeldet, nachdem er den
      // Demo-Modus benutzt hat, darf die alten Eintraege nirgends mehr sehen -
      // und keine Anzeige darf ihre Werte daraus ableiten.
      const store = neuerStore();
      store.isDemoMode.set(true);
      store.savePurchase(beispielEinkauf);

      store.isDemoMode.set(false);

      expect(store.getPurchases()).toEqual([]);
      expect(store.getItems()).toEqual([]);
      expect(store.getSources()).toEqual([]);
      expect(store.getSuppliers()).toEqual([]);
    });

    it('loescht ausserhalb des Demo-Modus nichts', () => {
      const store = neuerStore();
      store.isDemoMode.set(true);
      store.savePurchase(beispielEinkauf);

      store.isDemoMode.set(false);
      store.deletePurchase('p-1');
      store.isDemoMode.set(true);

      expect(store.getPurchases().length).toBe(1);
    });
  });
});
