import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { BetaApplicationService } from '../../services/beta-application.service';
import { BetaApplication, DEFAULT_GRANTED_DAYS } from '../../models/beta-application.model';

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

  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.applications.set(await this.service.list());
    } catch (fehler) {
      this.error.set(fehler instanceof Error ? fehler.message : String(fehler));
    } finally {
      this.loading.set(false);
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
    try {
      await this.service.decide(
        application.id,
        status,
        status === 'accepted' ? this.grantedDays() : null,
        note.trim() || null,
      );
      await this.load();
    } catch (fehler) {
      this.error.set(fehler instanceof Error ? fehler.message : String(fehler));
    }
  }
}
