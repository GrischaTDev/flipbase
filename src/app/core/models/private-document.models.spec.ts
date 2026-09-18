import { describe, expect, it } from 'vitest';
import {
  PRIVATE_DOCUMENT_MAX_BYTES,
  privateDocumentExtension,
  validatePrivateDocumentFile,
} from './private-document.models';

function file(overrides: Partial<{ name: string; type: string; size: number }> = {}) {
  return { name: 'Rechnung.pdf', type: 'application/pdf', size: 1024, ...overrides };
}

describe('private document validation', () => {
  it('akzeptiert die freigegebenen Dateitypen mit passender Endung', () => {
    expect(privateDocumentExtension(file())).toBe('pdf');
    expect(validatePrivateDocumentFile(file())).toBeNull();
  });

  it('lehnt Typ-/Endungs-Mismatches und zu große Dateien ab', () => {
    expect(
      validatePrivateDocumentFile(file({ name: 'rechnung.exe', type: 'application/pdf' }))?.message,
    ).toContain('PDF-, JPG-, PNG- oder XML');
    expect(
      validatePrivateDocumentFile(file({ size: PRIVATE_DOCUMENT_MAX_BYTES + 1 }))?.message,
    ).toContain('20 MiB');
  });
});
