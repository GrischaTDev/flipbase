import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';

/**
 * Prüft, dass jedes `formControlName` im Template auch ein Feld im Formular hat.
 *
 * **Warum es diesen Test gibt:** Im Verkaufsformular hießen vier Felder im
 * Template anders als im Formular — `platform_fees` statt `platform_fee`,
 * `shipping_costs` statt `shipping_cost`, dazu `payment_fees` und `notes`.
 *
 * Angular meldet das nur zur Laufzeit in der Browser-Konsole und bricht dann
 * das Rendern des restlichen Formulars ab. Übersetzung, Typprüfung, Lint und
 * Build waren grün. Sichtbar war es nur daran, dass die Beschriftung der
 * Speichern-Schaltfläche fehlte — und daran, dass jeder erfasste Verkauf
 * Plattformgebühr, Versandkosten und Zahlungsgebühren mit 0 speicherte. Bei
 * einem eBay-Verkauf fehlen damit rund elf Prozent auf der Kostenseite, und
 * Gewinn, ROI und alle Auswertungen darauf sind zu hoch.
 *
 * Gefunden wurde das durch Zufall beim Ausprobieren. Dieser Test macht daraus
 * eine Prüfung, die bei jedem Lauf greift.
 */
describe('Formularfelder in Templates', () => {
  const wurzel = join(process.cwd(), 'src', 'app');

  /** Alle Templates unterhalb von src/app einsammeln. */
  function templates(verzeichnis: string): string[] {
    const gefunden: string[] = [];
    for (const eintrag of readdirSync(verzeichnis, { withFileTypes: true })) {
      const pfad = join(verzeichnis, eintrag.name);
      if (eintrag.isDirectory()) {
        gefunden.push(...templates(pfad));
      } else if (eintrag.name.endsWith('.html')) {
        gefunden.push(pfad);
      }
    }
    return gefunden;
  }

  /**
   * Die im Formular angelegten Felder.
   *
   * Bewusst über den ganzen Quelltext und nicht nur über eine FormGroup:
   * Verschachtelte Gruppen zählen mit, und ein Feld zu viel in dieser Menge
   * führt nie zu einem falschen Alarm.
   */
  function angelegteFelder(quelltext: string): Set<string> {
    return new Set(
      [...quelltext.matchAll(/([a-zA-Z_$][\w$]*)\s*:\s*new FormControl/g)].map((t) => t[1]),
    );
  }

  function verwendeteFelder(template: string): Set<string> {
    return new Set([...template.matchAll(/formControlName="([^"]+)"/g)].map((t) => t[1]));
  }

  const geprueft: { datei: string; fehlend: string[] }[] = [];

  for (const templatePfad of templates(wurzel)) {
    const komponente = join(dirname(templatePfad), basename(templatePfad, '.html') + '.ts');
    if (!existsSync(komponente)) continue;

    const quelltext = readFileSync(komponente, 'utf-8');
    const angelegt = angelegteFelder(quelltext);
    if (angelegt.size === 0) continue;

    const verwendet = verwendeteFelder(readFileSync(templatePfad, 'utf-8'));
    const fehlend = [...verwendet].filter((f) => !angelegt.has(f));

    geprueft.push({ datei: templatePfad.replace(wurzel, 'src/app'), fehlend });
  }

  it('findet überhaupt Formulare zum Prüfen', () => {
    // Ohne diese Gegenprobe wäre der Test unten auch dann grün, wenn die Suche
    // ins Leere läuft - und würde nichts mehr absichern.
    expect(geprueft.length).toBeGreaterThan(3);
  });

  for (const { datei, fehlend } of geprueft) {
    it(`verwendet in ${datei} nur angelegte Felder`, () => {
      expect(fehlend).toEqual([]);
    });
  }
});
