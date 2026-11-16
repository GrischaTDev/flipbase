import { ChangeDetectionStrategy, Component, input, linkedSignal } from '@angular/core';
import { ActionStatusIndicatorComponent } from '../action-status-indicator/action-status-indicator.component';
import { ProductThumbnailComponent } from '../product-thumbnail/product-thumbnail.component';

/**
 * Status einer Aktion vor dem Bild des betroffenen Artikels: Das Bild ist abgedunkelt, damit
 * Ladekreis, Haken oder Fehler immer klar im Vordergrund stehen.
 */
@Component({
  selector: 'app-action-status-thumbnail',
  imports: [ActionStatusIndicatorComponent, ProductThumbnailComponent],
  templateUrl: './action-status-thumbnail.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'relative inline-flex size-14 shrink-0' },
})
export class ActionStatusThumbnailComponent {
  readonly state = input.required<'running' | 'success' | 'error' | 'paused'>();
  readonly imageUrl = input<string | null | undefined>(null);
  readonly failed = linkedSignal({ source: this.imageUrl, computation: () => false });
}
