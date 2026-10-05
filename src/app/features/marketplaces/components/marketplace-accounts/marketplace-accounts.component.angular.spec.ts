import { prepareMarketplaceRendering } from '../../../../../../e2e/support/marketplace-rendering';
import { ModalDialogDirective } from '../../../../shared/directives/modal-dialog.directive';
import { MarketplaceBrowserTestComponent } from '../marketplace-browser-test/marketplace-browser-test.component';
import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { CardComponent } from '../../../../shared/components/card/card.component';
import { DataTableComponent } from '../../../../shared/components/data-table/data-table.component';
import { CustomSearchInputComponent } from '../../../../shared/components/custom-search-input/custom-search-input.component';
import { TableColumnMenuComponent } from '../../../../shared/components/table-column-menu/table-column-menu.component';
import { ModalShellComponent } from '../../../../shared/components/modal-shell/modal-shell.component';
import { NoticeBannerComponent } from '../../../../shared/components/notice-banner/notice-banner.component';
import { TableActionButtonComponent } from '../../../../shared/components/table-action-button/table-action-button.component';
import { TextFieldComponent } from '../../../../shared/components/text-field/text-field.component';
import { CustomSelectComponent } from '../../../../shared/components/custom-select/custom-select.component';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { AuthService } from '../../../../core/services/auth.service';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import { MarketplaceAccountStore } from '../../services/marketplace-account.store';
import { MarketplaceCloudSetupApiService } from '../../services/marketplace-cloud-setup-api.service';
import { MarketplaceAccountsComponent } from './marketplace-accounts.component';
const createConnection = vi.fn();
const cloud = {
  available: vi.fn().mockResolvedValue(true),
  begin: vi.fn().mockResolvedValue({ status: 'no_capacity' }),
  action: vi.fn(),
};
beforeEach(() => {
  TestBed.resetTestingModule();
  vi.clearAllMocks();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      {
        provide: AuthService,
        useValue: {
          currentUser: signal({ id: 'operator' }),
          session: signal({ access_token: 'test-token' }),
        },
      },
      {
        provide: WorkspaceService,
        useValue: { currentWorkspace: signal({ id: '25500000-0000-4000-8000-000000000011' }) },
      },
      {
        provide: MarketplaceAccountStore,
        useValue: {
          connections: signal([]),
          canManage: signal(true),
          busy: signal(false),
          loading: signal(false),
          error: signal(null),
          mutationError: signal(null),
          clearMutationError: vi.fn(),
          createConnection,
        },
      },
      { provide: MarketplaceCloudSetupApiService, useValue: cloud },
    ],
  });
});
it('zeigt bei fehlender IP den Hinweis und lässt lokale Einrichtung ohne Browserdialog zu', async () => {
  const fixture = TestBed.createComponent(MarketplaceAccountsComponent);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.componentInstance.openDialog();
  fixture.componentInstance.name.setValue('Cloudtest');
  fixture.componentInstance.connectionMethod.setValue('cloud');
  await fixture.componentInstance.save();
  fixture.detectChanges();
  expect(fixture.nativeElement.textContent).toContain(
    'Aktuell sind keine freien Cloud-IPs vorhanden.',
  );
  expect(fixture.nativeElement.querySelector('app-marketplace-browser-test')).toBeNull();
  expect(createConnection).not.toHaveBeenCalled();
  expect(fixture.componentInstance.connectionMethod.enabled).toBe(true);
});

let restore: (() => void) | undefined;
beforeAll(async () => {
  restore = await prepareMarketplaceRendering([
    {
      type: MarketplaceAccountsComponent,
      path: 'src/app/features/marketplaces/components/marketplace-accounts/marketplace-accounts.component.ts',
    },
    {
      type: MarketplaceBrowserTestComponent,
      path: 'src/app/features/marketplaces/components/marketplace-browser-test/marketplace-browser-test.component.ts',
    },
    { type: ModalDialogDirective, path: 'src/app/shared/directives/modal-dialog.directive.ts' },
    { type: BadgeComponent, path: 'src/app/shared/components/badge/badge.component.ts' },
    { type: ButtonComponent, path: 'src/app/shared/components/button/button.component.ts' },
    { type: CardComponent, path: 'src/app/shared/components/card/card.component.ts' },
    {
      type: DataTableComponent,
      path: 'src/app/shared/components/data-table/data-table.component.ts',
    },
    {
      type: CustomSearchInputComponent,
      path: 'src/app/shared/components/custom-search-input/custom-search-input.component.ts',
    },
    {
      type: TableColumnMenuComponent,
      path: 'src/app/shared/components/table-column-menu/table-column-menu.component.ts',
    },
    {
      type: ModalShellComponent,
      path: 'src/app/shared/components/modal-shell/modal-shell.component.ts',
    },
    {
      type: NoticeBannerComponent,
      path: 'src/app/shared/components/notice-banner/notice-banner.component.ts',
    },
    {
      type: TableActionButtonComponent,
      path: 'src/app/shared/components/table-action-button/table-action-button.component.ts',
    },
    {
      type: TextFieldComponent,
      path: 'src/app/shared/components/text-field/text-field.component.ts',
    },
    {
      type: CustomSelectComponent,
      path: 'src/app/shared/components/custom-select/custom-select.component.ts',
    },
  ]);
});
afterAll(() => restore?.());
