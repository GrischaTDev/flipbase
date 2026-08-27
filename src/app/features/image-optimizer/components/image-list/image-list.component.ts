import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import {
  LucideDynamicIcon,
  LucideX as X,
  LucideArrowUp as ArrowUp,
  LucideArrowDown as ArrowDown,
} from '@lucide/angular';
import { OptimizerImage } from '../../models/optimizer-image';

/**
 * Die Filmleiste. Das erste Bild ist das Hauptbild - bei eBay das Bild im
 * Suchergebnis, bei Vinted das im Raster. Deshalb wird es markiert.
 */
@Component({
  selector: 'app-image-list',
  imports: [LucideDynamicIcon],
  templateUrl: './image-list.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ImageListComponent {
  readonly images = input.required<OptimizerImage[]>();
  readonly activeId = input<string | null>(null);
  readonly disabled = input(false);

  readonly selected = output<string>();
  readonly removed = output<string>();
  readonly moved = output<{ id: string; direction: -1 | 1 }>();

  readonly closeIcon = X;
  readonly moveUpIcon = ArrowUp;
  readonly moveDownIcon = ArrowDown;
}
