import '@angular/compiler';
import { describe, expect, it } from 'vitest';
import { AccountSettingsComponent } from './account-settings/account-settings.component';
import { AppSettingsComponent } from './app-settings/app-settings.component';
import { NotificationSettingsComponent } from './notification-settings/notification-settings.component';
import { ShippingSettingsComponent } from './shipping-settings/shipping-settings.component';
import { StoreSettingsComponent } from './store-settings/store-settings.component';
import { TeamSettingsComponent } from './team-settings/team-settings.component';
import { WorkspaceSettingsComponent } from './workspace-settings/workspace-settings.component';

/**
 * Inventar der bisherigen Settings-Aktionen. Diese Spezifikation schützt nur
 * die Zuordnung der Bereiche; gerenderte Interaktionen stehen im Angular-Test.
 */
describe('Einstellungsseiten – Aktionsinventar', () => {
  const pages = [
    AccountSettingsComponent,
    WorkspaceSettingsComponent,
    TeamSettingsComponent,
    NotificationSettingsComponent,
    StoreSettingsComponent,
    ShippingSettingsComponent,
    AppSettingsComponent,
  ];

  it('stellt jede bisherige Einstellungsseite als eigenständige Komponente bereit', () => {
    expect(pages).toHaveLength(7);
  });

  it('hält die vorherigen Handlungsbereiche auf genau einer Seite bereit', () => {
    expect(AccountSettingsComponent.prototype).toHaveProperty('onSaveProfile');
    expect(WorkspaceSettingsComponent.prototype).toHaveProperty('onDeleteWorkspace');
    expect(TeamSettingsComponent.prototype).toHaveProperty('onSendInvite');
    expect(NotificationSettingsComponent.prototype).toHaveProperty('testWebhook');
    expect(StoreSettingsComponent.prototype).toHaveProperty('onSavePaymentConfig');
    expect(ShippingSettingsComponent.prototype).toHaveProperty('onSaveCarrierConfig');
    expect(AppSettingsComponent.prototype).toHaveProperty('onSaveEbayConfig');
  });
});
