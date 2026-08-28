import '@angular/compiler';
import { signal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import { ToastService } from '../../shared/components/toast/toast.service';
import { ImageOptimizerComponent } from './image-optimizer.component';

function createComponent(pack: () => Promise<Blob>) {
  const toast = new ToastService();
  const component = Object.create(ImageOptimizerComponent.prototype) as ImageOptimizerComponent;
  Object.assign(component, {
    toast,
    isBusy: signal(false),
    rotationsPending: () => false,
    resolutionIssue: () => false,
    images: signal([]),
    selectedPlatforms: signal([]),
    error: signal<string | null>(null),
    baseName: () => '',
    zipExport: { pack: vi.fn(pack) },
    download: vi.fn(),
  });
  return { component, toast };
}

describe('ImageOptimizerComponent – Aktionsmeldungen', () => {
  it('bestätigt einen abgeschlossenen Export', async () => {
    const { component, toast } = createComponent(async () => new Blob());

    await component.exportImages();

    expect(toast.toasts()[0]).toMatchObject({
      type: 'success',
      title: 'Bilder wurden exportiert.',
    });
  });

  it('meldet einen Exportfehler persistent mit der Ausnahmebeschreibung', async () => {
    const { component, toast } = createComponent(async () => {
      throw new Error('ZIP konnte nicht erstellt werden');
    });

    await component.exportImages();

    expect(toast.toasts()[0]).toMatchObject({
      type: 'error',
      title: 'Bilder konnten nicht exportiert werden.',
      description: 'ZIP konnte nicht erstellt werden',
      persistent: true,
    });
  });
});
