import '@angular/compiler';
import { ɵresolveComponentResources } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { SetPasswordComponent } from './set-password.component';
import { AuthService } from '../../../core/services/auth.service';
import { SupabaseService } from '../../../core/services/supabase.service';
import { ThemeService } from '../../../core/services/theme.service';
import { TranslateService } from '@ngx-translate/core';
import { Router } from '@angular/router';
import { signal } from '@angular/core';
import { of } from 'rxjs';
import { By } from '@angular/platform-browser';
import { CustomCheckboxComponent } from '../../../shared/components/custom-checkbox/custom-checkbox.component';
import { TRANSLATIONS_DE } from '../../../core/i18n/translations';

beforeAll(async () => {
  const lookup: Record<string, string> = {
    'set-password.component.html': 'src/app/features/auth/set-password/set-password.component.html',
    'custom-checkbox.component.html':
      'src/app/shared/components/custom-checkbox/custom-checkbox.component.html',
    'custom-checkbox.component.scss':
      'src/app/shared/components/custom-checkbox/custom-checkbox.component.scss',
    'button.component.html': 'src/app/shared/components/button/button.component.html',
    'button.component.scss': 'src/app/shared/components/button/button.component.scss',
    'terms-modal.component.html':
      'src/app/features/auth/components/terms-modal/terms-modal.component.html',
    'privacy-modal.component.html':
      'src/app/features/auth/components/privacy-modal/privacy-modal.component.html',
  };

  await ɵresolveComponentResources(async (url) => {
    const filename = url.split('/').pop()?.split('\\').pop() ?? url;
    const mapped = lookup[filename];
    if (mapped) {
      return readFile(resolve(mapped), 'utf8');
    }
    return '';
  });
});

describe('SetPasswordComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  function createComponent(
    options: {
      isAuthenticated?: boolean;
      updateUserError?: Error | null;
      activationError?: Error | null;
    } = {},
  ) {
    const updateUser = vi.fn().mockResolvedValue({
      data: { user: {} },
      error: options.updateUserError ?? null,
    });
    const fakeSupabase = {
      client: {
        auth: {
          updateUser,
        },
      },
    };

    const fakeAuth = {
      sessionReady: Promise.resolve(),
      isAuthenticated: vi.fn().mockReturnValue(options.isAuthenticated ?? true),
      activatePendingBetaAccess: vi.fn().mockImplementation(async () => {
        if (options.activationError) throw options.activationError;
      }),
      currentUser: signal({
        id: 'u1',
        email: 'test@example.de',
        user_metadata: { first_name: 'Max', full_name: 'Max Mustermann' },
      }),
    };

    const fakeTheme = {
      isDark: signal(false),
      toggleTheme: vi.fn(),
    };

    const translate = (key: string) => {
      let value: unknown = TRANSLATIONS_DE;
      for (const segment of key.split('.')) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) return key;
        value = (value as Readonly<Record<string, unknown>>)[segment];
      }
      return typeof value === 'string' ? value : key;
    };
    const fakeTranslate = {
      currentLang: () => 'de',
      use: vi.fn(),
      instant: translate,
      get: (key: string) => of(translate(key)),
      stream: (key: string) => of(translate(key)),
      translate: (key: string) => signal(translate(key)),
      onLangChange: of({ lang: 'de', translations: {} }),
      onTranslationChange: of({ lang: 'de', translations: {} }),
      onDefaultLangChange: of({ lang: 'de', translations: {} }),
    };

    const fakeRouter = {
      navigate: vi.fn().mockResolvedValue(true),
    };

    TestBed.configureTestingModule({
      imports: [SetPasswordComponent],
      providers: [
        { provide: SupabaseService, useValue: fakeSupabase },
        { provide: AuthService, useValue: fakeAuth },
        { provide: ThemeService, useValue: fakeTheme },
        { provide: TranslateService, useValue: fakeTranslate },
        { provide: Router, useValue: fakeRouter },
      ],
    });

    const fixture = TestBed.createComponent(SetPasswordComponent);
    return {
      fixture,
      component: fixture.componentInstance,
      updateUser,
      activatePendingBetaAccess: fakeAuth.activatePendingBetaAccess,
      fakeRouter,
    };
  }

  it('initialisiert das Formular mit leeren Werten und ungueltigem Status', () => {
    const { component } = createComponent();

    expect(component.form.valid).toBe(false);
    expect(component.form.controls.password.value).toBe('');
    expect(component.form.controls.confirmPassword.value).toBe('');
    expect(component.form.controls.acceptTerms.value).toBe(false);
  });

  it('erkennt ungleiche Passwoerter als Mismatch', () => {
    const { component } = createComponent();

    component.form.controls.password.setValue('SicheresPasswort123!');
    component.form.controls.confirmPassword.setValue('Ungleich123!');
    component.form.controls.acceptTerms.setValue(true);

    expect(component.form.hasError('passwordMismatch')).toBe(true);
    expect(component.form.valid).toBe(false);
  });

  it('akzeptiert uebereinstimmende Passwoerter mit akzeptierten AGB', () => {
    const { component } = createComponent();

    component.form.controls.password.setValue('SicheresPasswort123!');
    component.form.controls.confirmPassword.setValue('SicheresPasswort123!');
    component.form.controls.acceptTerms.setValue(true);

    expect(component.form.valid).toBe(true);
    expect(component.isPasswordMatch).toBe(true);
  });

  it('ruft updateUser beim Absenden auf', async () => {
    const { component, updateUser, activatePendingBetaAccess } = createComponent();

    component.form.controls.password.setValue('SicheresPasswort123!');
    component.form.controls.confirmPassword.setValue('SicheresPasswort123!');
    component.form.controls.acceptTerms.setValue(true);

    await component.onSubmit();

    expect(updateUser).toHaveBeenCalledWith({
      password: 'SicheresPasswort123!',
      data: { beta_registration_completed: true },
    });
    expect(activatePendingBetaAccess).toHaveBeenCalledOnce();
  });

  it('zeigt einen Aktivierungsfehler und meldet noch keinen Erfolg', async () => {
    const { component, fakeRouter } = createComponent({
      activationError: new Error('Beta-Zugang konnte nicht gestartet werden.'),
    });

    component.form.controls.password.setValue('SicheresPasswort123!');
    component.form.controls.confirmPassword.setValue('SicheresPasswort123!');
    component.form.controls.acceptTerms.setValue(true);

    await component.onSubmit();

    expect(component.errorMessage()).toBe('Beta-Zugang konnte nicht gestartet werden.');
    expect(component.successMessage()).toBeNull();
    expect(component.isLoading()).toBe(false);
    expect(fakeRouter.navigate).not.toHaveBeenCalled();
  });

  it('markiert den Token als ungueltig wenn keine Sitzung vorhanden ist', async () => {
    const { component } = createComponent({ isAuthenticated: false });

    await component.ngOnInit();

    expect(component.isTokenInvalid()).toBe(true);
  });

  it('zeigt übersetzte Passworttexte und die gelbe Marken-Checkbox', async () => {
    const { fixture, component } = createComponent();
    component.form.controls.password.setValue('kurz');
    component.form.controls.password.markAsTouched();
    component.form.controls.confirmPassword.setValue('anders');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent?.replace(/\s+/gu, ' ') ?? '';
    const termsCheckbox = fixture.debugElement.query(By.directive(CustomCheckboxComponent))
      .componentInstance as CustomCheckboxComponent;

    expect(text).toContain('Passwort wiederholen');
    expect(text).toContain('Sicherheitsstufe:');
    expect(text).not.toContain('AUTH.');
    expect(termsCheckbox.color()).toBe('brand');
  });
});
