import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfirmDialogService } from '../components/confirm-dialog/confirm-dialog.service';
import { unsavedEntryGuard, type UnsavedEntryPage } from './unsaved-entry.guard';

let confirm: ReturnType<typeof vi.fn>;

function invokeGuard(component: UnsavedEntryPage, nextUrl?: string): boolean | Promise<boolean> {
  return TestBed.runInInjectionContext(
    () =>
      unsavedEntryGuard(component, {} as never, {} as never, { url: nextUrl } as never) as
        boolean | Promise<boolean>,
  );
}

describe('unsavedEntryGuard', () => {
  beforeEach(() => {
    confirm = vi.fn().mockResolvedValue(false);
    TestBed.configureTestingModule({
      providers: [{ provide: ConfirmDialogService, useValue: { frage: confirm } }],
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  it('lässt eine unveränderte, ruhende Erfassungsseite ohne Rückfrage verlassen', () => {
    expect(invokeGuard({ hasUnsavedChanges: () => false, isSaving: () => false })).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
  });

  it('fragt bei ungespeicherten Eingaben im eigenen Dialog statt im Browserfenster nach', async () => {
    const browserConfirm = vi.spyOn(globalThis, 'confirm');

    await expect(
      invokeGuard({ hasUnsavedChanges: () => true, isSaving: () => false }),
    ).resolves.toBe(false);
    expect(confirm).toHaveBeenCalledWith(
      expect.objectContaining({ titel: 'Seite verlassen?', bestaetigenText: 'Seite verlassen' }),
    );
    confirm.mockResolvedValue(true);
    await expect(
      invokeGuard({ hasUnsavedChanges: () => true, isSaving: () => false }),
    ).resolves.toBe(true);
    expect(browserConfirm).not.toHaveBeenCalled();
  });

  it('erlaubt nur den ausdrücklich gesicherten Wechsel zur Artikelerstellung', async () => {
    const component: UnsavedEntryPage = {
      hasUnsavedChanges: () => true,
      isSaving: () => false,
      canNavigateTo: (url) => url === '/catalog/new?purchaseReturn=abc',
    };
    expect(invokeGuard(component, '/catalog/new?purchaseReturn=abc')).toBe(true);
    await expect(invokeGuard(component, '/catalog/new')).resolves.toBe(false);
    expect(confirm).toHaveBeenCalledOnce();
  });

  it('blockiert Navigation während des Speicherns ohne Rückfrage', () => {
    expect(invokeGuard({ hasUnsavedChanges: () => true, isSaving: () => true })).toBe(false);
    expect(confirm).not.toHaveBeenCalled();
  });

  it('wirft keinen Fehler und lässt deaktiveren, wenn isSaving oder hasUnsavedChanges fehlen', () => {
    expect(invokeGuard({} as unknown as UnsavedEntryPage)).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
  });
});
