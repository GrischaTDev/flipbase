import { Injectable, computed, effect, signal } from '@angular/core';

/** Vom Nutzer waehlbare Einstellung. `system` folgt der Systemvoreinstellung. */
export type ThemePreference = 'light' | 'dark' | 'system';

/** Tatsaechlich angewendetes Design. */
export type AppTheme = 'light' | 'dark';

const STORAGE_KEY = 'reflip_theme';

/**
 * Steuert helles und dunkles Design.
 *
 * Zuvor setzte dieser Dienst zwar die Klasse `dark` am `<html>`-Element,
 * es gab in `styles.css` aber keine einzige Regel dafuer – das Design war
 * fest dunkel verdrahtet. Der Umschalter im Header war sichtbar, klickbar
 * und wirkungslos.
 */
@Injectable({
  providedIn: 'root',
})
export class ThemeService {
  /** Gewaehlte Einstellung; Standard ist die Systemvoreinstellung. */
  readonly preference = signal<ThemePreference>(this.readStoredPreference());

  /** Aktuelle Systemvoreinstellung, aktualisiert sich bei Aenderung. */
  private readonly systemPrefersDark = signal<boolean>(this.querySystemPrefersDark());

  /** Das Design, das tatsaechlich angewendet wird. */
  readonly currentTheme = computed<AppTheme>(() => {
    const pref = this.preference();
    if (pref === 'system') return this.systemPrefersDark() ? 'dark' : 'light';
    return pref;
  });

  readonly isDark = computed<boolean>(() => this.currentTheme() === 'dark');

  constructor() {
    this.watchSystemPreference();

    // Hinweis: effect() benoetigt einen ChangeDetectionScheduler. Die Tests
    // erzeugen die Dienste mit `new` statt ueber TestBed, weshalb kein
    // Injektionskontext existiert. Die Umgebung laeuft seit Phase 8 zwar unter
    // jsdom, das aendert daran aber nichts - der Scheduler kommt aus Angulars
    // Abhaengigkeitsverwaltung, nicht aus dem Browser. Dieser Schutz kann erst
    // entfallen, wenn die Tests auf TestBed umgestellt sind.
    try {
      effect(() => {
        const theme = this.currentTheme();
        if (typeof document === 'undefined') return;
        document.documentElement.classList.toggle('dark', theme === 'dark');
        // Adressleiste mobiler Browser mitfaerben
        document
          .querySelector('meta[name="theme-color"]')
          ?.setAttribute('content', theme === 'dark' ? '#282c37' : '#f4f5f7');
      });
    } catch {
      // nur Testumgebung ohne Scheduler
    }

    // Schutz nur fuer die Testumgebung (kein ChangeDetectionScheduler), siehe Phase 8.
    try {
      effect(() => {
        const pref = this.preference();
        try {
          if (pref === 'system') {
            localStorage.removeItem(STORAGE_KEY);
          } else {
            localStorage.setItem(STORAGE_KEY, pref);
          }
        } catch {
          // Ohne Speicher gilt die Auswahl nur fuer diese Sitzung.
        }
      });
    } catch {
      // nur Testumgebung ohne Scheduler
    }
  }

  /** Wechselt zwischen hell und dunkel; die Systemautomatik wird dabei verlassen. */
  toggleTheme(): void {
    this.preference.set(this.currentTheme() === 'dark' ? 'light' : 'dark');
  }

  setTheme(preference: ThemePreference): void {
    this.preference.set(preference);
  }

  private readStoredPreference(): ThemePreference {
    try {
      const gespeichert = localStorage.getItem(STORAGE_KEY);
      if (gespeichert === 'light' || gespeichert === 'dark') return gespeichert;
    } catch {
      // Zugriff kann durch Browsereinstellungen blockiert sein
    }
    return 'system';
  }

  private querySystemPrefersDark(): boolean {
    try {
      return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? true;
    } catch {
      return true;
    }
  }

  private watchSystemPreference(): void {
    try {
      const abfrage = window.matchMedia?.('(prefers-color-scheme: dark)');
      abfrage?.addEventListener('change', (e) => this.systemPrefersDark.set(e.matches));
    } catch {
      // Ohne matchMedia bleibt es bei der Startauswertung.
    }
  }
}
