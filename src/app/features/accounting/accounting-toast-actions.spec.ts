import '@angular/compiler';
import { signal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import { SyncStatusService } from '../../core/services/sync-status.service';
import { ToastService } from '../../shared/components/toast/toast.service';
import { AccountingComponent } from './accounting.component';

function erstelleKomponente() {
  const toast = new ToastService();
  const syncStatus = new SyncStatusService();
  const bankService = {
    importBankStatementFile: vi.fn(async () => ({
      success: true,
      message: 'Eine Transaktion importiert.',
    })),
    loadDemoStatement: vi.fn(),
    bookTransaction: vi.fn(async () => ({ success: true, message: 'Gebucht.' })),
    bookAllExactMatches: vi.fn(async () => ({ bookedCount: 2, message: 'Gebucht.' })),
    ignoreTransaction: vi.fn(),
    resetStatement: vi.fn(),
  };
  const taxAdvisorService = {
    updateAdvisorConfig: vi.fn(),
    generateDatevExtfCsv: vi.fn(() => 'datev'),
    generateDiffTaxJournalCsv: vi.fn(() => 'journal'),
    sendReportPackageToAdvisor: vi.fn(async () => ({ success: true, message: 'Versendet.' })),
  };
  const taxEngine = { generateEurCsv: vi.fn(() => 'eür') };
  const komponente = Object.create(AccountingComponent.prototype) as AccountingComponent;
  Object.assign(komponente, {
    toast,
    syncStatus,
    bankService,
    taxAdvisorService,
    taxEngine,
    bookingFeedback: signal<{ success: boolean; message: string } | null>(null),
    emailSentStatus: signal<{ success: boolean; text: string } | null>(null),
    selectedYear: signal(2026),
    selectedPeriod: signal('08'),
    filteredTaxResults: () => [],
    advisorReport: () => ({ periodKey: '2026-08' }),
    advisorForm: {
      getRawValue: () => ({
        firmName: 'Kanzlei Test',
        advisorEmail: 'test@example.com',
        clientNumber: '1',
        consultantNumber: '2',
        skrStandard: 'SKR03',
      }),
    },
    downloadFile: vi.fn(),
  });

  return { bankService, komponente, syncStatus, taxAdvisorService, toast };
}

describe('AccountingComponent – Aktionsmeldungen', () => {
  it('bestätigt einen erfolgreichen Kontoauszug-Import', async () => {
    const { komponente, toast } = erstelleKomponente();
    const input = { files: [new File(['Buchung'], 'konto.csv')], value: 'konto.csv' };

    await komponente.onFileUpload({ target: input } as unknown as Event);

    expect(toast.toasts()[0]).toMatchObject({
      type: 'success',
      title: 'Kontoauszug wurde importiert.',
    });
  });

  it('meldet einen abgelehnten Kontoauszug-Import persistent mit der Ursache', async () => {
    const { bankService, komponente, toast } = erstelleKomponente();
    bankService.importBankStatementFile.mockResolvedValue({
      success: false,
      message: 'Keine Buchungen erkannt.',
    });

    await komponente.onFileUpload({
      target: { files: [new File(['leer'], 'konto.csv')], value: 'konto.csv' },
    } as unknown as Event);

    expect(toast.toasts()[0]).toMatchObject({
      type: 'error',
      title: 'Kontoauszug konnte nicht importiert werden.',
      description: 'Keine Buchungen erkannt.',
      persistent: true,
    });
  });

  it.each([
    [
      'Demo-Kontoauszug wurde geladen.',
      (komponente: AccountingComponent) => komponente.onLoadDemoStatement(),
    ],
    [
      'Transaktion wurde ignoriert.',
      (komponente: AccountingComponent) => komponente.onIgnoreTransaction('tx-1'),
    ],
    [
      'Kontoauszug wurde zurückgesetzt.',
      (komponente: AccountingComponent) => komponente.onResetBankStatement(),
    ],
    [
      'DATEV-Buchungsstapel wurde exportiert.',
      (komponente: AccountingComponent) => komponente.onDownloadDatev(),
    ],
    [
      '§-25a-Journal wurde exportiert.',
      (komponente: AccountingComponent) => komponente.onDownloadDiffTaxJournal(),
    ],
    [
      'EÜR-Bericht wurde exportiert.',
      (komponente: AccountingComponent) => komponente.onDownloadEur(),
    ],
  ])('bestätigt die Aktion „%s“', async (title, aktion) => {
    const { komponente, toast } = erstelleKomponente();

    await aktion(komponente);

    expect(toast.toasts()[0]).toMatchObject({ type: 'success', title });
  });

  it('bestätigt eine erfolgreich gebuchte Transaktion statt eines Seitenbanners', async () => {
    const { komponente, toast } = erstelleKomponente();

    await komponente.onBookTransaction('tx-1');

    expect(toast.toasts()[0]).toMatchObject({
      type: 'success',
      title: 'Transaktion wurde gebucht.',
    });
  });

  it('meldet eine abgelehnte Buchung persistent mit der Ursache', async () => {
    const { bankService, komponente, toast } = erstelleKomponente();
    bankService.bookTransaction.mockResolvedValue({
      success: false,
      message: 'Transaktion oder Zuordnung nicht gefunden.',
    });

    await komponente.onBookTransaction('tx-fehlt');

    expect(toast.toasts()[0]).toMatchObject({
      type: 'error',
      title: 'Transaktion konnte nicht gebucht werden.',
      description: 'Transaktion oder Zuordnung nicht gefunden.',
      persistent: true,
    });
  });

  it('bestätigt das Buchen aller exakten Treffer', async () => {
    const { komponente, toast } = erstelleKomponente();

    await komponente.onBookAllExactMatches();

    expect(toast.toasts()[0]).toMatchObject({
      type: 'success',
      title: 'Passende Transaktionen wurden gebucht.',
    });
  });

  it('bestätigt einen erfolgreich versendeten Bericht', async () => {
    const { komponente, toast } = erstelleKomponente();

    await komponente.onSendEmailToAdvisor();

    expect(toast.toasts()[0]).toMatchObject({
      type: 'success',
      title: 'Bericht wurde an die Steuerberatung versendet.',
    });
  });

  it('meldet einen abgelehnten Berichtsversand persistent mit der Ursache', async () => {
    const { komponente, taxAdvisorService, toast } = erstelleKomponente();
    taxAdvisorService.sendReportPackageToAdvisor.mockResolvedValue({
      success: false,
      message: 'Postfach nicht erreichbar.',
    });

    await komponente.onSendEmailToAdvisor();

    expect(toast.toasts()[0]).toMatchObject({
      type: 'error',
      title: 'Bericht konnte nicht versendet werden.',
      description: 'Postfach nicht erreichbar.',
      persistent: true,
    });
  });

  it('erzeugt bei einem bereits zentral gemeldeten Buchungsfehler keinen zweiten Toast', async () => {
    const { bankService, komponente, syncStatus, toast } = erstelleKomponente();
    bankService.bookTransaction.mockRejectedValue(
      syncStatus.melde('Buchen der Transaktion', new Error('offline')),
    );

    await komponente.onBookTransaction('tx-1');

    expect(syncStatus.fehler()).toHaveLength(1);
    expect(toast.toasts()).toEqual([]);
  });

  it('meldet eine lokale Buchungsausnahme persistent', async () => {
    const { bankService, komponente, toast } = erstelleKomponente();
    bankService.bookTransaction.mockRejectedValue(new Error('Bankdienst nicht erreichbar'));

    await komponente.onBookTransaction('tx-1');

    expect(toast.toasts()[0]).toMatchObject({
      type: 'error',
      title: 'Transaktion konnte nicht gebucht werden.',
      description: 'Bankdienst nicht erreichbar',
      persistent: true,
    });
  });
});
