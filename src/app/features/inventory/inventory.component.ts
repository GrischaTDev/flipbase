import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { LucideAngularModule, Boxes, Plus, Filter, Search, Tag, Eye } from 'lucide-angular';
import { WorkspaceService } from '../../core/services/workspace.service';
import { InventoryItem } from '../../core/models/reflip.models';

@Component({
  selector: 'app-inventory',
  imports: [TranslatePipe, LucideAngularModule],
  templateUrl: './inventory.component.html',
  styleUrl: './inventory.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InventoryComponent {
  readonly workspaceService = inject(WorkspaceService);

  readonly boxesIcon = Boxes;
  readonly plusIcon = Plus;
  readonly filterIcon = Filter;
  readonly searchIcon = Search;
  readonly tagIcon = Tag;
  readonly eyeIcon = Eye;

  readonly items = signal<InventoryItem[]>([]);
  readonly activeFilter = signal<string>('all');
}
