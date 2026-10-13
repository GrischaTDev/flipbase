import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { PushNavigationService } from '../../../core/services/push-navigation.service';
import { ButtonComponent } from '../button/button.component';
@Component({
  selector: 'app-push-navigation-notice',
  imports: [ButtonComponent],
  templateUrl: './push-navigation-notice.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PushNavigationNoticeComponent {
  readonly navigation = inject(PushNavigationService);
}
