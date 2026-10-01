import type { BadgeTone } from '../../../shared/components/badge/badge.component';
import type { ConnectionStatus } from './marketplace.models';

export const MARKETPLACE_CONNECTION_LABELS: Readonly<Record<ConnectionStatus, string>> = {
  needs_login: 'Anmeldung ausstehend',
  connected: 'Verbunden',
  paused: 'Pausiert',
  blocked: 'Prüfung erforderlich',
  disconnected: 'Getrennt',
};
export const MARKETPLACE_CONNECTION_TONES: Readonly<Record<ConnectionStatus, BadgeTone>> = {
  needs_login: 'info',
  connected: 'success',
  paused: 'caution',
  blocked: 'critical',
  disconnected: 'neutral',
};
export const VINTED_SECTIONS = [
  { id: 'overview', label: 'Übersicht', path: '/marketplaces/vinted/overview' },
  { id: 'messages', label: 'Nachrichten', path: '/marketplaces/vinted/messages' },
  { id: 'listings', label: 'Inserate', path: '/marketplaces/vinted/listings' },
  { id: 'sales', label: 'Verkäufe', path: '/marketplaces/vinted/sales' },
  { id: 'activity', label: 'Aktivitäten', path: '/marketplaces/vinted/activity' },
  { id: 'profile', label: 'Profil', path: '/marketplaces/vinted/profile' },
];
