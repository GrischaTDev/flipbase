import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { TRANSLATIONS_DE, TRANSLATIONS_EN } from './core/i18n/translations';
import { ToastContainerComponent } from './shared/components/toast/toast-container.component';
import { ToastSyncBridgeService } from './shared/components/toast/toast-sync-bridge.service';
import { AppStartupService } from './core/services/app-startup.service';
import { PwaUpdateNoticeComponent } from './shared/components/pwa-update-notice/pwa-update-notice.component';
import { PwaService } from './core/services/pwa.service';
import { PwaInstallDialogComponent } from './shared/components/pwa-install-dialog/pwa-install-dialog.component';
import { PushNavigationService } from './core/services/push-navigation.service';
import { PushNavigationNoticeComponent } from './shared/components/push-navigation-notice/push-navigation-notice.component';
import { OfflinePurchaseContextService } from './features/purchases/services/offline-purchase-context.service';
import { PurchaseBufferService } from './features/purchases/services/purchase-buffer.service';

@Component({
  selector: 'app-root',
  imports: [
    RouterOutlet,
    ToastContainerComponent,
    PwaUpdateNoticeComponent,
    PushNavigationNoticeComponent,
    PwaInstallDialogComponent,
  ],
  templateUrl: './app.html',
  styleUrl: './app.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  protected readonly startup = inject(AppStartupService);
  protected readonly pwa = inject(PwaService);
  protected readonly pushNavigation = inject(PushNavigationService);
  private readonly translate = inject(TranslateService);
  private readonly toastSyncBridge = inject(ToastSyncBridgeService);
  private readonly offlinePurchaseContext = inject(OfflinePurchaseContextService);
  private readonly purchaseBuffer = inject(PurchaseBufferService);
  protected readonly title = signal('flipbase');

  constructor() {
    this.translate.setTranslation('de', TRANSLATIONS_DE, true);
    this.translate.setTranslation('en', TRANSLATIONS_EN, true);
    this.translate.use('de');
  }
}
