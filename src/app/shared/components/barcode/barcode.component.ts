import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  effect,
  input,
  viewChild,
} from '@angular/core';
import JsBarcode from 'jsbarcode';

/**
 * Zeichnet einen echten, scannbaren Barcode (Code 128).
 *
 * **Warum es diese Komponente gibt:** Auf dem Etikettendruck standen zuvor
 * zwölf fest verdrahtete schwarze Balken mit dem Kommentar "Vector Barcode
 * Simulation" - bei jedem Artikel dieselben. Das sah aus wie ein Barcode und
 * war Dekoration; kein Scanner konnte damit etwas anfangen, obwohl die
 * Anwendung einen Barcode-Scanner mitbringt.
 *
 * Die Kodierung übernimmt JsBarcode statt eigener Rechnerei: Ein selbst
 * gebauter Code 128 ließe sich hier nicht gegenprüfen - dem Browser dieser
 * Entwicklungsumgebung fehlt `BarcodeDetector`, also könnte niemand belegen,
 * dass das Ergebnis wirklich lesbar ist. Eine erprobte Bibliothek ist an
 * dieser Stelle ehrlicher als eine ungeprüfte eigene Umsetzung.
 */
@Component({
  selector: 'app-barcode',
  template: '<svg #zeichenflaeche class="w-full h-full"></svg>',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BarcodeComponent {
  /** Der zu kodierende Wert, üblicherweise die interne Artikelnummer. */
  readonly wert = input.required<string>();

  /** Höhe der Balken in Pixeln. */
  readonly hoehe = input<number>(28);

  private readonly zeichenflaeche = viewChild.required<ElementRef<SVGElement>>('zeichenflaeche');

  constructor() {
    effect(() => {
      const wert = this.wert();
      const ziel = this.zeichenflaeche().nativeElement;

      if (!wert) {
        ziel.replaceChildren();
        return;
      }

      try {
        JsBarcode(ziel, wert, {
          format: 'CODE128',
          // Die Nummer steht auf dem Etikett bereits als Text - hier waere sie
          // doppelt und wuerde nur Platz kosten.
          displayValue: false,
          height: this.hoehe(),
          width: 1.4,
          margin: 0,
          // Fest und nicht aus dem Design: Ein Strichcode wird optisch
          // gelesen und braucht den vollen Schwarz-Weiss-Kontrast.
          background: '#ffffff',
          lineColor: '#000000',
        });
      } catch {
        // Ein nicht kodierbarer Wert darf den Etikettendruck nicht sprengen.
        ziel.replaceChildren();
      }
    });
  }
}
