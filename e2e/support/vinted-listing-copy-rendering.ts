import { VintedListingCopyDialogComponent } from '../../src/app/features/marketplaces/components/vinted-listing-copy-dialog/vinted-listing-copy-dialog.component';
import { CustomCheckboxComponent } from '../../src/app/shared/components/custom-checkbox/custom-checkbox.component';
import { CustomSelectComponent } from '../../src/app/shared/components/custom-select/custom-select.component';
import { ModalShellComponent } from '../../src/app/shared/components/modal-shell/modal-shell.component';
import { NoticeBannerComponent } from '../../src/app/shared/components/notice-banner/notice-banner.component';
import { TextFieldComponent } from '../../src/app/shared/components/text-field/text-field.component';
import { ModalDialogDirective } from '../../src/app/shared/directives/modal-dialog.directive';

export const vintedListingCopyRendering = [
  {
    type: VintedListingCopyDialogComponent,
    path: 'src/app/features/marketplaces/components/vinted-listing-copy-dialog/vinted-listing-copy-dialog.component.ts',
  },
  ...[
    ['custom-checkbox', CustomCheckboxComponent],
    ['custom-select', CustomSelectComponent],
    ['modal-shell', ModalShellComponent],
    ['notice-banner', NoticeBannerComponent],
    ['text-field', TextFieldComponent],
  ].map(([name, type]) => ({
    type,
    path: `src/app/shared/components/${name}/${name}.component.ts`,
  })),
  { type: ModalDialogDirective, path: 'src/app/shared/directives/modal-dialog.directive.ts' },
];
