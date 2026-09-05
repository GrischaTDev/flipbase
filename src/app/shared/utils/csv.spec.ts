import { parseCsv } from './csv';
import { describe, expect, it } from 'vitest';

describe('CSV parser', () => {
  it('handles BOM, semicolon and quoted separators', () => {
    const result = parseCsv('\uFEFFtitle;ean\r\n"Tasse; blau";"036000291452"\r\n');
    expect(result.headers).toEqual(['title', 'ean']);
    expect(result.rows[0]).toEqual({ title: 'Tasse; blau', ean: '036000291452' });
  });

  it('rejects malformed quoted input and duplicate headers', () => {
    expect(() => parseCsv('title,title\na,b')).toThrow(/doppelte/);
    expect(() => parseCsv('title\n"nicht fertig')).toThrow(/Anführungszeichen/);
  });
});
