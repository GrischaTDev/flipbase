import { Crops } from '../services/crops';
import { Adjustments } from './image-adjustments';
import { Rect, Size } from './platform-profile';

/** Ein hochgeladenes Bild mit seinen plattformspezifischen Zuschnitten. */
export interface OptimizerImage {
  readonly id: string;
  readonly file: File;
  readonly dataUrl: string;
  /** Zuschnitt je Plattform, in Originalpixeln. Leer, solange nichts gesetzt wurde. */
  readonly crops: Crops;
  /**
   * Viertelumdrehungen im Uhrzeigersinn, bereits in `dataUrl` eingebrannt.
   * `dataUrl` zeigt also immer das fertig gedrehte Bild.
   */
  readonly rotation: 0 | 1 | 2 | 3;
  /** Hinweis, falls der Cropper dieses Bild beim Lesen nicht anzeigen konnte. */
  readonly loadError: string | null;
  /** Groesse von `dataUrl` in Originalpixeln. Null, solange unbekannt. */
  readonly naturalSize: Size | null;
  /**
   * Ob der Nutzer dieses Bild bereits im Editor gesehen hat. Bewusst nicht aus
   * den Zuschnitten abgeleitet: Der Cropper meldet den ersten Zuschnitt schon
   * beim Laden, und `setCrop` fuellt alle gewaehlten Plattformen mit ab - ein
   * daran haengender Marker waere sofort nach dem Anklicken gesetzt.
   */
  readonly reviewed: boolean;
  /**
   * Farb- und Belichtungswerte. Werden erst beim Rendern angewandt und nie
   * in `dataUrl` gerechnet - so bleibt Zuruecksetzen verlustfrei.
   */
  readonly adjustments: Adjustments;
}

/** Das volle Bild als Ersatz fuer Plattformen ohne eigenen Zuschnitt. */
export function fullImageRect(image: OptimizerImage): Rect | null {
  if (!image.naturalSize) return null;
  return { x: 0, y: 0, width: image.naturalSize.width, height: image.naturalSize.height };
}
