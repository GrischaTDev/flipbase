import type {
  Capability,
  CapabilityMap,
  CommandRequest,
  PageRequest,
} from './marketplace-contracts.ts';

export type CommandValidationResult =
  | { readonly ok: true; readonly command: CommandRequest }
  | {
      readonly ok: false;
      readonly error: { readonly code: 'invalid_command'; readonly field: string };
    };

// Grenzen unseres Transportvertrags, keine behaupteten Limits der Marktplätze.
const MAX_TEXT_LENGTH = 5000;
const MAX_PAGE_SIZE = 100;
const MAX_CURSOR_LENGTH = 2048;
const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Reflect.ownKeys(value).every((key) => typeof key === 'string' && allowed.includes(key));
}

function isIdentifier(value: unknown): value is string {
  return typeof value === 'string' && IDENTIFIER_PATTERN.test(value);
}

function isText(value: unknown, maximumLength: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maximumLength;
}

function invalid(field: string): CommandValidationResult {
  // Keine übergebenen Werte zurückgeben: Sie könnten Geheimnisse enthalten.
  return { ok: false, error: { code: 'invalid_command', field } };
}

function valid(command: CommandRequest): CommandValidationResult {
  Object.freeze(command.scope);
  Object.freeze(command.payload);
  return { ok: true, command: Object.freeze(command) };
}

/** Technischer Fähigkeitsstatus, ausdrücklich keine Nutzer- oder Plattformautorisierung. */
export function hasVerifiedCapability(states: CapabilityMap, capability: Capability): boolean {
  return Object.hasOwn(states, capability) && states[capability] === 'verified';
}

/**
 * Prüft ausschließlich den Transportvertrag und erzeugt eine unabhängige Kopie.
 * Vor einer Ausführung sind Anmeldung, Kontozugriff, Fremdschlüssel, Fähigkeiten
 * und Plattformfreigabe zusätzlich serverseitig zu prüfen. Hier wird nichts ausgeführt.
 */
export function validateMarketplaceCommand(input: unknown): CommandValidationResult {
  if (!isRecord(input) || !hasOnlyKeys(input, ['scope', 'requestId', 'action', 'payload'])) {
    return invalid('request');
  }
  if (!isRecord(input.scope) || !hasOnlyKeys(input.scope, ['workspaceId', 'connectionId'])) {
    return invalid('scope');
  }
  if (!isIdentifier(input.scope.workspaceId)) return invalid('scope.workspaceId');
  if (!isIdentifier(input.scope.connectionId)) return invalid('scope.connectionId');
  if (!isIdentifier(input.requestId)) return invalid('requestId');
  if (!isRecord(input.payload)) return invalid('payload');

  const base = {
    scope: {
      workspaceId: input.scope.workspaceId,
      connectionId: input.scope.connectionId,
    },
    requestId: input.requestId,
  };
  const payload = input.payload;

  switch (input.action) {
    case 'profile.read':
      if (!hasOnlyKeys(payload, [])) return invalid('payload');
      return valid({ ...base, action: input.action, payload: {} });

    case 'listings.read':
    case 'conversations.read':
    case 'sales.read': {
      if (!hasOnlyKeys(payload, ['cursor', 'limit'])) return invalid('payload');
      const page: { cursor?: string; limit?: number } = {};
      if (Object.hasOwn(payload, 'cursor')) {
        if (!isText(payload.cursor, MAX_CURSOR_LENGTH)) return invalid('payload.cursor');
        page.cursor = payload.cursor;
      }
      if (Object.hasOwn(payload, 'limit')) {
        if (
          typeof payload.limit !== 'number' ||
          !Number.isInteger(payload.limit) ||
          payload.limit < 1 ||
          payload.limit > MAX_PAGE_SIZE
        ) {
          return invalid('payload.limit');
        }
        page.limit = payload.limit;
      }
      return valid({ ...base, action: input.action, payload: page satisfies PageRequest });
    }

    case 'metrics.read':
      if (!hasOnlyKeys(payload, ['publicationId'])) return invalid('payload');
      if (!isIdentifier(payload.publicationId)) return invalid('payload.publicationId');
      return valid({
        ...base,
        action: input.action,
        payload: { publicationId: payload.publicationId },
      });

    case 'messages.sendText':
      if (!hasOnlyKeys(payload, ['conversationId', 'text'])) return invalid('payload');
      if (!isIdentifier(payload.conversationId)) return invalid('payload.conversationId');
      if (!isText(payload.text, MAX_TEXT_LENGTH)) return invalid('payload.text');
      return valid({
        ...base,
        action: input.action,
        payload: { conversationId: payload.conversationId, text: payload.text },
      });

    case 'listings.publish':
      if (!hasOnlyKeys(payload, ['listingId'])) return invalid('payload');
      if (!isIdentifier(payload.listingId)) return invalid('payload.listingId');
      return valid({ ...base, action: input.action, payload: { listingId: payload.listingId } });

    case 'listings.update':
      if (!hasOnlyKeys(payload, ['listingId', 'publicationId'])) return invalid('payload');
      if (!isIdentifier(payload.listingId)) return invalid('payload.listingId');
      if (!isIdentifier(payload.publicationId)) return invalid('payload.publicationId');
      return valid({
        ...base,
        action: input.action,
        payload: { listingId: payload.listingId, publicationId: payload.publicationId },
      });

    default:
      return invalid('action');
  }
}
