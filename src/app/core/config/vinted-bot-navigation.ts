import { SubNavigationItem } from './platform-admin-navigation';

/**
 * Unterpunkte fuer den Vinted-Bot in der Seitenleiste.
 *
 * 1. Vinted Feed: Gesammelte Angebote mit Schnellfiltern
 * 2. Suchfilter: Verwaltung der Suchbegriffe, Filterkriterien und Deal-Schwellen
 * 3. Favoriten: Gemerkte Artikel mit Galerie und Schnellfilter
 */
export const VINTED_BOT_NAVIGATION: readonly SubNavigationItem[] = [
  { label: 'Vinted Feed', path: '/vinted-bot' },
  { label: 'Suchfilter', path: '/vinted-bot/filters' },
  { label: 'Favoriten', path: '/vinted-bot/favorites' },
];
