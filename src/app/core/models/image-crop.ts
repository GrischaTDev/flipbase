/** Ausschnitt im normalisierten Originalkoordinatensystem; Drehung um die Bildmitte. */
export interface ImageCrop {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly rotation: 0 | 90 | 180 | 270;
}
