import {
  defaultSettings,
  discordTarget,
  publicSettings,
  settingsPatch,
  type WebhookChannel,
  type WebhookRow,
} from './webhook-settings.ts';
import { postPublicWebhook } from './public-webhook-post.ts';
import type { WebhookSale } from './sale-notification.ts';

export interface WebhookPorts {
  authorize(workspaceId: string): Promise<boolean>;
  administer(workspaceId: string): Promise<boolean>;
  read(workspaceId: string): Promise<WebhookRow | null>;
  save(workspaceId: string, patch: Record<string, boolean | string | null>): Promise<WebhookRow>;
  claim(workspaceId: string, event: string, channel: WebhookChannel): Promise<boolean>;
  complete(workspaceId: string, event: string, channel: WebhookChannel): Promise<void>;
  sale(workspaceId: string, saleId: string): Promise<WebhookSale | null>;
  fetch?: typeof fetch;
  customPost?: typeof postPublicWebhook;
}
const identifier = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

async function dispatch(
  channel: WebhookChannel,
  row: WebhookRow,
  message: string,
  ports: WebhookPorts,
): Promise<void> {
  if (channel === 'custom') {
    if (!row.custom_webhook_url) throw new Error('Zugangsdaten fehlen');
    await (ports.customPost ?? postPublicWebhook)(row.custom_webhook_url, {
      source: 'Flipbase',
      message,
    });
    return;
  }
  let target: string;
  let payload: unknown;
  if (channel === 'discord') {
    if (!row.discord_webhook_url) throw new Error('Zugangsdaten fehlen');
    target = discordTarget(row.discord_webhook_url).href;
    payload = { username: 'Flipbase', content: message, allowed_mentions: { parse: [] } };
  } else {
    if (!row.telegram_bot_token || !row.telegram_chat_id) throw new Error('Zugangsdaten fehlen');
    // Auch vor der Umstellung gespeicherte Werte werden vor jeder Verwendung geprüft.
    settingsPatch({
      telegramBotToken: row.telegram_bot_token,
      telegramChatId: row.telegram_chat_id,
    });
    target = `https://api.telegram.org/bot${row.telegram_bot_token}/sendMessage`;
    payload = { chat_id: row.telegram_chat_id, text: message };
  }
  const response = await (ports.fetch ?? fetch)(target, {
    method: 'POST',
    redirect: 'error',
    signal: AbortSignal.timeout(10_000),
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error('Webhook-Versand fehlgeschlagen');
  if (channel === 'telegram') {
    const result = await response.json();
    if (!result || result.ok !== true) throw new Error('Telegram-Versand fehlgeschlagen');
  } else await response.body?.cancel();
}

export async function handleWebhook(input: unknown, ports: WebhookPorts): Promise<unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new Error('Ungültige Anfrage');
  const request = input as Record<string, unknown>;
  const workspaceId = request.workspaceId;
  if (
    typeof workspaceId !== 'string' ||
    !identifier.test(workspaceId) ||
    !(await ports.authorize(workspaceId))
  )
    throw new Error('Kein Zugriff auf diesen Workspace');
  if (
    (request.action === 'save' || request.action === 'test') &&
    !(await ports.administer(workspaceId))
  )
    throw new Error('Administrationsrechte erforderlich');
  if (request.action === 'save')
    return publicSettings(await ports.save(workspaceId, settingsPatch(request.settings)));
  const row = (await ports.read(workspaceId)) ?? defaultSettings;
  if (request.action === 'read') return publicSettings(row);
  let message: string;
  let event: string;
  let channels: WebhookChannel[];
  if (request.action === 'test') {
    if (!['discord', 'telegram', 'custom'].includes(String(request.channel)))
      throw new Error('Ungültiger Kanal');
    channels = [request.channel as WebhookChannel];
    event = 'test';
    message = 'Flipbase Test-Nachricht: Deine Verbindung ist empfangsbereit.';
  } else if (request.action === 'sale') {
    if (typeof request.saleId !== 'string' || !identifier.test(request.saleId))
      throw new Error('Ungültiger Verkauf');
    const sale = await ports.sale(workspaceId, request.saleId);
    if (!sale) throw new Error('Verkauf nicht gefunden');
    if (!row.notify_on_sale) return { success: true, sent: 0 };
    event = request.saleId;
    const money = (amount: number) =>
      amount.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    message = `Neuer Verkauf: ${sale.title.slice(0, 300)}\nVerkaufspreis: ${money(sale.price)} €\nReingewinn: ${sale.profit === null ? 'noch nicht erfasst' : `${money(sale.profit)} €`} (ROI: ${sale.roi === null ? 'noch nicht erfasst' : `${sale.roi}%`})\nPlattform: ${(sale.platform ?? 'Kleinanzeigen').slice(0, 100)}.`;
    channels = [
      ...(row.discord_enabled ? ['discord' as const] : []),
      ...(row.telegram_enabled ? ['telegram' as const] : []),
      ...(row.custom_webhook_enabled ? ['custom' as const] : []),
    ];
  } else throw new Error('Unbekannte Aktion');
  let sent = 0;
  let failed = false;
  for (const channel of channels) {
    try {
      if (!(await ports.claim(workspaceId, event, channel))) {
        if (event === 'test') throw new Error('Bitte warte vor dem nächsten Test');
        continue;
      }
      await dispatch(channel, row, message, ports);
      await ports.complete(workspaceId, event, channel);
      sent += 1;
    } catch {
      // Ein Anbieterfehler darf die übrigen Kanäle nicht unterdrücken.
      failed = true;
    }
  }
  if (failed) throw new Error('Mindestens ein Webhook-Versand ist fehlgeschlagen');
  return { success: true, sent };
}
