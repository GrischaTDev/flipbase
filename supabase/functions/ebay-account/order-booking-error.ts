export type EbayBookingErrorCode =
  | 'legacy_sale_conflict'
  | 'stock_unavailable'
  | 'target_archived'
  | 'target_unavailable'
  | 'review_expired_or_changed'
  | 'booking_rejected'
  | 'forbidden';

export class EbayOrderBookingError extends Error {
  constructor(readonly code: EbayBookingErrorCode) {
    super(code);
  }
}

// Nur bestätigte SQL-Ablehnungen werden eindeutig. Interne Meldungen verlassen
// diesen Adapter nicht; Transportfehler bleiben für die Statusklärung unklar.
export function classifyEbayBookingError(error: { code: string; message: string }): Error {
  if (error.code === '42501') return new EbayOrderBookingError('forbidden');
  if (error.code === '22023') {
    if (error.message === 'Vorhandenen eBay-Verkauf bitte zuerst prüfen und manuell zuordnen')
      return new EbayOrderBookingError('legacy_sale_conflict');
    if (error.message === 'Dieser Artikel ist archiviert.')
      return new EbayOrderBookingError('target_archived');
    if (error.message === 'Bestellung bitte erneut prüfen')
      return new EbayOrderBookingError('review_expired_or_changed');
    return new EbayOrderBookingError('booking_rejected');
  }
  if (error.code === 'P0002') return new EbayOrderBookingError('target_unavailable');
  if (error.code === 'P0001' && error.message === 'Nicht genügend verfügbarer Bestand')
    return new EbayOrderBookingError('stock_unavailable');
  return new Error('Database operation failed');
}
