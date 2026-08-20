import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Der Demo-Modus verspricht auf der Anmeldeseite ausdruecklich:
 * "Es besteht kein Zugriff auf Serverdaten."
 *
 * Diese Zusage war lange falsch. Die Absicherung pruefte, ob eine Kennung mit
 * "demo-" beginnt - die Demo-Workspaces heissen aber ws-1, ws-2 und ws-3, und
 * Demo-Artikel item-demo-1. Keine einzige Kennung erfuellte die Bedingung,
 * wodurch 46 Pruefungen in 16 Diensten wirkungslos waren. Zwei weitere Dienste
 * hatten ueberhaupt keine.
 *
 * Der Fehler war im Betrieb unsichtbar: Die Anfragen liefen einfach mit, und
 * ohne erreichbaren Server fielen sie nicht auf. Deshalb diese strukturelle
 * Pruefung statt eines Verhaltenstests - sie greift auch bei Diensten, die es
 * heute noch gar nicht gibt.
 */
const DIENSTE_VERZEICHNIS = join(process.cwd(), 'src', 'app', 'core', 'services');

function dienstDateien(): string[] {
  return readdirSync(DIENSTE_VERZEICHNIS).filter(
    (name) => name.endsWith('.service.ts') && !name.endsWith('.spec.ts'),
  );
}

describe('Isolation des Demo-Modus', () => {
  it('jeder Dienst mit Datenbankzugriff kennt den Demo-Modus', () => {
    const ohneSchutz = dienstDateien().filter((name) => {
      const inhalt = readFileSync(join(DIENSTE_VERZEICHNIS, name), 'utf-8');
      return inhalt.includes(".from('") && !inhalt.includes('isDemoMode');
    });

    expect(ohneSchutz, `Dienste ohne Demo-Pruefung: ${ohneSchutz.join(', ')}`).toEqual([]);
  });

  it('niemand sichert sich ueber das Praefix "demo-" ab', () => {
    const mitPraefixpruefung = dienstDateien().filter((name) =>
      readFileSync(join(DIENSTE_VERZEICHNIS, name), 'utf-8').includes("startsWith('demo-')"),
    );

    expect(
      mitPraefixpruefung,
      `Diese Dienste pruefen wieder auf ein Kennungs-Praefix statt auf isDemoMode: ` +
        mitPraefixpruefung.join(', '),
    ).toEqual([]);
  });

  it('die Demo-Kennungen beginnen tatsaechlich nicht mit "demo-"', () => {
    // Belegt, warum die alte Pruefung nicht greifen konnte.
    const inhalt = readFileSync(join(DIENSTE_VERZEICHNIS, 'mock-data-store.service.ts'), 'utf-8');
    const demoWorkspace = /const DEMO_WS_ID = '([^']+)'/.exec(inhalt)?.[1];

    expect(demoWorkspace).toBeDefined();
    expect(demoWorkspace?.startsWith('demo-')).toBe(false);
  });
});
