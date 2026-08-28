import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import {
  LucideDynamicIcon,
  LucideCheck as Check,
  LucideCircleHelp as CircleHelp,
} from '@lucide/angular';
import { PlatformId, PlatformProfile, ratioLabel } from '../../models/platform-profile';

/** Waehlt die Exportziele aus. Ein Klick genuegt in beide Richtungen. */
@Component({
  selector: 'app-platform-selector',
  imports: [LucideDynamicIcon],
  templateUrl: './platform-selector.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlatformSelectorComponent {
  readonly platforms = input.required<readonly PlatformProfile[]>();
  readonly selectedIds = input.required<readonly PlatformId[]>();
  readonly disabled = input(false);

  readonly toggled = output<PlatformId>();
  readonly helpRequested = output<PlatformId>();

  readonly checkIcon = Check;
  readonly helpIcon = CircleHelp;

  isSelected(id: PlatformId): boolean {
    return this.selectedIds().includes(id);
  }

  /** Templates koennen keine freien Funktionen aufrufen, deshalb die Weiterleitung. */
  ratioLabel(platform: PlatformProfile): string {
    return ratioLabel(platform);
  }
}
