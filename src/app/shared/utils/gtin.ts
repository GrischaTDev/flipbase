export type GtinLength = 8 | 12 | 13 | 14;

export function normalizeGtin(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) return null;
  if (!/^\d+$/.test(trimmed)) return null;
  if (![8, 12, 13, 14].includes(trimmed.length)) return null;
  return isValidGtin(trimmed) ? trimmed : null;
}

export function isValidGtin(value: string): value is `${number}` {
  if (!/^\d+$/.test(value) || ![8, 12, 13, 14].includes(value.length)) return false;
  const digits = value.split('').map(Number);
  const check = digits.pop();
  if (check === undefined) return false;
  const sum = digits
    .reverse()
    .reduce((total, digit, index) => total + digit * (index % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

export function canonicalGtin(value: string | null | undefined): string | null {
  const normalized = normalizeGtin(value);
  return normalized ? normalized.padStart(14, '0') : null;
}
