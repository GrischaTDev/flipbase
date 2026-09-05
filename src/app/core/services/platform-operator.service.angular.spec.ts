import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PlatformOperatorService } from './platform-operator.service';
import { SupabaseService } from './supabase.service';

function serviceMit(antwort: { data: unknown; error: unknown }) {
  const rpc = vi.fn().mockResolvedValue(antwort);
  TestBed.configureTestingModule({
    providers: [{ provide: SupabaseService, useValue: { client: { rpc } } }],
  });
  return { service: TestBed.inject(PlatformOperatorService), rpc };
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

  it('fragt die Datenbank nur einmal', async () => {
    // Der Wächter und die Seitenleiste fragen beide. Ohne Zwischenspeicher
    // liefe je Navigation eine Abfrage mehr.
    const { service, rpc } = serviceMit({ data: true, error: null });

    await service.isOperator();
    await service.isOperator();

    expect(rpc).toHaveBeenCalledTimes(1);
  });
});
