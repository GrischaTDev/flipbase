import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
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
