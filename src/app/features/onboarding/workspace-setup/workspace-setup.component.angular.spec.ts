import '@angular/compiler';
import { signal, ɵresolveComponentResources } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import axe from 'axe-core';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { of } from 'rxjs';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { Workspace } from '../../../core/models/flipbase.models';
import { AuthService } from '../../../core/services/auth.service';
import { WorkspaceService } from '../../../core/services/workspace.service';
import { ButtonComponent } from '../../../shared/components/button/button.component';
import { TextFieldComponent } from '../../../shared/components/text-field/text-field.component';
import { WorkspaceSetupComponent } from './workspace-setup.component';
import { BetaDiscordService } from '../../beta-discord/services/beta-discord.service';

interface InputMetadata {
  inputs: Record<string, unknown>;
  declaredInputs: Record<string, string>;
}
const snapshots = new Map<unknown, InputMetadata>();
function registerInputs(component: unknown, names: string[]) {
  const metadata = (component as { ɵcmp: InputMetadata }).ɵcmp;
  snapshots.set(component, { inputs: metadata.inputs, declaredInputs: metadata.declaredInputs });
  metadata.inputs = {
    ...metadata.inputs,
    ...Object.fromEntries(names.map((name) => [name, [name, 1, null]])),
  };
  metadata.declaredInputs = {
    ...metadata.declaredInputs,
    ...Object.fromEntries(names.map((name) => [name, name])),
  };
}

const incompleteWorkspace: Workspace = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Mein Workspace',
  min_roi_percent: 30,
  min_profit_amount: 15,
  setup_completed_at: null,
};

const translations: Record<string, string> = {
  'WORKSPACE.SETUP_WELCOME': 'Willkommen bei Flipbase',
  'WORKSPACE.SETUP_QUESTION': 'Wie soll dein Workspace heißen?',
  'WORKSPACE.SETUP_HELP': 'Du kannst den Namen später jederzeit in den Einstellungen ändern.',
  'WORKSPACE.SETUP_NAME_PLACEHOLDER': 'Zum Beispiel Kamera Handel',
  'WORKSPACE.SETUP_NAME_ERROR': 'Bitte gib einen Namen mit 2 bis 100 Zeichen ein.',
  'WORKSPACE.SETUP_SUBMIT': 'Workspace einrichten',
  'WORKSPACE.SETUP_RETRY': 'Erneut versuchen',
  'WORKSPACE.SETUP_LOAD_ERROR': 'Der Workspace konnte nicht geladen werden.',
  'WORKSPACE.SETUP_MISSING_ERROR': 'Dein Workspace ist noch nicht verfügbar.',
  'AUTH.LOGOUT': 'Abmelden',
};

beforeAll(async () => {
  const lookup: Record<string, string> = {
    'workspace-setup.component.html':
      'src/app/features/onboarding/workspace-setup/workspace-setup.component.html',
    'beta-discord-banner.component.html':
      'src/app/features/beta-discord/components/beta-discord-banner/beta-discord-banner.component.html',
    'button.component.html': 'src/app/shared/components/button/button.component.html',
    'button.component.scss': 'src/app/shared/components/button/button.component.scss',
    'text-field.component.html': 'src/app/shared/components/text-field/text-field.component.html',
    'text-field.component.scss': 'src/app/shared/components/text-field/text-field.component.scss',
  };

  await ɵresolveComponentResources(async (url) => {
    const filename = url.split('/').pop()?.split('\\').pop() ?? url;
    const mapped = lookup[filename];
    return mapped ? readFile(resolve(mapped), 'utf8') : '';
  });

  registerInputs(ButtonComponent, [
    'variant',
    'size',
    'loading',
    'disabled',
    'icon',
    'iconPosition',
    'iconOnly',
    'fullWidth',
    'contentAlign',
    'type',
    'formId',
    'link',
    'href',
    'target',
    'queryParams',
    'ariaLabel',
    'title',
    'ariaExpanded',
    'ariaPressed',
    'ariaControls',
    'ariaHaspopup',
  ]);

  registerInputs(TextFieldComponent, [
    'label',
    'labelHidden',
    'placeholder',
    'type',
    'multiline',
    'prefix',
    'suffix',
    'prefixIcon',
    'clearable',
    'monospaced',
    'error',
    'helpText',
    'disabled',
    'id',
    'ariaLabel',
    'autocomplete',
    'required',
    'maxLength',
    'value',
  ]);
});

describe('WorkspaceSetupComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  function createComponent(
    options: {
      workspaces?: Workspace[];
      loadError?: Error | null;
      completeError?: Error | null;
    } = {},
  ) {
    const workspaces = signal(options.workspaces ?? [incompleteWorkspace]);
    const loadError = signal<Error | null>(options.loadError ?? null);
    const ensureLoaded = vi.fn().mockResolvedValue(undefined);
    const completeInitialSetup = vi.fn().mockResolvedValue({
      error: options.completeError ?? null,
    });
    const signOut = vi.fn().mockResolvedValue(undefined);
    const navigate = vi.fn().mockResolvedValue(true);
    const translate = (key: string) => translations[key] ?? key;

    TestBed.configureTestingModule({
      imports: [WorkspaceSetupComponent, ButtonComponent],
      providers: [
        {
          provide: WorkspaceService,
          useValue: { workspaces, loadError, ensureLoaded, completeInitialSetup },
        },
        {
          provide: AuthService,
          useValue: {
            currentUser: signal({
              id: 'user-1',
              email: 'berta@example.test',
              user_metadata: { first_name: 'Berta' },
            }),
            signOut,
          },
        },
        { provide: Router, useValue: { navigate } },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap({}) } },
        },
        {
          provide: BetaDiscordService,
          useValue: { status: async () => ({ eligible: false, linked: false, configured: false }) },
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
    const fixture = TestBed.createComponent(WorkspaceSetupComponent);
    return {
      fixture,
      component: fixture.componentInstance,
      ensureLoaded,
      completeInitialSetup,
      signOut,
      navigate,
    };
  }

  it('akzeptiert ausschließlich einen getrimmten Workspace-Namen mit 2 bis 100 Zeichen', () => {
    const { component } = createComponent();

    expect(component.form.invalid).toBe(true);
    component.form.controls.workspaceName.setValue(' A ');
    expect(component.form.invalid).toBe(true);
    component.form.controls.workspaceName.setValue('Kamera Handel');
    expect(component.form.valid).toBe(true);
    component.form.controls.workspaceName.setValue(` ${'A'.repeat(101)} `);
    expect(component.form.invalid).toBe(true);
  });

  it('speichert den vorhandenen Beta-Workspace und navigiert erst nach Erfolg', async () => {
    const { component, completeInitialSetup, navigate } = createComponent();
    component.form.controls.workspaceName.setValue('  Kamera Handel  ');

    await component.onSubmit();

    expect(completeInitialSetup).toHaveBeenCalledWith(incompleteWorkspace.id, 'Kamera Handel');
    expect(navigate).toHaveBeenCalledWith(['/dashboard']);
  });

  it('zeigt einen Speicherfehler, behält die Eingabe und navigiert nicht', async () => {
    const { fixture, component, navigate } = createComponent({
      completeError: new Error('Speichern fehlgeschlagen.'),
    });
    fixture.detectChanges();
    await fixture.whenStable();
    component.form.controls.workspaceName.setValue('Kamera Handel');

    await component.onSubmit();
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('[role="alert"]')?.textContent).toContain(
      'Speichern fehlgeschlagen.',
    );
    expect(element.querySelector<HTMLInputElement>('#workspace-name')?.value).toBe('Kamera Handel');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('deaktiviert die Speicheraktion während die Serverbestätigung aussteht', async () => {
    const { component, completeInitialSetup } = createComponent();
    await component.retryLoad();
    let confirmSave!: (result: { error: Error | null }) => void;
    completeInitialSetup.mockImplementationOnce(
      () =>
        new Promise((resolveSave) => {
          confirmSave = resolveSave;
        }),
    );
    component.form.controls.workspaceName.setValue('Kamera Handel');

    const pending = component.onSubmit();

    expect(component.submitDisabled()).toBe(true);

    confirmSave({ error: null });
    await pending;
  });

  it('bietet bei fehlenden Daten einen echten neuen Ladeversuch an', async () => {
    const { component, ensureLoaded } = createComponent({ workspaces: [] });

    await component.retryLoad();

    expect(ensureLoaded).toHaveBeenCalledOnce();
    expect(component.errorMessage()).toBe('Dein Workspace ist noch nicht verfügbar.');
  });

  it('meldet den Nutzer über die bestehende Sitzungsfunktion ab', async () => {
    const { component, signOut } = createComponent();

    await component.signOut();

    expect(signOut).toHaveBeenCalledOnce();
  });

  it('zeigt die beschlossene Ein-Feld-Seite ohne schwerwiegende Barrieren', async () => {
    const { fixture } = createComponent();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelectorAll('main')).toHaveLength(1);
    expect(element.querySelectorAll('h1')).toHaveLength(1);
    expect(element.textContent).toContain('Willkommen bei Flipbase');
    expect(element.textContent).toContain('Wie soll dein Workspace heißen?');
    expect(element.querySelector('input[autocomplete="organization"]')).not.toBeNull();

    const result = await axe.run(element, { rules: { 'color-contrast': { enabled: false } } });
    expect(
      result.violations.filter((violation) =>
        ['critical', 'serious'].includes(violation.impact ?? ''),
      ),
    ).toEqual([]);
  });
});
