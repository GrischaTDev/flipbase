import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import {
  BadgeComponent,
  type BadgeTone,
} from '../../../../shared/components/badge/badge.component';
import { LoadingIndicatorComponent } from '../../../../shared/components/loading-indicator/loading-indicator.component';

/**
 * Eigene Chatblase für einen Vorgang, den Vinted noch nicht bestätigt hat:
 * eine gesendete Nachricht oder eine Angebotsaktion. Solange der Vorgang läuft,
 * ist der Inhalt abgeschwächt und Ladekreis plus Status stehen in der Mitte.
 */
@Component({
  selector: 'app-vinted-chat-pending-bubble',
  imports: [BadgeComponent, LoadingIndicatorComponent],
  templateUrl: './vinted-chat-pending-bubble.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'ml-auto block w-fit max-w-[90%] sm:max-w-[78%]' },
})
export class VintedChatPendingBubbleComponent {
  /** Läuft der Vorgang noch? Dann abgeschwächt mit Ladekreis. */
  readonly pending = input.required<boolean>();
  readonly statusLabel = input.required<string>();
  readonly statusTone = input<BadgeTone>('neutral');
}
