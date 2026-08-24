import '@angular/compiler';
import { signal } from '@angular/core';
import { FormControl, FormGroup } from '@angular/forms';
import { describe, expect, it, vi } from 'vitest';
import { ToastService } from '../../shared/components/toast/toast.service';
import { ResearchComponent } from './research.component';
import { SyncStatusService } from '../../core/services/sync-status.service';

function erstelleKomponente(ergebnis: boolean) {
  const toast = new ToastService();
  const priceTrackerService = {
    applyRecommendedPrice: vi.fn(async () => ergebnis),
    addTrackedItem: vi.fn(
      async (): Promise<{
        data: { id: string } | null;
        error: Error | null;
        reportedBySyncStatus: boolean;
      }> => ({
        data: { id: 'track-new' },
        error: null,
        reportedBySyncStatus: false,
      }),
    ),
    deleteTrackedItem: vi.fn(
      async (): Promise<{
        data: boolean | null;
        error: Error | null;
        reportedBySyncStatus: boolean;
      }> => ({
        data: true,
        error: null,
        reportedBySyncStatus: false,
      }),
    ),
  };
  const komponente = Object.create(ResearchComponent.prototype) as ResearchComponent;
  Object.assign(komponente, {
    priceTrackerService,
    syncStatus: new SyncStatusService(),
    toast,
    activeTab: signal<'search' | 'radar'>('search'),
    isRadarMutationPending: signal(false),
    summary: signal({ medianPrice: 120 }),
    searchForm: new FormGroup({
      query: new FormControl('Testartikel', { nonNullable: true }),
      condition: new FormControl('used', { nonNullable: true }),
      estimatedCost: new FormControl(80, { nonNullable: true }),
      limit: new FormControl(24, { nonNullable: true }),
    }),
  });
  return { komponente, priceTrackerService, toast };
}

describe('ResearchComponent – Aktionsmeldungen', () => {
  it('bestätigt die Übernahme eines Radarpreises nur bei true', async () => {
    const { komponente, toast } = erstelleKomponente(true);

    await komponente.onApplyRadarPrice('item-1');

    expect(toast.toasts()[0]).toMatchObject({
      type: 'success',
      title: 'Preisempfehlung wurde übernommen.',
    });
    expect('repricingSuccessId' in komponente).toBe(false);
  });

  it('zeigt bei einem Nulltreffer keine Erfolgsmeldung', async () => {
    const { komponente, toast } = erstelleKomponente(false);

    await komponente.onApplyRadarPrice('item-1');

    expect(toast.toasts()).toEqual([]);
  });

  it('wechselt erst nach bestätigter Radar-Persistenz und meldet das Anlegen', async () => {
    const { komponente, toast } = erstelleKomponente(true);

    await komponente.onAddCurrentSearchToRadar();

    expect(komponente.activeTab()).toBe('radar');
    expect(toast.toasts()[0]).toMatchObject({
      type: 'success',
      title: 'Preisbeobachtung wurde angelegt.',
    });
  });

  it('behält die Recherche bei einem Radar-Speicherfehler und meldet ihn persistent', async () => {
    const { komponente, priceTrackerService, toast } = erstelleKomponente(true);
    priceTrackerService.addTrackedItem.mockResolvedValue({
      data: null,
      error: new Error('offline'),
      reportedBySyncStatus: false,
    });

    await komponente.onAddCurrentSearchToRadar();

    expect(komponente.activeTab()).toBe('search');
    expect(toast.toasts()[0]).toMatchObject({
      type: 'error',
      title: 'Preisbeobachtung konnte nicht angelegt werden.',
      persistent: true,
    });
  });

  it('bestätigt das Löschen einer Preisbeobachtung erst nach Erfolg', async () => {
    const { komponente, toast } = erstelleKomponente(true);

    await komponente.onDeleteTrackItem('track-1');

    expect(toast.toasts()[0]).toMatchObject({
      type: 'success',
      title: 'Preisbeobachtung wurde gelöscht.',
    });
  });

  it('beendet den Radar-Ladezustand auch bei einer geworfenen Ausnahme', async () => {
    const { komponente, priceTrackerService, toast } = erstelleKomponente(true);
    priceTrackerService.deleteTrackedItem.mockRejectedValue(new Error('offline'));

    await komponente.onDeleteTrackItem('track-1');

    expect(komponente.isRadarMutationPending()).toBe(false);
    expect(toast.toasts()[0]).toMatchObject({ type: 'error', persistent: true });
  });

  it('erzeugt bei reportedBySyncStatus keinen zweiten Radar-Feature-Toast', async () => {
    const { komponente, priceTrackerService, toast } = erstelleKomponente(true);
    priceTrackerService.addTrackedItem.mockResolvedValue({
      data: null,
      error: new Error('offline'),
      reportedBySyncStatus: true,
    });

    await komponente.onAddCurrentSearchToRadar();

    expect(toast.toasts()).toEqual([]);
  });
});
