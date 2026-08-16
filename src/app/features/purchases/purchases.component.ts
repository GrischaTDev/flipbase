import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { LucideAngularModule, ShoppingBag, Plus, Filter, Package, Layers } from 'lucide-angular';
import { WorkspaceService } from '../../core/services/workspace.service';
import { Purchase } from '../../core/models/reflip.models';

@Component({
  selector: 'app-purchases',
  imports: [TranslatePipe, LucideAngularModule],
  templateUrl: './purchases.component.html',
  styleUrl: './purchases.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PurchasesComponent {
  readonly workspaceService = inject(WorkspaceService);

  readonly bagIcon = ShoppingBag;
  readonly plusIcon = Plus;
  readonly filterIcon = Filter;
  readonly packageIcon = Package;
  readonly layersIcon = Layers;

  readonly purchases = signal<Purchase[]>([]);
  readonly activeTab = signal<'all' | 'single' | 'mystery_pack' | 'pallet'>('all');
}
