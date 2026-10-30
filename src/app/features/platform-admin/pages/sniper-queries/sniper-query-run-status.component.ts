import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { DatePipe } from '@angular/common';
import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import { LoadingIndicatorComponent } from '../../../../shared/components/loading-indicator/loading-indicator.component';
import { SniperQuery, queryStatusLabel } from '../../models/sniper-query.model';

@Component({
  selector: 'app-sniper-query-run-status',
  imports: [DatePipe, BadgeComponent, LoadingIndicatorComponent],
  templateUrl: './sniper-query-run-status.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SniperQueryRunStatusComponent {
  readonly query = input.required<SniperQuery>();
  readonly compact = input(false);
  readonly pending = input(false);
  readonly manualRequired = input(false);
  readonly currentTime = input(Date.now());
  readonly statusLabel = queryStatusLabel;
  readonly lastSuccessLabel = computed(() => {
    const timestamp = this.query().last_success_at;
    if (!timestamp) return 'Noch kein erfolgreicher Abruf';
    const elapsed = Math.max(0, this.currentTime() - Date.parse(timestamp));
    if (!Number.isFinite(elapsed)) return 'Erfolgszeit unbekannt';
    const minutes = Math.floor(elapsed / 60000);
    if (minutes < 1) return 'Erfolg gerade eben';
    if (minutes < 60) return `Erfolg vor ${minutes} ${minutes === 1 ? 'Minute' : 'Minuten'}`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `Erfolg vor ${hours} ${hours === 1 ? 'Stunde' : 'Stunden'}`;
    const days = Math.floor(hours / 24);
    return `Erfolg vor ${days} ${days === 1 ? 'Tag' : 'Tagen'}`;
  });
  readonly coverageLabel = computed(() => {
    switch (this.query().coverage_status) {
      case 'initial':
        return 'Erstbestand läuft';
      case 'caught_up':
        return 'Bis zum letzten Abruf aufgeholt';
      case 'limited':
        return 'Aufholen begrenzt · weitere Artikel möglich';
      default:
        return 'Abrufumfang noch unbekannt';
    }
  });
}
