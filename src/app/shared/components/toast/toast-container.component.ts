import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import {
  LucideDynamicIcon,
  LucideAlertTriangle as AlertTriangle,
  LucideCheckCircle2 as CheckCircle2,
  LucideCircleX as CircleX,
  LucideInfo as Info,
  LucideX as X,
} from '@lucide/angular';
import { ToastService } from './toast.service';

@Component({
  selector: 'app-toast-container',
  imports: [LucideDynamicIcon],
  templateUrl: './toast-container.component.html',
  host: { class: 'contents' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ToastContainerComponent {
  readonly toastService = inject(ToastService);

  readonly successIcon = CheckCircle2;
  readonly errorIcon = CircleX;
  readonly warningIcon = AlertTriangle;
  readonly infoIcon = Info;
  readonly closeIcon = X;
}
