import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { CategorySyncStatus } from '../../models/vinted-category.model';
import { VintedCategoryService } from '../../services/vinted-category.service';

/**
 * Zeigt, wie frisch der gespeicherte Kategoriebaum ist, und erlaubt es, ein
 * erneutes Einlesen anzufordern.
 *
 * Der Knopf stoesst den Dienst nicht direkt an - er setzt nur ein Feld in der
 * Datenbank. Der Sniper sieht es beim naechsten Takt. Deshalb sagt die
 * Oberflaeche "angefordert" und nicht "aufgefrischt": Der Unterschied ist
 * echt, und ihn zu verschweigen liesse jemanden vergeblich auf eine sofortige
 * Aenderung warten.
 */
@Component({
  selector: 'app-vinted-categories',
  imports: [DatePipe],
  templateUrl: './vinted-categories.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VintedCategoriesComponent {
  private readonly categories = inject(VintedCategoryService);

  protected readonly status = signal<CategorySyncStatus | null>(null);
  protected readonly loadError = signal<string | null>(null);
  protected readonly requesting = signal(false);
  protected readonly requested = signal(false);

  /**
   * Zeitpunkt einer noch nicht abgearbeiteten Anforderung, sonst null.
   *
   * Kommt aus dem geladenen Stand und nicht aus dem Knopfdruck: Sonst waere
   * nach einem Seitenwechsel nicht mehr zu sehen, dass eine Auffrischung noch
   * aussteht - der Hinweis haenge allein an einem Signal, das der naechste
   * Aufruf der Seite wieder auf false setzt.
   *
   * Abgearbeitet heisst: Der Dienst hat es seither versucht. Gelungen oder
   * gescheitert - beides beantwortet die Anforderung, und beides schreibt
   * einen Zeitstempel. Dieselbe Regel entscheidet im Dienst ueber die
   * Faelligkeit (isRefreshDue in services/sniper).
   */
  protected readonly pendingRequest = computed(() => {
    const state = this.status();
    const requestedAt = state?.requestedAt ?? null;
    if (state === null || requestedAt === null) return null;

    const requested = Date.parse(requestedAt);
    const handled = Math.max(
      state.refreshedAt === null ? 0 : Date.parse(state.refreshedAt),
      state.lastAttemptAt === null ? 0 : Date.parse(state.lastAttemptAt),
    );

    return requested > handled ? requestedAt : null;
  });

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    try {
      this.status.set(await this.categories.readStatus());
      this.loadError.set(null);
    } catch (error) {
      this.loadError.set(error instanceof Error ? error.message : String(error));
    }
  }

  protected async requestRefresh(): Promise<void> {
    this.requesting.set(true);

    try {
      await this.categories.requestRefresh();
      this.requested.set(true);
      await this.load();
    } catch (error) {
      this.loadError.set(error instanceof Error ? error.message : String(error));
    } finally {
      this.requesting.set(false);
    }
  }
}
