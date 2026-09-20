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
  decided_at: null,
  created_at: '2026-09-05T08:00:00.000Z',
  receipt_email_status: 'sent',
  receipt_email_sent_at: '2026-09-05T08:01:00.000Z',
  receipt_email_last_error: null,
  auth_user_id: null,
  invitation_status: 'not_sent',
  invitation_sent_at: null,
  invitation_last_error: null,
  registered_at: null,
  workspace_licenses: { status: 'active', ends_at: '2026-11-19T08:00:00.000Z' },
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
        decidedAt: null,
        createdAt: '2026-09-05T08:00:00.000Z',
        receiptEmailStatus: 'sent',
        receiptEmailSentAt: '2026-09-05T08:01:00.000Z',
        receiptEmailLastError: null,
        authUserId: null,
        invitationStatus: 'not_sent',
        invitationSentAt: null,
        invitationLastError: null,
        registeredAt: null,
        licenseStatus: 'active',
        betaEndsAt: '2026-11-19T08:00:00.000Z',
      },
    ]);
  });

  it('meldet einen Fehler statt einer leeren Liste', async () => {
    // Eine leere Liste sieht aus wie "keine Bewerbungen" und wuerde eine
    // gestoerte Verbindung als Ruhe ausgeben.
    const { service } = serviceWithList({ data: null, error: { message: 'weg' } });

    await expect(service.list()).rejects.toThrow('weg');
  });

  it('nimmt ueber die geschuetzte Funktion mit der gewaehlten Laufzeit an', async () => {
    const invoke = vi.fn().mockResolvedValue({ data: { application: row }, error: null });
    const service = serviceWith({ functions: { invoke } });

    await service.accept('a1', 60);

    expect(invoke).toHaveBeenCalledWith('beta-invite', {
      body: { applicationId: 'a1', grantedDays: 60, action: 'accept' },
    });
  });

  it('lehnt ueber dieselbe geschuetzte Servergrenze ab', async () => {
    const invoke = vi.fn().mockResolvedValue({ data: { application: row }, error: null });
    const service = serviceWith({ functions: { invoke } });

    await service.reject('a1');

    expect(invoke).toHaveBeenCalledWith('beta-invite', {
      body: { applicationId: 'a1', action: 'reject' },
    });
  });

  it('stellt beide fehlgeschlagenen E-Mail-Arten gezielt erneut zu', async () => {
    const invoke = vi.fn().mockResolvedValue({ data: { application: row }, error: null });
    const service = serviceWith({ functions: { invoke } });

    await service.resendInvitation('a1');
    await service.resendApplicationReceipt('a1');

    expect(invoke).toHaveBeenNthCalledWith(1, 'beta-invite', {
      body: { applicationId: 'a1', action: 'resend' },
    });
    expect(invoke).toHaveBeenNthCalledWith(2, 'beta-invite', {
      body: { applicationId: 'a1', action: 'resend_receipt' },
    });
  });

  it('gibt Einladungsfehler an die Oberflaeche weiter', async () => {
    const invoke = vi.fn().mockResolvedValue({
      data: null,
      error: { message: 'Einladung fehlgeschlagen' },
    });
    const service = serviceWith({ functions: { invoke } });

    await expect(service.accept('a1', 60)).rejects.toThrow('Einladung fehlgeschlagen');
  });
});
