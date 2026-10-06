import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { LucideHardDrive, LucideRefreshCw } from '@lucide/angular';
import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { CardComponent } from '../../../../shared/components/card/card.component';
import { PageHeaderComponent } from '../../../../shared/components/page-header/page-header.component';
import { ServerStorageState } from '../../services/server-storage-state';

@Component({
  selector: 'app-server-storage',
  imports: [
    DatePipe,
    DecimalPipe,
    BadgeComponent,
    ButtonComponent,
    CardComponent,
    PageHeaderComponent,
  ],
  templateUrl: './server-storage.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [ServerStorageState],
})
export class ServerStorageComponent {
  readonly state = inject(ServerStorageState);
  readonly storageIcon = LucideHardDrive;
  readonly refreshIcon = LucideRefreshCw;
}
