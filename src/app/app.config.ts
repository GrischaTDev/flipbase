import { ApplicationConfig, provideZonelessChangeDetection } from '@angular/core';
import { provideRouter, withComponentInputBinding, withViewTransitions } from '@angular/router';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideTranslateService, TranslateLoader } from '@ngx-translate/core';
import { SyncTranslateLoader } from './core/i18n/translations';

import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    provideRouter(routes, withComponentInputBinding(), withViewTransitions()),
    provideHttpClient(withFetch()),
    provideTranslateService({
      fallbackLang: 'de',
      lang: 'de',
      loader: {
        provide: TranslateLoader,
        useClass: SyncTranslateLoader,
      },
    }),
  ],
};
