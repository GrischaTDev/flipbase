import {
  Directive,
  ElementRef,
  OnDestroy,
  afterNextRender,
  booleanAttribute,
  inject,
  input,
  output,
} from '@angular/core';

/**
 * Rüstet einen vorhandenen modalen Dialog um alles nach, was für Tastatur- und
 * Screenreader-Bedienung nötig ist:
 *
 * - `role="dialog"` und `aria-modal="true"`, damit Screenreader den Dialog als
 *   solchen ankündigen und den Inhalt dahinter ausblenden
 * - eine Fokus-Falle: Tab und Shift+Tab bleiben im Dialog, statt in die Seite
 *   dahinter zu wandern
 * - Escape schließt den Dialog
 * - der Fokus kehrt beim Schließen auf das auslösende Element zurück
 * - der Hintergrund lässt sich nicht scrollen, solange der Dialog offen ist
 *
 * Bewusst als Direktive und nicht als Hülle: So lassen sich die vorhandenen
 * Overlays mit einer Zeile nachrüsten, ohne ihr Layout anzufassen.
 *
 * Verwendung am **Hintergrund** des Dialogs, also am `fixed inset-0`-Element:
 *
 * ```html
 * <div class="fixed inset-0 …"
 *      appModalDialog
 *      dialogTitel="Neuen Einkauf erfassen"
 *      (dialogClose)="close.emit()">
 *   <div class="card …">…</div>
 * </div>
 * ```
 *
 * Ein Klick auf den Hintergrund schließt den Dialog nur, wenn
 * `schliesstBeiKlickAussen` gesetzt ist. Standard ist **aus**, damit ein
 * Fehlklick neben einem Formular keine Eingaben verwirft.
 *
 * Zuvor lag diese Logik in den Templates: Der Hintergrund trug `(click)` zum
 * Schließen und der innere Kasten `(click)="$event.stopPropagation()"`, damit
 * Klicks im Dialog nicht durchschlagen. Beides waren aus Sicht der
 * Barrierefreiheit Klick-Handler auf nicht bedienbaren Elementen.
 */
@Directive({
  selector: '[appModalDialog]',
  host: {
    role: 'dialog',
    'aria-modal': 'true',
    tabindex: '-1',
    '[attr.aria-label]': 'dialogTitel() || null',
    '(click)': 'onHintergrundKlick($event)',
    '(document:keydown.escape)': 'onEscape($event)',
    '(document:keydown.tab)': 'onTab($event)',
    '(document:keydown.shift.tab)': 'onTab($event)',
  },
})
export class ModalDialogDirective implements OnDestroy {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** Bezeichnung des Dialogs für Screenreader. */
  readonly dialogTitel = input<string>('');

  /** Ob Escape den Dialog schließt. Bei Dialogen mit Datenverlustgefahr abschaltbar. */
  readonly schliesstMitEscape = input<boolean>(true);

  /**
   * Ob ein Klick auf den Hintergrund den Dialog schließt. Standard: nein.
   * Bei Formulardialogen bewusst aus, damit ein Fehlklick nichts verwirft.
   */
  readonly schliesstBeiKlickAussen = input(false, { transform: booleanAttribute });

  readonly dialogClose = output<void>();

  /** Element, das vor dem Öffnen den Fokus hatte. */
  private readonly zuvorFokussiert = (document.activeElement as HTMLElement) ?? null;

  /** Vorheriger Wert von `overflow`, für die Wiederherstellung. */
  private readonly vorherigesOverflow = document.body.style.overflow;

  constructor() {
    document.body.style.overflow = 'hidden';
    afterNextRender(() => this.fokussiereErstesElement());
  }

  ngOnDestroy(): void {
    document.body.style.overflow = this.vorherigesOverflow;
    // Fokus dorthin zurückgeben, wo er herkam – sonst springt er an den
    // Seitenanfang und der Nutzer verliert die Orientierung.
    this.zuvorFokussiert?.focus?.();
  }

  /**
   * Schließt bei einem Klick auf den Hintergrund. Klicks im Dialog haben ein
   * inneres Element als Ziel und lösen deshalb nicht aus - ein
   * `stopPropagation` in den Templates ist dadurch überflüssig.
   */
  protected onHintergrundKlick(event: Event): void {
    if (!this.schliesstBeiKlickAussen()) return;
    if (event.target !== this.host.nativeElement) return;
    this.dialogClose.emit();
  }

  protected onEscape(event: Event): void {
    if (!this.schliesstMitEscape()) return;
    event.stopPropagation();
    this.dialogClose.emit();
  }

  /** Hält den Tastaturfokus innerhalb des Dialogs. */
  protected onTab(event: Event): void {
    const tastatur = event as KeyboardEvent;
    const elemente = this.fokussierbareElemente();
    if (elemente.length === 0) return;

    const erstes = elemente[0];
    const letztes = elemente[elemente.length - 1];
    const aktiv = document.activeElement;
    const imDialog = this.host.nativeElement.contains(aktiv);

    if (tastatur.shiftKey) {
      if (aktiv === erstes || !imDialog) {
        tastatur.preventDefault();
        letztes.focus();
      }
    } else if (aktiv === letztes || !imDialog) {
      tastatur.preventDefault();
      erstes.focus();
    }
  }

  private fokussierbareElemente(): HTMLElement[] {
    const auswahl = [
      'a[href]',
      'button:not([disabled])',
      'input:not([disabled]):not([type="hidden"])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      '[tabindex]:not([tabindex="-1"])',
    ].join(',');

    return Array.from(this.host.nativeElement.querySelectorAll<HTMLElement>(auswahl)).filter(
      (el) => el.offsetParent !== null,
    );
  }

  private fokussiereErstesElement(): void {
    const elemente = this.fokussierbareElemente();
    // Reine Schließen-Knöpfe überspringen, damit der Fokus auf dem ersten
    // inhaltlichen Element landet – meist das erste Eingabefeld.
    const ziel =
      elemente.find(
        (el) => !/schliess|close|abbrechen/i.test(el.getAttribute('aria-label') ?? ''),
      ) ?? elemente[0];
    (ziel ?? this.host.nativeElement).focus?.();
  }
}
