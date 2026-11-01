import { Injectable, signal } from '@angular/core';

export type PageWidth = 'narrow' | 'medium' | 'full';
const STORAGE_KEY = 'flipbase_page_width';
const WIDESCREEN_STORAGE_KEY = 'flipbase_widescreen';

/** Dieselbe Inhaltsbreite gilt für alle Verwaltungsseiten. */
export function pageContentMaxWidth(width: PageWidth): string | null {
  if (width === 'narrow') return '64rem';
  if (width === 'full') return null;
  return '80rem';
}

@Injectable({ providedIn: 'root' })
export class PageLayoutService {
  private readonly selectedWidth = signal<PageWidth>(this.readWidth());
  private readonly widescreenEnabled = signal(this.readWidescreen());
  readonly width = this.selectedWidth.asReadonly();
  /** Für sehr breite Bildschirme: volle Breite und mehrere Bereiche nebeneinander. */
  readonly widescreen = this.widescreenEnabled.asReadonly();
  readonly options = ['narrow', 'medium', 'full'] as const;

  setWidth(width: PageWidth): void {
    this.selectedWidth.set(width);
    // Eine bewusst gewählte Breite beendet den Widescreen-Modus.
    this.setWidescreen(false);
    this.store(STORAGE_KEY, width);
  }

  setWidescreen(enabled: boolean): void {
    this.widescreenEnabled.set(enabled);
    this.store(WIDESCREEN_STORAGE_KEY, String(enabled));
  }

  private store(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
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

  private readWidescreen(): boolean {
    try {
      return localStorage.getItem(WIDESCREEN_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  }
}
