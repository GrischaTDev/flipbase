import { describe, it, expect, beforeEach } from 'vitest';
import { SyncFehlerAktion, SyncStatusService } from './sync-status.service';

describe('SyncStatusService – sichtbare Meldung fehlgeschlagener Speichervorgänge', () => {
  let service: SyncStatusService;

  beforeEach(() => {
    service = new SyncStatusService();
  });

  it('startet ohne Fehler', () => {
    expect(service.hatFehler()).toBe(false);
    expect(service.anzahl()).toBe(0);
    expect(service.neuesterFehler()).toBeNull();
  });

  it('nimmt einen Fehler auf und meldet ihn nach aussen', () => {
    const fehler = service.melde('Einkauf speichern', { code: '42501', message: 'denied' });

    expect(service.hatFehler()).toBe(true);
    expect(service.anzahl()).toBe(1);
    expect(fehler).toBeInstanceOf(Error);
    expect(fehler.message).toContain('Einkauf speichern');
  });

  describe('Übersetzung technischer Fehler', () => {
    const faelle: readonly [string, unknown, string][] = [
      ['fehlende Berechtigung', { code: '42501' }, 'Keine Berechtigung'],
      ['doppelter Eintrag', { code: '23505' }, 'existiert bereits'],
      ['fehlende Verknüpfung', { code: '23503' }, 'verknüpfter Datensatz'],
      ['fehlendes Pflichtfeld', { code: '23502' }, 'Pflichtfeld'],
      ['ungültiges Format', { code: '22P02' }, 'ungültiges Format'],
      ['nicht gefunden', { code: 'PGRST116' }, 'nicht gefunden'],
      ['SQL-Funktion ohne Treffer', { code: 'P0002' }, 'nicht gefunden'],
      ['Strukturfehler', { code: 'PGRST204' }, 'Datenbankstruktur'],
    ];

    for (const [name, ursache, erwartet] of faelle) {
      it(`übersetzt ${name}`, () => {
        service.melde('Test', ursache);
        expect(service.neuesterFehler()?.meldung).toContain(erwartet);
      });
    }

    it('erkennt einen Verbindungsabbruch', () => {
      service.melde('Test', new Error('Failed to fetch'));
      expect(service.neuesterFehler()?.meldung).toContain('Keine Verbindung');
    });

    it('reicht unbekannte Meldungen unverändert durch', () => {
      service.melde('Test', { message: 'irgendwas Seltsames' });
      expect(service.neuesterFehler()?.meldung).toBe('irgendwas Seltsames');
    });

    it('kommt mit null und undefined zurecht', () => {
      expect(() => service.melde('Test', null)).not.toThrow();
      expect(service.neuesterFehler()?.meldung).toBe('Unbekannter Fehler.');
    });
  });

  it('führt den jüngsten Fehler zuerst', () => {
    service.melde('Erster Vorgang', { message: 'a' });
    service.melde('Zweiter Vorgang', { message: 'b' });

    expect(service.neuesterFehler()?.vorgang).toBe('Zweiter Vorgang');
    expect(service.anzahl()).toBe(2);
  });

  it('behält alle Fehler, bis sie ausdrücklich geschlossen werden', () => {
    for (let i = 0; i < 30; i++) {
      service.melde(`Vorgang ${i}`, { message: 'x' });
    }

    expect(service.anzahl()).toBe(30);
    expect(service.neuesterFehler()?.vorgang).toBe('Vorgang 29');
    expect(service.fehler().at(-1)?.vorgang).toBe('Vorgang 0');
  });

  it('lässt einen einzelnen Fehler schliessen', () => {
    service.melde('A', { message: 'a' });
    service.melde('B', { message: 'b' });
    const id = service.neuesterFehler()!.id;

    service.verwerfen(id);

    expect(service.anzahl()).toBe(1);
    expect(service.neuesterFehler()?.vorgang).toBe('A');
  });

  it('lässt alle Fehler auf einmal schliessen', () => {
    service.melde('A', { message: 'a' });
    service.melde('B', { message: 'b' });

    service.alleVerwerfen();

    expect(service.hatFehler()).toBe(false);
  });

  it('vergibt für jeden Fehler eine eigene Kennung', () => {
    service.melde('A', { message: 'a' });
    service.melde('B', { message: 'b' });
    const ids = service.fehler().map((f) => f.id);

    expect(new Set(ids).size).toBe(2);
  });

  it('hält die technische Fehlerkennung fest', () => {
    service.melde('Einkauf speichern', { code: '42501', message: 'denied' });
    expect(service.neuesterFehler()?.code).toBe('42501');
  });

  it('dedupliziert über den Batch-Lebenszyklus und meldet in einer neuen Aktion erneut', () => {
    const aktion = service.neueFehlerAktion();
    const erster = service.melde('Speichern des Artikels', new Error('offline'), aktion);
    service.verwerfen(erster.syncFehler.id);

    service.melde('Speichern des Artikels', new Error('offline'), aktion);

    expect(service.fehler()).toEqual([]);

    const mitLifecycle = service as SyncStatusService & {
      beendeFehlerAktion(aktion: SyncFehlerAktion): void;
    };
    expect(mitLifecycle.beendeFehlerAktion).toBeTypeOf('function');
    mitLifecycle.beendeFehlerAktion(aktion);

    const spaetereAktion = service.neueFehlerAktion();
    service.melde('Speichern des Artikels', new Error('offline'), spaetereAktion);

    expect(service.fehler()).toHaveLength(1);
  });

  it('behält verschiedene fachliche Ursachen mit gleichem Fehlercode getrennt', () => {
    const aktion = service.neueFehlerAktion();
    service.melde(
      'Speichern des Artikels',
      {
        code: '23514',
        message: 'Preis verletzt Check A',
      },
      aktion,
    );
    service.melde(
      'Speichern des Artikels',
      {
        code: '23514',
        message: 'Titel verletzt Check B',
      },
      aktion,
    );
    service.melde(
      'Speichern des Artikels',
      {
        code: '23514',
        message: 'Preis verletzt Check A',
      },
      aktion,
    );

    expect(service.fehler()).toHaveLength(2);
    expect(service.fehler().map((fehler) => fehler.meldung)).toEqual([
      'Titel verletzt Check B',
      'Preis verletzt Check A',
    ]);
  });
});
