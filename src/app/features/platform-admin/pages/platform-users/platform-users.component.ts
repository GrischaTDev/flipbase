import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { LucideUsers as Users } from '@lucide/angular';
import { BadgeComponent, BadgeTone } from '../../../../shared/components/badge/badge.component';
import { DataTableComponent } from '../../../../shared/components/data-table/data-table.component';
import { PageHeaderComponent } from '../../../../shared/components/page-header/page-header.component';
import { PlatformUser } from '../../models/platform-user.model';
import { PlatformUserService } from '../../services/platform-user.service';

interface StatusDisplay {
  readonly label: string;
  readonly tone: BadgeTone;
}

@Component({
  selector: 'app-platform-users',
  imports: [DatePipe, BadgeComponent, DataTableComponent, PageHeaderComponent],
  templateUrl: './platform-users.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlatformUsersComponent implements OnInit {
  private readonly service = inject(PlatformUserService);

  readonly adminIcon = Users;
  readonly users = signal<readonly PlatformUser[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly searchQuery = signal('');
  readonly filteredUsers = computed(() => {
    const query = this.searchQuery().trim().toLocaleLowerCase('de');
    if (!query) return this.users();
    return this.users().filter((user) =>
      [user.fullName, user.email, user.workspaceName ?? '', this.accessStatus(user).label]
        .join(' ')
        .toLocaleLowerCase('de')
        .includes(query),
    );
  });

  ngOnInit(): void {
    void this.load();
  }

  registrationStatus(user: PlatformUser): StatusDisplay {
    if (user.registeredAt) return { label: 'Registriert', tone: 'success' };
    if (user.invitationStatus === 'failed') {
      return { label: 'Einladung fehlgeschlagen', tone: 'critical' };
    }
    if (user.applicationStatus === 'accepted' && user.invitationStatus === 'sent') {
      return { label: 'Wartet auf Registrierung', tone: 'info' };
    }
    return { label: 'Konto vorhanden', tone: 'neutral' };
  }

  accessStatus(user: PlatformUser): StatusDisplay {
    if (user.licenseStatus === 'suspended') return { label: 'Gesperrt', tone: 'critical' };
    if (
      user.licenseStatus === 'expired' ||
      (user.betaEndsAt !== null && new Date(user.betaEndsAt).getTime() <= Date.now())
    ) {
      return { label: 'Beta abgelaufen', tone: 'neutral' };
    }
    if (user.licenseStatus === 'active') return { label: 'Beta aktiv', tone: 'success' };
    if (user.licenseStatus === 'pending') return { label: 'Beta ausstehend', tone: 'caution' };
    return { label: 'Kein Beta-Zugang', tone: 'neutral' };
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.users.set(await this.service.list());
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : String(error));
    } finally {
      this.loading.set(false);
    }
  }
}
