import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import {
  LucideDynamicIcon,
  LucideAlertTriangle as AlertTriangle,
  LucideX as X,
} from '@lucide/angular';
import { SyncStatusService } from '../../../core/services/sync-status.service';

/**
 * Zeigt fehlgeschlagene Speichervorgänge deutlich sichtbar an.
 *
 * Ohne diese Anzeige blieb ein misslungenes Speichern für den Nutzer
 * unsichtbar: Der Datensatz erschien in der Liste, war aber nie in der
 * Datenbank angekommen und beim nächsten Neuladen verschwunden.
 *
 * Bewusst kein modaler Dialog, sondern ein Streifen im Seitenfluss – so
 * unterbricht er die Arbeit nicht und bleibt trotzdem per Tastatur und
 * Screenreader zugänglich.
 */
@Component({
  selector: 'app-sync-error-banner',
  imports: [LucideDynamicIcon],
  templateUrl: './sync-error-banner.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SyncErrorBannerComponent {
  readonly syncStatus = inject(SyncStatusService);

  readonly warningIcon = AlertTriangle;
  readonly closeIcon = X;
}
