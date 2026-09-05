import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BetaApplicationService } from './beta-application.service';
import { SupabaseService } from '../../../core/services/supabase.service';

function serviceMit(client: unknown): BetaApplicationService {
  TestBed.configureTestingModule({
    providers: [{ provide: SupabaseService, useValue: { client } }],
  });
  return TestBed.inject(BetaApplicationService);
}

const zeile = {
  id: 'a1',
  first_name: 'Anna',
  last_name: 'Beispiel',
  email: 'anna@example.test',
  status: 'open',
  granted_days: null,
  decision_note: null,
  created_at: '2026-09-05T08:00:00.000Z',
};

function serviceMitListe(antwort: { data: unknown; error: unknown }) {
  const order = vi.fn().mockResolvedValue(antwort);
  const select = vi.fn().mockReturnValue({ order });
  const from = vi.fn().mockReturnValue({ select });
  return { service: serviceMit({ from }), from, order };
}

describe('BetaApplicationService', () => {
  // Ohne Rueckbau verweigert TestBed ab dem zweiten Test die erneute
  // Konfiguration ("test module has already been instantiated").
  afterEach(() => TestBed.resetTestingModule());

  it('wandelt die Datenbankzeilen in das Modell um', async () => {
    const { service, from } = serviceMitListe({ data: [zeile], error: null });

    const bewerbungen = await service.list();

    expect(from).toHaveBeenCalledWith('beta_applications');
    expect(bewerbungen).toEqual([
      {
        id: 'a1',
        firstName: 'Anna',
        lastName: 'Beispiel',
        email: 'anna@example.test',
        status: 'open',
        grantedDays: null,
        decisionNote: null,
        createdAt: '2026-09-05T08:00:00.000Z',
      },
    ]);
  });

  it('meldet einen Fehler statt einer leeren Liste', async () => {
    // Eine leere Liste sieht aus wie "keine Bewerbungen" und wuerde eine
    // gestoerte Verbindung als Ruhe ausgeben.
    const { service } = serviceMitListe({ data: null, error: { message: 'weg' } });

    await expect(service.list()).rejects.toThrow('weg');
  });

  it('schreibt die Entscheidung mit Laufzeit und Notiz', async () => {
    const eq = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ update });
    const service = serviceMit({ from });

    await service.decide('a1', 'accepted', 180, 'passt');

    expect(update).toHaveBeenCalledWith({
      status: 'accepted',
      granted_days: 180,
      decision_note: 'passt',
    });
    expect(eq).toHaveBeenCalledWith('id', 'a1');
  });
});
