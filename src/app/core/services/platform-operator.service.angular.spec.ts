import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PlatformOperatorService } from './platform-operator.service';
import { SupabaseService } from './supabase.service';

function serviceMit(antwort: { data: unknown; error: unknown }, nutzerId: string | null = 'u1') {
  const rpc = vi.fn().mockResolvedValue(antwort);
  const getSession = vi.fn().mockResolvedValue({
    data: { session: nutzerId ? { user: { id: nutzerId } } : null },
  });
  TestBed.configureTestingModule({
    providers: [{ provide: SupabaseService, useValue: { client: { rpc, auth: { getSession } } } }],
  });
  return { service: TestBed.inject(PlatformOperatorService), rpc, getSession };
}

describe('PlatformOperatorService', () => {
  // TestBed instanziiert das Modul beim ersten inject() und verweigert danach
  // eine erneute Konfiguration. Ohne diesen Rueckbau wuerde der zweite und
  // dritte Test mit "test module has already been instantiated" abbrechen,
  // statt wie vorgesehen einen frischen Dienst zu bekommen.
  afterEach(() => TestBed.resetTestingModule());

  it('meldet Betreiber, wenn die Datenbank wahr liefert', async () => {
    const { service, rpc } = serviceMit({ data: true, error: null });

    await expect(service.isOperator()).resolves.toBe(true);
    expect(rpc).toHaveBeenCalledWith('is_platform_operator');
  });

  it('meldet im Fehlerfall keinen Betreiber', async () => {
    // Eine gescheiterte Abfrage darf niemanden zum Betreiber machen. Der
    // Fehlerfall ist die Sperre, nicht die Freigabe.
    const { service } = serviceMit({ data: null, error: { message: 'weg' } });

    await expect(service.isOperator()).resolves.toBe(false);
  });

  it('fragt die Datenbank nur einmal fuer denselben Nutzer', async () => {
    // Der Wächter und die Seitenleiste fragen beide. Ohne Zwischenspeicher
    // liefe je Navigation eine Abfrage mehr.
    const { service, rpc } = serviceMit({ data: true, error: null });

    await service.isOperator();
    await service.isOperator();

    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('fragt erneut, wenn die Sitzung einer anderen Kennung gehoert', async () => {
    // Abmelden laeuft als reine Navigation ohne Neuladen - der Dienst bliebe
    // ohne diese Pruefung bestehen und gaebe die Antwort des vorherigen
    // Nutzers weiter. Meldet sich danach ein anderer Nutzer an, muss neu
    // gefragt werden statt den alten Wert zu liefern.
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
    const getSession = vi
      .fn()
      .mockResolvedValueOnce({ data: { session: { user: { id: 'u1' } } } })
      .mockResolvedValueOnce({ data: { session: { user: { id: 'u2' } } } });
    TestBed.configureTestingModule({
      providers: [
        { provide: SupabaseService, useValue: { client: { rpc, auth: { getSession } } } },
      ],
    });
    const service = TestBed.inject(PlatformOperatorService);

    await expect(service.isOperator()).resolves.toBe(true);
    await expect(service.isOperator()).resolves.toBe(true);

    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it('liefert false ohne Sitzung, ohne die Datenbank zu fragen', async () => {
    const { service, rpc } = serviceMit({ data: true, error: null }, null);

    await expect(service.isOperator()).resolves.toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });
});
