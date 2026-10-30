import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import {
  LucideDynamicIcon,
  LucideShirt,
  LucideSettings,
  LucidePause,
  LucidePlay,
  LucidePencil,
  LucideCopy,
  LucideTrash2,
  LucideTriangleAlert,
} from '@lucide/angular';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { CustomCheckboxComponent } from '../../../../shared/components/custom-checkbox/custom-checkbox.component';
import { TableActionMenuComponent } from '../../../../shared/components/table-action-menu/table-action-menu.component';
import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import { SniperQueryRunStatusComponent } from '../../pages/sniper-queries/sniper-query-run-status.component';
import { SniperQuery, queryStatusLabel } from '../../models/sniper-query.model';
import {
  filterBrandLabel,
  filterIntervalLabel,
  filterPriceLabel,
} from '../../models/sniper-filter-presentation';

@Component({
  selector: 'app-sniper-filter-card',
  imports: [
    ButtonComponent,
    CustomCheckboxComponent,
    TableActionMenuComponent,
    BadgeComponent,
    LucideDynamicIcon,
    SniperQueryRunStatusComponent,
  ],
  templateUrl: './sniper-filter-card.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0 h-full', '(click)': 'openFromCard($event)' },
})
export class SniperFilterCardComponent {
  readonly query = input.required<SniperQuery>();
  readonly category = input('Alle Kategorien');
  readonly finds = input<number | null>(null);
  readonly selected = input(false);
  readonly compact = input(false);
  readonly disabled = input(false);
  readonly pending = input(false);
  readonly manualRequired = input(false);
  readonly currentTime = input(Date.now());
  readonly opened = output<void>();
  readonly selectionChanged = output<boolean>();
  readonly toggled = output<void>();
  readonly edited = output<void>();
  readonly duplicated = output<void>();
  readonly deleted = output<void>();
  readonly brands = computed(() => filterBrandLabel(this.query()));
  readonly price = computed(() => filterPriceLabel(this.query()));
  readonly interval = computed(() => filterIntervalLabel(this.query().poll_interval_ms));
  readonly title = computed(() => this.query().title || 'Unbenannter Suchfilter');
  readonly issue = computed(() => {
    const query = this.query();
    if (!query.is_active) return null;
    if (this.manualRequired()) return 'Wartet auf manuelle Vinted-Prüfung';
    if (query.run_state === 'invalid') return 'Einstellungen prüfen';
    if (['rate_limited', 'forbidden', 'failed'].includes(query.last_status))
      return queryStatusLabel(query);
    return query.coverage_status === 'limited'
      ? 'Aufholen begrenzt · weitere Artikel möglich'
      : null;
  });
  readonly critical = computed(() => ['failed', 'forbidden'].includes(this.query().last_status));
  readonly shirtIcon = LucideShirt;
  readonly settingsIcon = LucideSettings;
  readonly pauseIcon = LucidePause;
  readonly playIcon = LucidePlay;
  readonly editIcon = LucidePencil;
  readonly copyIcon = LucideCopy;
  readonly deleteIcon = LucideTrash2;
  readonly warningIcon = LucideTriangleAlert;

  openFromCard(event: MouseEvent): void {
    // Wie bei Tabellenzeilen bleibt der Titelbutton das Tastaturziel; freie Kartenflächen öffnen dasselbe Detail.
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      event.altKey ||
      window.getSelection()?.toString()
    )
      return;
    if (
      event.target instanceof Element &&
      !event.target.closest(
        'button, a, input, label, select, textarea, summary, [role="checkbox"], [role="dialog"], app-table-action-menu',
      )
    )
      this.opened.emit();
  }
}
