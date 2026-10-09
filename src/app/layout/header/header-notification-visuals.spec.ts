import { describe, expect, it } from 'vitest';
import { formatNotificationTime, resolveNotificationVisual } from './header-notification-visuals';

describe('header-notification-visuals', () => {
  describe('resolveNotificationVisual', () => {
    it('erkennt Vinted anhand von Marktplatz-Favoriten-IDs', () => {
      const visual = resolveNotificationVisual({
        id: 'marketplace:123',
        type: 'alert',
        title: 'Mehr Favoriten · Maike Vintage',
        message: '1 Inserat hat mehr Favoriten.',
        link: '/marketplaces/vinted/listings',
      });
      expect(visual.platform).toBe('vinted');
      expect(visual.logo).toBe('/images/platforms/vinted.svg');
    });

    it('erkennt Vinted anhand von Marktplatz-Feedback-IDs', () => {
      const visual = resolveNotificationVisual({
        id: 'marketplace-feedback:456',
        type: 'alert',
        title: 'Neue Bewertung · Maike Vintage',
        message: 'Neue Vinted-Bewertung · 5 von 5 Sternen.',
      });
      expect(visual.platform).toBe('vinted');
      expect(visual.logo).toBe('/images/platforms/vinted.svg');
    });

    it('erkennt Vinted anhand von Marktplatz-Nachrichten-IDs', () => {
      const visual = resolveNotificationVisual({
        id: 'marketplace-message:789',
        type: 'alert',
        title: 'Neuer Preisvorschlag · Maike Vintage',
        message: 'Neuer Preisvorschlag von ebruj.',
      });
      expect(visual.platform).toBe('vinted');
      expect(visual.logo).toBe('/images/platforms/vinted.svg');
    });

    it('erkennt Vinted bei Verkäufen auf Vinted', () => {
      const visual = resolveNotificationVisual({
        id: 'general-1',
        type: 'sale',
        title: 'Neuer Verkauf: Vintage Jacke',
        message: 'Verkauft für 45,00 € auf Vinted. Reingewinn: +25,00 €.',
        link: '/sales',
      });
      expect(visual.platform).toBe('vinted');
      expect(visual.logo).toBe('/images/platforms/vinted.svg');
    });

    it('erkennt eBay bei Verkäufen oder Links auf eBay', () => {
      const visual = resolveNotificationVisual({
        id: 'general-2',
        type: 'sale',
        title: 'Neuer Verkauf: Polo Shirt',
        message: 'Verkauft für 35,00 € auf eBay. Reingewinn: +18,50 €.',
        link: '/sales',
      });
      expect(visual.platform).toBe('ebay');
      expect(visual.logo).toBe('/images/platforms/ebay.svg');
    });

    it('erkennt Kleinanzeigen bei Verkäufen oder Links auf Kleinanzeigen', () => {
      const visual = resolveNotificationVisual({
        id: 'general-3',
        type: 'sale',
        title: 'Neuer Verkauf: Sneaker',
        message: 'Verkauft für 60,00 € auf Kleinanzeigen. Reingewinn: +30,00 €.',
        link: '/sales',
      });
      expect(visual.platform).toBe('kleinanzeigen');
      expect(visual.logo).toBe('/images/platforms/kleinanzeigen.svg');
    });

    it('liefert package-Icon für Einkäufe', () => {
      const visual = resolveNotificationVisual({
        id: 'purchase-1',
        type: 'purchase',
        title: 'Neuer Einkauf #B 2026 19',
        message: 'Einkaufskosten: 120,00 €.',
        link: '/purchases/123',
      });
      expect(visual.platform).toBeNull();
      expect(visual.logo).toBeNull();
      expect(visual.fallbackIcon).toBe('package');
    });

    it('liefert sale-Icon für Verkäufe ohne spezifische Plattform', () => {
      const visual = resolveNotificationVisual({
        id: 'sale-1',
        type: 'sale',
        title: 'Neuer Verkauf: Buch',
        message: 'Verkauft für 15,00 € im Direktverkauf.',
        link: '/sales',
      });
      expect(visual.platform).toBeNull();
      expect(visual.logo).toBeNull();
      expect(visual.fallbackIcon).toBe('sale');
    });

    it('liefert sparkles-Icon für Systemankündigungen', () => {
      const visual = resolveNotificationVisual({
        id: 'system-1',
        type: 'system',
        title: 'Systemwartung abgeschlossen',
        message: 'Alle Dienste laufen wieder normal.',
      });
      expect(visual.platform).toBeNull();
      expect(visual.logo).toBeNull();
      expect(visual.fallbackIcon).toBe('sparkles');
    });

    it('liefert bell-Icon als allgemeinen Fallback', () => {
      const visual = resolveNotificationVisual({
        id: 'alert-1',
        type: 'alert',
        title: 'Marge unter Schwellenwert',
        message: 'Die Marge liegt unter 20%.',
      });
      expect(visual.platform).toBeNull();
      expect(visual.logo).toBeNull();
      expect(visual.fallbackIcon).toBe('bell');
    });
  });

  describe('formatNotificationTime', () => {
    it('formatiert heutige Uhrzeit zweistellig (HH:mm)', () => {
      const now = new Date('2026-10-09T14:30:00Z');
      const todayTimestamp = new Date(now);
      todayTimestamp.setHours(8, 37, 0, 0);

      const formatted = formatNotificationTime(todayTimestamp.toISOString(), now);
      expect(formatted).toBe('08:37');
    });

    it('formatiert gestrigen Tag als "Gestern"', () => {
      const now = new Date('2026-10-09T14:30:00Z');
      const yesterday = new Date(now);
      yesterday.setDate(now.getDate() - 1);
      yesterday.setHours(22, 46, 0, 0);

      const formatted = formatNotificationTime(yesterday.toISOString(), now);
      expect(formatted).toBe('Gestern');
    });

    it('formatiert ältere Tage als DD.MM.', () => {
      const now = new Date('2026-10-09T14:30:00Z');
      const olderDate = new Date('2026-10-04T11:15:00Z');

      const formatted = formatNotificationTime(olderDate.toISOString(), now);
      expect(formatted).toBe('04.10.');
    });

    it('gibt leeren String bei ungültigem Zeitstempel zurück', () => {
      expect(formatNotificationTime('invalid-date')).toBe('');
    });
  });
});
