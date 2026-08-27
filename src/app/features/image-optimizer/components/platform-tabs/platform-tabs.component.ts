import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { PlatformId, PlatformProfile } from '../../models/platform-profile';

/** Waehlt, fuer welche Plattform der Editor gerade den Ausschnitt einstellt. */
@Component({
  selector: 'app-platform-tabs',
  imports: [],
  templateUrl: './platform-tabs.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlatformTabsComponent {
  /** Nur die tatsaechlich gewaehlten Plattformen. */
  readonly platforms = input.required<readonly PlatformProfile[]>();
  readonly activeId = input<PlatformId | null>(null);
  readonly disabled = input(false);

  readonly selected = output<PlatformId>();
}
