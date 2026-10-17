import { CategoryPickerComponent } from '../../src/app/shared/components/category-picker/category-picker.component';
import { KleinanzeigenPublicationPanelComponent } from '../../src/app/features/marketplaces/components/kleinanzeigen-publication-panel/kleinanzeigen-publication-panel.component';
import { ListingTransferActionComponent } from '../../src/app/features/marketplaces/components/listing-transfer-action/listing-transfer-action.component';
import { ListingTransferDialogComponent } from '../../src/app/features/marketplaces/components/listing-transfer-dialog/listing-transfer-dialog.component';
import { KleinanzeigenListingFieldsComponent } from '../../src/app/features/marketplaces/components/kleinanzeigen-listing-fields/kleinanzeigen-listing-fields.component';
import { ModalShellComponent } from '../../src/app/shared/components/modal-shell/modal-shell.component';
import { ButtonComponent } from '../../src/app/shared/components/button/button.component';
import { NoticeBannerComponent } from '../../src/app/shared/components/notice-banner/notice-banner.component';
import { TextFieldComponent } from '../../src/app/shared/components/text-field/text-field.component';
import { NumberInputComponent } from '../../src/app/shared/components/number-input/number-input.component';
import { CustomSelectComponent } from '../../src/app/shared/components/custom-select/custom-select.component';
import { ProductThumbnailComponent } from '../../src/app/shared/components/product-thumbnail/product-thumbnail.component';
import { CustomCheckboxComponent } from '../../src/app/shared/components/custom-checkbox/custom-checkbox.component';
import { ModalDialogDirective } from '../../src/app/shared/directives/modal-dialog.directive';
export const listingTransferRendering = [
  {
    type: CategoryPickerComponent,
    path: 'src/app/shared/components/category-picker/category-picker.component.ts',
  },
  {
    type: KleinanzeigenPublicationPanelComponent,
    path: 'src/app/features/marketplaces/components/kleinanzeigen-publication-panel/kleinanzeigen-publication-panel.component.ts',
  },
  {
    type: ListingTransferActionComponent,
    path: 'src/app/features/marketplaces/components/listing-transfer-action/listing-transfer-action.component.ts',
  },
  {
    type: ListingTransferDialogComponent,
    path: 'src/app/features/marketplaces/components/listing-transfer-dialog/listing-transfer-dialog.component.ts',
  },
  {
    type: KleinanzeigenListingFieldsComponent,
    path: 'src/app/features/marketplaces/components/kleinanzeigen-listing-fields/kleinanzeigen-listing-fields.component.ts',
  },
  {
    type: ModalShellComponent,
    path: 'src/app/shared/components/modal-shell/modal-shell.component.ts',
  },
  { type: ButtonComponent, path: 'src/app/shared/components/button/button.component.ts' },
  {
    type: NoticeBannerComponent,
    path: 'src/app/shared/components/notice-banner/notice-banner.component.ts',
  },
  {
    type: TextFieldComponent,
    path: 'src/app/shared/components/text-field/text-field.component.ts',
  },
  {
    type: NumberInputComponent,
    path: 'src/app/shared/components/number-input/number-input.component.ts',
  },
  {
    type: CustomSelectComponent,
    path: 'src/app/shared/components/custom-select/custom-select.component.ts',
  },
  {
    type: ProductThumbnailComponent,
    path: 'src/app/shared/components/product-thumbnail/product-thumbnail.component.ts',
  },
  {
    type: CustomCheckboxComponent,
    path: 'src/app/shared/components/custom-checkbox/custom-checkbox.component.ts',
  },
  { type: ModalDialogDirective, path: 'src/app/shared/directives/modal-dialog.directive.ts' },
] as const;
