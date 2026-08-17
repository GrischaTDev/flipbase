import { Injectable, effect, signal } from '@angular/core';

export type AppTheme = 'light' | 'dark';

@Injectable({
  providedIn: 'root',
})
export class ThemeService {
  readonly currentTheme = signal<AppTheme>(
    (localStorage.getItem('reflip_theme') as AppTheme) || 'light'
  );

  constructor() {
    effect(() => {
      const theme = this.currentTheme();
      localStorage.setItem('reflip_theme', theme);
      if (theme === 'dark') {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    });
  }

  toggleTheme(): void {
    this.currentTheme.update((t) => (t === 'light' ? 'dark' : 'light'));
  }

  setTheme(theme: AppTheme): void {
    this.currentTheme.set(theme);
  }
}
