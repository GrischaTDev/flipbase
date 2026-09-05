import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BetaApplicationService } from './beta-application.service';
import { SupabaseService } from '../../../core/services/supabase.service';

function serviceWith(client: unknown): BetaApplicationService {
  TestBed.configureTestingModule({
    providers: [{ provide: SupabaseService, useValue: { client } }],
  });
  return TestBed.inject(BetaApplicationService);
}

const row = {
  id: 'a1',
  first_name: 'Anna',
  last_name: 'Beispiel',
  email: 'anna@example.test',
  status: 'open',
  granted_days: null,
  decision_note: null,
  created_at: '2026-09-05T08:00:00.000Z',
};

function serviceWithList(response: { data: unknown; error: unknown }) {
  const order = vi.fn().mockResolvedValue(response);
  const select = vi.fn().mockReturnValue({ order });
  const from = vi.fn().mockReturnValue({ select });
  return { service: serviceWith({ from }), from, order };
}

describe('BetaApplicationService', () => {
  // Ohne Rueckbau verweigert TestBed ab dem zweiten Test die erneute
  // Konfiguration ("test module has already been instantiated").
  afterEach(() => TestBed.resetTestingModule());

  it('wandelt die Datenbankzeilen in das Modell um', async () => {
    const { service, from } = serviceWithList({ data: [row], error: null });

    const applications = await service.list();

    expect(from).toHaveBeenCalledWith('beta_applications');
    expect(applications).toEqual([
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
    const { service } = serviceWithList({ data: null, error: { message: 'weg' } });

    await expect(service.list()).rejects.toThrow('weg');
  });

  it('schreibt die Entscheidung mit Laufzeit und Notiz', async () => {
    const eq = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ update });
    const service = serviceWith({ from });

    await service.decide('a1', 'accepted', 180, 'passt');

    expect(update).toHaveBeenCalledWith({
      status: 'accepted',
      granted_days: 180,
      decision_note: 'passt',
    });
    expect(eq).toHaveBeenCalledWith('id', 'a1');
  });
});
