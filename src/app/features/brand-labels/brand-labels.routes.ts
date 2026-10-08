import type { Routes } from '@angular/router';
import { operatorGuard } from '../../core/guards/operator.guard';
import { unsavedEntryGuard } from '../../shared/guards/unsaved-entry.guard';
export const brandLabelRoutes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () =>
      import('./pages/label-library/label-library.component').then(
        (module) => module.LabelLibraryComponent,
      ),
  },
  {
    path: 'sizes',
    pathMatch: 'full',
    loadComponent: () =>
      import('./pages/size-library/size-library.component').then(
        (module) => module.SizeLibraryComponent,
      ),
  },
  {
    path: 'admin',
    pathMatch: 'full',
    canActivate: [operatorGuard],
    canDeactivate: [unsavedEntryGuard],
    loadComponent: () =>
      import('./pages/label-admin/label-admin.component').then(
        (module) => module.LabelAdminComponent,
      ),
  },
  {
    path: 'admin/brands',
    canActivate: [operatorGuard],
    canDeactivate: [unsavedEntryGuard],
    loadComponent: () =>
      import('./pages/label-brands/label-brands.component').then(
        (module) => module.LabelBrandsComponent,
      ),
  },
  {
    path: 'admin/images',
    canActivate: [operatorGuard],
    canDeactivate: [unsavedEntryGuard],
    loadComponent: () =>
      import('./pages/label-images/label-images.component').then(
        (module) => module.LabelImagesComponent,
      ),
  },
  {
    path: 'admin/sizes',
    canActivate: [operatorGuard],
    canDeactivate: [unsavedEntryGuard],
    data: { admin: true },
    loadComponent: () =>
      import('./pages/size-library/size-library.component').then(
        (module) => module.SizeLibraryComponent,
      ),
  },
  {
    path: 'admin/labels/:id',
    canActivate: [operatorGuard],
    canDeactivate: [unsavedEntryGuard],
    loadComponent: () =>
      import('./pages/label-editor/label-editor.component').then(
        (module) => module.LabelEditorComponent,
      ),
  },
  {
    path: ':brand/:label',
    loadComponent: () =>
      import('./pages/label-detail/label-detail.component').then(
        (module) => module.LabelDetailComponent,
      ),
  },
];
