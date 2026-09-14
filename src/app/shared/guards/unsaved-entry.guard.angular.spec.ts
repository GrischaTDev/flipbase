import { afterEach, describe, expect, it, vi } from 'vitest';
import { unsavedEntryGuard, type UnsavedEntryPage } from './unsaved-entry.guard';

function invokeGuard(component: UnsavedEntryPage): boolean {
  return unsavedEntryGuard(component, {} as never, {} as never, {} as never) as boolean;
}

describe('unsavedEntryGuard', () => {
  afterEach(() => vi.restoreAllMocks());

  it('lässt eine unveränderte, ruhende Erfassungsseite ohne Rückfrage verlassen', () => {
    const confirm = vi.spyOn(globalThis, 'confirm');

    expect(invokeGuard({ hasUnsavedChanges: () => false, isSaving: () => false })).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
  });

  it('fragt bei ungespeicherten Eingaben nach', () => {
    const confirm = vi.spyOn(globalThis, 'confirm').mockReturnValue(false);

    expect(invokeGuard({ hasUnsavedChanges: () => true, isSaving: () => false })).toBe(false);
    expect(confirm).toHaveBeenCalledOnce();
  });

  it('blockiert Navigation während des Speicherns ohne Rückfrage', () => {
    const confirm = vi.spyOn(globalThis, 'confirm');

    expect(invokeGuard({ hasUnsavedChanges: () => true, isSaving: () => true })).toBe(false);
    expect(confirm).not.toHaveBeenCalled();
  });

  it('wirft keinen Fehler und lässt deaktiveren, wenn isSaving oder hasUnsavedChanges fehlen', () => {
    const confirm = vi.spyOn(globalThis, 'confirm');

    expect(invokeGuard({} as unknown as UnsavedEntryPage)).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
  });
});
