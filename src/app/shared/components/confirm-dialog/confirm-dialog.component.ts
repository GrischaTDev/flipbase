import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import {
  LucideDynamicIcon,
  LucideTriangleAlert as TriangleAlert,
  LucideInfo as Info,
} from '@lucide/angular';
import { ModalDialogDirective } from '../../directives/modal-dialog.directive';
import { ConfirmDialogService } from './confirm-dialog.service';

/**
 * Zeigt die Rueckfrage oder den Hinweis an, den der ConfirmDialogService haelt.
 *
 * Gehoert genau einmal in das Grundgeruest (shell.component.html). Jede Stelle,
 * die etwas fragen will, ruft den Dienst - niemand bindet diese Komponente
 * selbst ein.
 */
@Component({
  selector: 'app-confirm-dialog',
  imports: [ModalDialogDirective, LucideDynamicIcon],
  templateUrl: './confirm-dialog.component.html',
  host: { class: 'contents' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConfirmDialogComponent {
  readonly dialog = inject(ConfirmDialogService);

  readonly warnIcon = TriangleAlert;
  readonly infoIcon = Info;
}
