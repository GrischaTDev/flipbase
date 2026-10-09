import type { AppNotification } from '../../core/models/webhook.models';

export type NotificationPlatform = 'vinted' | 'ebay' | 'kleinanzeigen';

export type NotificationFallbackIcon = 'package' | 'sale' | 'sparkles' | 'bell';

export interface NotificationVisual {
  readonly platform: NotificationPlatform | null;
  readonly logo: string | null;
  readonly fallbackIcon: NotificationFallbackIcon;
}

/**
 * Ermittelt das visuelle Erscheinungsbild (Plattform-Logo oder Icon) einer Benachrichtigung.
 *
 * Marktplatz-Meldungen (Vinted, eBay, Kleinanzeigen) erhalten ihr jeweiliges
 * Marken-Logo. Sonstige Meldungen (Einkauf, generischer Verkauf, System)
 * erhalten passende Typ-Icons.
 */
export function resolveNotificationVisual(
  notification: Pick<AppNotification, 'id' | 'type' | 'title' | 'message' | 'link'>,
): NotificationVisual {
  // 1. Vinted-Erkennung: Marktplatz-IDs, Links oder Texte
  if (
    notification.id.startsWith('marketplace:') ||
    notification.id.startsWith('marketplace-feedback:') ||
    notification.id.startsWith('marketplace-message:') ||
    notification.link?.includes('/marketplaces/vinted/') ||
    /\bvinted\b/i.test(notification.title) ||
    /\bvinted\b/i.test(notification.message)
  ) {
    return {
      platform: 'vinted',
      logo: '/images/platforms/vinted.svg',
      fallbackIcon: 'bell',
    };
  }

  // 2. eBay-Erkennung
  if (
    notification.link?.includes('/marketplaces/ebay/') ||
    /\bebay\b/i.test(notification.title) ||
    /\bebay\b/i.test(notification.message)
  ) {
    return {
      platform: 'ebay',
      logo: '/images/platforms/ebay.svg',
      fallbackIcon: 'bell',
    };
  }

  // 3. Kleinanzeigen-Erkennung
  if (
    notification.link?.includes('/marketplaces/kleinanzeigen/') ||
    /\bkleinanzeigen\b/i.test(notification.title) ||
    /\bkleinanzeigen\b/i.test(notification.message)
  ) {
    return {
      platform: 'kleinanzeigen',
      logo: '/images/platforms/kleinanzeigen.svg',
      fallbackIcon: 'bell',
    };
  }

  // 4. Nicht-Marktplatz-Typen
  if (notification.type === 'purchase') {
    return { platform: null, logo: null, fallbackIcon: 'package' };
  }
  if (notification.type === 'sale') {
    return { platform: null, logo: null, fallbackIcon: 'sale' };
  }
  if (notification.type === 'system') {
    return { platform: null, logo: null, fallbackIcon: 'sparkles' };
  }

  return { platform: null, logo: null, fallbackIcon: 'bell' };
}

/**
 * Formatiert den Zeitstempel einer Benachrichtigung lesbar und kompakt:
 * - Heute: 'HH:mm' (z. B. '08:37')
 * - Gestern: 'Gestern'
 * - Älter: 'DD.MM.' (z. B. '04.10.')
 */
export function formatNotificationTime(timestamp: string, now = new Date()): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';

  const isToday =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();

  if (isToday) {
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  }

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    date.getDate() === yesterday.getDate() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getFullYear() === yesterday.getFullYear();

  if (isYesterday) {
    return 'Gestern';
  }

  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${day}.${month}.`;
}
