import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { CdkDrag, CdkDragDrop, CdkDragPlaceholder, CdkDropList } from '@angular/cdk/drag-drop';
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
 */
@Component({
  selector: 'app-image-list',
  imports: [LucideDynamicIcon, CdkDropList, CdkDrag, CdkDragPlaceholder],
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

  /** Ein Loslassen am Ausgangsort ist keine Umsortierung. */
  onDropped(event: CdkDragDrop<unknown>): void {
    if (event.previousIndex === event.currentIndex) return;
    this.reordered.emit({ fromIndex: event.previousIndex, toIndex: event.currentIndex });
  }
}
