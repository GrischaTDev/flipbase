import '@angular/compiler';
import { describe, it, expect, beforeEach } from 'vitest';
import { Injector, runInInjectionContext, signal } from '@angular/core';
import { TaxEngineService } from './tax-engine.service';
import { WorkspaceService } from './workspace.service';
import { SalesService } from './sales.service';
import { InventoryService } from './inventory.service';
import { TaxCalculationResult } from '../models/flipbase.models';

/**
 * Prüft den DATEV-Buchungsstapel und die Steuerberechnung.
 *
 * Diese Zahlen gehen an die Steuerkanzlei und ans Finanzamt. Die Befunde
 * 4.3 bis 4.7 aus dem Projekt-Audit werden hier festgehalten, damit sie
 * nicht zurückkehren.
 */
describe('DATEV-Buchungsstapel & Steuerberechnung', () => {
  let engine: TaxEngineService;

  beforeEach(() => {
    // Der TaxEngineService zieht Workspace, Verkäufe und Inventar heran. Für
    // die geprüften Funktionen werden diese Daten nicht gebraucht, deshalb
    // genügen schlanke Attrappen.
    const injector = Injector.create({
      providers: [
        { provide: WorkspaceService, useValue: { currentWorkspace: signal(null) } },
        { provide: SalesService, useValue: { sales: signal([]) } },
        { provide: InventoryService, useValue: { items: signal([]) } },
      ],
    });
    engine = runInInjectionContext(injector, () => new TaxEngineService());
  });

  const ergebnis = (
    ueberschreibungen: Partial<TaxCalculationResult> = {},
  ): TaxCalculationResult => ({
    sale_id: 'a1b2c3d4-e5f6-0000-0000-000000000001',
    item_title: 'Sony PlayStation 5',
    sale_date: '2026-08-17',
    tax_mode: 'diff_25a',
    gross_revenue: 350,
    total_purchase_cost: 230,
    gross_margin: 120,
    tax_base: 120,
    vat_amount: 19.16,
    input_tax_deductible: 1.6,
    net_tax_liability: 17.56,
    net_profit_after_tax: 90.84,
    invoice_clause: '',
    ...ueberschreibungen,
  });

  /** Zerlegt den erzeugten Stapel in Kopfzeile, Spaltenüberschriften und Buchungen. */
  const zerlege = (csv: string) => {
    const zeilen = csv.split('\r\n');
    return {
      kopf: zeilen[0].split(';'),
      spalten: zeilen[1].split(';'),
      buchungen: zeilen.slice(2),
    };
  };

  describe('Belegdatum (Audit 4.3)', () => {
    it('schreibt das Datum als TTMM, nicht als MMTT', () => {
      // 2026-08-17 muss als "1708" erscheinen (17. August).
      // Zuvor stand dort "0817" - das liest DATEV als Tag 08, Monat 17.
      const { buchungen } = zerlege(
        engine.generateDatevCsv([ergebnis({ sale_date: '2026-08-17' })]),
      );
      const felder = buchungen[0].split(';');
      const belegdatum = felder[engine.datevSpalten.indexOf('Belegdatum')];

      expect(belegdatum).toBe('1708');
    });

    it('füllt einstellige Tage und Monate auf zwei Stellen auf', () => {
      const { buchungen } = zerlege(
        engine.generateDatevCsv([ergebnis({ sale_date: '2026-03-05' })]),
      );
      const felder = buchungen[0].split(';');

      expect(felder[engine.datevSpalten.indexOf('Belegdatum')]).toBe('0503');
    });
  });

  describe('Buchungsrichtung (Audit 4.4)', () => {
    it('bucht Bank an Erlöse, nicht umgekehrt', () => {
      // Ein Verkauf ist: Bank (1200) an Erlöse (8200).
      // Zuvor stand das Erlöskonto im Feld "Konto" mit Kennzeichen S -
      // damit landete der Umsatz auf der falschen Seite.
      const { buchungen } = zerlege(engine.generateDatevCsv([ergebnis()]));
      const felder = buchungen[0].split(';');

      expect(felder[engine.datevSpalten.indexOf('Konto')]).toBe('1200');
      expect(felder[engine.datevSpalten.indexOf('Gegenkonto (ohne BU-Schlüssel)')]).toBe('8200');
      expect(felder[engine.datevSpalten.indexOf('Soll/Haben-Kennzeichen')]).toBe('S');
    });

    it('nutzt je Steuermodus das richtige Erlöskonto', () => {
      const faelle: readonly [TaxCalculationResult['tax_mode'], string][] = [
        ['diff_25a', '8200'],
        ['kleinunternehmer_19', '8195'],
        ['regular_19', '8400'],
      ];

      for (const [modus, konto] of faelle) {
        const { buchungen } = zerlege(engine.generateDatevCsv([ergebnis({ tax_mode: modus })]));
        const felder = buchungen[0].split(';');
        expect(felder[engine.datevSpalten.indexOf('Gegenkonto (ohne BU-Schlüssel)')]).toBe(konto);
      }
    });
  });

  describe('EXTF-Kopfzeile (Audit 4.5)', () => {
    it('hat die von DATEV geforderten 31 Felder', () => {
      // Zuvor waren es 10 - DATEV kann die Datei damit nicht einlesen.
      const { kopf } = zerlege(engine.generateDatevCsv([ergebnis()]));

      expect(kopf.length).toBe(31);
    });

    it('beginnt mit Kennung, Version und Formatkategorie', () => {
      const { kopf } = zerlege(engine.generateDatevCsv([ergebnis()]));

      expect(kopf[0]).toBe('"EXTF"');
      expect(kopf[1]).toBe('700');
      expect(kopf[2]).toBe('21'); // Buchungsstapel
      expect(kopf[3]).toBe('"Buchungsstapel"');
      expect(kopf[4]).toBe('13'); // Formatversion
    });

    it('enthält Wirtschaftsjahresbeginn und Zeitraum im DATEV-Datumsformat', () => {
      const { kopf } = zerlege(engine.generateDatevCsv([ergebnis({ sale_date: '2026-08-17' })]));

      expect(kopf[12]).toBe('20260101'); // Wirtschaftsjahresbeginn
      expect(kopf[13]).toBe('4'); // Sachkontenlaenge
      expect(kopf[14]).toBe('20260817'); // Datum von
      expect(kopf[15]).toBe('20260817'); // Datum bis
    });

    it('gibt die Währung an', () => {
      const { kopf } = zerlege(engine.generateDatevCsv([ergebnis()]));
      expect(kopf[19]).toBe('"EUR"');
    });

    it('kommt ohne Buchungen zurecht', () => {
      const csv = engine.generateDatevCsv([]);
      const { kopf, buchungen } = zerlege(csv);

      expect(kopf.length).toBe(31);
      expect(buchungen.filter((z) => z.trim().length > 0).length).toBe(0);
    });
  });

  describe('Spaltenüberschriften', () => {
    it('führt die Pflichtspalten in der von DATEV erwarteten Reihenfolge', () => {
      const { spalten } = zerlege(engine.generateDatevCsv([ergebnis()]));

      expect(spalten[0]).toBe('Umsatz (ohne Soll/Haben-Kz)');
      expect(spalten[1]).toBe('Soll/Haben-Kennzeichen');
      expect(spalten[2]).toBe('WKZ Umsatz');
      expect(spalten[6]).toBe('Konto');
      expect(spalten[7]).toBe('Gegenkonto (ohne BU-Schlüssel)');
    });
  });

  describe('Beträge', () => {
    it('schreibt Beträge mit Komma als Dezimaltrenner und ohne Vorzeichen', () => {
      const { buchungen } = zerlege(engine.generateDatevCsv([ergebnis({ gross_revenue: 1234.5 })]));
      const felder = buchungen[0].split(';');

      expect(felder[0]).toBe('1234,50');
    });
  });

  describe('Reingewinn nach Steuern (Audit 4.6)', () => {
    it('rechnet die abziehbare Vorsteuer gegen', () => {
      // Marge 120 €, Betriebskosten 10 €, USt 19,16 €, Vorsteuer 1,60 €
      // richtig: 120 - 10 - (19,16 - 1,60) = 92,44 €
      // zuvor:   120 - 10 - 19,16          = 90,84 €  (Vorsteuer ignoriert)
      const res = engine.calculateSaleTax(
        {
          id: 's-1',
          workspace_id: 'ws',
          inventory_item_id: 'i-1',
          platform: 'ebay',
          sale_price: 350,
          sale_date: '2026-08-17',
          platform_fee: 10,
          shipping_cost: 0,
          packaging_cost: 0,
          other_costs: 0,
        },
        {
          id: 'i-1',
          workspace_id: 'ws',
          title: 'Sony PlayStation 5',
          condition: 'used',
          status: 'sold',
          allocated_purchase_cost: 230,
        },
        'diff_25a',
      );

      expect(res.net_profit_after_tax).toBeCloseTo(
        res.gross_margin - 10 - res.net_tax_liability,
        2,
      );
    });
  });

  describe('Schutz vor Formeln in CSV-Dateien (Audit 4.7)', () => {
    it('entschärft einen Artikeltitel, der als Formel gelesen würde', () => {
      const csv = engine.generateEurCsv([
        ergebnis({ item_title: '=HYPERLINK("http://boese.example")' }),
      ]);

      expect(csv).not.toMatch(/;"?=HYPERLINK/);
      expect(csv).toContain("'=HYPERLINK");
    });

    it('entschärft auch +, - und @ am Zeilenanfang', () => {
      for (const zeichen of ['+', '-', '@']) {
        const csv = engine.generateEurCsv([ergebnis({ item_title: `${zeichen}1+1` })]);
        expect(csv).toContain(`'${zeichen}1+1`);
      }
    });

    it('lässt harmlose Titel unverändert', () => {
      const csv = engine.generateEurCsv([ergebnis({ item_title: 'Sony PlayStation 5' })]);

      expect(csv).toContain('Sony PlayStation 5');
      expect(csv).not.toContain("'Sony");
    });

    it('schützt auch den DATEV-Buchungstext', () => {
      const { buchungen } = zerlege(
        engine.generateDatevCsv([ergebnis({ item_title: '=SUM(A1:A9)' })]),
      );

      expect(buchungen[0]).not.toMatch(/;"?=SUM/);
    });
  });
});
