import '@angular/compiler';
import { signal, ɵresolveComponentResources } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { of } from 'rxjs';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { BetaDiscordService } from '../../services/beta-discord.service';
import { DiscordCallbackComponent } from './discord-callback.component';

beforeAll(async () => {
  await ɵresolveComponentResources(async (url) => {
    const filename = url.split('/').pop()?.split('\\').pop() ?? url;
    return filename === 'discord-callback.component.html'
      ? readFile(
          resolve(
            'src/app/features/beta-discord/pages/discord-callback/discord-callback.component.html',
          ),
          'utf8',
        )
      : '';
  });
});

describe('DiscordCallbackComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  function createComponent(options: {
    code?: string;
    state?: string;
    error?: string;
    fail?: boolean;
  }) {
    const complete = options.fail
      ? vi.fn().mockRejectedValue(new Error('Discord fehlgeschlagen'))
      : vi.fn().mockResolvedValue(undefined);
    const navigate = vi.fn().mockResolvedValue(true);
    TestBed.configureTestingModule({
      imports: [DiscordCallbackComponent],
      providers: [
        { provide: BetaDiscordService, useValue: { complete } },
        { provide: Router, useValue: { navigate } },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              queryParamMap: convertToParamMap({
                code: options.code,
                state: options.state,
                error: options.error,
              }),
            },
          },
        },
        {
          provide: TranslateService,
          useValue: {
            instant: (key: string) => key,
            get: (key: string) => of(key),
            stream: (key: string) => of(key),
            translate: (key: string) => signal(key),
            onLangChange: of({ lang: 'de', translations: {} }),
            onTranslationChange: of({ lang: 'de', translations: {} }),
            onDefaultLangChange: of({ lang: 'de', translations: {} }),
          },
        },
      ],
    });
    return {
      component: TestBed.createComponent(DiscordCallbackComponent).componentInstance,
      complete,
      navigate,
    };
  }

  it('führt nach erfolgreicher Freigabe zurück zur Willkommensansicht', async () => {
    const { component, complete, navigate } = createComponent({ code: 'code', state: 'state' });

    await component.ngOnInit();

    expect(complete).toHaveBeenCalledWith('code', 'state');
    expect(navigate).toHaveBeenCalledWith(['/onboarding/discord'], {
      queryParams: { discord: 'connected' },
      replaceUrl: true,
    });
  });

  it('führt bei fehlgeschlagener Freigabe zum erneuten Versuch', async () => {
    const { component, navigate } = createComponent({ code: 'code', state: 'state', fail: true });

    await component.ngOnInit();

    expect(navigate).toHaveBeenCalledWith(['/onboarding/discord'], {
      queryParams: { discord: 'failed' },
      replaceUrl: true,
    });
  });
});
