import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';
import { LucideChevronLeft, LucideChevronRight } from '@lucide/angular';
import { ButtonComponent } from '../button/button.component';
import { clampTablePage, tablePageCount } from './table-page';

@Component({
  selector: 'app-table-pager',
  imports: [ButtonComponent],
  templateUrl: './table-pager.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class TablePagerComponent {
  readonly totalItems = input.required<number>();
  readonly pageSize = input(10);
  readonly ariaLabel = input('Seiten der Tabelle');
  /** 1-basierte Seite; die Fachseite schneidet ihre Zeilen mit `tablePageRows`. */
  readonly page = model(1);

  protected readonly previousIcon = LucideChevronLeft;
  protected readonly nextIcon = LucideChevronRight;

  protected readonly pageCount = computed(() => tablePageCount(this.totalItems(), this.pageSize()));
  protected readonly currentPage = computed(() =>
    clampTablePage(this.page(), this.totalItems(), this.pageSize()),
  );
  protected readonly firstItem = computed(() =>
    this.totalItems() === 0 ? 0 : (this.currentPage() - 1) * this.pageSize() + 1,
  );
  protected readonly lastItem = computed(() =>
    Math.min(this.totalItems(), this.currentPage() * this.pageSize()),
  );

  protected goTo(page: number): void {
    this.page.set(clampTablePage(page, this.totalItems(), this.pageSize()));
  }
}
