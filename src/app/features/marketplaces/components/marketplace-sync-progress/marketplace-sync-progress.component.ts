import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { ModalShellComponent } from '../../../../shared/components/modal-shell/modal-shell.component';
import type { MarketplaceSyncProgress } from '../../services/marketplace-browser-test-api.service';

const steps = [
  { id: 'browser', label: 'Verbindung vorbereiten' },
  { id: 'profile', label: 'Profil abrufen' },
  { id: 'publications', label: 'Inserate laden' },
  { id: 'conversations', label: 'Nachrichten laden' },
  { id: 'sales', label: 'Verkäufe abgleichen' },
  { id: 'persist', label: 'Daten übernehmen' },
  { id: 'cleanup', label: 'Verbindung beenden' },
] as const;

@Component({
  selector: 'app-marketplace-sync-progress',
  imports: [ModalShellComponent],
  templateUrl: './marketplace-sync-progress.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MarketplaceSyncProgressComponent {
  readonly progress = input<MarketplaceSyncProgress | null>(null);
  readonly error = input<string | null>(null);
  readonly closed = output<void>();
  readonly steps = steps;
  readonly currentIndex = computed(() => {
    const stage = this.progress()?.stage;
    return Math.max(
      0,
      steps.findIndex((step) => step.id === stage),
    );
  });

  completed(index: number): boolean {
    const progress = this.progress();
    return (
      progress?.state === 'succeeded' ||
      (progress?.state === 'running' && index < this.currentIndex())
    );
  }

  active(index: number): boolean {
    const state = this.progress()?.state;
    return (state === 'running' || state === 'queued') && index === this.currentIndex();
  }

  failed(index: number): boolean {
    return this.progress()?.state === 'failed' && index === this.currentIndex();
  }
}
