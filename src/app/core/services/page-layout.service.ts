import { Injectable, signal } from '@angular/core';

export type PageWidth = 'narrow' | 'medium' | 'full';
const STORAGE_KEY = 'flipbase_page_width';

/** Dieselbe Inhaltsbreite gilt für alle Verwaltungsseiten. */
export function pageContentMaxWidth(width: PageWidth): string | null {
  if (width === 'narrow') return '64rem';
  if (width === 'full') return null;
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
