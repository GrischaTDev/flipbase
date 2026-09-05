export interface CsvParseResult {
  readonly headers: readonly string[];
  readonly rows: readonly Readonly<Record<string, string>>[];
}

export function parseCsv(text: string, maxRows = 1000): CsvParseResult {
  const source = text.replace(/^\uFEFF/, '');
  const delimiter = detectDelimiter(source);
  const records: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === '"') {
      if (quoted && source[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (!quoted && character === delimiter) {
      row.push(field);
      field = '';
    } else if (!quoted && (character === '\n' || character === '\r')) {
      if (character === '\r' && source[index + 1] === '\n') index += 1;
      row.push(field);
      if (row.some((value) => value.trim())) records.push(row);
      row = [];
      field = '';
      if (records.length > maxRows + 1)
        throw new Error(`CSV enthält mehr als ${maxRows} Datenzeilen.`);
    } else {
      field += character;
    }
  }
  if (quoted) throw new Error('CSV enthält ein nicht geschlossenes Anführungszeichen.');
  if (field || row.length) {
    row.push(field);
    if (row.some((value) => value.trim())) records.push(row);
  }
  if (records.length === 0) throw new Error('CSV enthält keine Kopfzeile.');
  const headers = records[0].map((header) => header.trim().toLocaleLowerCase('de'));
  if (headers.some((header) => !header) || new Set(headers).size !== headers.length) {
    throw new Error('CSV-Kopfzeile enthält leere oder doppelte Spaltennamen.');
  }
  return {
    headers,
    rows: records
      .slice(1)
      .map((values) =>
        Object.fromEntries(headers.map((header, index) => [header, values[index]?.trim() ?? ''])),
      ),
  };
}

function detectDelimiter(text: string): ',' | ';' {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  return (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';
}
