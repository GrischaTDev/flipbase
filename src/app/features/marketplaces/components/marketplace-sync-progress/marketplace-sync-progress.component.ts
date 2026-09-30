import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { ModalShellComponent } from '../../../../shared/components/modal-shell/modal-shell.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { NoticeBannerComponent } from '../../../../shared/components/notice-banner/notice-banner.component';
import {
  MARKETPLACE_SYNC_SOURCE_LABELS,
  marketplaceSyncWarningSources,
  type MarketplaceSyncSource,
} from '../../models/marketplace-sync-results';
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

const stepSources: Partial<Record<(typeof steps)[number]['id'], readonly MarketplaceSyncSource[]>> =
  {
    profile: ['profile'],
    publications: ['publications'],
    conversations: ['conversations', 'messages'],
    sales: ['sales', 'feedback'],
  };

const STAGE_LABELS: Record<string, string> = {
  browser: 'Verbindung vorbereiten',
  profile: 'Profil abrufen',
  publications: 'Inserate laden',
  conversations: 'Nachrichten laden',
  sales: 'Verkäufe abgleichen',
  persist: 'Daten übernehmen',
  cleanup: 'Verbindung beenden',
};

const ERROR_EXPLANATIONS: Record<string, { summary: string; detail: string }> = {
  identity: {
    summary: 'Sitzung nicht mehr aktiv (HTTP 401)',
    detail:
      'Vinted hat das gespeicherte Anmelde-Cookie abgewiesen. Dies tritt typischerweise auf, wenn der Proxy die IP gewechselt hat oder DataDome eine erneute Authentifizierung verlangt.',
  },
  browser: {
    summary: 'Browser-Start fehlgeschlagen',
    detail:
      'Der Cloudbrowser konnte nicht gestartet werden. Mögliche Ursachen: Verbindungsabbruch oder GoLogin-Kapazitätsgrenze.',
  },
  profile: {
    summary: 'Profilabruf verweigert',
    detail:
      'Vinted hat beim Lesen der Benutzerdaten nicht geantwortet oder verlangt eine Sicherheitsprüfung (z. B. Captcha).',
  },
  publications: {
    summary: 'Inserate nicht geladen',
    detail: 'Der Artikelabruf wurde von Vinted abgebrochen oder durch ein Rate-Limit verlangsamt.',
  },
  conversations: {
    summary: 'Nachrichten nicht geladen',
    detail: 'Die Unterhaltungen konnten nicht vollständig von Vinted übertragen werden.',
  },
  sales: {
    summary: 'Verkäufe nicht geladen',
    detail: 'Die Transaktionsdaten konnten von Vinted nicht abgerufen werden.',
  },
  access: {
    summary: 'Berechtigung unterbrochen',
    detail:
      'Die Berechtigungsprüfung für das Marktplatzkonto wurde während des Vorgangs unterbrochen.',
  },
  interrupted: {
    summary: 'Auftrag vorzeitig unterbrochen',
    detail: 'Der Hintergrundauftrag wurde durch einen Serverneustart oder Timeout unterbrochen.',
  },
};

export interface SyncDiagnosticInfo {
  readonly operationId: string | null;
  readonly stage: string | null;
  readonly stageLabel: string | null;
  readonly errorCode: string | null;
  readonly summary: string;
  readonly detail: string | null;
  readonly hasError: boolean;
  readonly serverCommand: string;
}

@Component({
  selector: 'app-marketplace-sync-progress',
  imports: [ModalShellComponent, ButtonComponent, NoticeBannerComponent],
  templateUrl: './marketplace-sync-progress.component.html',
  styleUrl: './marketplace-sync-progress.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MarketplaceSyncProgressComponent {
  readonly progress = input<MarketplaceSyncProgress | null>(null);
  readonly error = input<string | null>(null);
  readonly reconnectLink = input<string | null>(null);
  readonly closed = output<void>();
  readonly steps = steps;
  readonly warningSources = computed(() =>
    marketplaceSyncWarningSources(this.progress()?.sourceResults).map((source) => ({
      source,
      label: MARKETPLACE_SYNC_SOURCE_LABELS[source],
    })),
  );

  readonly showDiagnostics = signal(false);
  readonly copiedCommand = signal(false);

  readonly currentIndex = computed(() => {
    const stage = this.progress()?.stage;
    return Math.max(
      0,
      steps.findIndex((step) => step.id === stage),
    );
  });

  readonly diagnosticInfo = computed<SyncDiagnosticInfo>(() => {
    const currentProgress = this.progress();
    const hasError = this.error() !== null || currentProgress?.state === 'failed';
    const errorCode = currentProgress?.errorCode ?? null;
    const stage = currentProgress?.stage ?? null;
    const stageLabel = stage ? (STAGE_LABELS[stage] ?? stage) : null;
    const explanation = errorCode ? ERROR_EXPLANATIONS[errorCode] : undefined;

    return {
      operationId: currentProgress?.id ?? null,
      stage,
      stageLabel,
      errorCode,
      summary: explanation?.summary ?? (hasError ? 'Unerwartete Unterbrechung' : 'Keine Fehler'),
      detail:
        explanation?.detail ??
        (hasError ? 'Die Ausführung konnte an diesem Schritt nicht fortgesetzt werden.' : null),
      hasError,
      serverCommand: 'docker logs --tail 100 flipbase-marketplace-worker',
    };
  });

  completed(index: number): boolean {
    const progress = this.progress();
    const step = steps[index];
    if (!step) return false;
    const results = progress?.sourceResults;
    if (
      results &&
      stepSources[step.id]?.some(
        (source) => results[source].status !== 'complete' || !!results[source].failure,
      )
    )
      return false;
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

  toggleDiagnostics(): void {
    this.showDiagnostics.update((visible) => !visible);
  }

  async copyCommand(): Promise<void> {
    const cmd = this.diagnosticInfo().serverCommand;
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(cmd);
        this.copiedCommand.set(true);
        setTimeout(() => this.copiedCommand.set(false), 2000);
      } catch {
        // Fallback wenn Clipboard-Zugriff verweigert wird
      }
    }
  }
}
