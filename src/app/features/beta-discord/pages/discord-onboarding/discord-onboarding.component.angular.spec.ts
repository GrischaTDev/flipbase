import '@angular/compiler';
import { signal, ɵresolveComponentResources } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import axe from 'axe-core';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { of } from 'rxjs';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { TRANSLATIONS_DE } from '../../../../core/i18n/translations';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { BetaRegistrationProgressComponent } from '../../../onboarding/components/beta-registration-progress/beta-registration-progress.component';
import { BetaDiscordService, BetaDiscordStatus } from '../../services/beta-discord.service';
import { DiscordOnboardingComponent } from './discord-onboarding.component';

beforeAll(async () => {
  const files: Record<string, string> = {
    'discord-onboarding.component.html':
      'src/app/features/beta-discord/pages/discord-onboarding/discord-onboarding.component.html',
    'beta-registration-progress.component.html':
      'src/app/features/onboarding/components/beta-registration-progress/beta-registration-progress.component.html',
    'button.component.html': 'src/app/shared/components/button/button.component.html',
    'button.component.scss': 'src/app/shared/components/button/button.component.scss',
  };
  await ɵresolveComponentResources(async (url) => {
    const filename = url.split('/').pop()?.split('\\').pop() ?? url;
    return files[filename] ? readFile(resolve(files[filename]), 'utf8') : '';
  });

  for (const [component, names] of [
    [ButtonComponent, ['variant', 'size', 'href', 'target', 'loading', 'link']],
    [BetaRegistrationProgressComponent, ['step']],
  ] as const) {
    const metadata = (
      component as unknown as {
        ɵcmp: { inputs: Record<string, unknown>; declaredInputs: Record<string, string> };
      }
    ).ɵcmp;
    metadata.inputs = {
      ...metadata.inputs,
      ...Object.fromEntries(names.map((name) => [name, [name, 1, null]])),
    };
    metadata.declaredInputs = {
      ...metadata.declaredInputs,
      ...Object.fromEntries(names.map((name) => [name, name])),
    };
  }
});

function translate(key: string): string {
  let value: unknown = TRANSLATIONS_DE;
  for (const segment of key.split('.')) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return key;
    value = (value as Readonly<Record<string, unknown>>)[segment];
  }
  return typeof value === 'string' ? value : key;
}

describe('DiscordOnboardingComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  function createComponent(status: BetaDiscordStatus, result?: string) {
    const loadStatus = vi.fn().mockResolvedValue(status);
    TestBed.configureTestingModule({
      imports: [DiscordOnboardingComponent],
      providers: [
        { provide: BetaDiscordService, useValue: { status: loadStatus } },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap({ discord: result }) } },
        },
        {
          provide: TranslateService,
          useValue: {
            instant: translate,
            get: (key: string) => of(translate(key)),
            stream: (key: string) => of(translate(key)),
            translate: (key: string) => signal(translate(key)),
            onLangChange: of({ lang: 'de', translations: {} }),
            onTranslationChange: of({ lang: 'de', translations: {} }),
            onDefaultLangChange: of({ lang: 'de', translations: {} }),
          },
        },
      ],
    });
    return TestBed.createComponent(DiscordOnboardingComponent);
  }

  it('zeigt im dritten Schritt die Verbindung und eine spätere Fortsetzung an', async () => {
    const fixture = createComponent({
      eligible: true,
      linked: false,
      configured: true,
      guildId: '123456789012345678',
    });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('[aria-current="step"]')?.textContent).toContain('3');
    expect(element.textContent).toContain('Teile deine Erfahrungen');
    expect(element.textContent).toContain('Mit Discord verbinden');
    expect(element.textContent).toContain('Jetzt nicht, zu Flipbase');
  });

  it('bestätigt nach der Rückkehr die Rolle und öffnet den richtigen Server', async () => {
    const fixture = createComponent(
      { eligible: true, linked: true, configured: true, guildId: '123456789012345678' },
      'connected',
    );
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.textContent).toContain('Willkommen in der Flipbase-Community!');
    expect(element.textContent).toContain('Rolle „Beta-Tester“ erhalten');
    expect(
      element.querySelector<HTMLAnchorElement>(
        'a[href="https://discord.com/channels/123456789012345678"]',
      )?.target,
    ).toBe('_blank');
  });

  it('zeigt im Discord-Schritt keine schwerwiegenden Barrieren', async () => {
    const fixture = createComponent({
      eligible: true,
      linked: false,
      configured: true,
      guildId: '123456789012345678',
    });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const result = await axe.run(fixture.nativeElement as HTMLElement, {
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(
      result.violations.filter((violation) =>
        ['critical', 'serious'].includes(violation.impact ?? ''),
      ),
    ).toEqual([]);
  });
});
