/**
 * Gemeinsame Systemauswahl für Verkaufserfassung und Stammdatenübersicht.
 * Diese Kennungen sind keine verbundenen Konten. Bestehende Sale.platform-Werte
 * werden durch eine Umbenennung im UI nicht migriert oder ersetzt.
 */
export const SALE_PLATFORM_OPTIONS = [
  { value: 'kleinanzeigen', label: 'Kleinanzeigen (0 % Gebühr)', displayName: 'Kleinanzeigen' },
  { value: 'ebay', label: 'eBay', displayName: 'eBay' },
  { value: 'vinted', label: 'Vinted', displayName: 'Vinted' },
  { value: 'direct', label: 'Direktverkauf', displayName: 'Direktverkauf' },
  { value: 'other', label: 'Andere', displayName: 'Andere' },
] as const;
