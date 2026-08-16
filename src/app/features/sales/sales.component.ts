import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { LucideAngularModule, TrendingUp, Plus, DollarSign, Calendar } from 'lucide-angular';
import { WorkspaceService } from '../../core/services/workspace.service';
import { Sale } from '../../core/models/reflip.models';

@Component({
  selector: 'app-sales',
  imports: [TranslatePipe, LucideAngularModule],
  templateUrl: './sales.component.html',
  styleUrl: './sales.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SalesComponent {
  readonly workspaceService = inject(WorkspaceService);

  readonly trendingIcon = TrendingUp;
  readonly plusIcon = Plus;
  readonly dollarIcon = DollarSign;
  readonly calendarIcon = Calendar;

  readonly sales = signal<Sale[]>([]);
}
