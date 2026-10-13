import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { PwaUpdateService } from '../../../core/services/pwa-update.service';
import { PushNavigationService } from '../../../core/services/push-navigation.service';
import { ButtonComponent } from '../button/button.component';

@Component({
  selector: 'app-pwa-update-notice',
  imports: [ButtonComponent],
  templateUrl: './pwa-update-notice.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PwaUpdateNoticeComponent {
  protected readonly updates = inject(PwaUpdateService);
  protected readonly pushNavigation = inject(PushNavigationService);
  protected readonly postponed = signal(false);
}
