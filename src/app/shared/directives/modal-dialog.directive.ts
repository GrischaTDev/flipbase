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
  private static readonly activeDialogs: ModalDialogDirective[] = [];
  private static readonly backgroundLocks = new Map<HTMLElement, boolean>();
  private static originalOverflow = '';
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

  constructor() {
    if (ModalDialogDirective.activeDialogs.length === 0) {
      ModalDialogDirective.originalOverflow = document.body.style.overflow;
    }
    ModalDialogDirective.activeDialogs.push(this);
    document.body.style.overflow = 'hidden';
    afterNextRender(() => {
      ModalDialogDirective.refreshBackground();
      this.fokussiereErstesElement();
    });
  }

  ngOnDestroy(): void {
    const wasTopDialog = this.isTopDialog();
    const dialogs = ModalDialogDirective.activeDialogs;
    dialogs.splice(dialogs.indexOf(this), 1);
    ModalDialogDirective.refreshBackground();
    if (dialogs.length === 0) document.body.style.overflow = ModalDialogDirective.originalOverflow;
    // Fokus dorthin zurückgeben, wo er herkam – sonst springt er an den
    // Seitenanfang und der Nutzer verliert die Orientierung.
    if (wasTopDialog) this.zuvorFokussiert?.focus?.();
  }

  /** Nur Geschwister entlang des Dialogpfads sperren, niemals den Dialog selbst. */
  private static refreshBackground(): void {
    for (const [element, wasInert] of this.backgroundLocks) element.inert = wasInert;
    this.backgroundLocks.clear();
    const active = this.activeDialogs.at(-1);
    if (!active) return;
    let branch: HTMLElement = active.host.nativeElement;
    while (branch.parentElement) {
      for (const sibling of Array.from(branch.parentElement.children)) {
        if (!(sibling instanceof HTMLElement) || sibling === branch) continue;
        const locks = ModalDialogDirective.backgroundLocks;
        locks.set(sibling, sibling.inert);
        sibling.inert = true;
      }
      branch = branch.parentElement;
      if (branch === document.body) break;
    }
  }

  private isTopDialog(): boolean {
    return ModalDialogDirective.activeDialogs.at(-1) === this;
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
    if (!this.isTopDialog()) return;
    if (!this.schliesstMitEscape()) return;
    event.stopPropagation();
    this.dialogClose.emit();
  }

  /** Hält den Tastaturfokus innerhalb des Dialogs. */
  protected onTab(event: Event): void {
    if (!this.isTopDialog()) return;
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
