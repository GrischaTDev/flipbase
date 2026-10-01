import { readEbayConfig, readEbayDeletionConfig } from '../_shared/ebay-config.ts';
import { createNotificationKeyReader } from '../_shared/ebay-notifications.ts';
import { createDeletionHandler } from './handler.ts';

export function createDeletionEndpoint(
  readEnvironment: (name: string) => string | undefined,
  removeUser: (id: string) => Promise<void>,
) {
  const deletionConfig = readEbayDeletionConfig(readEnvironment);
  if (!deletionConfig)
    return () =>
      new Response(JSON.stringify({ error: 'not_configured' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      });
  const config = readEbayConfig(readEnvironment);
  const readKey = config ? createNotificationKeyReader(config) : null;
  // eBay gibt das Keyset erst nach erfolgreicher Bestätigung des Endpoints frei.
  // Echte Meldungen bleiben bis zur vollständigen Konfiguration wiederholbar.
  return createDeletionHandler(
    deletionConfig.verificationToken,
    deletionConfig.endpoint,
    (id) => {
      if (!readKey) throw new Error('eBay account configuration unavailable');
      return readKey(id);
    },
    removeUser,
  );
}
