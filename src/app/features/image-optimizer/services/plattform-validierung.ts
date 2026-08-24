import {
  Groesse,
  PlattformProfil,
  ProfilId,
  pruefeMindestgroesse,
  Rechteck,
} from '../models/plattform-profile';
import { planeAusgabe } from './bild-renderer';

export interface AusgabePruefung extends Groesse {
  readonly istGueltig: boolean;
}

export interface ZuPruefendesBild {
  readonly name: string;
  readonly naturGroesse: Groesse | null;
  readonly ausschnitte: Partial<Record<ProfilId, Rechteck>>;
}

export interface Aufloesungsproblem extends Groesse {
  readonly bildName: string;
  readonly plattformName: string;
}

/** Prueft die echte, nicht hochskalierte Exportgroesse einer Plattformfassung. */
export function pruefeAusgabe(
  ausschnitt: Rechteck | null,
  bildgroesse: Groesse | null,
  plattform: PlattformProfil,
): AusgabePruefung | null {
  const quelle =
    ausschnitt ??
    (bildgroesse ? { x: 0, y: 0, breite: bildgroesse.breite, hoehe: bildgroesse.hoehe } : null);
  if (!quelle) return null;

  const plan = planeAusgabe(quelle, plattform);
  const groesse = { breite: plan.breite, hoehe: plan.hoehe };
  return { ...groesse, istGueltig: pruefeMindestgroesse(groesse, plattform) };
}

/** Findet das erste Bild, das eine gewaehlte Plattform nicht annehmen wuerde. */
export function findeAufloesungsproblem(
  bilder: readonly ZuPruefendesBild[],
  profile: readonly PlattformProfil[],
): Aufloesungsproblem | null {
  for (const bild of bilder) {
    for (const plattform of profile) {
      const pruefung = pruefeAusgabe(
        bild.ausschnitte[plattform.id] ?? null,
        bild.naturGroesse,
        plattform,
      );
      if (pruefung && !pruefung.istGueltig) {
        return {
          bildName: bild.name,
          plattformName: plattform.name,
          breite: pruefung.breite,
          hoehe: pruefung.hoehe,
        };
      }
    }
  }
  return null;
}
