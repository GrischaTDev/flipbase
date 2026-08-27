import '@angular/compiler';
import { signal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import { ToastService } from '../../shared/components/toast/toast.service';
import { ImageOptimizerComponent } from './image-optimizer.component';

function erstelleKomponente(packe: () => Promise<Blob>) {
  const toast = new ToastService();
  const komponente = Object.create(ImageOptimizerComponent.prototype) as ImageOptimizerComponent;
  Object.assign(komponente, {
    toast,
    isBusy: signal(false),
    rotationsPending: () => false,
    resolutionIssue: () => false,
    images: signal([]),
    selectedPlatforms: signal([]),
    error: signal<string | null>(null),
    zipExport: { pack: vi.fn(packe) },
    download: vi.fn(),
  });
  return { komponente, toast };
}

describe('ImageOptimizerComponent – Aktionsmeldungen', () => {
  it('bestätigt einen abgeschlossenen Export', async () => {
    const { komponente, toast } = erstelleKomponente(async () => new Blob());

    await komponente.exportImages();

    expect(toast.toasts()[0]).toMatchObject({
      type: 'success',
      title: 'Bilder wurden exportiert.',
    });
  });

  it('meldet einen Exportfehler persistent mit der Ausnahmebeschreibung', async () => {
    const { komponente, toast } = erstelleKomponente(async () => {
      throw new Error('ZIP konnte nicht erstellt werden');
    });

    await komponente.exportImages();

    expect(toast.toasts()[0]).toMatchObject({
      type: 'error',
      title: 'Bilder konnten nicht exportiert werden.',
      description: 'ZIP konnte nicht erstellt werden',
      persistent: true,
    });
  });
});
