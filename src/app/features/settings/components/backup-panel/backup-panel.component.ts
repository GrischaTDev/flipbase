import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import {
  LucideAngularModule,
  AlertTriangle,
  CheckCircle2,
  Download,
  RotateCcw,
  ShieldCheck,
  Upload,
  X,
} from 'lucide-angular';
import { BackupService } from '../../../../core/services/backup.service';
import { BackupSummary, ReflipBackup } from '../../../../core/models/backup.models';

/**
 * Sicherung und Wiederherstellung des lokalen Datenbestands.
 *
 * Bewusst als Karte direkt auf der Seite umgesetzt und nicht als modaler
 * Dialog: Die Bestätigung vor dem Überschreiben muss auch per Tastatur und
 * Screenreader zuverlässig bedienbar sein, und die vorhandenen Dialoge im
 * Projekt erfüllen das derzeit nicht.
 */
@Component({
  selector: 'app-backup-panel',
  imports: [LucideAngularModule, DatePipe, DecimalPipe],
  templateUrl: './backup-panel.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BackupPanelComponent {
  readonly backupService = inject(BackupService);

  readonly downloadIcon = Download;
  readonly uploadIcon = Upload;
  readonly shieldIcon = ShieldCheck;
  readonly warningIcon = AlertTriangle;
  readonly successIcon = CheckCircle2;
  readonly restoreIcon = RotateCcw;
  readonly closeIcon = X;

  /** Rückmeldung nach einer erfolgreichen Sicherung. */
  readonly exportDone = signal<boolean>(false);

  /** Fehlermeldung aus der Prüfung einer gewählten Datei. */
  readonly importError = signal<string | null>(null);

  /** Hinweise, die das Einspielen nicht verhindern. */
  readonly importWarnings = signal<string[]>([]);

  /** Geprüfte Sicherung, die auf die Bestätigung des Nutzers wartet. */
  readonly pendingBackup = signal<ReflipBackup | null>(null);

  /** Name der gewählten Datei, zur Rückversicherung für den Nutzer. */
  readonly pendingFileName = signal<string>('');

  readonly isRestoring = signal<boolean>(false);

  /** Übersicht über den Inhalt der gewählten Sicherung. */
  readonly pendingSummary = computed<BackupSummary | null>(() => {
    const backup = this.pendingBackup();
    return backup ? this.backupService.summarize(backup) : null;
  });

  /** Text für die Statuszeile über den Stand der letzten Sicherung. */
  readonly statusLabel = computed<string>(() => {
    const days = this.backupService.daysSinceLastBackup();
    if (days === null) return 'Noch nie gesichert';
    if (days === 0) return 'Heute gesichert';
    if (days === 1) return 'Gestern gesichert';
    return `Vor ${days} Tagen gesichert`;
  });

  downloadBackup(): void {
    this.backupService.downloadBackup();
    this.exportDone.set(true);
    setTimeout(() => this.exportDone.set(false), 4000);
  }

  /** Liest die gewählte Datei ein und zeigt die Vorschau – schreibt noch nichts. */
  async onFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    this.resetImportState();
    if (!file) return;

    this.pendingFileName.set(file.name);
    const result = await this.backupService.readFile(file);

    // Auswahl zurücksetzen, damit dieselbe Datei erneut gewählt werden kann
    input.value = '';

    if (!result.isValid || !result.backup) {
      this.importError.set(result.error ?? 'Die Datei konnte nicht gelesen werden.');
      return;
    }

    this.importWarnings.set(result.warnings);
    this.pendingBackup.set(result.backup);
  }

  /**
   * Spielt die geprüfte Sicherung ein. Vorher wird der aktuelle Stand
   * automatisch als Datei heruntergeladen, damit ein versehentliches
   * Überschreiben rückgängig gemacht werden kann.
   */
  confirmRestore(): void {
    const backup = this.pendingBackup();
    if (!backup || this.isRestoring()) return;

    this.isRestoring.set(true);

    // Sicherheitsnetz: aktuellen Stand sichern, bevor er ersetzt wird
    this.backupService.downloadBackup();

    this.backupService.restore(backup);

    // Neu laden, weil die Dienste ihren Zustand beim Start aus dem
    // Speicher lesen und ihn sonst weiter aus dem Arbeitsspeicher zeigen würden.
    window.location.reload();
  }

  cancelRestore(): void {
    this.resetImportState();
  }

  private resetImportState(): void {
    this.importError.set(null);
    this.importWarnings.set([]);
    this.pendingBackup.set(null);
    this.pendingFileName.set('');
  }
}
