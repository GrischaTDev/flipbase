import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  input,
  model,
  signal,
} from '@angular/core';
import { clampRatio, ratioFromKey, ratioFromPointer, readStoredRatio } from './split-pane-ratio';

/**
 * Zwei Spalten mit einem Griff dazwischen, den der Nutzer verschieben kann.
 *
 * Liegt in `shared/`, nicht im Bildoptimierer: Der Trenner weiss nichts von
 * Bildern, und im Projekt gab es bisher nur feste Verhaeltnisse
 * (`two-column-layout`).
 *
 * Unterhalb von `lg` faellt das Gitter einspaltig und der Griff verschwindet
 * aus dem Baum - auf einem schmalen Bildschirm gibt es nichts zu verteilen,
 * und ein unbedienbarer Griff in der Tabreihenfolge waere ein Hindernis.
 */
@Component({
  selector: 'app-split-pane',
  templateUrl: './split-pane.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'block w-full',
  },
})
export class SplitPaneComponent {
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly destroyRef = inject(DestroyRef);

  /** Anteil der linken Spalte in Prozent. */
  readonly ratio = model<number>(50);

  /** Schluessel fuer den Browserspeicher. Leer heisst: nicht merken. */
  readonly storageKey = input<string>('');
  readonly minRatio = input<number>(25);
  readonly maxRatio = input<number>(75);
  readonly leftLabel = input.required<string>();
  readonly rightLabel = input.required<string>();

  /** Waehrend einer Ziehbewegung; schaltet die Textauswahl ab. */
  readonly isDragging = signal(false);

  /** Ab hier lohnt sich das Verteilen; darunter wird gestapelt. */
  protected readonly isWide = signal(false);

  readonly columns = computed(() => (this.isWide() ? `${this.ratio()}% 0.75rem 1fr` : '1fr'));

  readonly handleLabel = computed(
    () => `Breite von ${this.leftLabel()} und ${this.rightLabel()} verschieben`,
  );

  constructor() {
    const stored = readStoredRatio(this.read(), this.minRatio(), this.maxRatio());
    if (stored !== null) this.ratio.set(stored);

    afterNextRender(() => {
      const query = window.matchMedia('(min-width: 1024px)');
      const update = (matches: boolean): void => this.isWide.set(matches);
      update(query.matches);

      const listener = (event: MediaQueryListEvent): void => update(event.matches);
      query.addEventListener('change', listener);
      this.destroyRef.onDestroy(() => query.removeEventListener('change', listener));
    });
  }

  onKeydown(event: KeyboardEvent): void {
    const next = ratioFromKey(
      event.key,
      this.ratio(),
      event.shiftKey,
      this.minRatio(),
      this.maxRatio(),
    );
    // null heisst: geht den Trenner nichts an. Das Ereignis bleibt
    // unangetastet, sonst kaeme man mit Tab nicht mehr heraus.
    if (next === null) return;

    event.preventDefault();
    this.apply(next);
  }

  onPointerDown(event: PointerEvent): void {
    // Der Zeiger wird eingefangen, damit das Ziehen auch dann weiterlaeuft,
    // wenn die Maus den schmalen Griff verlaesst - und beim Loslassen
    // ausserhalb des Fensters sauber endet.
    (event.target as Element).setPointerCapture(event.pointerId);
    this.isDragging.set(true);
  }

  onPointerMove(event: PointerEvent): void {
    if (!this.isDragging()) return;

    const bounds = (this.host.nativeElement as HTMLElement).getBoundingClientRect();
    this.apply(
      ratioFromPointer(event.clientX, bounds.left, bounds.width, this.minRatio(), this.maxRatio()),
    );
  }

  onPointerUp(event: PointerEvent): void {
    if (!this.isDragging()) return;

    (event.target as Element).releasePointerCapture(event.pointerId);
    this.isDragging.set(false);
  }

  /** Doppelklick stellt die Mitte wieder her - schneller als zurueckzuziehen. */
  onDoubleClick(): void {
    this.apply(clampRatio(50, this.minRatio(), this.maxRatio()));
  }

  private apply(value: number): void {
    this.ratio.set(value);
    this.write(String(value));
  }

  /**
   * Der Zugriff auf den Browserspeicher ist gekapselt und faengt jeden Fehler
   * ab: In einem privaten Fenster wirft schon das Lesen, und ein Trenner darf
   * daran nicht die ganze Seite mitreissen.
   */
  private read(): string | null {
    const key = this.storageKey();
    if (!key) return null;
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  private write(value: string): void {
    const key = this.storageKey();
    if (!key) return;
    try {
      localStorage.setItem(key, value);
    } catch {
      // Ohne Speicher bleibt die Position eben nur fuer diese Sitzung stehen.
    }
  }
}
