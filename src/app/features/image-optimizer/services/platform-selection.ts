import { PlatformId } from '../models/platform-profile';

export interface SelectionState {
  readonly selectedIds: readonly PlatformId[];
  readonly workingId: PlatformId | null;
}

export interface ToggleResult {
  readonly state: SelectionState;
  /**
   * Plattform, von der die neu hinzugewaehlte ihren Zuschnitt erben soll -
   * sonst wuerde fuer bereits bearbeitete Bilder unbemerkt das Vollbild
   * exportiert. Null beim Abwaehlen und bei der allerersten Auswahl.
   */
  readonly inheritFrom: PlatformId | null;
}

/** Waehlt eine Plattform aus oder ab. Es darf auch gar keine gewaehlt sein. */
export function togglePlatformIn(state: SelectionState, id: PlatformId): ToggleResult {
  if (state.selectedIds.includes(id)) {
    const selectedIds = state.selectedIds.filter((entry) => entry !== id);
    const workingId = state.workingId === id ? (selectedIds[0] ?? null) : state.workingId;
    return { state: { selectedIds, workingId }, inheritFrom: null };
  }

  const selectedIds = [...state.selectedIds, id];
  const inheritFrom = state.workingId;
  return {
    state: { selectedIds, workingId: state.workingId ?? id },
    inheritFrom,
  };
}
