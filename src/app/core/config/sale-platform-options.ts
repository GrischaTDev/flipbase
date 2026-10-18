/**
 * Gemeinsame Systemauswahl für Verkaufserfassung und Stammdatenübersicht.
 * Diese Kennungen sind keine verbundenen Konten. Bestehende Sale.platform-Werte
 * werden durch eine Umbenennung im UI nicht migriert oder ersetzt.
 */
export const SALE_PLATFORM_OPTIONS = [
  { value: 'kleinanzeigen', label: 'Kleinanzeigen', displayName: 'Kleinanzeigen' },
  { value: 'ebay', label: 'eBay', displayName: 'eBay' },
  { value: 'vinted', label: 'Vinted', displayName: 'Vinted' },
  { value: 'stockx', label: 'StockX', displayName: 'StockX' },
  { value: 'direct', label: 'Direktverkauf', displayName: 'Direktverkauf' },
  { value: 'custom_store', label: 'Shop', displayName: 'Shop' },
  { value: 'other', label: 'Andere', displayName: 'Andere' },
] as const;
