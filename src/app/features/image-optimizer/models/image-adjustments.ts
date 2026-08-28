/**
 * Farb- und Belichtungswerte eines Bildes.
 *
 * Die Werte werden **nie** ins Bild gerechnet, sondern erst beim Rendern
 * angewandt. So bleiben sie jederzeit ruecknehmbar, und mehrfaches Verstellen
 * kostet keine Qualitaet - anders als beim Drehen, wo jede Runde neu als JPEG
 * kodiert und das Bild sichtbar weicher wird.
 */
export interface Adjustments {
  /** 0.5 bis 1.5, Standard 1. */
  readonly brightness: number;
  /** 0.5 bis 1.5, Standard 1. */
  readonly contrast: number;
  /** 0 bis 2, Standard 1. */
  readonly saturation: number;
  /** 0 bis 1, Standard 0. */
  readonly grayscale: number;
}
