import type { Page } from 'playwright';
import type {
  MarketplaceMessageCommand,
  MarketplaceMessageResult,
} from '../../../supabase/functions/_shared/marketplace-message-contracts.d.ts';

function record(input: unknown): Record<string, unknown> {
  return input !== null && typeof input === 'object' && !Array.isArray(input)
    ? (input as Record<string, unknown>)
    : {};
}

function identifier(input: unknown): string | null {
  const text = typeof input === 'number' && Number.isSafeInteger(input) ? String(input) : input;
  return typeof text === 'string' && /^[1-9][0-9]{0,31}$/.test(text) ? text : null;
}

export function isValidVintedMessageCommand(command: MarketplaceMessageCommand): boolean {
  if (
    !identifier(command.externalConversationId) ||
    typeof command.text !== 'string' ||
    command.text.length > 5000 ||
    [...command.text].some((character) => {
      const code = character.charCodeAt(0);
      return code < 32 && code !== 9 && code !== 10 && code !== 13;
    }) ||
    (!command.text.trim() && !command.attachment)
  )
    return false;
  const attachment = command.attachment;
  if (!attachment) return true;
  if (
    typeof attachment.name !== 'string' ||
    !attachment.name.trim() ||
    attachment.name.length > 120 ||
    /[/\\]/.test(attachment.name) ||
    [...attachment.name].some((character) => character.charCodeAt(0) < 32) ||
    !['image/jpeg', 'image/png'].includes(attachment.mimeType) ||
    typeof attachment.base64 !== 'string' ||
    attachment.base64.length > 349_528 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(attachment.base64)
  )
    return false;
  const bytes = Buffer.from(attachment.base64, 'base64');
  if (!bytes.length || bytes.length > 262_144 || bytes.toString('base64') !== attachment.base64)
    return false;
  return attachment.mimeType === 'image/png'
    ? [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte)
    : bytes[0] === 255 &&
        bytes[1] === 216 &&
        bytes[2] === 255 &&
        bytes.at(-2) === 255 &&
        bytes.at(-1) === 217;
}

class MessageRequestError extends Error {
  readonly code: string;
  readonly status?: number;
  constructor(code: string, status?: number) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

export async function sendVintedMessage(
  page: Page,
  accountId: string,
  command: MarketplaceMessageCommand,
  authorize: () => Promise<void>,
): Promise<MarketplaceMessageResult> {
  if (!identifier(accountId) || !isValidVintedMessageCommand(command))
    return { outcome: 'failed', errorCode: 'invalid_command' };
  let replyAttempted = false;
  let replyAccepted = false;
  async function assertAuthorized(): Promise<void> {
    try {
      await authorize();
    } catch {
      throw new MessageRequestError('authorization_expired');
    }
    if (new URL(page.url()).origin !== 'https://www.vinted.de')
      throw new MessageRequestError('login_required');
  }
  async function request(
    path: string,
    write?: { csrf: string; upload?: boolean },
  ): Promise<unknown> {
    await assertAuthorized();
    // Ab hier kann ein Reply trotz verlorener Browserantwort bereits übermittelt worden sein.
    if (write && !write.upload) replyAttempted = true;
    const response = await page.evaluate(
      async ({ path, write, command }) => {
        if (location.origin !== 'https://www.vinted.de')
          return { status: 401, isJson: false, payload: null };
        let body: string | FormData | undefined;
        const headers: Record<string, string> = { Accept: 'application/json' };
        if (write) {
          headers['X-CSRF-Token'] = write.csrf;
          if (write.upload && command.attachment) {
            const bytes = Uint8Array.from(atob(command.attachment.base64), (character) =>
              character.charCodeAt(0),
            );
            body = new FormData();
            body.append('photo[type]', 'user_msg');
            body.append(
              'photo[file]',
              new Blob([bytes], { type: command.attachment.mimeType }),
              command.attachment.name,
            );
          } else {
            headers['Content-Type'] = 'application/json';
            const reply = {
              body: command.text,
              photo_temp_uuids: write.temporaryPhotos,
              ...(command.attachment ? { is_personal_data_sharing_check_skipped: false } : {}),
            };
            body = JSON.stringify({ reply });
          }
        }
        const response = await fetch(path, {
          method: write ? 'POST' : 'GET',
          credentials: 'include',
          headers,
          ...(body === undefined ? {} : { body }),
          cache: 'no-store',
          redirect: 'error',
          signal: AbortSignal.timeout(10_000),
        });
        const isJson = response.headers.get('content-type')?.includes('application/json') ?? false;
        return {
          status: response.status,
          isJson,
          payload: isJson ? await response.json().catch(() => null) : null,
        };
      },
      { path, write: write ? { ...write, temporaryPhotos } : null, command },
    );
    if (response.status < 200 || response.status >= 300) {
      const code =
        response.status === 429
          ? 'rate_limited'
          : response.status === 401
            ? 'login_required'
            : response.status === 403
              ? 'challenge_required'
              : 'provider_unavailable';
      throw new MessageRequestError(code, response.status);
    }
    if (!response.isJson || response.payload === null)
      throw new MessageRequestError('challenge_required');
    return response.payload as unknown;
  }
  async function identity(): Promise<void> {
    if (identifier(record(record(await request('/api/v2/users/current')).user).id) !== accountId)
      throw new MessageRequestError('identity_changed');
  }
  async function messages(): Promise<unknown[]> {
    const conversation = record(
      record(await request(`/api/v2/conversations/${command.externalConversationId}`)).conversation,
    );
    if (
      identifier(conversation.id) !== command.externalConversationId ||
      !Array.isArray(conversation.messages)
    )
      throw new MessageRequestError('reply_unconfirmed');
    return conversation.messages;
  }
  let temporaryPhotos: string[] | null = null;
  try {
    await assertAuthorized();
    const csrf = await page.evaluate(() => {
      const valid = (token: unknown): token is string =>
        typeof token === 'string' && !!token.trim() && token.length <= 512;
      const metadata = document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content;
      if (valid(metadata)) return metadata;
      for (const script of document.scripts) {
        if (script.src) continue;
        const frame = script.textContent?.trim().match(/^self\.__next_f\.push\(([\s\S]*)\);?$/);
        if (!frame) continue;
        try {
          // Nur JSON-Frames lesen, niemals ausgelieferte Skripte ausführen.
          const payload: unknown = JSON.parse(frame[1] ?? '');
          const match =
            Array.isArray(payload) && typeof payload[1] === 'string'
              ? payload[1].match(/"CSRF_TOKEN"\s*:\s*("(?:[^"\\]|\\.)*")/)
              : null;
          const token: unknown = match ? JSON.parse(match[1] ?? 'null') : null;
          if (valid(token)) return token;
        } catch {
          /* Andere oder unvollständige Frames bestätigen keine Freigabe. */
        }
      }
      return null;
    });
    if (!csrf) throw new MessageRequestError('login_required');
    await identity();
    const baseline = new Set(
      (await messages()).flatMap((message) => {
        const id = identifier(record(message).id) ?? identifier(record(record(message).entity).id);
        return id ? [id] : [];
      }),
    );
    if (command.attachment) {
      await identity();
      const uploaded = record(await request('/api/v2/photos', { csrf, upload: true }));
      const temporaryId = uploaded.photo_temp_uuid ?? uploaded.temp_uuid;
      if (
        typeof temporaryId !== 'string' ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(temporaryId)
      )
        throw new MessageRequestError('attachment_unconfirmed');
      temporaryPhotos = [temporaryId];
    }
    await identity();
    await request(`/api/v2/conversations/${command.externalConversationId}/replies`, { csrf });
    replyAccepted = true;
    await identity();
    const matches = (await messages()).flatMap((message) => {
      const row = record(message);
      const entity = record(row.entity);
      const id = identifier(row.id) ?? identifier(entity.id);
      // Ohne belegten Bildbezug ist ein passender Text kein Versandnachweis für den Anhang.
      return id &&
        !baseline.has(id) &&
        identifier(entity.user_id) === accountId &&
        entity.body === command.text &&
        !command.attachment
        ? [id]
        : [];
    });
    return matches.length === 1
      ? { outcome: 'sent', externalMessageId: matches[0] }
      : { outcome: 'outcome_unknown', errorCode: 'reply_unconfirmed' };
  } catch (error) {
    const rejected =
      error instanceof MessageRequestError &&
      error.status !== undefined &&
      error.status >= 400 &&
      error.status < 500 &&
      error.status !== 408;
    return {
      outcome: !replyAttempted || (!replyAccepted && rejected) ? 'failed' : 'outcome_unknown',
      errorCode: error instanceof MessageRequestError ? error.code : 'provider_unavailable',
    };
  }
}
