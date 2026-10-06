export type WebhookChannel = 'discord' | 'telegram' | 'custom';
export interface WebhookRow {
  discord_enabled: boolean;
  discord_webhook_url: string | null;
  telegram_enabled: boolean;
  telegram_bot_token: string | null;
  telegram_chat_id: string | null;
  custom_webhook_enabled: boolean;
  custom_webhook_url: string | null;
  notify_on_sale: boolean;
  notify_on_purchase: boolean;
  notify_on_low_margin: boolean;
  sound_enabled: boolean;
}
export const defaultSettings: WebhookRow = {
  discord_enabled: false,
  discord_webhook_url: null,
  telegram_enabled: false,
  telegram_bot_token: null,
  telegram_chat_id: null,
  custom_webhook_enabled: false,
  custom_webhook_url: null,
  notify_on_sale: true,
  notify_on_purchase: true,
  notify_on_low_margin: true,
  sound_enabled: true,
};

export function publicSettings(row: WebhookRow) {
  return {
    discordEnabled: row.discord_enabled,
    hasDiscordCredentials: Boolean(row.discord_webhook_url),
    telegramEnabled: row.telegram_enabled,
    hasTelegramCredentials: Boolean(row.telegram_bot_token && row.telegram_chat_id),
    customWebhookEnabled: row.custom_webhook_enabled,
    hasCustomWebhookCredentials: Boolean(row.custom_webhook_url),
    notifyOnSale: row.notify_on_sale,
    notifyOnPurchase: row.notify_on_purchase,
    notifyOnLowMargin: row.notify_on_low_margin,
    soundEnabled: row.sound_enabled,
  };
}

export function discordTarget(secret: string): URL {
  const target = new URL(secret);
  if (
    target.protocol !== 'https:' ||
    target.hostname !== 'discord.com' ||
    target.port ||
    target.username ||
    target.password ||
    target.search ||
    target.hash ||
    !/^\/api\/webhooks\/[0-9]{10,25}\/[A-Za-z0-9_-]{20,200}$/.test(target.pathname)
  )
    throw new Error('Ungültige Discord-Konfiguration');
  return target;
}

export function customTarget(secret: string): URL {
  const target = new URL(secret);
  if (
    target.protocol !== 'https:' ||
    target.port ||
    target.username ||
    target.password ||
    target.hash ||
    target.href.length > 2048 ||
    !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(target.hostname) ||
    /\.(?:localhost|local|internal|test|invalid|example)$/.test(target.hostname)
  )
    throw new Error('Ungültige Webhook-Adresse');
  return target;
}

export function settingsPatch(input: unknown): Record<string, boolean | string | null> {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new Error('Ungültige Einstellungen');
  const fields: Record<string, string> = {
    discordEnabled: 'discord_enabled',
    discordWebhookUrl: 'discord_webhook_url',
    telegramEnabled: 'telegram_enabled',
    telegramBotToken: 'telegram_bot_token',
    telegramChatId: 'telegram_chat_id',
    customWebhookEnabled: 'custom_webhook_enabled',
    customWebhookUrl: 'custom_webhook_url',
    notifyOnSale: 'notify_on_sale',
    notifyOnPurchase: 'notify_on_purchase',
    notifyOnLowMargin: 'notify_on_low_margin',
    soundEnabled: 'sound_enabled',
  };
  const patch: Record<string, boolean | string | null> = {};
  for (const [key, value] of Object.entries(input)) {
    if (key === 'clearCredentials') continue;
    const column = fields[key];
    if (!column) throw new Error('Unbekannte Einstellung');
    if (key.endsWith('Url') || key === 'telegramBotToken' || key === 'telegramChatId') {
      if (typeof value !== 'string' || value.length > 2048)
        throw new Error('Ungültige Zugangsdaten');
      const secret = value.trim();
      // Ein leeres Formular ersetzt die ausschließlich serverseitig gespeicherten Werte nicht.
      if (!secret) continue;
      if (key === 'discordWebhookUrl') discordTarget(secret);
      if (key === 'customWebhookUrl') customTarget(secret);
      if (key === 'telegramBotToken' && !/^[0-9]{5,20}:[A-Za-z0-9_-]{20,100}$/.test(secret))
        throw new Error('Ungültiges Telegram-Token');
      if (key === 'telegramChatId' && !/^(?:-?[0-9]{1,20}|@[A-Za-z0-9_]{5,64})$/.test(secret))
        throw new Error('Ungültige Telegram-Chat-ID');
      patch[column] = secret;
    } else {
      if (typeof value !== 'boolean') throw new Error('Ungültige Einstellung');
      patch[column] = value;
    }
  }
  const clear = (input as Record<string, unknown>).clearCredentials;
  if (clear !== undefined) {
    if (
      !Array.isArray(clear) ||
      clear.length > 3 ||
      clear.some((channel) => !['discord', 'telegram', 'custom'].includes(channel))
    )
      throw new Error('Ungültige Löschanweisung');
    for (const channel of clear) {
      for (const column of channel === 'discord'
        ? ['discord_webhook_url']
        : channel === 'telegram'
          ? ['telegram_bot_token', 'telegram_chat_id']
          : ['custom_webhook_url']) {
        if (column in patch) throw new Error('Widersprüchliche Zugangsdaten');
        patch[column] = null;
      }
    }
  }
  return patch;
}
