import { describe, it, expect, beforeEach } from 'vitest';
import { prepareBrowserStorage } from '../utils/browser-storage-initialization';
import { uebernehmeAltenBrowserSpeicher } from './storage-migration';

/**
 * Der Umzug laeuft genau einmal und im Hintergrund - wenn er etwas verliert,
 * merkt es niemand, bis die Daten gebraucht werden. Betroffen waeren unter
 * anderem die offline erfassten Flohmarkt-Eintraege, die es nur im Browser
 * gibt und sonst nirgends.
 */
describe('Umzug des Browser-Speichers auf das neue Praefix', () => {
  let inhalt: Record<string, string>;
  let speicher: Storage;

  beforeEach(() => {
    inhalt = {};
    speicher = {
      getItem: (k: string) => inhalt[k] ?? null,
      setItem: (k: string, v: string) => {
        inhalt[k] = v;
      },
      removeItem: (k: string) => {
        delete inhalt[k];
      },
      key: (i: number) => Object.keys(inhalt)[i] ?? null,
      clear: () => {
        inhalt = {};
      },
      get length() {
        return Object.keys(inhalt).length;
      },
    } as Storage;
  });

  it('uebernimmt alte Werte unter dem neuen Namen', () => {
    inhalt['reflip_theme'] = 'dark';
    inhalt['reflip_offline_purchase_entries'] = '[{"id":"1"}]';

    const anzahl = uebernehmeAltenBrowserSpeicher(speicher);

    expect(anzahl).toBe(2);
    expect(inhalt['flipbase_theme']).toBe('dark');
    expect(inhalt['flipbase_offline_purchase_entries']).toBe('[{"id":"1"}]');
  });

  it('raeumt die alten Schluessel weg', () => {
    inhalt['reflip_theme'] = 'dark';

    uebernehmeAltenBrowserSpeicher(speicher);

    expect(inhalt['reflip_theme']).toBeUndefined();
  });

  it('laesst fremde Schluessel unberuehrt', () => {
    inhalt['irgendwas_anderes'] = 'bleibt';

    uebernehmeAltenBrowserSpeicher(speicher);

    expect(inhalt['irgendwas_anderes']).toBe('bleibt');
  });

  it('ueberschreibt einen bereits vorhandenen neuen Wert nicht', () => {
    // Der neue Wert ist der juengere - er darf nicht von einem Ueberbleibsel
    // aus der Zeit davor verdraengt werden.
    inhalt['reflip_theme'] = 'dark';
    inhalt['flipbase_theme'] = 'light';

    uebernehmeAltenBrowserSpeicher(speicher);

    expect(inhalt['flipbase_theme']).toBe('light');
    expect(inhalt['reflip_theme']).toBeUndefined();
  });

  it('laeuft nur ein einziges Mal', () => {
    inhalt['reflip_theme'] = 'dark';
    uebernehmeAltenBrowserSpeicher(speicher);

    // Ein Ueberbleibsel, das spaeter auftaucht, wird nicht mehr angefasst -
    // sonst koennte ein zweiter Durchlauf neuere Daten verdraengen.
    inhalt['reflip_theme'] = 'veraltet';
    const zweiterLauf = uebernehmeAltenBrowserSpeicher(speicher);

    expect(zweiterLauf).toBe(0);
    expect(inhalt['flipbase_theme']).toBe('dark');
  });

  it('erfasst alle Eintraege, auch wenn sich der Bestand dabei verkuerzt', () => {
    // Beim Umziehen faellt je ein alter Schluessel weg. Wer ueber den sich
    // veraendernden Bestand laeuft, ueberspringt jeden zweiten Eintrag.
    for (let i = 0; i < 10; i++) inhalt['reflip_wert_' + i] = String(i);

    const anzahl = uebernehmeAltenBrowserSpeicher(speicher);

    expect(anzahl).toBe(10);
    expect(Object.keys(inhalt).filter((k) => k.startsWith('reflip_'))).toEqual([]);
  });

  it('entfernt globale Geschäftsdaten direkt nach der Präfix-Migration', () => {
    inhalt['reflip_saved_returns'] = '[{"id":"return-a"}]';
    inhalt['reflip_price_radar_items'] = '[{"id":"track-a"}]';
    inhalt['flipbase_shipping_orders'] = '[{"id":"shipping-a"}]';
    inhalt['flipbase_carrier_config'] = '{"dhlEkp":"foreign-account"}';
    inhalt['reflip_theme'] = 'dark';

    prepareBrowserStorage(speicher);

    expect(inhalt['reflip_saved_returns']).toBeUndefined();
    expect(inhalt['reflip_price_radar_items']).toBeUndefined();
    expect(inhalt['flipbase_saved_returns']).toBeUndefined();
    expect(inhalt['flipbase_price_radar_items']).toBeUndefined();
    expect(inhalt['flipbase_shipping_orders']).toBeUndefined();
    expect(inhalt['flipbase_carrier_config']).toBeUndefined();
    expect(inhalt['flipbase_theme']).toBe('dark');
  });
});
