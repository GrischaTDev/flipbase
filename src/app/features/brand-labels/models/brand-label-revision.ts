import type { LabelRevisionState } from './brand-label.models';

export type LabelRevisionAction = 'save' | 'submit' | 'publish' | 'discard';

/**
 * Zustandsvertrag für die Oberfläche. Die eigentliche Datenbankoperation muss
 * Berechtigung, Version und Voraussetzungen selbst atomar prüfen.
 * Bearbeiten veröffentlichter Inhalte benötigt eine neue Revision, kein Update.
 */
export function nextLabelRevisionState(
  state: LabelRevisionState,
  action: LabelRevisionAction,
): LabelRevisionState {
  if (state !== 'draft' && state !== 'review') throw new Error('invalid-revision-transition');
  switch (action) {
    case 'save':
      return 'draft';
    case 'submit':
      return 'review';
    case 'discard':
      return 'discarded';
    case 'publish':
      if (state === 'review') return 'published';
      break;
  }
  throw new Error('invalid-revision-transition');
}
