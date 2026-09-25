import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { LucideDynamicIcon, LucideInfo } from '@lucide/angular';

@Component({
  selector: 'app-notice-banner',
  imports: [LucideDynamicIcon],
  templateUrl: './notice-banner.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class NoticeBannerComponent {
  readonly announcement = input<'status' | 'alert'>('status');
  protected readonly infoIcon = LucideInfo;
}
