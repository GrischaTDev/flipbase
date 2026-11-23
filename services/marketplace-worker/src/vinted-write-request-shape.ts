import type { Page } from 'playwright';

/**
 * Aufbau einer Schreibanfrage, die Vinteds eigene Seite beim Speichern oder Löschen sendet.
 * Enthält ausschließlich Methode, Adressmuster, Inhaltstyp, Feldnamen mit Typ und den
 * Antwortstatus – keine Werte, Texte, Preise oder Kennungen. Grundlage, um später einen
 * direkten Schreibweg im exakt gleichen Format zu bauen, statt das Format zu raten.
 */
export interface VintedWriteRequestShape {
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  contentType: 'json' | 'multipart' | 'form' | 'none' | 'other';
  fields: string[];
  status: number | null;
}

const maxShapes = 6;
const maxFields = 120;
const maxDepth = 5;
const writeMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const fieldPattern = /^[a-z0-9_#?.[\]:]{1,120}$/;
// Nur benannte Abschnitte oder Platzhalter; eine rohe Kennung darf nie im Muster stehen.
const pathPattern = /^\/api\/v2(?:\/(?::id|:x|[a-z][a-z0-9_-]{0,59})){1,8}$/;

/** Kennungen und unbekannte Abschnitte werden ersetzt, damit keine Daten im Muster landen. */
export function vintedRequestPathTemplate(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.origin !== 'https://www.vinted.de' || !parsed.pathname.startsWith('/api/v2/'))
    return null;
  const path = parsed.pathname
    .split('/')
    .map((part) =>
      part === ''
        ? part
        : /^[0-9]+$/.test(part)
          ? ':id'
          : /^[a-z][a-z0-9_-]{0,59}$/.test(part)
            ? part
            : ':x',
    )
    .join('/');
  return pathPattern.test(path) ? path : null;
}

const fieldName = (key: string) =>
  /^[0-9]+$/.test(key) ? '#' : /^[a-z][a-z0-9_]{0,40}$/.test(key) ? key : '?';

const valueType = (value: unknown): string =>
  value === null
    ? 'null'
    : Array.isArray(value)
      ? 'array'
      : typeof value === 'object'
        ? 'object'
        : typeof value === 'number'
          ? 'number'
          : typeof value === 'boolean'
            ? 'boolean'
            : 'string';

function jsonFields(value: unknown, prefix: string, depth: number, out: Set<string>): void {
  if (out.size >= maxFields || depth > maxDepth) return;
  if (Array.isArray(value)) {
    // Ein Eintrag genügt für den Aufbau; alle Einträge zu zählen verriete Mengen.
    if (value.length > 0) {
      out.add(`${prefix}[]:${valueType(value[0])}`);
      jsonFields(value[0], `${prefix}[]`, depth + 1, out);
    }
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const key of Object.keys(value).sort()) {
    if (out.size >= maxFields) return;
    const path = prefix ? `${prefix}.${fieldName(key)}` : fieldName(key);
    const child = (value as Record<string, unknown>)[key];
    out.add(`${path}:${valueType(child)}`);
    jsonFields(child, path, depth + 1, out);
  }
}

/** Reiner Teil der Messung: beschreibt eine Anfrage ohne ihre Werte. */
export function describeVintedWriteRequest(request: {
  method: string;
  url: string;
  contentType: string | null;
  body: string | null;
  status: number | null;
}): VintedWriteRequestShape | null {
  const method = request.method.toUpperCase();
  const path = vintedRequestPathTemplate(request.url);
  if (!writeMethods.has(method) || !path) return null;
  const type = (request.contentType ?? '').toLowerCase();
  const fields = new Set<string>();
  let contentType: VintedWriteRequestShape['contentType'] = 'other';
  if (!request.body) contentType = 'none';
  else if (type.startsWith('application/json')) {
    contentType = 'json';
    try {
      jsonFields(JSON.parse(request.body), '', 0, fields);
    } catch {
      fields.add('?:unparsable');
    }
  } else if (type.startsWith('multipart/form-data')) {
    contentType = 'multipart';
    for (const match of request.body.matchAll(/name="([^"]{1,80})"/g))
      if (fields.size < maxFields) fields.add(`${fieldName(match[1]!.replace(/\[\]$/, ''))}:part`);
  } else if (type.startsWith('application/x-www-form-urlencoded')) {
    contentType = 'form';
    for (const key of new URLSearchParams(request.body).keys())
      if (fields.size < maxFields) fields.add(`${fieldName(key)}:string`);
  }
  return {
    method: method as VintedWriteRequestShape['method'],
    path,
    contentType,
    fields: [...fields].filter((field) => fieldPattern.test(field)),
    status:
      typeof request.status === 'number' && Number.isInteger(request.status)
        ? request.status
        : null,
  };
}

/** Prüft zurückgegebene Messungen streng; Unerwartetes wird verworfen, nie weitergereicht. */
export function parseVintedWriteRequestShapes(input: unknown): VintedWriteRequestShape[] {
  if (!Array.isArray(input) || input.length > maxShapes) throw new Error('Ungültige Messung');
  return input.map((entry: unknown) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry))
      throw new Error('Ungültige Messung');
    const value = entry as Record<string, unknown>;
    if (
      Object.keys(value).sort().join(',') !== 'contentType,fields,method,path,status' ||
      !writeMethods.has(String(value['method'])) ||
      typeof value['path'] !== 'string' ||
      !pathPattern.test(value['path']) ||
      !['json', 'multipart', 'form', 'none', 'other'].includes(String(value['contentType'])) ||
      !Array.isArray(value['fields']) ||
      value['fields'].length > maxFields ||
      !value['fields'].every((field) => typeof field === 'string' && fieldPattern.test(field)) ||
      !(
        value['status'] === null ||
        (typeof value['status'] === 'number' &&
          Number.isInteger(value['status']) &&
          value['status'] >= 100 &&
          value['status'] <= 599)
      )
    )
      throw new Error('Ungültige Messung');
    return value as unknown as VintedWriteRequestShape;
  });
}

/**
 * Hört auf der reservierten Seite passiv mit (CDP-Network, ohne Abfangen). Nur Anfragen des
 * Hauptframes an Vinteds Schnittstelle mit schreibender Methode werden beschrieben.
 */
export async function recordVintedWriteRequests(page: Page) {
  const shapes: VintedWriteRequestShape[] = [];
  const pending = new Map<
    string,
    { method: string; url: string; contentType: string | null; body: string | null }
  >();
  const session = await page.context().newCDPSession(page);
  let mainFrame = '';
  try {
    mainFrame = (await session.send('Page.getFrameTree')).frameTree.frame.id;
  } catch {
    mainFrame = '';
  }
  session.on('Network.requestWillBeSent', (event) => {
    if (event.frameId !== mainFrame || !writeMethods.has(event.request.method.toUpperCase()))
      return;
    if (!vintedRequestPathTemplate(event.request.url)) return;
    const header = Object.entries(event.request.headers).find(
      ([key]) => key.toLowerCase() === 'content-type',
    );
    pending.set(event.requestId, {
      method: event.request.method,
      url: event.request.url,
      contentType: header ? String(header[1]) : null,
      body: event.request.postData ?? null,
    });
  });
  const settle = (requestId: string, status: number | null) => {
    const request = pending.get(requestId);
    if (!request) return;
    pending.delete(requestId);
    try {
      const shape = describeVintedWriteRequest({ ...request, status });
      if (shape && shapes.length < maxShapes) shapes.push(shape);
    } catch {
      // Eine nicht beschreibbare Anfrage wird ausgelassen; die Messung darf nichts stören.
    }
  };
  session.on('Network.responseReceived', (event) => settle(event.requestId, event.response.status));
  session.on('Network.loadingFailed', (event) => settle(event.requestId, null));
  await session.send('Network.enable', { maxPostDataSize: 262_144 });
  return {
    shapes: () => shapes.slice(),
    close: async () => {
      for (const id of [...pending.keys()]) settle(id, null);
      await session.send('Network.disable').catch(() => undefined);
      await session.detach().catch(() => undefined);
    },
  };
}
