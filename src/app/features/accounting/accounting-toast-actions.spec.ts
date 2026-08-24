import '@angular/compiler';
import { signal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import { SyncStatusService } from '../../core/services/sync-status.service';
import { ToastService } from '../../shared/components/toast/toast.service';
import { AccountingComponent } from './accounting.component';
import {
  BankBatchBookingResult,
  BankMutationResult,
} from '../../core/models/bank-reconciliation.models';

function erstelleKomponente() {
  const toast = new ToastService();
  const syncStatus = new SyncStatusService();
  const bookTransaction = vi.fn<(id: string) => Promise<BankMutationResult>>(async () => ({
    status: 'success',
    success: true,
    message: 'Gebucht.',
  }));
  const bookAllExactMatches = vi.fn<() => Promise<BankBatchBookingResult>>(async () => ({
    status: 'success',
    bookedCount: 2,
    failedCount: 0,
    message: 'Gebucht.',
    problems: [],
  }));
  const ignoreTransaction = vi.fn<(id: string) => Promise<BankMutationResult>>(async () => ({
    status: 'success',
    success: true,
    message: 'Ignoriert.',
  }));
  const resetStatement = vi.fn<() => Promise<BankMutationResult>>(async () => ({
    status: 'success',
    success: true,
    message: 'Zurückgesetzt.',
  }));
  const bankService = {
    importBankStatementFile: vi.fn(async () => ({
      success: true,
      message: 'Eine Transaktion importiert.',
    })),
    loadDemoStatement: vi.fn(),
    bookTransaction,
    bookAllExactMatches,
    ignoreTransaction,
    resetStatement,
  };
  const taxAdvisorService = {
    updateAdvisorConfig: vi.fn(),
    generateDatevExtfCsv: vi.fn(() => 'datev'),
    generateDiffTaxJournalCsv: vi.fn(() => 'journal'),
    prepareReportPackageForAdvisor: vi.fn(async () => ({
      status: 'prepared',
      message: 'Vorbereitet. Ein echter E-Mail-Versand ist noch nicht eingerichtet.',
    })),
  };
  const taxEngine = { generateEurCsv: vi.fn(() => 'eür') };
  const komponente = Object.create(AccountingComponent.prototype) as AccountingComponent;
  Object.assign(komponente, {
    toast,
    syncStatus,
    bankService,
    taxAdvisorService,
    taxEngine,
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
      status: 'failed',
      success: false,
      message: 'Transaktion oder Zuordnung nicht gefunden.',
      problem: {
        error: new Error('Transaktion oder Zuordnung nicht gefunden.'),
        reportedBySyncStatus: false,
      },
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

  it('meldet einen Batch ohne Treffer neutral statt als Erfolg', async () => {
    const { bankService, komponente, toast } = erstelleKomponente();
    bankService.bookAllExactMatches.mockResolvedValue({
      status: 'empty',
      bookedCount: 0,
      failedCount: 0,
      message: 'Keine passenden Transaktionen gefunden.',
      problems: [],
    });

    await komponente.onBookAllExactMatches();

    expect(toast.toasts()[0]).toMatchObject({
      type: 'info',
      title: 'Keine passenden Transaktionen gefunden.',
    });
  });

  it('meldet Batch-Teilerfolg als Warnung mit echten Zählern', async () => {
    const { bankService, komponente, toast } = erstelleKomponente();
    bankService.bookAllExactMatches.mockResolvedValue({
      status: 'partial',
      bookedCount: 1,
      failedCount: 1,
      message: '1 Transaktion gebucht, 1 fehlgeschlagen.',
      problems: [{ error: new Error('offline'), reportedBySyncStatus: true }],
    });

    await komponente.onBookAllExactMatches();

    expect(toast.toasts()[0]).toMatchObject({
      type: 'warning',
      title: 'Einige Transaktionen konnten nicht gebucht werden.',
      description: '1 Transaktion gebucht, 1 fehlgeschlagen.',
    });
  });

  it('bestätigt wahrheitsgemäß nur das Vorbereiten des Berichtspakets', async () => {
    const { komponente, toast } = erstelleKomponente();

    await komponente.onPrepareReportForAdvisor();

    expect(toast.toasts()[0]).toMatchObject({
      type: 'info',
      title: 'Berichtspaket wurde vorbereitet.',
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

  it('erzeugt für einen zentral gemeldeten Ergebnisfehler keinen zweiten Toast', async () => {
    const { bankService, komponente, syncStatus, toast } = erstelleKomponente();
    const error = syncStatus.melde('Ignorieren der Banktransaktion', new Error('offline'));
    bankService.ignoreTransaction.mockResolvedValue({
      status: 'failed',
      success: false,
      message: error.message,
      problem: { error, reportedBySyncStatus: true },
    });

    await komponente.onIgnoreTransaction('tx-1');

    expect(syncStatus.fehler()).toHaveLength(1);
    expect(toast.toasts()).toEqual([]);
  });
});
