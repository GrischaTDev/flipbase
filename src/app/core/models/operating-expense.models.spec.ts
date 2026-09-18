import { describe, expect, it } from 'vitest';
import {
  OPERATING_EXPENSE_DEFAULT_CATEGORIES,
  OPERATING_EXPENSE_DOCUMENT_MAX_BYTES,
  OPERATING_EXPENSE_INTERVAL_LABELS,
  calculateExpenseTax,
  validateOperatingExpenseDocumentFile,
} from './operating-expense.models';

describe('Betriebsausgabenmodelle', () => {
  it('liefert die gängigen Standardkategorien in verständlicher Reihenfolge', () => {
    expect(OPERATING_EXPENSE_DEFAULT_CATEGORIES.map((category) => category.label)).toEqual([
      'Versandmaterial',
      'Technik & Geräte',
      'Software & Abos',
      'Hosting & Server',
      'Miete & Räume',
      'Werbung',
      'Dienstleistungen',
      'Gebühren',
      'Bürobedarf',
      'Fahrzeug & Fahrtkosten',
      'Versicherungen',
      'Steuer & Beratung',
      'Sonstiges',
    ]);
  });

  it('benennt monatliche, quartalsweise und jährliche Wiederholungen', () => {
    expect(OPERATING_EXPENSE_INTERVAL_LABELS).toEqual({
      monthly: 'Monatlich',
      quarterly: 'Quartalsweise',
      yearly: 'Jährlich',
    });
  });

  it.each([
    [119, 19, { netAmount: 100, vatAmount: 19 }],
    [107, 7, { netAmount: 100, vatAmount: 7 }],
    [29.9, 0, { netAmount: 29.9, vatAmount: 0 }],
  ] as const)('berechnet Netto und MwSt. aus %s € brutto bei %s %%', (gross, vat, expected) => {
    expect(calculateExpenseTax(gross, vat)).toEqual(expected);
  });

  it('erfindet ohne MwSt.-Angabe keine Netto- oder Steuerwerte', () => {
    expect(calculateExpenseTax(29.9, null)).toEqual({ netAmount: null, vatAmount: null });
  });

  it.each([
    [{ name: 'beleg.gif', type: 'image/gif', size: 100 }, 'PDF-, JPG-, PNG- oder XML'],
    [{ name: 'beleg.pdf', type: 'application/pdf', size: 0 }, 'Datei ist leer'],
    [
      {
        name: 'beleg.pdf',
        type: 'application/pdf',
        size: OPERATING_EXPENSE_DOCUMENT_MAX_BYTES + 1,
      },
      'größer als 20 MiB',
    ],
  ])('lehnt ungeeignete Ausgabenbelege ab', (file, message) => {
    expect(validateOperatingExpenseDocumentFile(file)?.message).toContain(message);
  });
});
