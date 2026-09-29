import type { Routes } from '@angular/router';
import { unsavedEntryGuard } from '../../shared/guards/unsaved-entry.guard';
import { MASTER_DATA_SECTIONS } from './master-data-view';

export const MASTER_DATA_ROUTES: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'brands' },
  ...MASTER_DATA_SECTIONS.map((section) => ({
    path: section.id,
    title: `${section.label} – Stammdaten`,
    data: { masterDataSection: section.id, workspaceContextLocked: false },
    canDeactivate: [unsavedEntryGuard],
    loadComponent: () => import('./master-data.component').then((m) => m.MasterDataComponent),
  })),
  { path: '**', redirectTo: 'brands' },
];
