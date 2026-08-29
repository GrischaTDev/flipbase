/**
 * Erzeugt eine UUID v4 fuer Werte, die ausserhalb des Browsers verwendet
 * werden können (z. B. Datenbank-IDs oder Idempotenzschlüssel).
 *
 * `getRandomValues` ist der sichere Browser-Fallback für HTTP-Umgebungen,
 * in denen `randomUUID` nicht verfügbar ist. Ohne kryptografische Quelle wird
 * bewusst kein Ersatzwert erzeugt.
 */
export function createSecureClientUuid(): string {
  const browserCrypto = globalThis.crypto;
  if (typeof browserCrypto?.randomUUID === 'function') {
    return browserCrypto.randomUUID();
  }
  if (typeof browserCrypto?.getRandomValues === 'function') {
    const bytes = browserCrypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hexadecimal = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
    return `${hexadecimal.slice(0, 8)}-${hexadecimal.slice(8, 12)}-${hexadecimal.slice(12, 16)}-${hexadecimal.slice(16, 20)}-${hexadecimal.slice(20)}`;
  }
  throw new Error('Für diese Aktion ist eine sichere Browser-UUID erforderlich.');
}

let localSequence = 0;

/**
 * Kennung ausschließlich für lokale Demo- und kurzlebige Clientdaten.
 *
 * Der nicht-kryptografische Fallback darf nie für Datenbank-IDs,
 * Berechtigungen, Sicherheitswerte oder Idempotenzschlüssel verwendet werden.
 */
export function createLocalDemoId(prefix: string): string {
  try {
    return createSecureClientUuid();
  } catch {
    localSequence += 1;
    return `${prefix}-local-${Date.now().toString(36)}-${localSequence.toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}
