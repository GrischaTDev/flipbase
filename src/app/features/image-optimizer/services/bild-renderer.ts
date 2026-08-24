import { PlattformProfil, Rechteck } from '../models/plattform-profile';
import { leiteAb } from './zuschnitt';

/** Vollständiger, von Vorschau und Export gemeinsam verwendeter Renderplan. */
export interface RenderPlan {
  readonly quelle: Rechteck;
  readonly breite: number;
  readonly hoehe: number;
}

/**
 * Plant die Plattformausgabe, ohne jemals zusätzliche Pixel zu erfinden.
 * Große Quellen werden auf die Plattformgrenze verkleinert, kleine behalten
 * ihre natürliche Auflösung.
 */
export function planeAusgabe(ausschnitt: Rechteck, plattform: PlattformProfil): RenderPlan {
  const quelle = leiteAb(ausschnitt, plattform.exportVerhaeltnis);
  const faktor = Math.min(
    1,
    plattform.exportBreite / quelle.breite,
    plattform.exportHoehe / quelle.hoehe,
  );

  return {
    quelle,
    breite: Math.max(1, Math.round(quelle.breite * faktor)),
    hoehe: Math.max(1, Math.round(quelle.hoehe * faktor)),
  };
}

/** Rendert einen Plan als JPEG. Diese Funktion ist die einzige Canvas-Ausgabe für Vorschau und Export. */
export async function rendereBild(
  bild: CanvasImageSource,
  plan: RenderPlan,
  qualitaet = 0.92,
): Promise<Blob> {
  const flaeche = document.createElement('canvas');
  flaeche.width = plan.breite;
  flaeche.height = plan.hoehe;

  const stift = flaeche.getContext('2d');
  if (!stift) throw new Error('Der Browser stellt keine Zeichenfläche bereit.');

  stift.fillStyle = '#ffffff';
  stift.fillRect(0, 0, flaeche.width, flaeche.height);
  stift.imageSmoothingEnabled = true;
  stift.imageSmoothingQuality = 'high';
  stift.drawImage(
    bild,
    plan.quelle.x,
    plan.quelle.y,
    plan.quelle.breite,
    plan.quelle.hoehe,
    0,
    0,
    plan.breite,
    plan.hoehe,
  );

  return new Promise<Blob>((aufloesen, ablehnen) => {
    flaeche.toBlob(
      (blob) =>
        blob ? aufloesen(blob) : ablehnen(new Error('Das Bild ließ sich nicht erzeugen.')),
      'image/jpeg',
      qualitaet,
    );
  });
}
