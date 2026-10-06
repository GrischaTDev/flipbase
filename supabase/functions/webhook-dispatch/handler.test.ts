import assert from 'node:assert/strict';
import { handleWebhook, type WebhookPorts } from './handler.ts';
import { defaultSettings, publicSettings, settingsPatch } from './webhook-settings.ts';

const workspaceId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const saleId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const secret = 'https://discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz';
function fixture() {
  const calls: string[] = [];
  const row = { ...defaultSettings, discord_enabled: true, discord_webhook_url: secret };
  const ports: WebhookPorts = {
    authorize: async () => true,
    read: async () => {
      calls.push('read');
      return row;
    },
    save: async (_workspaceId, patch) => {
      calls.push('save');
      return Object.assign(row, patch);
    },
    claim: async () => {
      calls.push('claim');
      return true;
    },
    complete: async () => undefined,
    sale: async () => ({ price: 21.98, platform: 'Vinted', title: 'Artikel', profit: 5, roi: 50 }),
    fetch: async (target, options) => {
      calls.push(String(target));
      assert.equal(options?.redirect, 'error');
      return new Response(null, { status: 204 });
    },
  };
  return { ports, calls, row };
}
Deno.test('Zugriff wird vor jedem Lesen, Speichern und Versand am Workspace geprüft', async () => {
  for (const action of ['read', 'save', 'test', 'sale']) {
    const { ports, calls } = fixture();
    ports.authorize = async () => false;
    await assert.rejects(
      handleWebhook({ action, workspaceId, channel: 'discord', saleId, settings: {} }, ports),
    );
    assert.deepEqual(calls, []);
  }
});
Deno.test('Browser erhält weder gespeicherte noch frisch übermittelte Zugangsdaten', async () => {
  const { ports, row } = fixture();
  for (const action of ['read', 'save']) {
    const result = await handleWebhook(
      { action, workspaceId, settings: { discordWebhookUrl: secret } },
      ports,
    );
    assert.equal(JSON.stringify(result).includes(secret), false);
    assert.deepEqual(result, publicSettings(row));
  }
});
Deno.test('Leere Eingaben behalten Zugangsdaten; explizites Löschen entfernt sie', () => {
  assert.deepEqual(
    settingsPatch({ discordWebhookUrl: '', telegramBotToken: '  ', soundEnabled: false }),
    { sound_enabled: false },
  );
  assert.deepEqual(settingsPatch({ clearCredentials: ['telegram'] }), {
    telegram_bot_token: null,
    telegram_chat_id: null,
  });
  assert.throws(() => settingsPatch({ clearCredentials: ['discord'], discordWebhookUrl: secret }));
});
Deno.test('Discord- und Telegram-Adressen können nicht auf beliebige Server zeigen', async () => {
  for (const discordWebhookUrl of [
    'http://discord.com/api/webhooks/1/x',
    secret.replace('discord.com', 'discord.com.evil.test'),
    secret + '?redirect=http://127.0.0.1',
    'https://127.0.0.1/',
  ])
    assert.throws(() => settingsPatch({ discordWebhookUrl }));
  assert.throws(() => settingsPatch({ telegramBotToken: '12345:foo/../../evil' }));
  const { ports, row, calls } = fixture();
  row.discord_webhook_url = 'https://127.0.0.1/old-secret';
  await assert.rejects(handleWebhook({ action: 'test', workspaceId, channel: 'discord' }, ports));
  assert.equal(
    calls.some((call) => call.startsWith('https://')),
    false,
  );
});
Deno.test('Testversand prüft Anbieterantwort und Versandlimit', async () => {
  const { ports, calls } = fixture();
  assert.deepEqual(
    await handleWebhook({ action: 'test', workspaceId, channel: 'discord' }, ports),
    { success: true, sent: 1 },
  );
  assert.equal(calls.at(-1), secret);
  ports.claim = async () => false;
  await assert.rejects(handleWebhook({ action: 'test', workspaceId, channel: 'discord' }, ports));
  ports.claim = async () => true;
  ports.fetch = async () => new Response(null, { status: 429 });
  await assert.rejects(handleWebhook({ action: 'test', workspaceId, channel: 'discord' }, ports));
});
Deno.test(
  'Verkäufe stammen aus dem Workspace und werden bei Wiederholung nicht erneut versendet',
  async () => {
    const { ports, calls } = fixture();
    let claimed = false;
    ports.claim = async () => {
      const previous = claimed;
      claimed = true;
      return !previous;
    };
    for (let attempt = 0; attempt < 2; attempt++)
      await handleWebhook({ action: 'sale', workspaceId, saleId, message: 'injected' }, ports);
    assert.equal(calls.filter((call) => call === secret).length, 1);
    ports.sale = async () => null;
    await assert.rejects(handleWebhook({ action: 'sale', workspaceId, saleId }, ports));
  },
);
Deno.test(
  'Ausfall von Discord verhindert Telegram nicht und bestätigt nur erfolgreiche Kanäle',
  async () => {
    const { ports, row, calls } = fixture();
    row.telegram_enabled = true;
    row.telegram_bot_token = '123456:abcdefghijklmnopqrstuvwxyz';
    row.telegram_chat_id = '1234';
    const completed: string[] = [];
    ports.complete = async (_workspaceId, _event, channel) => {
      completed.push(channel);
    };
    ports.fetch = async (target, options) => {
      calls.push(String(target));
      if (String(target).includes('discord.com')) return new Response(null, { status: 429 });
      const body = JSON.parse(String(options?.body));
      assert.match(body.text, /Artikel/);
      assert.match(body.text, /Reingewinn: 5,00/);
      assert.match(body.text, /ROI: 50%/);
      return Response.json({ ok: true });
    };
    await assert.rejects(handleWebhook({ action: 'sale', workspaceId, saleId }, ports));
    assert.equal(
      calls.some((call) => call.includes('api.telegram.org')),
      true,
    );
    assert.deepEqual(completed, ['telegram']);
  },
);
