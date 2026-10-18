import { Injectable, signal } from '@angular/core';

export type PageWidth = 'narrow' | 'medium' | 'full';
const STORAGE_KEY = 'flipbase_page_width';
const WIDE_PAGES = new Set(['/dashboard', '/purchases', '/catalog', '/sales']);

/** Die Tabellenübersichten bleiben nur im Standardlayout breit. */
export function pageContentMaxWidth(width: PageWidth, url: string): string | null {
  if (width === 'narrow') return '64rem';
  if (width === 'full' || WIDE_PAGES.has(url.split(/[?#]/, 1)[0])) return null;
  return '80rem';
}

@Injectable({ providedIn: 'root' })
export class PageLayoutService {
  private readonly selectedWidth = signal<PageWidth>(this.readWidth());
  readonly width = this.selectedWidth.asReadonly();
  readonly options = ['narrow', 'medium', 'full'] as const;

  setWidth(width: PageWidth): void {
    this.selectedWidth.set(width);
    try {
      localStorage.setItem(STORAGE_KEY, width);
    } catch {
      // Bei gesperrtem Speicher gilt die Auswahl für die laufende Sitzung.
    }
  }

  private readWidth(): PageWidth {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'narrow' || stored === 'medium' || stored === 'full') return stored;
    } catch {
      // Ohne Browserspeicher gilt das Standardlayout.
    }
    return 'medium';
  }
}
