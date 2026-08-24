import '@angular/compiler';
import { signal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import { ToastService } from '../../shared/components/toast/toast.service';
import { ResearchComponent } from './research.component';

function erstelleKomponente(ergebnis: boolean) {
  const toast = new ToastService();
  const priceTrackerService = { applyRecommendedPrice: vi.fn(async () => ergebnis) };
  const komponente = Object.create(ResearchComponent.prototype) as ResearchComponent;
  Object.assign(komponente, {
    priceTrackerService,
    toast,
    repricingSuccessId: signal<string | null>(null),
  });
  return { komponente, toast };
}

describe('ResearchComponent – Aktionsmeldungen', () => {
  it('bestätigt die Übernahme eines Radarpreises nur bei true', async () => {
    const { komponente, toast } = erstelleKomponente(true);

    await komponente.onApplyRadarPrice('item-1');

    expect(toast.toasts()[0]).toMatchObject({
      type: 'success',
      title: 'Preisempfehlung wurde übernommen.',
    });
  });

  it('zeigt bei einem Nulltreffer keine Erfolgsmeldung', async () => {
    const { komponente, toast } = erstelleKomponente(false);

    await komponente.onApplyRadarPrice('item-1');

    expect(toast.toasts()).toEqual([]);
  });
});
