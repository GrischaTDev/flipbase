import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { TRANSLATIONS_DE, TRANSLATIONS_EN } from './core/i18n/translations';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  private readonly translate = inject(TranslateService);
  protected readonly title = signal('flipbase');

  constructor() {
    this.translate.setTranslation('de', TRANSLATIONS_DE, true);
    this.translate.setTranslation('en', TRANSLATIONS_EN, true);
    this.translate.use('de');
  }
}
