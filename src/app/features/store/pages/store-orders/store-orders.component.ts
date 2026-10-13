import { ChangeDetectionStrategy, Component, effect, inject } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import { DataTableComponent } from '../../../../shared/components/data-table/data-table.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { StoreOrderListService } from '../../services/store-order-list.service';

@Component({
  selector: 'app-store-orders',
  imports: [DataTableComponent, ButtonComponent, CurrencyPipe, DatePipe],
  providers: [StoreOrderListService],
  templateUrl: './store-orders.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class StoreOrdersComponent {
  readonly orders = inject(StoreOrderListService);
  private readonly workspace = inject(WorkspaceService);
  constructor() {
    effect(() => {
      const id = this.workspace.currentWorkspace()?.id;
      if (id) void this.orders.loadOrders(id);
    });
  }
  reload(): void {
    const id = this.workspace.currentWorkspace()?.id;
    if (id) void this.orders.loadOrders(id);
  }
}
