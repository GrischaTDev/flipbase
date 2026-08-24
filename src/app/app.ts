import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { TRANSLATIONS_DE, TRANSLATIONS_EN } from './core/i18n/translations';
import { ToastContainerComponent } from './shared/components/toast/toast-container.component';
import { ToastSyncBridgeService } from './shared/components/toast/toast-sync-bridge.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ToastContainerComponent],
  templateUrl: './app.html',
  styleUrl: './app.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  private readonly translate = inject(TranslateService);
  private readonly toastSyncBridge = inject(ToastSyncBridgeService);
  protected readonly title = signal('flipbase');

  constructor() {
    this.translate.setTranslation('de', TRANSLATIONS_DE, true);
    this.translate.setTranslation('en', TRANSLATIONS_EN, true);
    this.translate.use('de');
  }
}
