import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { CardComponent } from '../../../../shared/components/card/card.component';
import { CustomSelectComponent } from '../../../../shared/components/custom-select/custom-select.component';
import { vintedAccountLabels } from '../../models/vinted-account-labels';
import { MARKETPLACE_CONNECTION_LABELS } from '../../models/marketplace-presentation';
import { MarketplaceAccountStore } from '../../services/marketplace-account.store';
import { VintedFavoriteSettingsComponent } from '../vinted-favorite-settings/vinted-favorite-settings.component';
import { VintedMessageSettingsComponent } from '../vinted-message-settings/vinted-message-settings.component';

@Component({
  selector: 'app-vinted-settings',
  imports: [
    ButtonComponent,
    CardComponent,
    CustomSelectComponent,
    VintedFavoriteSettingsComponent,
    VintedMessageSettingsComponent,
  ],
  templateUrl: './vinted-settings.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block w-full max-w-2xl' },
})
export class VintedSettingsComponent {
  private readonly accounts = inject(MarketplaceAccountStore);
  private readonly selectedConnectionId = signal<string | null>(null);
  private readonly connections = computed(() =>
    this.accounts.canManage() ? this.accounts.connections() : [],
  );

  readonly loading = this.accounts.loading;
  readonly accountOptions = computed(() => {
    const connections = this.connections();
    const labels = vintedAccountLabels(connections);
    return connections.map((account) => ({
      value: account.connectionId,
      label: labels.get(account.connectionId) ?? account.displayName,
      description: MARKETPLACE_CONNECTION_LABELS[account.status],
    }));
  });
  readonly account = computed(
    () =>
      this.connections().find((account) => account.connectionId === this.selectedConnectionId()) ??
      null,
  );

  selectAccount(connectionId: string | null): void {
    this.selectedConnectionId.set(connectionId);
  }
}
