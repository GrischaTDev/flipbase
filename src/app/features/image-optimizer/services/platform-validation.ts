import {
  Size,
  PlatformProfile,
  PlatformId,
  meetsMinimumSize,
  Rect,
} from '../models/platform-profile';
import { planOutput } from './image-renderer';

export interface OutputCheck extends Size {
  readonly isValid: boolean;
}

export interface CheckableImage {
  readonly name: string;
  readonly naturGroesse: Size | null;
  readonly ausschnitte: Partial<Record<PlatformId, Rect>>;
}

export interface ResolutionIssue extends Size {
  readonly imageName: string;
  readonly platformName: string;
}

/** Prueft die echte, nicht hochskalierte Exportgroesse einer Plattformfassung. */
export function checkOutput(
  ausschnitt: Rect | null,
  bildgroesse: Size | null,
  plattform: PlatformProfile,
): OutputCheck | null {
  const quelle =
    ausschnitt ??
    (bildgroesse ? { x: 0, y: 0, width: bildgroesse.width, height: bildgroesse.height } : null);
  if (!quelle) return null;

  const plan = planOutput(quelle, plattform);
  const groesse = { width: plan.width, height: plan.height };
  return { ...groesse, isValid: meetsMinimumSize(groesse, plattform) };
}

/** Findet das erste Bild, das eine gewaehlte Plattform nicht annehmen wuerde. */
export function findResolutionIssue(
  bilder: readonly CheckableImage[],
  profile: readonly PlatformProfile[],
): ResolutionIssue | null {
  for (const bild of bilder) {
    for (const plattform of profile) {
      const pruefung = checkOutput(
        bild.ausschnitte[plattform.id] ?? null,
        bild.naturGroesse,
        plattform,
      );
      if (pruefung && !pruefung.isValid) {
        return {
          imageName: bild.name,
          platformName: plattform.name,
          width: pruefung.width,
          height: pruefung.height,
        };
      }
    }
  }
  return null;
}
