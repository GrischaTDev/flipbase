import {
  ChangeDetectionStrategy,
  Component,
  computed,
  forwardRef,
  input,
  model,
  signal,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { LucideDynamicIcon, LucideMinus as Minus, LucidePlus as Plus } from '@lucide/angular';

/**
 * Zahlenfeld mit eigenen Schaltflaechen zum Hoch- und Runterzaehlen.
 *
 * Die Pfeilchen, die der Browser an ein `input[type=number]` haengt, zeichnet
 * er selbst - in seinen Farben, mit seiner Groesse, und auf dem Handy gar
 * nicht. In einer dunklen Oberflaeche fallen sie als helle Fremdkoerper auf.
 * Sie sind deshalb ausgeblendet (siehe styles.css), und diese Komponente
 * uebernimmt ihre Aufgabe im Design der Anwendung.
 *
 * Die Schaltflaechen sind bewusst gross genug fuer den Finger und tragen
 * `tabindex=-1`: Wer mit der Tastatur arbeitet, zaehlt mit den Pfeiltasten
 * hoch und runter, ohne sich durch zwei zusaetzliche Halte zu klicken.
 */
@Component({
  selector: 'app-number-input',
  imports: [LucideDynamicIcon],
  templateUrl: './number-input.component.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => NumberInputComponent),
      multi: true,
    },
  ],
})
export class NumberInputComponent implements ControlValueAccessor {
  readonly value = model<number | null>(null);
  readonly platzhalter = input<string>('');
  readonly schritt = input<number>(1);
  readonly minimum = input<number | null>(null);
  readonly maximum = input<number | null>(null);
  readonly einheit = input<string>('');
  readonly feldId = input<string>('');
  /** Fuer Felder ohne sichtbares Label - landet als aria-label am Eingabefeld. */
  readonly beschriftung = input<string>('');
  /** Rechtsbuendig und in Ziffernbreite - fuer Betraege. */
  readonly alsBetrag = input<boolean>(false);

  readonly deaktiviert = signal<boolean>(false);

  readonly amMinimum = computed(() => {
    const min = this.minimum();
    return min !== null && (this.value() ?? 0) <= min;
  });

  readonly amMaximum = computed(() => {
    const max = this.maximum();
    return max !== null && (this.value() ?? 0) >= max;
  });

  private beiAenderung: (wert: number | null) => void = () => undefined;
  private beiBeruehrung: () => void = () => undefined;

  writeValue(wert: number | null): void {
    this.value.set(wert);
  }

  registerOnChange(fn: (wert: number | null) => void): void {
    this.beiAenderung = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.beiBeruehrung = fn;
  }

  setDisabledState(gesperrt: boolean): void {
    this.deaktiviert.set(gesperrt);
  }

  onEingabe(ereignis: Event): void {
    const roh = (ereignis.target as HTMLInputElement).value;
    this.setze(roh === '' ? null : Number(roh));
  }

  onVerlassen(): void {
    this.beiBeruehrung();
  }

  zaehleHoch(): void {
    this.setze(this.begrenze((this.value() ?? 0) + this.schritt()));
  }

  zaehleRunter(): void {
    this.setze(this.begrenze((this.value() ?? 0) - this.schritt()));
  }

  /**
   * Haelt den Wert in den Grenzen und raeumt Rundungsreste auf.
   *
   * Ohne das Runden wird aus 0.1 + 0.2 die bekannte 0.30000000000000004 -
   * bei einem Feld fuer Betraege waere das sofort sichtbar.
   */
  private begrenze(wert: number): number {
    const stellen = (String(this.schritt()).split('.')[1] || '').length;
    let ergebnis = Number(wert.toFixed(stellen));
    const min = this.minimum();
    const max = this.maximum();
    if (min !== null) ergebnis = Math.max(min, ergebnis);
    if (max !== null) ergebnis = Math.min(max, ergebnis);
    return ergebnis;
  }

  private setze(wert: number | null): void {
    this.value.set(wert);
    this.beiAenderung(wert);
  }

  protected readonly plusIcon = Plus;
  protected readonly minusIcon = Minus;
}
