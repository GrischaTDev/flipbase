import {
  ApplicationConfig,
  ErrorHandler,
  LOCALE_ID,
  provideZonelessChangeDetection,
  provideAppInitializer,
  inject,
} from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideTranslateService, TranslateLoader } from '@ngx-translate/core';
import { SyncTranslateLoader } from './core/i18n/translations';
import { AppErrorHandler } from './core/errors/app-error-handler';

import { routes } from './app.routes';
import { PwaService } from './core/services/pwa.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideAppInitializer(() => {
      inject(PwaService);
    }),
    provideZonelessChangeDetection(),
    provideRouter(routes, withComponentInputBinding()),
    { provide: LOCALE_ID, useValue: 'de' },
    { provide: ErrorHandler, useClass: AppErrorHandler },
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
