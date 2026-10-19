import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { NgOptimizedImage } from '@angular/common';
import { PwaUpdateService } from '../../../core/services/pwa-update.service';
import { PushNavigationService } from '../../../core/services/push-navigation.service';
import { ButtonComponent } from '../button/button.component';
import { ModalDialogDirective } from '../../directives/modal-dialog.directive';

@Component({
  selector: 'app-pwa-update-notice',
  imports: [ButtonComponent, NgOptimizedImage, ModalDialogDirective],
  templateUrl: './pwa-update-notice.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'fb-admin' },
})
export class PwaUpdateNoticeComponent {
  protected readonly updates = inject(PwaUpdateService);
  protected readonly pushNavigation = inject(PushNavigationService);
}
