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
    expect(store.getPurchases().length).toBe(0);

    store.ensureShowcaseData();

    expect(store.getPurchases().length).toBeGreaterThan(0);
    expect(store.getItems().length).toBeGreaterThan(0);
  });

  it('überschreibt vorhandene Daten nicht, wenn Beispieldaten angefordert werden', () => {
    const store = neuerStore();
    store.savePurchase({
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
    store.savePurchase({
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
});
