import { LABEL_LIMITS } from './brand-label-limits';

export type LabelValidationCode =
  | 'invalid-object'
  | 'unknown-field'
  | 'missing-field'
  | 'invalid-array'
  | 'too-many-items'
  | 'invalid-text'
  | 'text-too-long'
  | 'invalid-id'
  | 'invalid-year'
  | 'invalid-date'
  | 'invalid-url'
  | 'invalid-value'
  | 'duplicate-value'
  | 'invalid-source-id'
  | 'duplicate-source'
  | 'unknown-source'
  | 'invalid-interval'
  | 'duplicate-image'
  | 'invalid-image-order'
  | 'payload-too-large';

/** Maschinenlesbarer Fehler ohne Eingabewerte, interne URLs oder SQL-Texte. */
export class LabelValidationError extends Error {
  readonly code: LabelValidationCode;
  readonly path: string;

  constructor(code: LabelValidationCode, path: string) {
    super(code);
    this.name = 'LabelValidationError';
    this.code = code;
    this.path = path;
  }
}

export function readLabelObject(
  value: unknown,
  keys: readonly string[],
  path: string,
): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new LabelValidationError('invalid-object', path);
  }
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new LabelValidationError('invalid-object', path);
  }
  const allowed = new Set(keys);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || !allowed.has(key)) {
      throw new LabelValidationError('unknown-field', path);
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) {
      throw new LabelValidationError('invalid-object', path);
    }
  }
  for (const key of keys) {
    if (!Object.hasOwn(value, key)) {
      throw new LabelValidationError('missing-field', `${path}.${key}`);
    }
  }
  return value as Record<string, unknown>;
}

export function readLabelArray(value: unknown, maximum: number, path: string): readonly unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) {
    throw new LabelValidationError('invalid-array', path);
  }
  if (value.length > maximum) throw new LabelValidationError('too-many-items', path);
  if (Reflect.ownKeys(value).length !== value.length + 1) {
    throw new LabelValidationError('invalid-array', path);
  }
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) {
      throw new LabelValidationError('invalid-array', path);
    }
  }
  return value as readonly unknown[];
}

export function readLabelText(value: unknown, maximum: number, path: string): string {
  if (typeof value !== 'string') throw new LabelValidationError('invalid-text', path);
  let characters = 0;
  for (const character of value) {
    const point = character.codePointAt(0) ?? 0;
    if (point === 0 || (point >= 0xd800 && point <= 0xdfff)) {
      throw new LabelValidationError('invalid-text', path);
    }
    characters += 1;
    if (characters > maximum) throw new LabelValidationError('text-too-long', path);
  }
  return value;
}

export function readLabelId(value: unknown, path: string): number {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > LABEL_LIMITS.maxId
  ) {
    throw new LabelValidationError('invalid-id', path);
  }
  return value;
}

export function readLabelYear(value: unknown, path: string): number | null {
  if (value === null) return null;
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > LABEL_LIMITS.maxCalendarYear
  ) {
    throw new LabelValidationError('invalid-year', path);
  }
  return value;
}

/** Kalenderprüfung ohne Browserzeitzone oder stilles Datums-Rollover. */
export function readLabelDate(value: unknown, path: string): string | null {
  if (value === null) return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new LabelValidationError('invalid-date', path);
  }
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const maximum = days[month - 1];
  if (year < 1 || maximum === undefined || day < 1 || day > maximum) {
    throw new LabelValidationError('invalid-date', path);
  }
  return value;
}

export function readLabelSourceUrl(value: unknown, path: string): string {
  const text = readLabelText(value, LABEL_LIMITS.sourceUrlCharacters, path);
  // Eine fehlende Adresse ist ein unvollständiger Entwurf, keine Veröffentlichung.
  if (text === '') return text;
  if (
    !/^https:\/\//i.test(text) ||
    /\s/.test(text) ||
    [...text].some((character) => {
      const point = character.codePointAt(0) ?? 0;
      return point < 0x20 || (point >= 0x7f && point <= 0x9f);
    })
  ) {
    throw new LabelValidationError('invalid-url', path);
  }
  try {
    const url = new URL(text);
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) {
      throw new LabelValidationError('invalid-url', path);
    }
  } catch {
    throw new LabelValidationError('invalid-url', path);
  }
  return text;
}

export function assertUniqueLabelValues<T extends string | number>(
  values: readonly T[],
  path: string,
  code: LabelValidationCode = 'duplicate-value',
): void {
  if (new Set(values).size !== values.length) throw new LabelValidationError(code, path);
}

/** Nur mit bereits rekonstruierten JSON-Daten aufrufen, niemals mit beliebigen Objektinstanzen. */
export function assertLabelJsonSize(value: unknown, path: string): void {
  const encoded = JSON.stringify(value);
  if (
    encoded === undefined ||
    new TextEncoder().encode(encoded).byteLength > LABEL_LIMITS.jsonBytes
  ) {
    throw new LabelValidationError('payload-too-large', path);
  }
}
