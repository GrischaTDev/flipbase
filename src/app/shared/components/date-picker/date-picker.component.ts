import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  forwardRef,
  inject,
  input,
  model,
  signal,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import {
  LucideDynamicIcon,
  LucideCalendar as Calendar,
  LucideChevronLeft as ChevronLeft,
  LucideChevronRight as ChevronRight,
} from '@lucide/angular';

interface Tag {
  datum: string;
  zahl: number;
  ausserhalb: boolean;
  heute: boolean;
  gewaehlt: boolean;
}

/**
 * Datumsauswahl im Design der Anwendung.
 *
 * Das Fenster, das ein `input[type=date]` beim Anklicken oeffnet, zeichnet
 * der Browser selbst. Es laesst sich von einer Seite aus nicht gestalten -
 * weder Farben noch Schrift noch Abstaende. In einer dunklen Oberflaeche
 * steht dort ein weisser Kasten aus einer anderen Welt.
 *
 * Diese Komponente ersetzt ihn vollstaendig: ein Textfeld, das das Datum in
 * gewohnter Schreibweise zeigt, und ein selbst gezeichneter Monatskalender.
 * Nach aussen verhaelt sie sich wie ein Formularfeld und liefert wie zuvor
 * einen ISO-Wert (JJJJ-MM-TT), damit an den Diensten nichts zu aendern war.
 */
@Component({
  selector: 'app-date-picker',
  imports: [LucideDynamicIcon],
  templateUrl: './date-picker.component.html',
  host: {
    class: 'block relative',
    '(document:click)': 'beiKlickAusserhalb($event)',
    '(document:keydown.escape)': 'schliesse()',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => DatePickerComponent),
      multi: true,
    },
  ],
})
export class DatePickerComponent implements ControlValueAccessor {
  private readonly elementRef = inject(ElementRef);

  /** Datum als ISO-Zeichenkette (JJJJ-MM-TT) - dasselbe Format wie zuvor. */
  readonly value = model<string | null>(null);
  readonly feldId = input<string>('');
  readonly platzhalter = input<string>('TT.MM.JJJJ');

  readonly istOffen = signal<boolean>(false);
  readonly deaktiviert = signal<boolean>(false);
  /** Der Monat, der gerade im Kalender steht - unabhaengig vom gewaehlten Tag. */
  readonly angezeigterMonat = signal<Date>(new Date());

  readonly wochentage = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

  readonly monatsName = computed(() =>
    this.angezeigterMonat().toLocaleDateString('de-DE', { month: 'long', year: 'numeric' }),
  );

  readonly anzeige = computed(() => {
    const wert = this.value();
    if (!wert) return '';
    const d = this.ausIso(wert);
    // Mit fuehrenden Nullen: Ohne die Angaben liefert der Browser 1.2.2026
    // statt 01.02.2026, und die Feldbreite springt beim Blaettern.
    return d
      ? d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
      : '';
  });

  /**
   * Die Tage des Rasters - immer sechs volle Wochen.
   *
   * Feste Zeilenzahl, damit der Kalender beim Blaettern nicht in der Hoehe
   * springt. Die Woche beginnt am Montag, wie hierzulande ueblich.
   */
  readonly tage = computed<Tag[]>(() => {
    const monat = this.angezeigterMonat();
    const erster = new Date(monat.getFullYear(), monat.getMonth(), 1);
    const versatz = (erster.getDay() + 6) % 7;
    const start = new Date(erster);
    start.setDate(erster.getDate() - versatz);

    const heute = this.alsIso(new Date());
    const gewaehlt = this.value();
    const liste: Tag[] = [];

    for (let i = 0; i < 42; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const iso = this.alsIso(d);
      liste.push({
        datum: iso,
        zahl: d.getDate(),
        ausserhalb: d.getMonth() !== monat.getMonth(),
        heute: iso === heute,
        gewaehlt: iso === gewaehlt,
      });
    }
    return liste;
  });

  private beiAenderung: (wert: string | null) => void = () => undefined;
  private beiBeruehrung: () => void = () => undefined;

  writeValue(wert: string | null): void {
    this.value.set(wert);
    const d = wert ? this.ausIso(wert) : null;
    if (d) this.angezeigterMonat.set(new Date(d.getFullYear(), d.getMonth(), 1));
  }

  registerOnChange(fn: (wert: string | null) => void): void {
    this.beiAenderung = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.beiBeruehrung = fn;
  }

  setDisabledState(gesperrt: boolean): void {
    this.deaktiviert.set(gesperrt);
  }

  schalteUm(ereignis: Event): void {
    ereignis.stopPropagation();
    if (this.deaktiviert()) return;
    if (!this.istOffen()) {
      const d = this.value() ? this.ausIso(this.value()!) : new Date();
      if (d) this.angezeigterMonat.set(new Date(d.getFullYear(), d.getMonth(), 1));
    }
    this.istOffen.update((offen) => !offen);
  }

  schliesse(): void {
    if (this.istOffen()) {
      this.istOffen.set(false);
      this.beiBeruehrung();
    }
  }

  beiKlickAusserhalb(ereignis: MouseEvent): void {
    if (!this.elementRef.nativeElement.contains(ereignis.target as Node)) this.schliesse();
  }

  blaettere(monate: number): void {
    const m = this.angezeigterMonat();
    this.angezeigterMonat.set(new Date(m.getFullYear(), m.getMonth() + monate, 1));
  }

  waehle(tag: Tag): void {
    this.value.set(tag.datum);
    this.beiAenderung(tag.datum);
    this.schliesse();
  }

  waehleHeute(): void {
    const heute = this.alsIso(new Date());
    this.value.set(heute);
    this.beiAenderung(heute);
    this.schliesse();
  }

  /**
   * Wandelt eine Eingabe von Hand in ein Datum.
   *
   * Nimmt 1.2.2026 genauso wie 01.02.2026 - wer tippt, soll nicht auch noch
   * fuehrende Nullen setzen muessen.
   */
  beiEingabe(ereignis: Event): void {
    const roh = (ereignis.target as HTMLInputElement).value.trim();
    if (!roh) {
      this.value.set(null);
      this.beiAenderung(null);
      return;
    }
    const teile = roh.split('.');
    if (teile.length !== 3) return;
    const [t, m, j] = teile.map((x) => Number(x));
    if (!t || !m || !j) return;
    const d = new Date(j, m - 1, t);
    if (d.getDate() !== t || d.getMonth() !== m - 1) return;
    const iso = this.alsIso(d);
    this.value.set(iso);
    this.beiAenderung(iso);
    this.angezeigterMonat.set(new Date(d.getFullYear(), d.getMonth(), 1));
  }

  /** Ortszeit, nicht UTC: `toISOString()` haette je nach Zeitzone den Vortag geliefert. */
  private alsIso(d: Date): string {
    const monat = String(d.getMonth() + 1).padStart(2, '0');
    const tag = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${monat}-${tag}`;
  }

  private ausIso(wert: string): Date | null {
    const treffer = /^(\d{4})-(\d{2})-(\d{2})$/.exec(wert);
    if (!treffer) return null;
    return new Date(Number(treffer[1]), Number(treffer[2]) - 1, Number(treffer[3]));
  }

  protected readonly kalenderIcon = Calendar;
  protected readonly zurueckIcon = ChevronLeft;
  protected readonly weiterIcon = ChevronRight;
}
