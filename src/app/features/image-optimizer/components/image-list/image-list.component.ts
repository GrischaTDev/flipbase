import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import {
  CdkDrag,
  CdkDragDrop,
  CdkDragHandle,
  CdkDragPlaceholder,
  CdkDropList,
} from '@angular/cdk/drag-drop';
import {
  LucideDynamicIcon,
  LucideX as X,
  LucideArrowUp as ArrowUp,
  LucideArrowDown as ArrowDown,
} from '@lucide/angular';
import { OptimizerImage } from '../../models/optimizer-image';

/**
 * Die Bilderliste als Raster. Das erste Bild ist das Hauptbild - bei eBay das
 * Bild im Suchergebnis, bei Vinted das im Raster. Umsortiert wird per Ziehen;
 * die Pfeile in der Werkzeugleiste der Kachel bleiben als Weg ohne Ziehen fuer
 * Tastatur und Screenreader (WCAG 2.2, 2.5.7).
 *
 * Gezogen wird nur am Bild selbst (`cdkDragHandle` auf dem Auswahl-Knopf):
 * ohne Griff wuerde jede Beruehrung der Kachel - auch auf den Werkzeug-
 * Knoepfen oder dem "durchgesehen"-Schalter - nach 5px Bewegung einen Zug
 * auf dem ganzen `<article>` starten und den folgenden Klick verschlucken.
 * Auf Touch kommt eine Verzoegerung dazu: Ohne sie wuerde ein Wischen zum
 * Scrollen im Raster (`overflow-y-auto`) sofort als Zug gewertet; mit
 * Verzoegerung scrollt ein kurzes Wischen normal und erst ein laengeres
 * Halten startet das Ziehen.
 */
@Component({
  selector: 'app-image-list',
  imports: [LucideDynamicIcon, CdkDropList, CdkDrag, CdkDragHandle, CdkDragPlaceholder],
  templateUrl: './image-list.component.html',
  styleUrl: './image-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ImageListComponent {
  readonly images = input.required<OptimizerImage[]>();
  readonly activeId = input<string | null>(null);
  readonly disabled = input(false);
  readonly reviewedCount = input(0);

  readonly selected = output<string>();
  readonly removed = output<string>();
  readonly moved = output<{ id: string; direction: -1 | 1 }>();
  readonly reordered = output<{ readonly fromIndex: number; readonly toIndex: number }>();
  readonly clearAllRequested = output<void>();
  readonly reviewToggled = output<string>();

  readonly closeIcon = X;
  readonly moveUpIcon = ArrowUp;
  readonly moveDownIcon = ArrowDown;

  /** Auf der Maus sofort ziehbar, auf Touch erst nach kurzem Halten (siehe Klassenkommentar). */
  readonly dragStartDelay = { touch: 250, mouse: 0 } as const;

  /** Ein Loslassen am Ausgangsort ist keine Umsortierung. */
  onDropped(event: CdkDragDrop<unknown>): void {
    if (event.previousIndex === event.currentIndex) return;
    this.reordered.emit({ fromIndex: event.previousIndex, toIndex: event.currentIndex });
  }
}
