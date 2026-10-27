import { VintedProfileEditorComponent } from '../../src/app/features/marketplaces/components/vinted-profile-editor/vinted-profile-editor.component';
import { CustomCheckboxComponent } from '../../src/app/shared/components/custom-checkbox/custom-checkbox.component';
import { CustomSelectComponent } from '../../src/app/shared/components/custom-select/custom-select.component';
import { ModalShellComponent } from '../../src/app/shared/components/modal-shell/modal-shell.component';
import { NoticeBannerComponent } from '../../src/app/shared/components/notice-banner/notice-banner.component';
import { ProductThumbnailComponent } from '../../src/app/shared/components/product-thumbnail/product-thumbnail.component';
import { TextFieldComponent } from '../../src/app/shared/components/text-field/text-field.component';

export const vintedProfileEditorRendering = [
  {
    type: VintedProfileEditorComponent,
    path: 'src/app/features/marketplaces/components/vinted-profile-editor/vinted-profile-editor.component.ts',
  },
  {
    type: CustomCheckboxComponent,
    path: 'src/app/shared/components/custom-checkbox/custom-checkbox.component.ts',
  },
  {
    type: CustomSelectComponent,
    path: 'src/app/shared/components/custom-select/custom-select.component.ts',
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
    type: ProductThumbnailComponent,
    path: 'src/app/shared/components/product-thumbnail/product-thumbnail.component.ts',
  },
  {
    type: TextFieldComponent,
    path: 'src/app/shared/components/text-field/text-field.component.ts',
  },
];
