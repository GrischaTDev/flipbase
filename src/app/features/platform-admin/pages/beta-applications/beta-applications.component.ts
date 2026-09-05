import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { BetaApplicationService } from '../../services/beta-application.service';
import { BetaApplication, DEFAULT_GRANTED_DAYS } from '../../models/beta-application.model';

const MIN_GRANTED_DAYS = 1;
const MAX_GRANTED_DAYS = 3650;

@Component({
  selector: 'app-beta-applications',
  imports: [DatePipe],
  templateUrl: './beta-applications.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BetaApplicationsComponent implements OnInit {
  private readonly service = inject(BetaApplicationService);

  readonly applications = signal<readonly BetaApplication[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly grantedDays = signal(DEFAULT_GRANTED_DAYS);

  /**
   * Kennung der Bewerbung, ueber die gerade entschieden wird.
   *
   * Haelt waehrend der laufenden Anfrage die Knoepfe genau dieser Zeile
   * gesperrt. Ohne das liesse sich per Doppelklick dieselbe Entscheidung
   * zweimal abschicken.
   */
  readonly decidingId = signal<string | null>(null);

  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.applications.set(await this.service.list());
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : String(error));
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Uebernimmt die Laufzeit nur, wenn sie brauchbar ist.
   *
   * Ein geleertes Feld, ein Wert unter eins oder ueber 3650 laesst den
   * zuletzt gueltigen Wert stehen, statt ihn stillschweigend auf 0 zu setzen.
   */
  onGrantedDaysChange(rawValue: string): void {
    const value = Number(rawValue);
    const isUsable =
      rawValue.trim() !== '' &&
      Number.isFinite(value) &&
      value >= MIN_GRANTED_DAYS &&
      value <= MAX_GRANTED_DAYS;

    if (isUsable) {
      this.grantedDays.set(Math.trunc(value));
    }
  }

  async accept(application: BetaApplication, note: string): Promise<void> {
    await this.decide(application, 'accepted', note);
  }

  async reject(application: BetaApplication, note: string): Promise<void> {
    await this.decide(application, 'rejected', note);
  }

  private async decide(
    application: BetaApplication,
    status: 'accepted' | 'rejected',
    note: string,
  ): Promise<void> {
    this.error.set(null);
    this.decidingId.set(application.id);
    try {
      await this.service.decide(
        application.id,
        status,
        status === 'accepted' ? this.grantedDays() : null,
        note.trim() || null,
      );
      await this.load();
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : String(error));
    } finally {
      this.decidingId.set(null);
    }
  }
}
