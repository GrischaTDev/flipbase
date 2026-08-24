import { signal } from '@angular/core';
import { ProfilId } from '../models/plattform-profile';

export type FotoguideTab = 'aufnehmen' | ProfilId;

/** Kleiner, unabhaengig testbarer UI-Zustand fuer den Fotoguide. */
export class FotoguideZustand {
  readonly istOffen = signal(false);
  readonly aktiverTab = signal<FotoguideTab>('aufnehmen');

  oeffnen(tab: FotoguideTab = 'aufnehmen'): void {
    this.aktiverTab.set(tab);
    this.istOffen.set(true);
  }

  schliessen(): void {
    this.istOffen.set(false);
  }

  waehleTab(tab: FotoguideTab): void {
    this.aktiverTab.set(tab);
  }
}
