import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { PlatformProfile } from '../../models/platform-profile';
import { Crops } from '../../services/crops';
import { Look } from '../../services/adjustments';
import { NEUTRAL_LOOK } from '../../services/image-renderer';
import { PlatformPreviewComponent } from '../platform-preview/platform-preview.component';

/** Zeigt je gewaehlter Plattform, was der Export tatsaechlich liefert. */
@Component({
  selector: 'app-preview-grid',
  imports: [PlatformPreviewComponent],
  templateUrl: './preview-grid.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PreviewGridComponent {
  readonly platforms = input.required<readonly PlatformProfile[]>();
  readonly dataUrl = input.required<string>();
  readonly crops = input.required<Crops>();
  readonly look = input<Look>(NEUTRAL_LOOK);
}
