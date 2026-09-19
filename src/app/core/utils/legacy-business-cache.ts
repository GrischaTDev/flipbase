const LEGACY_BUSINESS_CACHE_KEYS = [
  'flipbase_saved_returns',
  'flipbase_price_radar_items',
  'flipbase_shipping_orders',
  'flipbase_carrier_config',
] as const;

/** Entfernt frühere globale Geschäftsdaten-Caches nach dem Update idempotent. */
export function removeLegacyBusinessCache(storage: Storage): void {
  for (const key of LEGACY_BUSINESS_CACHE_KEYS) storage.removeItem(key);
}
