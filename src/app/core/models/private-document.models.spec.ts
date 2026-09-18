import { describe, expect, it } from 'vitest';
import {
  PRIVATE_DOCUMENT_MAX_BYTES,
  privateDocumentExtension,
  validatePrivateDocumentFile,
} from './private-document.models';

const file = (overrides: Partial<{ name: string; type: string; size: number }> = {}) => ({
  name: 'Rechnung.pdf',
  type: 'application/pdf',
  size: 1024,
  ...overrides,
});

describe('private document validation', () => {
  it('akzeptiert die gemeinsamen privaten Belegformate', () => {
    expect(privateDocumentExtension(file())).toBe('pdf');
    expect(privateDocumentExtension(file({ name: 'bild.jpeg', type: 'image/jpeg' }))).toBe('jpeg');
    expect(privateDocumentExtension(file({ name: 'bild.png', type: 'image/png' }))).toBe('png');
    expect(privateDocumentExtension(file({ name: 'daten.xml', type: 'application/xml' }))).toBe(
      'xml',
    );
  });

  it('lehnt Typ, Endung, leere und zu große Dateien verständlich ab', () => {
    expect(
      validatePrivateDocumentFile(file({ name: 'bild.gif', type: 'image/gif' }))?.message,
    ).toContain('PDF-, JPG-, PNG- oder XML');
    expect(validatePrivateDocumentFile(file({ name: 'rechnung.txt' }))?.message).toContain(
      'PDF-, JPG-, PNG- oder XML',
    );
    expect(validatePrivateDocumentFile(file({ size: 0 }))?.message).toContain('leer');
    expect(
      validatePrivateDocumentFile(file({ size: PRIVATE_DOCUMENT_MAX_BYTES + 1 }))?.message,
    ).toContain('20 MiB');
  });
});
