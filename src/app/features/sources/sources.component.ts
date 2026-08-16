import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { LucideAngularModule, Store, Users, Plus, TrendingUp, AlertTriangle } from 'lucide-angular';
import { WorkspaceService } from '../../core/services/workspace.service';

@Component({
  selector: 'app-sources',
  imports: [TranslatePipe, LucideAngularModule],
  templateUrl: './sources.component.html',
  styleUrl: './sources.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SourcesComponent {
  readonly workspaceService = inject(WorkspaceService);

  readonly storeIcon = Store;
  readonly usersIcon = Users;
  readonly plusIcon = Plus;
  readonly trendingIcon = TrendingUp;
  readonly alertIcon = AlertTriangle;

  readonly activeTab = signal<'sources' | 'suppliers'>('sources');
}
