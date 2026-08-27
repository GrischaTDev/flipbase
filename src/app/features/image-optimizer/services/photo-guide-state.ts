import { signal } from '@angular/core';
import { PlatformId } from '../models/platform-profile';

export type PhotoGuideTab = 'aufnehmen' | PlatformId;

/** Kleiner, unabhaengig testbarer UI-Zustand fuer den Fotoguide. */
export class PhotoGuideState {
  readonly isOpen = signal(false);
  readonly activeTab = signal<PhotoGuideTab>('aufnehmen');

  open(tab: PhotoGuideTab = 'aufnehmen'): void {
    this.activeTab.set(tab);
    this.isOpen.set(true);
  }

  close(): void {
    this.isOpen.set(false);
  }

  selectTab(tab: PhotoGuideTab): void {
    this.activeTab.set(tab);
  }
}
