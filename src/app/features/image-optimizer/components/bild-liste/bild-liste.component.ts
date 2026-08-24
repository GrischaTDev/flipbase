import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import {
  LucideDynamicIcon,
  LucideX as X,
  LucideChevronLeft as ChevronLeft,
  LucideChevronRight as ChevronRight,
} from '@lucide/angular';
import { OptimiererBild } from '../../image-optimizer.component';

/**
 * Die Filmleiste. Das erste Bild ist das Hauptbild - bei eBay das Bild im
 * Suchergebnis, bei Vinted das im Raster. Deshalb wird es markiert.
 */
@Component({
  selector: 'app-bild-liste',
  imports: [LucideDynamicIcon],
  templateUrl: './bild-liste.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BildListeComponent {
  readonly bilder = input.required<OptimiererBild[]>();
  readonly aktivesId = input<string | null>(null);
  readonly deaktiviert = input(false);

  readonly gewaehlt = output<string>();
  readonly entfernt = output<string>();
  readonly verschoben = output<{ id: string; richtung: -1 | 1 }>();

  readonly closeIcon = X;
  readonly linksIcon = ChevronLeft;
  readonly rechtsIcon = ChevronRight;
}
