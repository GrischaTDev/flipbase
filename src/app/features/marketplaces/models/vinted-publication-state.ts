import type { BadgeTone } from '../../../shared/components/badge/badge.component';

export type VintedPublicationState =
  'active' | 'reserved' | 'draft' | 'hidden' | 'ended' | 'unknown';

export function parseVintedPublicationState(value: unknown): VintedPublicationState {
  return value === 'active' ||
    value === 'reserved' ||
    value === 'draft' ||
    value === 'hidden' ||
    value === 'ended'
    ? value
    : 'unknown';
}

export function vintedPublicationIsOnline(state: VintedPublicationState | undefined): boolean {
  return state === 'active' || state === 'reserved';
}

const badges: Record<
  Exclude<VintedPublicationState, 'active'>,
  { readonly label: string; readonly tone: BadgeTone }
> = {
  reserved: { label: 'Reserviert', tone: 'caution' },
  draft: { label: 'Entwurf', tone: 'neutral' },
  hidden: { label: 'Versteckt', tone: 'neutral' },
  ended: { label: 'Beendet', tone: 'neutral' },
  unknown: { label: 'Status unbekannt', tone: 'neutral' },
};

export function vintedPublicationBadge(state: VintedPublicationState | undefined) {
  return state === 'active' ? null : badges[state ?? 'unknown'];
}
