import '@angular/compiler';
import { signal } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastService } from '../toast/toast.service';
import { WorkspaceModalComponent } from './workspace-modal.component';

function erstelleKomponente(error: Error | null) {
  const toast = new ToastService();
  const created = { emit: vi.fn() };
  const closed = { emit: vi.fn() };
  const komponente = Object.create(WorkspaceModalComponent.prototype) as WorkspaceModalComponent;

  Object.assign(komponente, {
    workspaceService: {
      createWorkspace: vi.fn(async () => ({ data: null, error })),
    },
    toast,
    created,
    closed,
    isSubmitting: signal(false),
    errorMessage: signal<string | null>(null),
    form: new FormGroup({
      name: new FormControl('Neuer Workspace', {
        nonNullable: true,
        validators: [Validators.required, Validators.minLength(2)],
      }),
    }),
  });

  return { komponente, toast, created, closed };
}

describe('WorkspaceModalComponent – zentrale Aktionsmeldungen', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('behält den Workspace-Dialog bei einem Fehler geöffnet und erzeugt keinen doppelten Toast', async () => {
    const { komponente, toast, created, closed } = erstelleKomponente(new Error('Sync-Fehler'));

    await komponente.onSubmit();

    expect(komponente.isSubmitting()).toBe(false);
    expect(created.emit).not.toHaveBeenCalled();
    expect(closed.emit).not.toHaveBeenCalled();
    expect(toast.toasts()).toEqual([]);
  });

  it('bestätigt die Erstellung und schließt erst nach Erfolg über das created-Ereignis', async () => {
    const { komponente, toast, created, closed } = erstelleKomponente(null);

    await komponente.onSubmit();

    expect(created.emit).toHaveBeenCalledOnce();
    expect(closed.emit).not.toHaveBeenCalled();
    expect(toast.toasts()).toHaveLength(1);
    expect(toast.toasts()[0]).toMatchObject({
      type: 'success',
      title: 'Workspace wurde erstellt.',
    });
  });

  it('erzeugt für ein ungültiges, nicht abgesendetes Formular keinen Toast', async () => {
    const { komponente, toast, created } = erstelleKomponente(null);
    komponente.form.controls.name.setValue('');

    await komponente.onSubmit();

    expect(created.emit).not.toHaveBeenCalled();
    expect(toast.toasts()).toEqual([]);
  });
});
