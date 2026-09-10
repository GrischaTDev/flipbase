import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-table-toolbar',
  templateUrl: './table-toolbar.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class TableToolbarComponent {}
